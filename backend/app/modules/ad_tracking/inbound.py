"""
Inbound leads from every ad platform -> the CRM (العملاء المحتملون).

Each source (Snapchat webhook, Meta lead-ads webhook / sync, the generic
webhook used for TikTok via Zapier / Make) is parsed into one
NormalizedLead and saved by LeadIngestor:

* new phone      -> a new lead (stage "new", source = the platform), with
                    campaign / ad / form in the notes, a stage-event entry
                    and an in-app notification;
* known phone    -> the SAME customer (customers are unique by phone) gets
                    the attribution + a note "سجّل مرة أخرى";
* known lead id  -> nothing (platforms retry deliveries; (platform,
                    external_lead_id) is unique).

The attribution row keeps the platform's own lead id, which the outbound
conversions send back so the platform matches the exact ad.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit.service import AuditService
from app.core.notifications.service import NotificationService
from app.core.permissions.registry import CRM_LEAD_VIEW_ALL
from app.core.settings.config import get_settings
from app.core.users.models import AccountStatus, Permission, User, role_permissions, user_roles
from app.modules.ad_tracking.models import LeadAdAttribution
from app.modules.ad_tracking.platforms import LABELS
from app.modules.ad_tracking.service import _user_by_email, find_lead_by_phone
from app.modules.crm.leads.models import Lead, LeadStage, LeadStageEvent
from app.modules.marketing.schemas import normalize_phone

logger = structlog.get_logger("app.ad_tracking.inbound")
settings = get_settings()

# ad platform -> CRM lead.source
PLATFORM_LEAD_SOURCE = {"snapchat": "snapchat", "meta": "instagram", "tiktok": "tiktok"}


@dataclass
class NormalizedLead:
    platform: str
    external_lead_id: str | None
    name: str | None = None
    phone: str | None = None
    email: str | None = None
    form_id: str | None = None
    form_name: str | None = None
    ad_account_id: str | None = None
    campaign_id: str | None = None
    campaign_name: str | None = None
    adset_id: str | None = None
    adset_name: str | None = None
    ad_id: str | None = None
    ad_name: str | None = None
    submitted_at: datetime | None = None
    answers: dict[str, str] = field(default_factory=dict)  # custom questions (e.g. عمر الطفل)
    raw: Any = None


def _s(v: Any) -> str | None:
    if v is None:
        return None
    if isinstance(v, list):
        v = ", ".join(str(x) for x in v if x not in (None, ""))
    v = str(v).strip()
    return v or None


def parse_time(v: Any) -> datetime | None:
    """Unix seconds / ms (number or digit string) or ISO-8601."""
    s = _s(v)
    if not s:
        return None
    if re.fullmatch(r"\d+(\.\d+)?", s):
        n = float(s)
        return datetime.fromtimestamp(n / 1000 if n > 10**11 else n, tz=timezone.utc)
    try:
        dt = datetime.fromisoformat(s.replace("Z", "+00:00").replace("+0000", "+00:00"))
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


_NAME_KEYS = ("full_name", "fullname", "name", "الاسم", "الاسم_الكامل", "اسم")
_FIRST_KEYS = ("first_name", "firstname", "given_name")
_LAST_KEYS = ("last_name", "lastname", "family_name", "surname")
_EMAIL_KEYS = ("email", "email_address", "البريد", "الايميل")


def _norm_key(k: str) -> str:
    return re.sub(r"[\s\-]+", "_", str(k).strip().lower())


def split_answers(answers: dict[str, str]) -> tuple[str | None, str | None, str | None, dict[str, str]]:
    """(name, phone, email, other answers) from a form's question -> answer map."""
    norm = {_norm_key(k): v for k, v in answers.items() if v}
    name = next((norm[k] for k in _NAME_KEYS if norm.get(k)), None)
    if not name:
        first = next((norm[k] for k in _FIRST_KEYS if norm.get(k)), None)
        last = next((norm[k] for k in _LAST_KEYS if norm.get(k)), None)
        name = " ".join(x for x in (first, last) if x) or None
    phone = next((v for k, v in norm.items() if "phone" in k or "mobile" in k or "جوال" in k or "هاتف" in k or "رقم" in k), None)
    email = next((norm[k] for k in _EMAIL_KEYS if norm.get(k)), None) or next((v for k, v in norm.items() if "email" in k), None)
    used = set(_NAME_KEYS + _FIRST_KEYS + _LAST_KEYS + _EMAIL_KEYS)
    rest = {k: v for k, v in answers.items()
            if _norm_key(k) not in used and v != phone and v != email and "phone" not in _norm_key(k)}
    return name, phone, email, rest


