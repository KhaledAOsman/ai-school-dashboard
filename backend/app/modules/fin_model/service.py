"""Financial model versions: storage, validation, calibration and results."""
from __future__ import annotations

import copy
import hashlib
import json
import re
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit.service import AuditService
from app.core.cache import cached
from app.modules.fin_model import engine
from app.modules.fin_model.calibration import calibrate
from app.modules.fin_model.defaults import DEFAULT_ASSUMPTIONS, default_assumptions
from app.modules.fin_model.models import FinModelVersion

YM = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")
RATE_KEYS = {
    "lead_to_trial", "lead_to_trial_target", "show_rate", "show_rate_target", "trial_to_paid",
    "trial_to_paid_target", "organic_share", "organic_share_target", "avg_discount", "renewal_rate",
    "renewal_rate_target", "funnel_share", "vat_rate", "zakat_rate", "gateway_fee_pct", "annual_raise",
    "employer_oncost", "intl_transfer_fee_pct", "loan_rate", "loan_upfront_fee", "discount_rate",
    "terminal_growth", "cpl_growth_yoy", "growth_yoy", "monthly_growth",
}
MONTH_KEYS = {"start_month", "end_month", "month", "loan_draw_month", "vat_from_month"}
LIST_LIMIT = 30


def _bad(msg: str) -> HTTPException:
    return HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, msg)


def _clean_value(key: str, value, template):
    if key in MONTH_KEYS:
        if value in (None, ""):
            return None
        if not isinstance(value, str) or not YM.match(value):
            raise _bad(f"صيغة الشهر غير صحيحة في «{key}»: استخدم YYYY-MM")
        return value
    if isinstance(template, bool):
        return bool(value)
    if isinstance(template, (int, float)) and not isinstance(template, bool):
        try:
            v = float(value)
        except (TypeError, ValueError):
            raise _bad(f"القيمة في «{key}» لازم تكون رقم")
        if v != v or v in (float("inf"), float("-inf")):
            raise _bad(f"القيمة في «{key}» غير صالحة")
        if key in RATE_KEYS and not (-1.0 <= v <= 1.0 if key in {"growth_yoy", "cpl_growth_yoy", "monthly_growth"} else 0.0 <= v <= 1.0):
            raise _bad(f"«{key}» نسبة: لازم تكون بين 0 و 1 (مثلاً 0.25 = 25%)")
        if v < 0 and key not in {"growth_yoy", "cpl_growth_yoy", "monthly_growth", "opening_cash", "owner_invested_to_date", "amount"}:
            raise _bad(f"«{key}» لا يمكن أن تكون سالبة")
        return int(v) if isinstance(template, int) and float(v).is_integer() else v
    if isinstance(template, str) or template is None:
        return None if value is None else str(value)[:300]
    return value


def _merge(template: dict, data: dict) -> dict:
    out = {}
    for k, tv in template.items():
        if k not in data:
            out[k] = copy.deepcopy(tv)
            continue
        v = data[k]
        if isinstance(tv, dict) and k in ("seasonality",):
            out[k] = {str(m): float(_clean_value("seasonality", v.get(str(m), tv[str(m)]), 1.0)) for m in range(1, 13)}
        elif isinstance(tv, dict):
            out[k] = _merge(tv, v if isinstance(v, dict) else {})
        elif isinstance(tv, list) and (not tv or not isinstance(tv[0], dict)):
            if not isinstance(v, list) or len(v) > 60:
                raise _bad(f"«{k}» قائمة غير صالحة")
            out[k] = [_clean_value(k, x, tv[0] if tv else 0.0) for x in v]
        elif isinstance(tv, list):
            if not isinstance(v, list) or len(v) > LIST_LIMIT:
                raise _bad(f"«{k}»: الحد الأقصى {LIST_LIMIT} عنصر")
            item_t = tv[0]
            out[k] = [_merge(item_t, x if isinstance(x, dict) else {}) for x in v]
        else:
            out[k] = _clean_value(k, v, tv)
    # keep extra keys only for known optional fields
    for k in ("service_months", "active_months", "bridge"):
        if k in data and k not in out:
            out[k] = data[k]
    return out


