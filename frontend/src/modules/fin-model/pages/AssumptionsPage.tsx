/**
 * Flexible assumptions editor for the financial analyst. Every field of the
 * model is here; changes recalculate live (unsaved preview) and are stored
 * with "Save". Calibrated fields can follow the platform's actual data
 * ("auto") or be set by hand.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import clsx from "clsx";
import { ChevronDown, Copy, Plus, Trash2 } from "lucide-react";
import { useFM } from "../context";
import { fmApi, type Assumptions, type ExpenseCategory, type Market, type ModelResult, type Stream } from "../api";
import { EXPENSE_LABELS, HIRE_CATEGORIES } from "../components/expenses";
import { money, monthLabel, pct } from "../i18n";
import { CARD, Note } from "../components/ui";
import { AutoBadge, FieldShell, MonthInput, NumInput, SelectInput, TextInput, Toggle } from "../components/fields";
import { apiErrorMessage } from "@/modules/marketing/lib";

type L2 = readonly [string, string];
const MONTHS_AR = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "markets.ksa.cpl" -> list items matched by id */
function setPath(obj: unknown, path: string, value: number) {
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const part of parts.slice(0, -1)) {
    cur = Array.isArray(cur) ? cur.find((x: { id?: string }) => x.id === part) : (cur as Record<string, unknown>)?.[part];
    if (cur === undefined || cur === null) return;
  }
  (cur as Record<string, unknown>)[parts[parts.length - 1]] = value;
}

