/**
 * Executive KPI dashboard for management.
 * Layout (short on purpose):
 *   1. period filter + executive summary (5 headline numbers)
 *   2. phase goals (editable by the administrator; the only animated block)
 *   3. operations overview: journey, bookings split, interactive charts
 * Visual language: sheetventure.com cards (white, 12px radius, hairline
 * border, soft wide shadow) in the AiSchool identity (purple / orange).
 */
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDownRight, ArrowUpRight, ChevronDown, Info, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FormField, Input } from "@/components/ui/Field";
import { usePermission } from "@/permissions/usePermission";
import { PERMISSIONS } from "@/permissions/constants";
import { kpiApi, type KpiSummary, type PeriodMetrics, type PhaseGoals, type Targets } from "@/modules/kpi/services/kpiApi";
import { AnimatedText, Reveal, useCountUp, useMounted } from "@/components/motion";
import { apiErrorMessage, formatNumber, formatSAR, PLATFORM_LABELS } from "@/modules/marketing/lib";

/** sheetventure card geometry + the brand palette. */
const CARD = "rounded-xl border border-[#e1e7ef] bg-white shadow-card";
const PURPLE = "#6d3af2";
const PURPLE_SOFT = "#bea3ff";
const ORANGE = "#ff8a3d";
const GRAY = "#c3c8da";
const PLATFORM_COLORS = [PURPLE, PURPLE_SOFT, ORANGE];
const SOURCE_LABELS: Record<string, string> = {
  instagram: "إنستغرام (ميتا)", snapchat: "سناب شات", tiktok: "تيك توك", website: "تسجيل الموقع", organic: "زيارات مباشرة", other: "غير محدد المصدر",
};

const num = (v: string | number | null | undefined): number | null => (v === null || v === undefined ? null : Number(v));
const pct = (v: number | null) => (v === null ? "—" : `${v.toLocaleString("en-US", { maximumFractionDigits: 1 })}%`);
const share = (a: number, b: number) => (b > 0 ? (a / b) * 100 : null);
function change(c: number | null, p: number | null): number | null {
  if (c === null || p === null || p === 0) return null;
  return ((c - p) / Math.abs(p)) * 100;
}
const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