def normalize(data: dict) -> dict:
    """Validate and complete an assumptions payload against the defaults."""
    if not isinstance(data, dict):
        raise _bad("الافتراضات غير صالحة")
    t = DEFAULT_ASSUMPTIONS
    out = _merge({k: v for k, v in t.items() if k not in ("streams", "markets", "opex", "capex", "auto_fields", "scenarios")}, data)
    # lists of objects with their own templates
    stream_t = {**t["streams"][0], "active_months": list(range(1, 13)), "initial_monthly": 0.0, "monthly_growth": 0.0,
                "max_monthly": 0.0, "service_months": 12}
    market_t = t["markets"][0]
    opex_t = t["opex"][0]
    capex_t = t["capex"][0]
    for key, tmpl in (("streams", stream_t), ("markets", market_t), ("opex", opex_t), ("capex", capex_t)):
        items = data.get(key, t[key])
        if not isinstance(items, list) or len(items) > LIST_LIMIT:
            raise _bad(f"«{key}»: الحد الأقصى {LIST_LIMIT} عنصر")
        merged = []
        seen = set()
        for x in items:
            m = _merge(tmpl, x if isinstance(x, dict) else {})
            if "id" in tmpl:
                m["id"] = re.sub(r"[^a-z0-9_]", "_", str(m.get("id") or "").lower())[:40] or f"{key}_{len(merged) + 1}"
                if m["id"] in seen:
                    raise _bad(f"المعرّف «{m['id']}» مكرر في {key}")
                seen.add(m["id"])
            if key == "streams":
                m["category"] = "b2b" if m.get("category") == "b2b" else "b2c"
                cap = 0.5 if m["category"] == "b2b" else 0.3
                if not 0 <= float(m.get("avg_discount", 0)) <= cap:
                    raise _bad(f"الخصم في «{m.get('name_ar')}» يجب ألا يتجاوز {int(cap * 100)}%")
                am = x.get("active_months", list(range(1, 13))) if isinstance(x, dict) else list(range(1, 13))
                m["active_months"] = sorted({int(v) for v in am if 1 <= int(v) <= 12}) or list(range(1, 13))
                if m["driver"] not in ("funnel", "growth"):
                    raise _bad("نوع المحرك لازم يكون funnel أو growth")
                if m["driver"] == "funnel" and not any(mk.get("id") == m.get("market") for mk in data.get("markets", t["markets"])):
                    raise _bad(f"مصدر الإيراد «{m.get('name_ar')}» مرتبط بسوق غير موجود")
            if key == "markets":
                b = m.get("trials_by_year") or [0.0]
                m["trials_by_year"] = [max(0.0, float(v)) for v in b][:10]
            merged.append(m)
        out[key] = merged
    sc = data.get("scenarios", t["scenarios"])
    out["scenarios"] = {name: _merge(t["scenarios"][name], (sc or {}).get(name, {})) for name in engine.SCENARIOS}
    af = data.get("auto_fields", t["auto_fields"])
    out["auto_fields"] = [p for p in af if isinstance(p, str) and p in t["auto_fields"]]
    if out["general"]["horizon_months"] not in (36, 48, 60, 72, 84, 96, 120):
        out["general"]["horizon_months"] = 60
    return out


def upgrade(assumptions: dict) -> dict:
    """Stored assumptions completed with fields added to the model after they were saved."""
    a = copy.deepcopy(assumptions)
    try:
        schema = int(a.get("schema") or 1)
    except (TypeError, ValueError):
        schema = 1
    if schema < 3:
        # board decisions of v3, applied once to plans saved before them:
        # fixed 30 % discount (not the actual average), partnerships from model year 2, interest-free loan
        a["auto_fields"] = [p for p in (a.get("auto_fields") or []) if p != "streams.core_b2c.avg_discount"]
        for st in a.get("streams", []):
            if isinstance(st, dict) and st.get("id") == "core_b2c":
                st["avg_discount"] = 0.30
            if isinstance(st, dict) and st.get("id") == "schools" and str(st.get("start_month") or "") < "2027-10":
                st["start_month"] = "2027-10"
        # cost lines saved before expense categories existed
        opex_cat = {"content": "content", "tools": "tools", "marketing_content": "marketing_extra", "legal": "admin", "accreditation": "admin"}
        for o in a.get("opex", []) or []:
            if isinstance(o, dict) and not o.get("category"):
                o["category"] = opex_cat.get(str(o.get("id")), "admin")
        team = a.get("team") if isinstance(a.get("team"), dict) else {}
        for h in team.get("hires", []) or []:
            if isinstance(h, dict) and not h.get("category"):
                role = f"{h.get('role_en', '')} {h.get('role_ar', '')}".lower()
                h["category"] = "marketing" if any(w in role for w in ("sales", "marketing", "gcc", "مبيعات", "تسويق", "الخليج")) else "admin"
        fin = a.setdefault("financing", {})
        if isinstance(fin, dict):
            fin["loan_rate"] = 0.0
            fin["loan_upfront_fee"] = 0.0
        a["schema"] = 3
    if schema < 4:
        # board decisions of v4: only individual + institutional subscriptions (no NSMA, curriculum
        # courses or camps), institutional students taught one-to-one, GCC from year 3,
        # and the partnerships sales lead as the only planned hire
        dropped = {"curriculum", "nsma", "summer_camp"}
        a["streams"] = [st for st in (a.get("streams") or []) if not (isinstance(st, dict) and st.get("id") in dropped)]
        for st in a["streams"]:
            if not isinstance(st, dict):
                continue
            if st.get("id") == "core_b2c":
                st["funnel_share"] = 1.0
            if st.get("id") == "schools":
                st["group_size"] = 1
            if st.get("id") == "gcc_b2c" and str(st.get("start_month") or "") < "2028-10":
                st["start_month"] = "2028-10"
        for mk in a.get("markets") or []:
            if isinstance(mk, dict) and mk.get("id") == "gcc" and str(mk.get("start_month") or "") < "2028-10":
                mk["start_month"] = "2028-10"
        team = a.get("team") if isinstance(a.get("team"), dict) else None
        if team is not None:
            def _partner_sales(h):
                role = f"{h.get('role_en', '')} {h.get('role_ar', '')}".lower()
                return ("sales" in role or "مبيعات" in role) and any(w in role for w in ("school", "partner", "مدارس", "شراك"))
            team["hires"] = [h for h in (team.get("hires") or []) if isinstance(h, dict) and _partner_sales(h)]
        a["schema"] = 4
    for st in a.get("streams", []):
        if isinstance(st, dict):
            if "category" not in st:
                st["category"] = "b2b" if st.get("id") in ("schools", "platform_license") else "b2c"
            cap = 0.5 if st["category"] == "b2b" else 0.3
            try:
                st["avg_discount"] = min(max(float(st.get("avg_discount", 0)), 0.0), cap)
            except (TypeError, ValueError):
                pass
    try:
        return normalize(a)
    except HTTPException:
        return a