class LeadIngestor:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def _system_user(self) -> User | None:
        user = await _user_by_email(self.db, settings.SNAP_LEADS_SYSTEM_USER_EMAIL or settings.ADS_LEADS_SYSTEM_USER_EMAIL)
        if user:
            return user
        return (
            await self.db.execute(
                select(User).where(User.status == AccountStatus.ACTIVE.value).order_by(User.created_at).limit(1)
            )
        ).scalar_one_or_none()

    @staticmethod
    def _summary(n: NormalizedLead) -> str:
        parts = [LABELS.get(n.platform, n.platform)]
        if n.campaign_name:
            parts.append(f"حملة: {n.campaign_name}")
        if n.ad_name:
            parts.append(f"إعلان: {n.ad_name}")
        if n.form_name:
            parts.append(f"فورم: {n.form_name}")
        if n.answers:
            parts.append(" | ".join(f"{k}: {v}" for k, v in n.answers.items()))
        return " — ".join(parts)[:2000]

    async def _notify(self, lead: Lead, created: bool, platform: str) -> None:
        if lead.assigned_to:
            recipients = [lead.assigned_to]
        else:
            stmt = (
                select(User.id)
                .join(user_roles, user_roles.c.user_id == User.id)
                .join(role_permissions, role_permissions.c.role_id == user_roles.c.role_id)
                .join(Permission, Permission.id == role_permissions.c.permission_id)
                .where(Permission.code == CRM_LEAD_VIEW_ALL, User.status == AccountStatus.ACTIVE.value)
                .distinct()
                .limit(25)
            )
            recipients = list((await self.db.execute(stmt)).scalars().all())
        label = LABELS.get(platform, platform)
        title = f"عميل محتمل جديد من {label}" if created else f"عميل حالي سجّل مرة أخرى من {label}"
        notifier = NotificationService(self.db)
        for uid in recipients:
            await notifier.create(
                user_id=uid, event_type=f"crm.lead.{platform}", title=title,
                body=f"{lead.full_name} — {lead.phone}", resource_type="Lead", resource_id=str(lead.id),
            )

    async def ingest(self, n: NormalizedLead) -> dict:
        if not n.external_lead_id:
            return {"result": "ignored", "reason": "missing lead id"}
        dup = (
            await self.db.execute(
                select(LeadAdAttribution.lead_id).where(
                    LeadAdAttribution.platform == n.platform, LeadAdAttribution.external_lead_id == n.external_lead_id
                )
            )
        ).scalar_one_or_none()
        if dup:
            return {"result": "duplicate", "lead_id": str(dup)}
        try:
            phone = normalize_phone(n.phone or "")
        except ValueError:
            # a lead = name + phone; a form without a phone is not a lead
            logger.warning("ad_lead_without_phone", platform=n.platform, external_lead_id=n.external_lead_id)
            return {"result": "ignored", "reason": "missing phone"}

        system_user = await self._system_user()
        if system_user is None:
            raise RuntimeError("no active user to own webhook leads")

        label = LABELS.get(n.platform, n.platform)
        lead = await find_lead_by_phone(self.db, phone)
        created = lead is None
        summary = self._summary(n)
        if created:
            assignee = await _user_by_email(
                self.db, settings.SNAP_LEADS_DEFAULT_ASSIGNEE_EMAIL or settings.ADS_LEADS_DEFAULT_ASSIGNEE_EMAIL
            )
            lead = Lead(
                full_name=(n.name or f"عميل {label}")[:200],
                phone=phone,
                source=PLATFORM_LEAD_SOURCE.get(n.platform),
                stage=LeadStage.NEW.value,
                notes=summary,
                assigned_to=assignee.id if assignee else None,
                created_by=system_user.id,
            )
            self.db.add(lead)
            await self.db.flush()
            note = f"تسجيل تلقائي من فورم {label} — {summary}"
        else:
            if not lead.source:
                lead.source = PLATFORM_LEAD_SOURCE.get(n.platform)
            note = f"سجّل مرة أخرى من فورم {label} — {summary}"
        self.db.add(LeadStageEvent(
            lead_id=lead.id, stage=lead.stage, performed_by=system_user.id, note=note[:2000],
            created_at=datetime.now(timezone.utc),
        ))
        raw = n.raw if isinstance(n.raw, dict) else {"data": n.raw}
        if n.email:
            raw = {**raw, "email": n.email}
        self.db.add(
            LeadAdAttribution(
                lead_id=lead.id, platform=n.platform, external_lead_id=n.external_lead_id[:100],
                form_id=n.form_id, form_name=(n.form_name or None) and n.form_name[:300],
                ad_account_id=n.ad_account_id, campaign_id=n.campaign_id,
                campaign_name=(n.campaign_name or None) and n.campaign_name[:300],
                ad_squad_id=n.adset_id, ad_squad_name=(n.adset_name or None) and n.adset_name[:300],
                ad_id=n.ad_id, ad_name=(n.ad_name or None) and n.ad_name[:300],
                submitted_at=n.submitted_at, raw=raw,
            )
        )
        await AuditService(self.db).record(
            user_id=system_user.id, action=f"crm_lead.{n.platform}_lead_form", resource_type="Lead", resource_id=str(lead.id),
            new_value={"external_lead_id": n.external_lead_id, "created": created, "campaign": n.campaign_name, "ad": n.ad_name},
        )
        await self._notify(lead, created, n.platform)
        await self.db.commit()
        return {"result": "created" if created else "linked", "lead_id": str(lead.id)}