/** Plain text delta: arrow + % against the previous period (nothing when no comparison). */
function Delta({ current, previous, lowerIsBetter = false }: { current: number | null; previous: number | null; lowerIsBetter?: boolean }) {
  const p = change(current, previous);
  if (p === null) return null;
  if (Math.abs(p) < 0.05) return <span className="text-[12px] text-ink-500">دون تغيير</span>;
  const up = p > 0;
  const good = lowerIsBetter ? !up : up;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[12px] font-semibold ${good ? "text-[#136c3a]" : "text-[#a02a24]"}`}>
      <Icon size={13} strokeWidth={2.5} />
      <span className="ltr-content">{Math.abs(p) > 999 ? "999%+" : `${Math.abs(p).toLocaleString("en-US", { maximumFractionDigits: 0 })}%`}</span>
      <span className="font-normal text-ink-500">عن السابق</span>
    </span>
  );
}

/* ----------------------------- summary ----------------------------- */

function Summary({ cur, prev }: { cur: PeriodMetrics; prev: PeriodMetrics | null }) {
  const f = cur.funnel;
  const tiles = [
    { label: "المشتركون", value: formatNumber(f.subscribers), sub: "اشتراكات مدفوعة", c: f.subscribers, p: prev?.funnel.subscribers ?? null, low: false },
    { label: "الإيراد", value: formatSAR(cur.revenue.total_paid), sub: cur.revenue.avg_paid ? `متوسط ${formatSAR(cur.revenue.avg_paid)} / مشترك` : "—", c: num(cur.revenue.total_paid), p: prev ? num(prev.revenue.total_paid) : null, low: false },
    { label: "التكلفة", value: formatSAR(cur.marketing.total_spend), sub: cur.marketing.cac ? `${formatSAR(cur.marketing.cac)} لكل مشترك` : "لا مشتركين بعد", c: num(cur.marketing.total_spend), p: prev ? num(prev.marketing.total_spend) : null, low: true },
    { label: "نسبة الحضور", value: pct(cur.funnel_rates.booked_to_attended), sub: `${formatNumber(f.attended)} من ${formatNumber(f.decided)} محاضرة مسجّلة`, c: cur.funnel_rates.booked_to_attended, p: prev?.funnel_rates.booked_to_attended ?? null, low: false },
    { label: "التحويل من الحاضرين", value: pct(cur.funnel_rates.attended_to_subscriber), sub: `${formatNumber(f.subscribers)} مشترك من ${formatNumber(f.attended)} حضروا`, c: cur.funnel_rates.attended_to_subscriber, p: prev?.funnel_rates.attended_to_subscriber ?? null, low: false },
  ];
  return (
    <section>
      <h2 className="mb-3 text-[18px] font-bold text-ink-900">الملخص التنفيذي</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {tiles.map((t, i) => (
          <div key={t.label} className={`${CARD} flex flex-col gap-0.5 p-4 ${i === tiles.length - 1 ? "col-span-2 md:col-span-1" : ""}`}>
            <p className="text-[13px] font-medium text-ink-600">{t.label}</p>
            <p className="ltr-content mt-1 whitespace-nowrap text-right text-[24px] font-bold leading-8 tracking-tight text-ink-900 sm:text-[26px]">{t.value}</p>
            <p className="text-[12.5px] leading-snug text-ink-600">{t.sub}</p>
            <div className="mt-1 min-h-[16px]"><Delta current={t.c} previous={t.p} lowerIsBetter={t.low} /></div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ----------------------------- phase goals ----------------------------- */

function GoalBar({ progress, color, label }: { progress: number; color: string; label: string }) {
  const mounted = useMounted(150);
  const pctNow = useCountUp(Math.round(progress * 100), 1200);
  return (
    <div className="flex items-center gap-2.5" role="img" aria-label={label}>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-100">
        <div className="h-full rounded-full transition-[width] duration-[1300ms] ease-out-expo" style={{ width: mounted ? `${Math.max(progress * 100, progress > 0 ? 3 : 0)}%` : "0%", backgroundColor: color }} />
      </div>
      <span className="ltr-content w-9 shrink-0 text-end text-[12px] font-semibold text-ink-700">{Math.round(pctNow)}%</span>
    </div>
  );
}

function GoalsEditor({ goals, onClose }: { goals: PhaseGoals; onClose: () => void }) {
  const qc = useQueryClient();
  const t = goals.targets;
  const [f, setF] = useState({
    phase_start: goals.start, phase_end_inclusive: goals.end_inclusive,
    subscribers: String(t.subscribers), max_cac: String(t.max_cac), min_conversion: String(t.min_conversion), min_attendance: String(t.min_attendance),
  });
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => kpiApi.updateSettings({
      phase_start: f.phase_start || null, phase_end_inclusive: f.phase_end_inclusive || null,
      subscribers: Number(f.subscribers) || null, max_cac: Number(f.max_cac) || null,
      min_conversion: f.min_conversion === "" ? null : Number(f.min_conversion), min_attendance: f.min_attendance === "" ? null : Number(f.min_attendance),
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["kpi-summary"] }),
  });
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try { await save.mutateAsync(); onClose(); } catch (err) { setError(apiErrorMessage(err)); }
  }
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((s) => ({ ...s, [k]: e.target.value }));
  return (
    <form onSubmit={submit} className={`${CARD} mb-3 p-4 sm:p-5`}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[15px] font-bold text-ink-900">تعديل المرحلة والأهداف</h3>
        <button type="button" onClick={onClose} aria-label="إغلاق" className="rounded-full p-1.5 text-ink-600 hover:bg-ink-100"><X size={18} /></button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <FormField label="بداية المرحلة"><Input type="date" dir="ltr" value={f.phase_start} onChange={set("phase_start")} required /></FormField>
        <FormField label="نهاية المرحلة"><Input type="date" dir="ltr" value={f.phase_end_inclusive} onChange={set("phase_end_inclusive")} required /></FormField>
        <FormField label="هدف عدد المشتركين"><Input type="number" min={1} dir="ltr" value={f.subscribers} onChange={set("subscribers")} required /></FormField>
        <FormField label="أقصى تكلفة اكتساب مشترك (ر.س)"><Input type="number" min={1} step="any" dir="ltr" value={f.max_cac} onChange={set("max_cac")} required /></FormField>
        <FormField label="هدف التحويل من الحاضرين (%)"><Input type="number" min={0} max={100} step="any" dir="ltr" value={f.min_conversion} onChange={set("min_conversion")} required /></FormField>
        <FormField label="هدف نسبة الحضور (%)"><Input type="number" min={0} max={100} step="any" dir="ltr" value={f.min_attendance} onChange={set("min_attendance")} required /></FormField>
      </div>
      {error && <p className="mt-3 text-[14px] text-danger-700">{error}</p>}
      <div className="mt-4 flex gap-2">
        <Button type="submit" variant="primary" isLoading={save.isPending}>حفظ</Button>
        <Button type="button" variant="ghost" onClick={onClose}>إلغاء</Button>
      </div>
      <p className="mt-3 text-[12.5px] text-ink-600">كل الأرقام في الصفحة تُحسب تلقائيًا بحسب هذه التواريخ.</p>
    </form>
  );
}

/** Phase goals: the only block with number motion. */
function GoalsStrip({ goals, canManage }: { goals: PhaseGoals; canManage: boolean }) {
  const [editing, setEditing] = useState(false);
  const t: Targets = goals.targets, m = goals.metrics;
  const cac = num(m.cac);
  type State = "met" | "near" | "behind" | "none";
  const st = (ok: boolean, ratio: number, has: boolean): State => (!has ? "none" : ok ? "met" : ratio >= 0.7 ? "near" : "behind");
  const rows: { label: string; info: string; value: string; goal: string; progress: number; state: State }[] = [
    {
      label: "عدد المشتركين", info: "المشتركون المدفوعون خلال المرحلة",
      value: `${formatNumber(m.subscribers)} / ${formatNumber(t.subscribers)}`, goal: `متبقٍ ${formatNumber(Math.max(t.subscribers - m.subscribers, 0))}`,
      progress: Math.min(m.subscribers / t.subscribers, 1), state: st(m.subscribers >= t.subscribers, m.subscribers / t.subscribers, true),
    },
    {
      label: "تكلفة اكتساب المشترك", info: `إجمالي الإنفاق الإعلاني ÷ المشتركين · إنفاق ${formatSAR(m.total_spend)}`,
      value: cac === null ? "—" : formatSAR(cac), goal: `الحد الأقصى ${formatSAR(t.max_cac)}`,
      progress: cac === null ? 0 : Math.min(t.max_cac / Math.max(cac, 1), 1), state: st(cac !== null && cac < t.max_cac, cac ? t.max_cac / cac : 0, cac !== null),
    },
    {
      label: "التحويل من الحاضرين", info: "المشتركون ÷ من حضروا المحاضرة",
      value: pct(m.conversion), goal: `الهدف ‎${t.min_conversion}%‎`,
      progress: Math.min((m.conversion ?? 0) / t.min_conversion, 1), state: st((m.conversion ?? 0) >= t.min_conversion, (m.conversion ?? 0) / t.min_conversion, m.conversion !== null),
    },
    {
      label: "نسبة الحضور", info: `${formatNumber(m.attended)} حضروا من ${formatNumber(m.decided)} محاضرة مسجّلة (حضروا + لم يحضروا)`,
      value: pct(m.attendance_rate), goal: `الهدف ‎${t.min_attendance}%‎`,
      progress: Math.min((m.attendance_rate ?? 0) / t.min_attendance, 1), state: st((m.attendance_rate ?? 0) >= t.min_attendance, (m.attendance_rate ?? 0) / t.min_attendance, m.attendance_rate !== null),
    },
  ];
  const status = {
    met: { text: "تحقق الهدف", color: "#1f8a52", cls: "text-[#136c3a]" },
    near: { text: "قريب", color: ORANGE, cls: "text-accent-700" },
    behind: { text: "دون الهدف", color: "#d9453d", cls: "text-[#a02a24]" },
    none: { text: "بانتظار البيانات", color: GRAY, cls: "text-ink-600" },
  } as const;
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <div>
          <h2 className="text-[18px] font-bold text-ink-900">أهداف المرحلة الأولى</h2>
          <p className="ltr-content text-[12.5px] text-ink-600">{fmtDate(goals.start)} → {fmtDate(goals.end_inclusive)}</p>
        </div>
        {canManage && !editing && (
          <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1.5 rounded-full border border-[#e1e7ef] bg-white px-3.5 py-1.5 text-[13px] font-semibold text-brand-600 hover:bg-brand-50">
            <Pencil size={14} /> تعديل الأهداف
          </button>
        )}
      </div>
      {editing && <GoalsEditor key={`${goals.start}-${goals.end_inclusive}-${JSON.stringify(goals.targets)}`} goals={goals} onClose={() => setEditing(false)} />}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {rows.map((r, i) => (
          <Reveal key={r.label} delay={i * 90} className="h-full">
            <div className={`${CARD} flex h-full flex-col p-4`}>
              <p className="flex items-center gap-1.5 text-[13px] font-medium text-ink-600">
                <span>{r.label}</span>
                <span title={r.info} className="shrink-0 cursor-help text-ink-400"><Info size={13} /></span>
              </p>
              <p className="ltr-content mt-1 whitespace-nowrap text-right text-[22px] font-bold leading-8 tracking-tight text-ink-900 sm:text-[24px]"><AnimatedText text={r.value} /></p>
              <div className="mt-2">
                <GoalBar progress={r.progress} color={r.state === "met" ? "#1f8a52" : r.state === "behind" ? "#d9453d" : r.state === "near" ? ORANGE : GRAY} label={`${r.label}: ${Math.round(r.progress * 100)}% من الهدف`} />
              </div>
              <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 border-t border-[#eef1f6] pt-2 text-[12px] text-ink-600">
                <span className={`inline-flex items-center gap-1.5 font-semibold ${status[r.state].cls}`}>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: status[r.state].color }} />{status[r.state].text}
                </span>
                <span>{r.goal}</span>
              </div>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ----------------------------- operations overview ----------------------------- */

type Tab = "trend" | "source" | "spend";
type MetricKey = "leads" | "booked" | "attended" | "subscribers";
const METRICS: { key: MetricKey; label: string; color: string }[] = [
  { key: "leads", label: "محتملون", color: PURPLE_SOFT },
  { key: "booked", label: "الحجوزات", color: PURPLE },
  { key: "attended", label: "حضروا", color: "#3b1fa8" },
  { key: "subscribers", label: "مشتركون", color: ORANGE },
];

const tooltipStyle = { borderRadius: 10, border: "1px solid #e1e7ef", fontSize: 13, boxShadow: "0 4px 24px -4px rgba(138,151,171,0.5)" };

function Stat({ label, hint, value, rate, rateLabel }: { label: string; hint?: string; value: number; rate?: number | null; rateLabel?: string }) {
  return (
    <div className="rounded-lg border border-[#eef1f6] bg-white p-3">
      <p className="text-[12.5px] font-medium text-ink-600">{label}</p>
      <p className="ltr-content mt-0.5 text-right text-[22px] font-bold leading-7 text-ink-900">{formatNumber(value)}</p>
      <p className="min-h-[16px] text-[12px] text-ink-600">
        {rate !== undefined && rate !== null ? <><span className="ltr-content font-semibold text-brand-700">{pct(rate)}</span> {rateLabel}</> : <span className="hidden sm:inline">{hint}</span>}
      </p>
    </div>
  );
}

function Operations({ cur }: { cur: PeriodMetrics }) {
  const f = cur.funnel;
  const [tab, setTab] = useState<Tab>("trend");
  const [active, setActive] = useState<Record<MetricKey, boolean>>({ leads: true, booked: true, attended: true, subscribers: true });
  const [hover, setHover] = useState<string | null>(null);
  const series = cur.series ?? [];
  const sources = useMemo(() => {
    // website sign-ups, organic and unknown sources are all one thing for management: direct visits
    const DIRECT = new Set(["website", "organic", "other"]);
    type Row = { name: string; attended: number; not_attended: number; pending: number; not_booked: number; leads: number };
    const rows: Row[] = [];
    let direct = null as Row | null;
    for (const s of cur.sources ?? []) {
      const r = { name: SOURCE_LABELS[s.source] ?? s.source, attended: s.attended, not_attended: s.not_attended, pending: s.pending, not_booked: Math.max(s.leads - s.booked, 0), leads: s.leads };
      if (DIRECT.has(s.source)) {
        direct = direct
          ? { ...direct, attended: direct.attended + r.attended, not_attended: direct.not_attended + r.not_attended, pending: direct.pending + r.pending, not_booked: direct.not_booked + r.not_booked, leads: direct.leads + r.leads }
          : { ...r, name: "زيارات مباشرة" };
      } else rows.push(r);
    }
    if (direct) rows.push(direct);
    return rows;
  }, [cur.sources]);
  const total = Math.max(f.booked, 1);
  const split = [
    { key: "attended", label: "حضروا", v: f.attended, color: PURPLE },
    { key: "not_attended", label: "لم يحضروا", v: f.not_attended, color: ORANGE },
    { key: "pending", label: "بانتظار تغيّر الحالة", v: f.pending_attendance, color: GRAY },
  ];
  const platforms = cur.marketing.platforms;
  const spendTotal = Number(cur.marketing.total_spend) || 0;
  const pie = platforms.map((p) => ({ name: PLATFORM_LABELS[p.platform], value: Number(p.spend) || 0 })).filter((d) => d.value > 0);
  const tabs: { key: Tab; label: string }[] = [
    { key: "trend", label: "الاتجاه الشهري" }, { key: "source", label: "المصادر" }, { key: "spend", label: "الإنفاق" },
  ];
  return (
    <section>
      <h2 className="mb-3 text-[18px] font-bold text-ink-900">ملخص التشغيل الفعلي</h2>
      <div className={`${CARD} p-4 sm:p-5`}>
        {/* journey */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <Stat label="محتملون" hint="تسجيلات الإعلانات والزيارات المباشرة" value={f.leads} />
          <Stat label="الحجوزات" value={f.booked} rate={cur.funnel_rates.lead_to_booked} rateLabel="من المحتملين" />
          <Stat label="اشتركوا" value={f.subscribers} rate={cur.funnel_rates.attended_to_subscriber} rateLabel="من الحاضرين" />
        </div>

        {/* bookings = attended + not attended + pending */}
        <div className="mt-4 rounded-lg bg-ink-100/50 p-3.5">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-1 text-[13.5px]">
            <span className="font-semibold text-ink-900">تفصيل الحجوزات</span>
            <span className="ltr-content font-semibold text-ink-900">{formatNumber(f.attended)} + {formatNumber(f.not_attended)} + {formatNumber(f.pending_attendance)} = {formatNumber(f.booked)}</span>
          </div>
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-white" dir="ltr">
            {split.map((s) => s.v > 0 && (
              <div key={s.key} title={`${s.label}: ${s.v}`} onMouseEnter={() => setHover(s.key)} onMouseLeave={() => setHover(null)}
                className="transition-opacity" style={{ width: `${(s.v / total) * 100}%`, backgroundColor: s.color, opacity: hover && hover !== s.key ? 0.35 : 1 }} />
            ))}
          </div>
          <div className="mt-2.5 grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-3">
            {split.map((s) => (
              <button key={s.key} type="button" onMouseEnter={() => setHover(s.key)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(s.key)} onBlur={() => setHover(null)}
                className="flex items-center gap-2 text-start text-[13px] text-ink-700">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                <span className="flex-1">{s.label}</span>
                <span className="ltr-content font-semibold text-ink-900">{formatNumber(s.v)}</span>
                <span className="ltr-content w-12 text-end text-ink-500">{pct(share(s.v, f.booked))}</span>
              </button>
            ))}
          </div>
        </div>

        {/* tabs */}
        <div className="mt-5 flex gap-1.5 overflow-x-auto border-b border-[#eef1f6] pb-3" role="tablist">
          {tabs.map((t) => (
            <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
              className={"shrink-0 rounded-full px-4 py-1.5 text-[13.5px] font-semibold transition-colors " + (tab === t.key ? "bg-brand-600 text-white" : "text-ink-700 hover:bg-ink-100")}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === "trend" && (
          <div className="pt-4">
            <div className="mb-2 flex flex-wrap gap-2">
              {METRICS.map((m) => (
                <button key={m.key} type="button" aria-pressed={active[m.key]} onClick={() => setActive((a) => ({ ...a, [m.key]: !a[m.key] }))}
                  className={"inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12.5px] font-medium transition-colors " + (active[m.key] ? "border-[#e1e7ef] bg-white text-ink-900" : "border-transparent bg-ink-100 text-ink-500")}>
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: active[m.key] ? m.color : GRAY }} />{m.label}
                </button>
              ))}
            </div>
            <div className="ltr-content h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={series} margin={{ top: 8, right: 4, left: -20, bottom: 0 }} barGap={3}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef1f6" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: "#40455f", fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fill: "#555b7a", fontSize: 12 }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: "rgba(109,58,242,0.06)" }} contentStyle={tooltipStyle} />
                  {METRICS.filter((m) => active[m.key]).map((m) => (
                    <Bar key={m.key} dataKey={m.key} name={m.label} fill={m.color} radius={[6, 6, 0, 0]} maxBarSize={26} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-2 text-[12px] text-ink-500">الأعمدة بحسب شهر التسجيل. التسجيلات السابقة للإطلاق تُحتسب في الشهر الأول.</p>
          </div>
        )}

        {tab === "source" && (
          <div className="pt-4">
            <div className="ltr-content" style={{ height: Math.max(220, sources.length * 46 + 50) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sources} layout="vertical" margin={{ top: 0, right: 12, left: 8, bottom: 0 }} barSize={16}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef1f6" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fill: "#555b7a", fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={110} tick={{ fill: "#2d3149", fontSize: 12 }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: "rgba(109,58,242,0.06)" }} contentStyle={tooltipStyle} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="attended" name="حضروا" stackId="a" fill={PURPLE} />
                  <Bar dataKey="not_attended" name="لم يحضروا" stackId="a" fill={ORANGE} />
                  <Bar dataKey="pending" name="بانتظار تغيّر الحالة" stackId="a" fill={GRAY} />
                  <Bar dataKey="not_booked" name="لم يحجزوا" stackId="a" fill="#eceef5" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-1 text-[12px] text-ink-500">كل شريط = عدد المحتملين من المصدر مقسّمًا على حالة الحجز.</p>
          </div>
        )}

        {tab === "spend" && (
          <div className="grid grid-cols-1 items-center gap-5 pt-4 md:grid-cols-[220px_1fr]">
            <div className="relative mx-auto h-[190px] w-[190px]">
              {pie.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pie} dataKey="value" innerRadius={62} outerRadius={88} paddingAngle={3} stroke="none" cornerRadius={6}>
                      {pie.map((_, i) => <Cell key={i} fill={PLATFORM_COLORS[i % PLATFORM_COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => formatSAR(v)} />
                  </PieChart>
                </ResponsiveContainer>
              ) : <div className="flex h-full items-center justify-center rounded-full bg-ink-100 text-[13px] text-ink-600">لا إنفاق</div>}
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[12px] text-ink-600">الإجمالي</span>
                <span className="ltr-content text-[20px] font-bold text-ink-900">{formatNumber(Math.round(spendTotal))}</span>
                <span className="text-[12px] text-ink-600">ر.س</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[13.5px]">
                <thead>
                  <tr className="border-b border-[#e1e7ef] text-ink-600">
                    <th className="py-2 text-start font-semibold">المنصة</th>
                    <th className="py-2 text-start font-semibold">الإنفاق</th>
                    <th className="py-2 text-start font-semibold">عملاء</th>
                    <th className="py-2 text-start font-semibold">تكلفة/عميل</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#eef1f6]">
                  {platforms.map((p, i) => (
                    <tr key={p.platform}>
                      <td className="whitespace-nowrap py-2.5 font-semibold text-ink-900"><span className="me-2 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ backgroundColor: PLATFORM_COLORS[i % PLATFORM_COLORS.length] }} />{PLATFORM_LABELS[p.platform]}</td>
                      <td className="ltr-content whitespace-nowrap py-2.5 text-start text-ink-800">{formatSAR(p.spend)} <span className="text-ink-500">({pct(share(Number(p.spend), spendTotal))})</span></td>
                      <td className="ltr-content py-2.5 text-start text-ink-800">{formatNumber(p.leads)}</td>
                      <td className="ltr-content whitespace-nowrap py-2.5 text-start font-medium text-ink-900">{p.cost_per_lead ? formatSAR(p.cost_per_lead) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                {cur.marketing.includes_cumulative && <p className="flex items-start gap-1.5 text-[12px] text-ink-600"><Info size={14} className="mt-0.5 shrink-0" />بعض الحملات أرقامها تراكمية بدون تواريخ فتُحتسب كاملةً على الفترة الحالية.</p>}
                <Link to="/marketing/campaigns" className="text-[13px] font-semibold text-brand-600 hover:underline">إدارة الحملات</Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

/* ----------------------------- page ----------------------------- */

function PageSkeleton(): ReactNode {
  return (
    <div className="space-y-5" aria-busy="true">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-[110px] !rounded-xl" />)}</div>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-[120px] !rounded-xl" />)}</div>
      <div className="skeleton h-[420px] !rounded-xl" />
    </div>
  );
}

export function KpiDashboardPage() {
  const canManage = usePermission(PERMISSIONS.DASHBOARDS_MANAGE);
  const [period, setPeriod] = useState<string | undefined>(undefined);
  const { data, isLoading, isError } = useQuery<KpiSummary>({ queryKey: ["kpi-summary", period ?? "default"], queryFn: () => kpiApi.summary(period), placeholderData: (p) => p });
  const cur = data?.current;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-bold leading-9 tracking-tight text-ink-900 sm:text-[30px]">مؤشرات أداء المشروع</h1>
          {cur && <p className="mt-0.5 text-[14px] text-ink-600">{cur.label}{data?.previous ? ` · مقارنة بـ ${data.previous.label}` : ""}</p>}
        </div>
        {data && (
          <label className="relative block">
            <span className="sr-only">الفترة</span>
            <select
              value={period ?? data.selected}
              onChange={(e) => setPeriod(e.target.value)}
              className="h-10 max-w-[88vw] appearance-none rounded-full border border-[#e1e7ef] bg-white py-0 pe-4 ps-10 text-[14px] font-semibold text-ink-900 shadow-card outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            >
              {data.periods.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
            <ChevronDown size={16} className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-ink-600" />
          </label>
        )}
      </div>

      {isLoading && <PageSkeleton />}
      {isError && <p className="rounded-xl bg-danger-50 px-5 py-4 text-[15px] font-medium text-danger-700">تعذّر تحميل المؤشرات.</p>}

      {data && cur && (
        <div className="space-y-7">
          <Summary cur={cur} prev={data.previous} />
          <GoalsStrip goals={data.phase_goals} canManage={canManage} />
          <Operations cur={cur} />
        </div>
      )}
    </div>
  );
}