def resolve(assumptions: dict, calibration: dict | None) -> dict:
    """Assumptions with the auto fields replaced by actual data."""
    a = upgrade(assumptions)
    vals = (calibration or {}).get("values", {})
    for path in a.get("auto_fields", []):
        if path in vals and vals[path] is not None:
            engine.set_path(a, path, vals[path])
    return a


def _changed_paths(old, new, prefix="") -> list[str]:
    out = []
    if isinstance(old, dict) and isinstance(new, dict):
        for k in sorted(set(old) | set(new)):
            out += _changed_paths(old.get(k), new.get(k), f"{prefix}.{k}" if prefix else k)
    elif isinstance(old, list) and isinstance(new, list) and old and new and all(isinstance(x, dict) and "id" in x for x in old + new):
        oi, ni = {x["id"]: x for x in old}, {x["id"]: x for x in new}
        for k in sorted(set(oi) | set(ni)):
            out += _changed_paths(oi.get(k), ni.get(k), f"{prefix}.{k}")
    elif old != new:
        out.append(prefix)
    return out


class FinModelService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.audit = AuditService(db)

    # ----------------------------------------------------------- versions
    async def list(self, include_drafts: bool) -> list[FinModelVersion]:
        stmt = select(FinModelVersion).order_by(FinModelVersion.updated_at.desc())
        if not include_drafts:
            stmt = stmt.where(FinModelVersion.status == "published")
        else:
            stmt = stmt.where(FinModelVersion.status != "archived")
        return list((await self.db.execute(stmt)).scalars().all())

    async def ensure_default(self, user_id: uuid.UUID) -> None:
        n = (await self.db.execute(text("SELECT count(*) FROM fin_model_versions"))).scalar()
        if n:
            return
        v = FinModelVersion(name="الخطة الأساسية 2026–2031", description="النسخة الأولى: الافتراضات المبدئية + بيانات التشغيل الفعلية",
                            status="draft", assumptions=normalize(default_assumptions()), created_by=user_id, updated_by=user_id)
        self.db.add(v)
        await self.db.commit()

    async def get(self, version_id: uuid.UUID, include_drafts: bool) -> FinModelVersion:
        v = await self.db.get(FinModelVersion, version_id)
        if v is None or (not include_drafts and v.status != "published"):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "النسخة غير موجودة")
        return v

    async def create(self, name: str, copy_from: uuid.UUID | None, user_id: uuid.UUID) -> FinModelVersion:
        if copy_from:
            src = await self.get(copy_from, True)
            assumptions, desc = copy.deepcopy(src.assumptions), f"نسخة من «{src.name}»"
        else:
            assumptions, desc = default_assumptions(), "من الافتراضات المبدئية"
        v = FinModelVersion(name=name, description=desc, status="draft", assumptions=normalize(assumptions),
                            created_by=user_id, updated_by=user_id)
        self.db.add(v)
        await self.db.flush()
        await self.audit.record(user_id=user_id, action="fin_model.create", resource_type="fin_model_version",
                                resource_id=str(v.id), new_value={"name": name, "copy_from": str(copy_from) if copy_from else None})
        await self.db.commit()
        await self.db.refresh(v)
        return v

    async def update(self, version_id: uuid.UUID, name: str | None, description: str | None,
                     assumptions: dict | None, user_id: uuid.UUID) -> FinModelVersion:
        v = await self.get(version_id, True)
        if v.status != "draft":
            raise HTTPException(status.HTTP_409_CONFLICT, "النسخة المنشورة مقفولة؛ اعمل نسخة جديدة منها للتعديل")
        changes: list[str] = []
        if assumptions is not None:
            new = normalize(assumptions)
            changes = _changed_paths(upgrade(v.assumptions), new)
            v.assumptions = new
        if name is not None and name.strip() and name.strip() != v.name:
            changes.append("name")
            v.name = name.strip()[:150]
        if description is not None and description != v.description:
            changes.append("description")
            v.description = description[:2000]
        v.updated_by = user_id
        if changes:
            await self.audit.record(user_id=user_id, action="fin_model.update", resource_type="fin_model_version",
                                    resource_id=str(v.id), new_value={"changed": changes[:200]})
        await self.db.commit()
        await self.db.refresh(v)
        return v

    async def publish(self, version_id: uuid.UUID, user_id: uuid.UUID) -> FinModelVersion:
        v = await self.get(version_id, True)
        if v.status != "draft":
            raise HTTPException(status.HTTP_409_CONFLICT, "النسخة منشورة بالفعل")
        cal = await calibrate(self.db)
        v.calibration = {k: cal[k] for k in ("as_of", "values", "basis", "window", "funding_history", "totals")}
        v.status = "published"
        v.published_by = user_id
        v.published_at = datetime.now(timezone.utc)
        await self.audit.record(user_id=user_id, action="fin_model.publish", resource_type="fin_model_version",
                                resource_id=str(v.id), new_value={"name": v.name, "calibration_as_of": cal["as_of"]})
        await self.db.commit()
        await self.db.refresh(v)
        return v

    async def archive(self, version_id: uuid.UUID, user_id: uuid.UUID) -> None:
        v = await self.get(version_id, True)
        v.status = "archived"
        await self.audit.record(user_id=user_id, action="fin_model.archive", resource_type="fin_model_version",
                                resource_id=str(v.id), new_value={"name": v.name})
        await self.db.commit()

    async def history(self, version_id: uuid.UUID) -> list[dict]:
        rows = (await self.db.execute(text("""
            SELECT a.timestamp, a.action, a.new_value, u.full_name
            FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
            WHERE a.resource_type = 'fin_model_version' AND a.resource_id = :rid
            ORDER BY a.timestamp DESC LIMIT 100"""), {"rid": str(version_id)})).mappings().all()
        return [{"at": r["timestamp"].isoformat() if r["timestamp"] else None, "action": r["action"],
                 "by": r["full_name"], "details": r["new_value"]} for r in rows]

    # ------------------------------------------------------------ numbers
    async def calibration_for(self, v: FinModelVersion) -> dict:
        if v.status == "published" and v.calibration:
            return v.calibration
        return await cached("fm:calibration", lambda: calibrate(self.db), ttl=300)

    async def result(self, v: FinModelVersion, scenario: str) -> dict:
        cal = await self.calibration_for(v)
        a = resolve(v.assumptions, cal)
        key = hashlib.sha1(json.dumps([engine.ENGINE_VERSION, a, scenario, cal.get("funding_history")], sort_keys=True, default=str).encode()).hexdigest()

        async def produce():
            r = engine.compute(a, scenario, cal.get("funding_history"))
            r["calibration"] = {"as_of": cal.get("as_of"), "values": cal.get("values"), "basis": cal.get("basis")}
            r["resolved_assumptions"] = a
            return r

        return await cached(f"fm:result:{key}", produce, ttl=3600)

    async def sensitivity(self, v: FinModelVersion, scenario: str) -> dict:
        cal = await self.calibration_for(v)
        a = resolve(v.assumptions, cal)
        key = hashlib.sha1(json.dumps([engine.ENGINE_VERSION, a, scenario], sort_keys=True, default=str).encode()).hexdigest()

        async def produce():
            return engine.sensitivity(a, scenario)

        return await cached(f"fm:sens:{key}", produce, ttl=3600)

    async def preview(self, assumptions: dict, scenario: str) -> dict:
        a = normalize(assumptions)
        cal = await cached("fm:calibration", lambda: calibrate(self.db), ttl=300)
        r = engine.compute(resolve(a, cal), scenario, cal.get("funding_history"))
        return r