function Section({ title, children, open: initial = false }: { title: string; children: ReactNode; open?: boolean }) {
  const [open, setOpen] = useState(initial);
  return (
    <section className={clsx(CARD, "overflow-hidden")}>
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between px-4 py-3.5 text-start sm:px-5">
        <span className="text-[15.5px] font-bold text-ink-900">{title}</span>
        <ChevronDown size={18} className={clsx("text-ink-500 transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="border-t border-[#eef1f6] px-4 py-4 sm:px-5">{children}</div>}
    </section>
  );
}

const grid = "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4";

export default function AssumptionsPage() {
  const { version, canEdit, lang, scenario, result, t, setVersionId } = useFM();
  const ar = lang === "ar";
  const L = (x: L2) => (ar ? x[0] : x[1]);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const vq = useQuery({ queryKey: ["fm", "version", version?.id, version?.updated_at], queryFn: () => fmApi.version(version!.id), enabled: !!version });
  const [draft, setDraft] = useState<Assumptions | null>(null);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ModelResult | null>(null);
  const timer = useRef<number>();
  const readOnly = !canEdit || version?.status !== "draft";

  useEffect(() => {
    if (vq.data?.assumptions) { setDraft(structuredClone(vq.data.assumptions)); setDirty(false); setPreview(null); }
  }, [vq.data]);

  // live preview (debounced) while editing
  useEffect(() => {
    if (!draft || !dirty || readOnly) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      try { setPreview(await fmApi.preview(draft, scenario)); setError(null); } catch (e) { setError(apiErrorMessage(e)); }
    }, 650);
    return () => window.clearTimeout(timer.current);
  }, [draft, dirty, scenario, readOnly]);

  const save = useMutation({
    mutationFn: () => fmApi.update(version!.id, { assumptions: draft! }),
    onSuccess: () => { setDirty(false); setError(null); qc.invalidateQueries({ queryKey: ["fm"] }); },
    onError: (e) => setError(apiErrorMessage(e)),
  });
  const copy = useMutation({
    mutationFn: () => fmApi.create(`${version!.name} — ${ar ? "نسخة للتعديل" : "editable copy"}`, version!.id),
    onSuccess: (v) => { qc.invalidateQueries({ queryKey: ["fm", "versions"] }).then(() => setVersionId(v.id)); },
  });

  const cal = result?.calibration;
  const shown = preview ?? result;

  if (!draft || !version) return <p className="py-10 text-center text-ink-600">{t("loading")}</p>;

  const upd = (fn: (d: Assumptions) => void) => {
    setDraft((prev) => { const n = structuredClone(prev!); fn(n); return n; });
    setDirty(true);
  };
  const isAuto = (path: string) => draft.auto_fields.includes(path);
  const toggleAuto = (path: string) => upd((d) => {
    if (d.auto_fields.includes(path)) {
      d.auto_fields = d.auto_fields.filter((p) => p !== path);
      // switching to manual starts from the actual value
      const actual = cal?.values?.[path];
      if (actual !== undefined) setPath(d, path, actual);
    } else {
      d.auto_fields = [...d.auto_fields, path];
    }
  });
  const autoProps = (path: string, format: (v: number) => string) => ({
    auto: <AutoBadge on={isAuto(path)} onToggle={() => toggleAuto(path)} actual={cal?.values?.[path]} basis={cal?.basis?.[path]} disabled={readOnly} lang={lang} format={format} />,
    locked: isAuto(path) && cal?.values?.[path] !== undefined,
    actual: cal?.values?.[path],
  });
  const fPct = (v: number) => pct(v, 1);
  const fMoney = (v: number) => money(v, { decimals: 0 });

  // ---------- helpers for repeated field sets
  const Num = (p: { label: L2; value: number; set: (v: number) => void; kind?: "num" | "money" | "pct" | "int"; hint?: L2; autoPath?: string }) => {
    const a = p.autoPath ? autoProps(p.autoPath, p.kind === "pct" ? fPct : fMoney) : null;
    return (
      <FieldShell label={L(p.label)} hint={p.hint ? L(p.hint) : undefined} auto={a?.auto}>
        <NumInput value={a?.locked ? (a.actual as number) : p.value} onChange={p.set} kind={p.kind} disabled={readOnly || !!a?.locked} />
      </FieldShell>
    );
  };
  const Month = (p: { label: L2; value: string | null; set: (v: string | null) => void; allowEmpty?: boolean }) => (
    <FieldShell label={L(p.label)}><MonthInput value={p.value} onChange={p.set} disabled={readOnly} allowEmpty={p.allowEmpty} /></FieldShell>
  );
  const Txt = (p: { label: L2; value: string; set: (v: string) => void; dir?: "rtl" | "ltr" }) => (
    <FieldShell label={L(p.label)}><TextInput value={p.value} onChange={p.set} disabled={readOnly} dir={p.dir} /></FieldShell>
  );

  const marketOptions = draft.markets.map((m) => ({ value: m.id, label: ar ? m.name_ar : m.name_en }));

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[1fr_300px]">
      <div className="min-w-0 space-y-3">
        {readOnly ? (
          <Note tone="warn">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>{canEdit ? t("read_only") : (ar ? "عرض فقط." : "View only.")}</span>
              {canEdit && <button type="button" onClick={() => copy.mutate()} className="rounded-full bg-brand-600 px-3.5 py-1.5 text-[13px] font-semibold text-white">{ar ? "إنشاء نسخة قابلة للتعديل" : "Create editable copy"}</button>}
            </div>
          </Note>
        ) : (
          <Note>{ar ? "يظهر أثر أي تعديل فورًا في المعاينة. الحقول المعلَّمة «تلقائي من الفعلي» تُحدَّث من بيانات لوحة التحكم إلى أن تُحوَّل إلى إدخال يدوي. تُكتب النسب كنسب مئوية." : "Change any number and see its effect instantly in the preview. Fields marked “Auto from actuals” follow the dashboard data until switched to manual. Rates are entered as percentages."}</Note>
        )}

        <Section title={ar ? "1. عام" : "1. General"} open>
          <div className={grid}>
            {Month({ label: ["بداية الخطة", "Plan start"], value: draft.general.start_month, set: (v) => upd((d) => { d.general.start_month = v!; }) })}
            <FieldShell label={L(["مدة الخطة", "Horizon"])}>
              <SelectInput value={draft.general.horizon_months} disabled={readOnly} onChange={(v) => upd((d) => { d.general.horizon_months = v; })}
                options={[36, 48, 60, 72, 84, 120].map((n) => ({ value: n, label: ar ? `${n / 12} سنوات` : `${n / 12} years` }))} />
            </FieldShell>
            {Num({ label: ["أسابيع الشهر", "Weeks per month"], value: draft.general.weeks_per_month, set: (v) => upd((d) => { d.general.weeks_per_month = v; }) })}
            <FieldShell label={L(["أساس احتساب الإيراد", "Revenue basis"])}>
              <SelectInput value={draft.general.revenue_basis} disabled={readOnly} onChange={(v) => upd((d) => { d.general.revenue_basis = v; })}
                options={[{ value: "billing", label: L(["الاشتراكات المدفوعة في الفترة", "Subscriptions paid in the period"]) }, { value: "delivery", label: L(["المحاضرات المقدَّمة في الفترة", "Lectures delivered in the period"]) }]} />
            </FieldShell>
          </div>
        </Section>

        <Section title={ar ? "2. الأسواق وقمع التسويق" : "2. Markets & marketing funnel"}>
          <div className="space-y-4">
            {draft.markets.map((m, mi) => {
              const sm = (fn: (x: Market) => void) => upd((d) => fn(d.markets[mi]));
              const ap = (f: string) => (m.id === "ksa" ? `markets.ksa.${f}` : undefined);
              return (
                <div key={m.id} className="rounded-lg border border-[#e1e7ef] p-3 sm:p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-[14.5px] font-bold text-brand-700">{ar ? m.name_ar : m.name_en}</p>
                    {!readOnly && !draft.streams.some((s) => s.market === m.id) && (
                      <button type="button" onClick={() => upd((d) => { d.markets.splice(mi, 1); })} className="text-[12.5px] font-semibold text-[#a02a24]"><Trash2 size={14} className="inline" /> {t("remove")}</button>
                    )}
                  </div>
                  <div className={grid}>
                    {Txt({ label: ["الاسم بالعربي", "Name (Arabic)"], value: m.name_ar, set: (v) => sm((x) => { x.name_ar = v; }) })}
                    {Txt({ label: ["الاسم بالإنجليزي", "Name (English)"], value: m.name_en, set: (v) => sm((x) => { x.name_en = v; }), dir: "ltr" })}
                    {Month({ label: ["بداية السوق", "Market start"], value: m.start_month, set: (v) => sm((x) => { x.start_month = v!; }) })}
                    {Num({ label: ["تكلفة المحاضرة التجريبية", "Trial lecture cost"], value: m.trial_cost, set: (v) => sm((x) => { x.trial_cost = v; }), kind: "money", hint: ["تُدفع للمعلم حتى عند غياب الطالب", "Paid to the teacher even on a no-show"] })}
                  </div>
                  <p className="mb-2 mt-4 text-[12.5px] font-bold text-ink-700">{L(["عدد المحاضرات المجانية شهريًا (متوسط كل سنة) — تُحسب منه الإعلانات والاشتراكات", "Free trial lectures per month (yearly average) — drives ad spend and subscriptions"])}</p>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                    {m.trials_by_year.map((b, yi) => (
                      <FieldShell key={yi} label={`${t("y")}${yi + 1} · ${money(b * 12)} ${ar ? "سنويًا" : "a year"}`}><NumInput value={b} kind="int" disabled={readOnly} onChange={(v) => sm((x) => { x.trials_by_year[yi] = v; })} /></FieldShell>
                    ))}
                  </div>
                  <p className="mb-2 mt-4 text-[12.5px] font-bold text-ink-700">{L(["توزيع المحاضرات على أشهر السنة (1 = شهر عادي، 2 = الضعف)؛ يُعاد ضبطه ليبقى إجمالي السنة ثابتًا", "Spread over the year (1 = normal, 2 = double); rescaled so the yearly total is unchanged"])}</p>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                    {Array.from({ length: 12 }, (_, i) => String(i + 1)).map((k) => (
                      <FieldShell key={k} label={(ar ? MONTHS_AR : MONTHS_EN)[Number(k) - 1]}>
                        <NumInput value={m.seasonality[k]} disabled={readOnly} onChange={(v) => sm((x) => { x.seasonality[k] = v; })} />
                      </FieldShell>
                    ))}
                  </div>
                  <p className="mb-2 mt-4 text-[12.5px] font-bold text-ink-700">{L(["القمع: الآن ← المستهدف", "Funnel: now → target"])}</p>
                  <div className={grid}>
                    {Num({ label: ["تكلفة العميل المحتمل من الإعلانات", "Cost per paid lead"], value: m.cpl, set: (v) => sm((x) => { x.cpl = v; }), kind: "money", autoPath: ap("cpl") })}
                    {Num({ label: ["الزيادة السنوية في تكلفة العميل المحتمل", "Yearly CPL increase"], value: m.cpl_growth_yoy, set: (v) => sm((x) => { x.cpl_growth_yoy = v; }), kind: "pct" })}
                    {Num({ label: ["العملاء المحتملون دون إعلان — الحالي", "Free (non-ad) leads — now"], value: m.organic_share, set: (v) => sm((x) => { x.organic_share = v; }), kind: "pct", autoPath: ap("organic_share") })}
                    {Num({ label: ["العملاء المحتملون دون إعلان — المستهدف", "Free (non-ad) leads — target"], value: m.organic_share_target, set: (v) => sm((x) => { x.organic_share_target = v; }), kind: "pct" })}
                    {Num({ label: ["نسبة حجز المحاضرة المجانية — الحالية", "Leads booking a trial — now"], value: m.lead_to_trial, set: (v) => sm((x) => { x.lead_to_trial = v; }), kind: "pct", autoPath: ap("lead_to_trial") })}
                    {Num({ label: ["نسبة حجز المحاضرة المجانية — المستهدفة", "Leads booking a trial — target"], value: m.lead_to_trial_target, set: (v) => sm((x) => { x.lead_to_trial_target = v; }), kind: "pct" })}
                    {Num({ label: ["نسبة الحضور — الحالية", "Show rate — now"], value: m.show_rate, set: (v) => sm((x) => { x.show_rate = v; }), kind: "pct", autoPath: ap("show_rate") })}
                    {Num({ label: ["نسبة الحضور — المستهدفة", "Show rate — target"], value: m.show_rate_target, set: (v) => sm((x) => { x.show_rate_target = v; }), kind: "pct" })}
                    {Num({ label: ["التحويل من الحضور إلى اشتراك — الحالي", "Attended-to-paid — now"], value: m.trial_to_paid, set: (v) => sm((x) => { x.trial_to_paid = v; }), kind: "pct", autoPath: ap("trial_to_paid") })}
                    {Num({ label: ["التحويل — المستهدف", "Attended-to-paid — target"], value: m.trial_to_paid_target, set: (v) => sm((x) => { x.trial_to_paid_target = v; }), kind: "pct" })}
                    {Num({ label: ["عدد الأشهر للوصول إلى المستهدف", "Months to reach targets"], value: m.ramp_months, set: (v) => sm((x) => { x.ramp_months = v; }), kind: "int" })}
                  </div>
                </div>
              );
            })}
            {!readOnly && (
              <button type="button" onClick={() => upd((d) => { const base = structuredClone(d.markets[0]); base.id = `market_${d.markets.length + 1}`; base.name_ar = "سوق جديد"; base.name_en = "New market"; d.markets.push(base); })}
                className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-brand-300 px-3.5 py-1.5 text-[13px] font-semibold text-brand-600 hover:bg-brand-50"><Plus size={14} /> {ar ? "إضافة سوق" : "Add market"}</button>
            )}
          </div>
        </Section>

        <Section title={ar ? "3. مصادر الإيراد والمنتجات" : "3. Revenue streams & products"}>
          <div className="space-y-4">
            {draft.streams.map((s, si) => {
              const ss = (fn: (x: Stream) => void) => upd((d) => fn(d.streams[si]));
              const ap = (f: string) => (s.id === "core_b2c" ? `streams.core_b2c.${f}` : undefined);
              return (
                <div key={s.id} className={clsx("rounded-lg border p-3 sm:p-4", s.enabled ? "border-[#e1e7ef]" : "border-dashed border-ink-300 opacity-80")}>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <Toggle checked={s.enabled} disabled={readOnly} onChange={(v) => ss((x) => { x.enabled = v; })} label={ar ? s.name_ar : s.name_en} />
                      {s.suggested && <span className="text-[11.5px] font-semibold text-accent-700">{t("suggested")}</span>}
                    </div>
                    {!readOnly && (
                      <div className="flex gap-3 text-[12.5px] font-semibold">
                        <button type="button" className="text-ink-600" onClick={() => upd((d) => { const c = structuredClone(d.streams[si]); c.id = `${c.id}_copy${d.streams.length}`; c.name_ar += " (نسخة)"; c.name_en += " (copy)"; d.streams.splice(si + 1, 0, c); })}><Copy size={13} className="inline" /> {t("duplicate")}</button>
                        {s.id !== "core_b2c" && <button type="button" className="text-[#a02a24]" onClick={() => upd((d) => { d.streams.splice(si, 1); })}><Trash2 size={13} className="inline" /> {t("remove")}</button>}
                      </div>
                    )}
                  </div>
                  <div className={grid}>
                    {Txt({ label: ["الاسم بالعربي", "Name (Arabic)"], value: s.name_ar, set: (v) => ss((x) => { x.name_ar = v; }) })}
                    {Txt({ label: ["الاسم بالإنجليزي", "Name (English)"], value: s.name_en, set: (v) => ss((x) => { x.name_en = v; }), dir: "ltr" })}
                    {Month({ label: ["شهر الإطلاق", "Launch month"], value: s.start_month, set: (v) => ss((x) => { x.start_month = v!; }) })}
                    <FieldShell label={L(["الفئة", "Segment"])}>
                      <SelectInput value={s.category} disabled={readOnly} onChange={(v) => ss((x) => { x.category = v; x.avg_discount = Math.min(x.avg_discount, v === "b2b" ? 0.5 : 0.3); })}
                        options={[{ value: "b2c", label: L(["اشتراكات فردية (B2C)", "Individual (B2C)"]) }, { value: "b2b", label: L(["اشتراكات مؤسسية (B2B)", "Institutional (B2B)"]) }]} />
                    </FieldShell>
                    <FieldShell label={L(["مصدر العملاء الجدد", "Where new customers come from"])}>
                      <SelectInput value={s.driver} disabled={readOnly} onChange={(v) => ss((x) => { x.driver = v; if (v === "funnel" && !x.market) x.market = draft.markets[0]?.id; })}
                        options={[{ value: "funnel", label: L(["المحاضرات المجانية", "Free trial lectures"]) }, { value: "growth", label: L(["نمو شهري (شراكات / برامج)", "Monthly growth (partnerships / programs)"]) }]} />
                    </FieldShell>
                    {s.driver === "funnel" ? (
                      <>
                        <FieldShell label={L(["السوق", "Market"])}><SelectInput value={s.market ?? ""} disabled={readOnly} onChange={(v) => ss((x) => { x.market = v; })} options={marketOptions} /></FieldShell>
                        {Num({ label: ["نصيبه من المشتركين الجدد", "Share of new subscribers"], value: s.funnel_share, set: (v) => ss((x) => { x.funnel_share = v; }), kind: "pct", hint: ["توزَّع بالنسبة بين المصادر المفعّلة", "Split by share across active streams"] })}
                      </>
                    ) : (
                      <>
                        {Num({ label: ["التسجيلات في أول شهر", "Enrolments in first month"], value: s.initial_monthly, set: (v) => ss((x) => { x.initial_monthly = v; }) })}
                        {Num({ label: ["النمو الشهري", "Monthly growth"], value: s.monthly_growth, set: (v) => ss((x) => { x.monthly_growth = v; }), kind: "pct" })}
                        {Num({ label: ["أقصى تسجيلات شهرية", "Max enrolments / month"], value: s.max_monthly, set: (v) => ss((x) => { x.max_monthly = v; }) })}
                        <div className="sm:col-span-2 lg:col-span-4">
                          <p className="mb-1 text-[12.5px] font-semibold text-ink-800">{L(["شهور التسجيل", "Enrolment months"])}</p>
                          <div className="flex flex-wrap gap-1.5">
                            {Array.from({ length: 12 }, (_, i) => i + 1).map((mo) => {
                              const on = s.active_months.includes(mo);
                              return (
                                <button key={mo} type="button" disabled={readOnly} onClick={() => ss((x) => { x.active_months = on ? x.active_months.filter((y) => y !== mo) : [...x.active_months, mo].sort((a, b) => a - b); })}
                                  className={clsx("rounded-full border px-2.5 py-1 text-[12px] font-semibold", on ? "border-brand-600 bg-brand-600 text-white" : "border-ink-300 text-ink-600")}>
                                  {(ar ? MONTHS_AR : MONTHS_EN)[mo - 1]}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </>
                    )}
                    {Num({ label: ["سعر القائمة (يدفعه العميل)", "List price (customer pays)"], value: s.list_price, set: (v) => ss((x) => { x.list_price = v; }), kind: "money" })}
                    {Num({ label: ["نسبة الخصم", "Discount"], value: s.avg_discount, set: (v) => ss((x) => { x.avg_discount = Math.min(v, s.category === "b2b" ? 0.5 : 0.3); }), kind: "pct", hint: s.category === "b2b" ? ["الحد الأقصى 50%", "Maximum 50%"] : ["الحد الأقصى 30%", "Maximum 30%"] })}
                    {Num({ label: ["عدد المحاضرات", "Lessons"], value: s.lessons, set: (v) => ss((x) => { x.lessons = v; }), kind: "int", hint: ["0 = ترخيص/خدمة بدون محاضرات", "0 = licence/service without lessons"] })}
                    {Num({ label: ["محاضرات في الأسبوع", "Lessons per week"], value: s.lessons_per_week, set: (v) => ss((x) => { x.lessons_per_week = v; }) })}
                    {Num({ label: ["طلاب في المحاضرة", "Students per lesson"], value: s.group_size, set: (v) => ss((x) => { x.group_size = v; }), kind: "int" })}
                    {Num({ label: ["أجر المعلم للمحاضرة", "Teacher fee per lesson"], value: s.teacher_cost_per_lesson, set: (v) => ss((x) => { x.teacher_cost_per_lesson = v; }), kind: "money" })}
                    {Num({ label: ["عمولة مبيعات لكل اشتراك", "Sales commission per enrolment"], value: s.commission_per_enrolment, set: (v) => ss((x) => { x.commission_per_enrolment = v; }), kind: "money" })}
                    {Num({ label: ["تكلفة الإطلاق (مرة واحدة)", "Launch cost (one-off)"], value: s.launch_cost, set: (v) => ss((x) => { x.launch_cost = v; }), kind: "money" })}
                    {Num({ label: ["التجديد الآن", "Renewal now"], value: s.renewal_rate, set: (v) => ss((x) => { x.renewal_rate = v; }), kind: "pct", autoPath: ap("renewal_rate") })}
                    {Num({ label: ["التجديد — المستهدف", "Renewal — target"], value: s.renewal_rate_target, set: (v) => ss((x) => { x.renewal_rate_target = v; }), kind: "pct" })}
                    {Num({ label: ["شهور الوصول لمستهدف التجديد", "Months to renewal target"], value: s.renewal_ramp_months, set: (v) => ss((x) => { x.renewal_ramp_months = v; }), kind: "int" })}
                    {Num({ label: ["تأخير التحصيل (شهور)", "Payment delay (months)"], value: s.payment_lag_months, set: (v) => ss((x) => { x.payment_lag_months = v; }), kind: "int" })}
                    <div className="flex items-end pb-2"><Toggle checked={s.uses_gateway} disabled={readOnly} onChange={(v) => ss((x) => { x.uses_gateway = v; })} label={L(["الدفع عبر بوابة إلكترونية", "Paid through a gateway"])} /></div>
                  </div>
                </div>
              );
            })}
            {!readOnly && (
              <button type="button" onClick={() => upd((d) => { const c = structuredClone(d.streams.find((x) => x.id === "schools") ?? d.streams[0]); c.id = `stream_${d.streams.length + 1}`; c.name_ar = "مصدر إيراد جديد"; c.name_en = "New revenue stream"; c.suggested = false; c.enabled = true; d.streams.push(c); })}
                className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-brand-300 px-3.5 py-1.5 text-[13px] font-semibold text-brand-600 hover:bg-brand-50"><Plus size={14} /> {ar ? "إضافة مصدر إيراد" : "Add revenue stream"}</button>
            )}
          </div>
        </Section>

        <Section title={ar ? "4. الضرائب والزكاة والدفع" : "4. Tax, zakat & payments"}>
          <div className={grid}>
            <FieldShell label={L(["التسجيل في ضريبة القيمة المضافة", "VAT registration"])}>
              <SelectInput value={draft.tax.vat_mode} disabled={readOnly} onChange={(v) => upd((d) => { d.tax.vat_mode = v; })}
                options={[{ value: "auto", label: L(["تلقائي عند تجاوز الحد", "Automatic at the threshold"]) }, { value: "month", label: L(["من شهر محدد", "From a set month"]) }, { value: "never", label: L(["بدون", "Not registered"]) }]} />
            </FieldShell>
            {draft.tax.vat_mode === "month" && Month({ label: ["شهر التسجيل", "Registration month"], value: draft.tax.vat_from_month, set: (v) => upd((d) => { d.tax.vat_from_month = v!; }) })}
            {Num({ label: ["حد التسجيل الإلزامي (12 شهر)", "Mandatory threshold (12 months)"], value: draft.tax.vat_threshold, set: (v) => upd((d) => { d.tax.vat_threshold = v; }), kind: "money" })}
            {Num({ label: ["نسبة الضريبة", "VAT rate"], value: draft.tax.vat_rate, set: (v) => upd((d) => { d.tax.vat_rate = v; }), kind: "pct" })}
            {Num({ label: ["نسبة الزكاة", "Zakat rate"], value: draft.tax.zakat_rate, set: (v) => upd((d) => { d.tax.zakat_rate = v; }), kind: "pct" })}
            {Num({ label: ["سداد الزكاة بعد نهاية السنة (شهور)", "Zakat paid after year end (months)"], value: draft.tax.zakat_pay_lag_months, set: (v) => upd((d) => { d.tax.zakat_pay_lag_months = v; }), kind: "int" })}
            {Num({ label: ["رسوم بوابة الدفع %", "Gateway fee %"], value: draft.payments.gateway_fee_pct, set: (v) => upd((d) => { d.payments.gateway_fee_pct = v; }), kind: "pct" })}
            {Num({ label: ["رسوم ثابتة لكل عملية", "Fixed fee per payment"], value: draft.payments.gateway_fee_fixed, set: (v) => upd((d) => { d.payments.gateway_fee_fixed = v; }), kind: "money" })}
          </div>
        </Section>

        <Section title={ar ? "5. الفريق والتوظيف" : "5. Team & hiring"}>
          <div className={grid}>
            {Num({ label: ["رواتب فريق التسويق الحالي شهريًا", "Current marketing team payroll / month"], value: draft.team.marketing_payroll, set: (v) => upd((d) => { d.team.marketing_payroll = v; }), kind: "money", autoPath: "team.marketing_payroll" })}
            {Num({ label: ["رواتب بقية الفريق الحالي شهريًا", "Other current staff payroll / month"], value: draft.team.admin_payroll, set: (v) => upd((d) => { d.team.admin_payroll = v; }), kind: "money", autoPath: "team.admin_payroll" })}
            {Num({ label: ["عدد الفريق الحالي", "Current team size"], value: draft.team.base_headcount, set: (v) => upd((d) => { d.team.base_headcount = v; }), kind: "int", autoPath: "team.base_headcount" })}
            {Num({ label: ["الزيادة السنوية للرواتب", "Yearly salary raise"], value: draft.team.annual_raise, set: (v) => upd((d) => { d.team.annual_raise = v; }), kind: "pct", hint: ["مرة واحدة سنويًا في الشهر المحدد", "Once a year in the chosen month"] })}
            <FieldShell label={L(["شهر الزيادة", "Raise month"])}>
              <SelectInput value={draft.team.raise_month} disabled={readOnly} onChange={(v) => upd((d) => { d.team.raise_month = v; })} options={Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: (ar ? MONTHS_AR : MONTHS_EN)[i] }))} />
            </FieldShell>
            {Num({ label: ["تأمينات ومزايا فوق الراتب", "Employer on-costs"], value: draft.team.employer_oncost, set: (v) => upd((d) => { d.team.employer_oncost = v; }), kind: "pct" })}
            {Num({ label: ["رسوم التحويل الدولي للرواتب", "International transfer fees"], value: draft.team.intl_transfer_fee_pct, set: (v) => upd((d) => { d.team.intl_transfer_fee_pct = v; }), kind: "pct" })}
            {Num({ label: ["طاقة المعلم (محاضرة شهريًا)", "Teacher capacity (lectures / month)"], value: draft.team.teacher_capacity_lessons, set: (v) => upd((d) => { d.team.teacher_capacity_lessons = v; }), kind: "int", hint: ["من 60 إلى 80 محاضرة", "60 to 80 lectures"] })}
            {Num({ label: ["تكلفة تأهيل معلم جديد", "Onboarding cost per teacher"], value: draft.team.teacher_onboarding_cost, set: (v) => upd((d) => { d.team.teacher_onboarding_cost = v; }), kind: "money" })}
            {Num({ label: ["طاقة موظف خدمة العملاء (حجوزات واشتراكات شهريًا)", "Support agent load (bookings + subscriptions / month)"], value: draft.team.cs_load_per_agent, set: (v) => upd((d) => { d.team.cs_load_per_agent = v; }), kind: "int" })}
            {Num({ label: ["راتب موظف خدمة العملاء", "Support agent salary"], value: draft.team.cs_salary, set: (v) => upd((d) => { d.team.cs_salary = v; }), kind: "money", autoPath: "team.cs_salary" })}
            {Num({ label: ["موظفو خدمة العملاء الحاليون", "Current support agents"], value: draft.team.cs_current_agents, set: (v) => upd((d) => { d.team.cs_current_agents = v; }), kind: "int", autoPath: "team.cs_current_agents" })}
            {Month({ label: ["بداية فريق الجودة", "Quality team start"], value: draft.team.quality_start_month, set: (v) => upd((d) => { d.team.quality_start_month = v!; }) })}
            {Num({ label: ["محاضرات لكل مراجع جودة شهريًا", "Lectures per quality reviewer / month"], value: draft.team.quality_lectures_per_reviewer, set: (v) => upd((d) => { d.team.quality_lectures_per_reviewer = v; }), kind: "int" })}
            {Num({ label: ["راتب مراجع الجودة", "Quality reviewer salary"], value: draft.team.quality_salary, set: (v) => upd((d) => { d.team.quality_salary = v; }), kind: "money" })}
            {Num({ label: ["إنفاق إعلاني لكل مشترٍ للإعلانات", "Ad spend per media buyer"], value: draft.team.ad_spend_per_media_buyer, set: (v) => upd((d) => { d.team.ad_spend_per_media_buyer = v; }), kind: "money" })}
            {Num({ label: ["راتب مشتري الإعلانات", "Media buyer salary"], value: draft.team.media_buyer_salary, set: (v) => upd((d) => { d.team.media_buyer_salary = v; }), kind: "money" })}
            {Num({ label: ["مشترو الإعلانات الحاليون", "Current media buyers"], value: draft.team.media_buyers_current, set: (v) => upd((d) => { d.team.media_buyers_current = v; }), kind: "int" })}
          </div>
          <p className="mb-2 mt-5 text-[13px] font-bold text-ink-800">{L(["التوظيف المخطط", "Planned hires"])}</p>
          <div className="space-y-2">
            {draft.team.hires.map((h, hi) => (
              <div key={hi} className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[1.4fr_1.4fr_1fr_1fr_1fr_.6fr_auto]">
                {Txt({ label: ["الوظيفة", "Role (AR)"], value: h.role_ar, set: (v) => upd((d) => { d.team.hires[hi].role_ar = v; }) })}
                {Txt({ label: ["Role", "Role (EN)"], value: h.role_en, set: (v) => upd((d) => { d.team.hires[hi].role_en = v; }), dir: "ltr" })}
                <FieldShell label={L(["القسم", "Function"])}>
                  <SelectInput value={h.category} disabled={readOnly} onChange={(v) => upd((d) => { d.team.hires[hi].category = v; })} options={HIRE_CATEGORIES.map((c) => ({ value: c.value, label: ar ? c.ar : c.en }))} />
                </FieldShell>
                {Month({ label: ["من شهر", "From"], value: h.month, set: (v) => upd((d) => { d.team.hires[hi].month = v!; }) })}
                {Num({ label: ["الراتب", "Salary"], value: h.salary, set: (v) => upd((d) => { d.team.hires[hi].salary = v; }), kind: "money" })}
                {Num({ label: ["العدد", "Count"], value: h.count, set: (v) => upd((d) => { d.team.hires[hi].count = v; }), kind: "int" })}
                {!readOnly && <button type="button" aria-label={t("remove")} onClick={() => upd((d) => { d.team.hires.splice(hi, 1); })} className="mb-2 text-[#a02a24]"><Trash2 size={16} /></button>}
              </div>
            ))}
            {!readOnly && <button type="button" onClick={() => upd((d) => { d.team.hires.push({ role_ar: "وظيفة جديدة", role_en: "New role", month: d.general.start_month, salary: 3000, count: 1, category: "admin" }); })}
              className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-brand-300 px-3.5 py-1.5 text-[13px] font-semibold text-brand-600 hover:bg-brand-50"><Plus size={14} /> {ar ? "إضافة وظيفة" : "Add hire"}</button>}
          </div>
        </Section>

        <Section title={ar ? "6. مصروفات تشغيلية أخرى" : "6. Other operating expenses"}>
          <div className="space-y-2">
            {draft.opex.map((o, oi) => (
              <div key={o.id} className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[1.5fr_1fr_1fr_1fr_1fr_.8fr_auto]">
                {Txt({ label: ["البند", "Item"], value: ar ? o.name_ar : o.name_en, set: (v) => upd((d) => { if (ar) d.opex[oi].name_ar = v; else d.opex[oi].name_en = v; }) })}
                <FieldShell label={L(["التصنيف", "Category"])}>
                  <SelectInput value={o.category} disabled={readOnly} onChange={(v) => upd((d) => { d.opex[oi].category = v; })} options={(["content", "marketing_extra", "tools", "admin"] as ExpenseCategory[]).map((c) => ({ value: c, label: ar ? EXPENSE_LABELS[c].ar : EXPENSE_LABELS[c].en }))} />
                </FieldShell>
                {Num({ label: ["شهريًا", "Monthly"], value: o.monthly, set: (v) => upd((d) => { d.opex[oi].monthly = v; }), kind: "money" })}
                {Month({ label: ["من", "From"], value: o.start_month, set: (v) => upd((d) => { d.opex[oi].start_month = v!; }) })}
                {Month({ label: ["إلى (اختياري)", "To (optional)"], value: o.end_month, set: (v) => upd((d) => { d.opex[oi].end_month = v; }), allowEmpty: true })}
                {Num({ label: ["زيادة سنوية", "Yearly increase"], value: o.growth_yoy, set: (v) => upd((d) => { d.opex[oi].growth_yoy = v; }), kind: "pct" })}
                {!readOnly && <button type="button" aria-label={t("remove")} onClick={() => upd((d) => { d.opex.splice(oi, 1); })} className="mb-2 text-[#a02a24]"><Trash2 size={16} /></button>}
              </div>
            ))}
            {!readOnly && <button type="button" onClick={() => upd((d) => { d.opex.push({ id: `opex_${Date.now().toString(36)}`, category: "admin", name_ar: "بند جديد", name_en: "New item", monthly: 500, start_month: d.general.start_month, end_month: null, growth_yoy: 0 }); })}
              className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-brand-300 px-3.5 py-1.5 text-[13px] font-semibold text-brand-600 hover:bg-brand-50"><Plus size={14} /> {ar ? "إضافة بند" : "Add item"}</button>}
          </div>
        </Section>

        <Section title={ar ? "7. الاستثمارات الرأسمالية" : "7. Capital expenditure"}>
          <div className="space-y-2">
            {draft.capex.map((c, ci) => (
              <div key={ci} className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[1.6fr_1fr_1fr_1fr_auto]">
                {Txt({ label: ["البند", "Item"], value: ar ? c.name_ar : c.name_en, set: (v) => upd((d) => { if (ar) d.capex[ci].name_ar = v; else d.capex[ci].name_en = v; }) })}
                {Month({ label: ["الشهر", "Month"], value: c.month, set: (v) => upd((d) => { d.capex[ci].month = v!; }) })}
                {Num({ label: ["المبلغ", "Amount"], value: c.amount, set: (v) => upd((d) => { d.capex[ci].amount = v; }), kind: "money" })}
                {Num({ label: ["عمر الإهلاك (شهور)", "Depreciation life (months)"], value: c.life_months, set: (v) => upd((d) => { d.capex[ci].life_months = v; }), kind: "int" })}
                {!readOnly && <button type="button" aria-label={t("remove")} onClick={() => upd((d) => { d.capex.splice(ci, 1); })} className="mb-2 text-[#a02a24]"><Trash2 size={16} /></button>}
              </div>
            ))}
            {!readOnly && <button type="button" onClick={() => upd((d) => { d.capex.push({ name_ar: "أصل جديد", name_en: "New asset", month: d.general.start_month, amount: 10000, life_months: 36 }); })}
              className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-brand-300 px-3.5 py-1.5 text-[13px] font-semibold text-brand-600 hover:bg-brand-50"><Plus size={14} /> {ar ? "إضافة أصل" : "Add asset"}</button>}
          </div>
        </Section>

        <Section title={ar ? "8. التمويل والقرض" : "8. Financing & loan"}>
          <div className={grid}>
            {Num({ label: ["النقد في بداية الخطة", "Cash at plan start"], value: draft.financing.opening_cash, set: (v) => upd((d) => { d.financing.opening_cash = v; }), kind: "money", autoPath: "financing.opening_cash" })}
            {Num({ label: ["ما استثمره الملاك حتى الآن", "Owners' investment so far"], value: draft.financing.owner_invested_to_date, set: (v) => upd((d) => { d.financing.owner_invested_to_date = v; }), kind: "money", autoPath: "financing.owner_invested_to_date" })}
            <FieldShell label={L(["حجم القرض", "Loan size"])}>
              <SelectInput value={draft.financing.loan_mode} disabled={readOnly} onChange={(v) => upd((d) => { d.financing.loan_mode = v; })}
                options={[{ value: "auto", label: L(["تلقائي حسب العجز + الاحتياطي", "Auto from deficit + buffer"]) }, { value: "manual", label: L(["مبلغ محدد", "Fixed amount"]) }]} />
            </FieldShell>
            {draft.financing.loan_mode === "manual"
              ? Num({ label: ["مبلغ القرض", "Loan amount"], value: draft.financing.loan_amount, set: (v) => upd((d) => { d.financing.loan_amount = v; }), kind: "money" })
              : Num({ label: ["تقريب القرض لأقرب", "Round loan to"], value: draft.financing.loan_rounding, set: (v) => upd((d) => { d.financing.loan_rounding = v; }), kind: "money" })}
            {Num({ label: ["احتياطي نقدي (شهور مصروفات)", "Cash buffer (months of costs)"], value: draft.financing.cash_buffer_months, set: (v) => upd((d) => { d.financing.cash_buffer_months = v; }), kind: "int" })}
            {Month({ label: ["شهر صرف القرض", "Loan draw month"], value: draft.financing.loan_draw_month, set: (v) => upd((d) => { d.financing.loan_draw_month = v!; }) })}
            {Num({ label: ["معدل الربح السنوي", "Annual profit rate"], value: draft.financing.loan_rate, set: (v) => upd((d) => { d.financing.loan_rate = v; }), kind: "pct" })}
            {Num({ label: ["مدة القرض (شهور)", "Tenor (months)"], value: draft.financing.loan_tenor_months, set: (v) => upd((d) => { d.financing.loan_tenor_months = v; }), kind: "int" })}
            {Num({ label: ["فترة السماح (شهور)", "Grace period (months)"], value: draft.financing.loan_grace_months, set: (v) => upd((d) => { d.financing.loan_grace_months = v; }), kind: "int" })}
            {Num({ label: ["رسوم القرض والضمان", "Loan & guarantee fees"], value: draft.financing.loan_upfront_fee, set: (v) => upd((d) => { d.financing.loan_upfront_fee = v; }), kind: "pct" })}
          </div>
          <p className="mb-2 mt-5 text-[13px] font-bold text-ink-800">{L(["ضخ تمويل إضافي من الملاك أو مستثمرين", "Extra owner / investor equity"])}</p>
          <div className="space-y-2">
            {draft.financing.equity_injections.map((e, ei) => (
              <div key={ei} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2 sm:max-w-[520px]">
                {Month({ label: ["الشهر", "Month"], value: e.month, set: (v) => upd((d) => { d.financing.equity_injections[ei].month = v!; }) })}
                {Num({ label: ["المبلغ", "Amount"], value: e.amount, set: (v) => upd((d) => { d.financing.equity_injections[ei].amount = v; }), kind: "money" })}
                {!readOnly && <button type="button" aria-label={t("remove")} onClick={() => upd((d) => { d.financing.equity_injections.splice(ei, 1); })} className="mb-2 text-[#a02a24]"><Trash2 size={16} /></button>}
              </div>
            ))}
            {!readOnly && <button type="button" onClick={() => upd((d) => { d.financing.equity_injections.push({ month: d.general.start_month, amount: 50000 }); })}
              className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-brand-300 px-3.5 py-1.5 text-[13px] font-semibold text-brand-600 hover:bg-brand-50"><Plus size={14} /> {ar ? "إضافة تمويل" : "Add funding"}</button>}
          </div>
        </Section>

        <Section title={ar ? "9. التقييم" : "9. Valuation"}>
          <div className={grid}>
            {Num({ label: ["معدل الخصم", "Discount rate"], value: draft.valuation.discount_rate, set: (v) => upd((d) => { d.valuation.discount_rate = v; }), kind: "pct", hint: ["العائد المطلوب لشركة ناشئة في التعليم الرقمي", "Required return for an early-stage edtech"] })}
            <FieldShell label={L(["طريقة القيمة النهائية", "Terminal value method"])}>
              <SelectInput value={draft.valuation.terminal_method} disabled={readOnly} onChange={(v) => upd((d) => { d.valuation.terminal_method = v; })}
                options={[{ value: "multiple", label: L(["مضاعف الإيرادات", "Revenue multiple"]) }, { value: "gordon", label: L(["النمو الدائم", "Perpetual growth"]) }]} />
            </FieldShell>
            {Num({ label: ["مضاعف الإيرادات عند التخارج", "Exit revenue multiple"], value: draft.valuation.exit_revenue_multiple, set: (v) => upd((d) => { d.valuation.exit_revenue_multiple = v; }) })}
            {Num({ label: ["النمو الدائم", "Perpetual growth"], value: draft.valuation.terminal_growth, set: (v) => upd((d) => { d.valuation.terminal_growth = v; }), kind: "pct" })}
          </div>
        </Section>

        <Section title={ar ? "10. السيناريوهات" : "10. Scenarios"}>
          <div className="thin-scrollbar overflow-x-auto">
            <table className="w-full min-w-[620px] text-[13px]">
              <thead><tr className="text-ink-600"><th className="px-2 py-1 text-start" />{(["conservative", "base", "optimistic"] as const).map((k) => <th key={k} className="px-2 py-1 text-start">{t(`sc_${k}` as "sc_base")}</th>)}</tr></thead>
              <tbody>
                {([["trials_volume", "مضاعف عدد المحاضرات المجانية", "Free lectures ×"], ["conversion", "مضاعف التحويل", "Conversion ×"], ["cpl", "مضاعف تكلفة العميل المحتمل", "Cost per lead ×"], ["renewal", "مضاعف التجديد", "Renewal ×"], ["growth_volume", "مضاعف حجم الشراكات والبرامج", "Partnerships & programs volume ×"], ["price", "مضاعف السعر", "Price ×"], ["delay_months", "تأخير المنتجات الجديدة (بالأشهر)", "Delay of new products (months)"]] as const).map(([key, a, e]) => (
                  <tr key={key}>
                    <td className="px-2 py-1 text-ink-700">{ar ? a : e}</td>
                    {(["conservative", "base", "optimistic"] as const).map((k) => (
                      <td key={k} className="px-2 py-1"><NumInput value={draft.scenarios[k][key]} kind={key === "delay_months" ? "int" : "num"} disabled={readOnly} onChange={(v) => upd((d) => { d.scenarios[k][key] = v; })} /></td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </div>

      {/* live preview / save bar */}
      <aside className="xl:sticky xl:top-6 xl:self-start">
        <div className={clsx(CARD, "space-y-3 p-4")}>
          <p className="text-[14px] font-bold text-ink-900">{t("live_preview")} <span className="text-[12px] font-normal text-ink-500">— {t(`sc_${scenario}` as "sc_base")}</span></p>
          {shown && (
            <dl className="grid grid-cols-2 gap-y-2 text-[13px]">
              <dt className="text-ink-600">{t("revenue_y5")}</dt><dd className="ltr-content text-end font-bold">{money(shown.kpis.revenue_y5)}</dd>
              <dt className="text-ink-600">{t("ebitda_y5")}</dt><dd className={clsx("ltr-content text-end font-bold", shown.kpis.ebitda_y5 >= 0 ? "text-[#136c3a]" : "text-[#a02a24]")}>{money(shown.kpis.ebitda_y5)}</dd>
              <dt className="text-ink-600">{t("breakeven")}</dt><dd className="text-end font-semibold">{shown.kpis.ebitda_breakeven_month ? monthLabel(shown.kpis.ebitda_breakeven_month, lang) : "—"}</dd>
              <dt className="text-ink-600">{t("loan")}</dt><dd className="ltr-content text-end font-semibold">{money(shown.kpis.loan_amount)}</dd>
              <dt className="text-ink-600">{t("ev")}</dt><dd className="ltr-content text-end font-semibold">{money(shown.kpis.enterprise_value)}</dd>
              <dt className="text-ink-600">{ar ? "تطابق الأرقام" : "Reconciles"}</dt><dd className={clsx("text-end font-semibold", shown.checks.all_ok ? "text-[#136c3a]" : "text-[#a02a24]")}>{shown.checks.all_ok ? "✓" : "✗"}</dd>
            </dl>
          )}
          {preview && dirty && <p className="text-[12px] text-accent-700">{ar ? "معاينة غير محفوظة" : "Unsaved preview"}</p>}
          {error && <p className="text-[12.5px] text-[#a02a24]">{error}</p>}
          {!readOnly && (
            <div className="flex gap-2">
              <button type="button" disabled={!dirty || save.isPending} onClick={() => save.mutate()}
                className="flex-1 rounded-full bg-brand-600 py-2 text-[14px] font-semibold text-white disabled:bg-ink-200 disabled:text-ink-500">
                {save.isPending ? t("saving") : dirty ? t("save") : t("saved")}
              </button>
              {dirty && <button type="button" onClick={() => { setDraft(structuredClone(vq.data!.assumptions!)); setDirty(false); setPreview(null); }} className="rounded-full px-3 text-[13px] font-semibold text-ink-600 hover:bg-ink-100">{t("reset")}</button>}
            </div>
          )}
          {!readOnly && <button type="button" onClick={() => navigate(`../versions${location.search}`)} className="w-full text-center text-[12.5px] font-semibold text-brand-600">{ar ? "النسخ والنشر للمستثمرين ←" : "Versions & publishing →"}</button>}
        </div>
      </aside>
    </div>
  );
}