# ------------------------------------------------------------------ parsers
def from_snap(p: dict) -> NormalizedLead:
    from app.modules.ad_tracking import snap

    d = snap.parse_lead(p)
    return NormalizedLead(
        platform="snapchat", external_lead_id=d["lead_id"], name=d["name"], phone=d["phone"], email=d["email"],
        form_id=d["form_id"], form_name=d["form_name"], ad_account_id=d["ad_account_id"],
        campaign_id=d["campaign_id"], campaign_name=d["campaign_name"],
        adset_id=d["ad_squad_id"], adset_name=d["ad_squad_name"], ad_id=d["ad_id"], ad_name=d["ad_name"],
        submitted_at=d["submitted_at"], answers={k: v for k, v in d["custom"].items()}, raw=p,
    )


def _answers_list(items: Any) -> dict[str, str]:
    """[{name|field_name|question|key: ..., values|value|field_value|answer: ...}] -> {question: answer}."""
    out: dict[str, str] = {}
    if isinstance(items, dict):
        return {str(k): _s(v) for k, v in items.items() if _s(v)}
    for it in items if isinstance(items, list) else []:
        if not isinstance(it, dict):
            continue
        k = _s(it.get("name") or it.get("field_name") or it.get("question") or it.get("key") or it.get("label"))
        v = _s(it.get("values") if "values" in it else it.get("value", it.get("field_value", it.get("answer"))))
        if k and v:
            out[k] = v
    return out


def from_generic(p: dict, platform: str) -> NormalizedLead:
    """Flexible format for TikTok (Zapier / Make / TikTok CRM webhook) and
    anything else: flat keys and/or an answers list ("fields", "field_data",
    "answers", "questions")."""
    answers: dict[str, str] = {}
    for key in ("fields", "field_data", "answers", "questions", "form_data", "lead_data"):
        if key in p:
            answers.update(_answers_list(p[key]))
    flat = {k: _s(v) for k, v in p.items() if not isinstance(v, (dict, list)) and _s(v)}
    name, phone, email, rest = split_answers({**flat, **answers})
    known = {"lead_id", "id", "leadgen_id", "form_id", "form_name", "advertiser_id", "ad_account_id", "campaign_id",
             "campaign_name", "adgroup_id", "adgroup_name", "adset_id", "adset_name", "ad_squad_id", "ad_squad_name",
             "ad_id", "ad_name", "create_time", "created_time", "created_at", "submitted_at", "platform", "page_id"}
    extra = {k: v for k, v in rest.items() if _norm_key(k) not in known and k not in flat}
    ext_id = _s(p.get("lead_id") or p.get("id") or p.get("leadgen_id"))
    if not ext_id and (phone or _s(p.get("phone"))):
        # no platform id (some Zapier / Make setups): phone + form + time keeps retries idempotent
        digits = re.sub(r"\D", "", phone or _s(p.get("phone")) or "")
        ext_id = ":".join(x for x in ("noid", digits, _s(p.get("form_id")) or "",
                                      _s(p.get("create_time") or p.get("created_time") or p.get("created_at")) or "") if x is not None)
    return NormalizedLead(
        platform=platform,
        external_lead_id=ext_id,
        name=name, phone=phone or _s(p.get("phone")), email=email,
        form_id=_s(p.get("form_id")), form_name=_s(p.get("form_name")),
        ad_account_id=_s(p.get("advertiser_id") or p.get("ad_account_id")),
        campaign_id=_s(p.get("campaign_id")), campaign_name=_s(p.get("campaign_name")),
        adset_id=_s(p.get("adgroup_id") or p.get("adset_id") or p.get("ad_squad_id")),
        adset_name=_s(p.get("adgroup_name") or p.get("adset_name") or p.get("ad_squad_name")),
        ad_id=_s(p.get("ad_id")), ad_name=_s(p.get("ad_name")),
        submitted_at=parse_time(p.get("create_time") or p.get("created_time") or p.get("created_at") or p.get("submitted_at")),
        answers=extra, raw=p,
    )
