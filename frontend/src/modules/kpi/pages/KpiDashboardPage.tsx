/**
 * Executive KPI dashboard (half-yearly) for management.
 * Design language follows sheetventure.com: soft #f5f7fa canvas, white cards
 * (12px radius, hairline border, wide soft shadow), near-black headings,
 * pill controls. Brand purple/orange are used only as accents.
 *
 * Reading order (kept deliberately short):
 *   1. executive summary (4 headline numbers)
 *   2. test-phase goals
 *   3. funnel (booked = attended + not attended)
 *   4. ad spend by platform
 */
import { useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { ArrowDownRight, ArrowUpRight, ChevronDown, ChevronLeft, ChevronRight, Info } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FormField, Input } from "@/components/ui/Field";
import { usePermission } from "@/permissions/usePermission";
import { PERMISSIONS } from "@/permissions/constants";
import { kpiApi, type PeriodMetrics, type Phases, type TestPhase } from "@/modules/kpi/services/kpiApi";
import { AnimatedText, Reveal, useCountUp, useMounted } from "@/components/motion";
import { apiErrorMessage, formatNumber, formatSAR, PLATFORM_LABELS } from "@/modules/marketing/lib";

const HALF_LABEL: Record<number, string> = { 1: "النصف الأول · يناير – يونيو", 2: "النصف الثاني · يوليو – ديسمبر" };
const PLATFORM_COLORS = ["#6d3af2", "#bea3ff", "#ff8a3d", "#2fa56f"];
/** sheetventure card: white, 12px radius, hairline border, wide soft shadow. */
const CARD = "rounded-xl border border-[#e1e7ef] bg-white shadow-[0_4px_24px_-4px_rgba(138,151,171,0.5)]";

function currentHalf(): { year: number; half: 1 | 2 } {
  const d = new Date();
  return { year: d.getFullYear(), half: d.getMonth() < 6 ? 1 : 2 };
}
function shiftHalf(year: number, half: 1 | 2, delta: number): { year: number; half: 1 | 2 } {
  const idx = year * 2 + (half - 1) + delta;
  return { year: Math.floor(idx / 2), half: ((idx % 2) + 1) as 1 | 2 };
}
const num = (v: string | number | null | undefined): number | null => (v === null || v === undefined ? null : Number(v));
const pct = (v: number | null) => (v === null ? "—" : `${v.toLocaleString("en-US", { maximumFractionDigits: 1 })}%`);
function change(c: number | null, p: number | null): number | null {
  if (c === null || p === null || p === 0) return null;
  return ((c - p) / Math.abs(p)) * 100;
}

/** Plain text delta (no colored badge): arrow + % vs previous half. */
function Delta({ current, previous, lowerIsBetter = false }: { current: number | null; previous: number | null; lowerIsBetter?: boolean }) {
  const p = change(current, previous);
  if (p === null) return <span className="text-[13px] text-ink-500">لا مقارنة سابقة</span>;
  if (Math.abs(p) < 0.05) return <span className="text-[13px] text-ink-500">دون تغيير عن السابق</span>;
  const up = p > 0;
  const good = lowerIsBetter ? !up : up;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-1 text-[13px] font-semibold ${good ? "text-[#136c3a]" : "text-[#a02a24]"}`}>
      <Icon size={15} strokeWidth={2.5} />
      <span className="ltr-content">{Math.abs(p) > 999 ? "999%+" : `${Math.abs(p).toLocaleString("en-US", { maximumFractionDigits: 0 })}%`}</span>
      <span className="font-normal text-ink-500">عن السابق</span>
    </span>
  );
}

/* ----------------------------- summary ----------------------------- */

function Summary({ cur, prev }: { cur: PeriodMetrics; prev: PeriodMetrics }) {
  const f = cur.funnel;
  const items = [
    { label: "الإيراد المحصَّل", value: formatSAR(cur.revenue.total_paid), sub: `${formatNumber(cur.revenue.subscribers)} مشترك`, c: num(cur.revenue.total_paid), p: num(prev.revenue.total_paid), low: false },
    { label: "الحجوزات", value: formatNumber(f.booked), sub: `حضر ${formatNumber(f.attended)} + لم يحضر ${formatNumber(f.not_attended)}`, c: f.booked, p: prev.funnel.booked, low: false },
    { label: "نسبة الحضور", value: pct(cur.funnel_rates.booked_to_attended), sub: "من إجمالي الحجوزات", c: cur.funnel_rates.booked_to_attended, p: prev.funnel_rates.booked_to_attended, low: false },
    { label: "تكلفة اكتساب المشترك", value: cur.marketing.cac ? formatSAR(cur.marketing.cac) : "—", sub: `إنفاق ${formatSAR(cur.marketing.total_spend)}`, c: num(cur.marketing.cac), p: num(prev.marketing.cac), low: true },
  ];
  return (
    <section className={`${CARD} grid grid-cols-1 divide-y divide-[#e1e7ef] sm:grid-cols-2 sm:divide-y-0 xl:grid-cols-4 xl:divide-x xl:divide-x-reverse`}>
      {items.map((it) => (
        <div key={it.label} className="flex flex-col gap-1.5 p-5 sm:p-6">
          <p className="text-[15px] font-medium text-ink-600">{it.label}</p>
          <p className="ltr-content whitespace-nowrap text-right text-[34px] font-bold leading-[44px] tracking-tight text-[#0d141c] sm:text-[38px]">{it.value}</p>
          <p className="text-[13.5px] text-ink-600">{it.sub}</p>
          <Delta current={it.c} previous={it.p} lowerIsBetter={it.low} />
        </div>
      ))}
    </section>
  );
}

/* ----------------------------- phases ----------------------------- */

function GoalBar({ progress, color, label }: { progress: number; color: string; label: string }) {
  const mounted = useMounted(150);
  const pctNow = useCountUp(Math.round(progress * 100), 1200);
  return (
    <div className="flex items-center gap-3" role="img" aria-label={label}>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#eef1f6]">
        <div className="h-full rounded-full transition-[width] duration-[1300ms] ease-out-expo" style={{ width: mounted ? `${Math.max(progress * 100, progress > 0 ? 3 : 0)}%` : "0%", backgroundColor: color }} />
      </div>
      <span className="ltr-content w-10 shrink-0 text-end text-[13px] font-semibold text-ink-700">{Math.round(pctNow)}%</span>
    </div>
  );
}

/** Test-phase goals — the only block with number motion. */
function TargetsStrip({ tp }: { tp: TestPhase }) {
  const t = tp.targets, m = tp.metrics;
  const cac = num(m.cac);
  type State = "met" | "near" | "behind" | "none";
  const st = (ok: boolean, ratio: number, has: boolean): State => (!has ? "none" : ok ? "met" : ratio >= 0.7 ? "near" : "behind");
  const rows: { label: string; info: string; value: string; goal: string; progress: number; state: State }[] = [
    {
      label: "عدد العملاء", info: "عدد المشتركين المدفوعين خلال مرحلة الاختبار",
      value: `${formatNumber(m.subscribers)} / ${formatNumber(t.subscribers)}`, goal: `متبقٍ ${formatNumber(Math.max(t.subscribers - m.subscribers, 0))} عميل`,
      progress: Math.min(m.subscribers / t.subscribers, 1), state: st(m.subscribers >= t.subscribers, m.subscribers / t.subscribers, true),
    },
    {
      label: "تكلفة اكتساب العميل", info: `إجمالي الإنفاق الإعلاني ÷ المشتركين · إنفاق ${formatSAR(m.total_spend)}`,
      value: cac === null ? "—" : formatSAR(cac), goal: `الهدف أقل من ${formatSAR(t.max_cac)}`,
      progress: cac === null ? 0 : Math.min(t.max_cac / Math.max(cac, 1), 1), state: st(cac !== null && cac < t.max_cac, cac ? t.max_cac / cac : 0, cac !== null),
    },
    {
      label: "التحويل من الحاضرين", info: "المشتركون ÷ من حضروا المحاضرة (وليس من إجمالي المحتملين)",
      value: pct(m.conversion), goal: `الهدف ‎${t.min_conversion}%‎`,
      progress: Math.min((m.conversion ?? 0) / t.min_conversion, 1), state: st((m.conversion ?? 0) >= t.min_conversion, (m.conversion ?? 0) / t.min_conversion, m.conversion !== null),
    },
    {
      label: "نسبة حضور المحاضرة", info: `${formatNumber(m.attended)} حضروا من ${formatNumber(m.booked)} حجز (حضروا + لم يحضروا)`,
      value: pct(m.attendance_rate), goal: `الهدف ‎${t.min_attendance}%‎`,
      progress: Math.min((m.attendance_rate ?? 0) / t.min_attendance, 1), state: st((m.attendance_rate ?? 0) >= t.min_attendance, (m.attendance_rate ?? 0) / t.min_attendance, m.attendance_rate !== null),
    },
  ];
  const status = {
    met: { text: "تحقق الهدف", color: "#1f8a52", cls: "text-[#136c3a]" },
    near: { text: "قريب من الهدف", color: "#ff8a3d", cls: "text-accent-700" },
    behind: { text: "دون الهدف", color: "#d9453d", cls: "text-[#a02a24]" },
    none: { text: "بانتظار البيانات", color: "#b7bdd3", cls: "text-ink-600" },
  } as const;
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-[20px] font-bold text-[#0d141c]">أهداف مرحلة الاختبار</h2>
        <p className="ltr-content text-[13px] text-ink-600">
          {tp.start} → {tp.end_inclusive}
          {!tp.configured && <span className="font-sans"> · النصف المحدد (لم تُحدَّد بداية المشروع)</span>}
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {rows.map((r, i) => (
          <Reveal key={r.label} delay={i * 90} className="h-full">
            <div className={`${CARD} flex h-full flex-col p-5`}>
              <p className="flex items-center gap-1.5 text-[15px] font-medium text-ink-600">
                <span>{r.label}</span>
                <span title={r.info} className="shrink-0 cursor-help text-ink-400"><Info size={14} /></span>
              </p>
              <p className="ltr-content mt-2 whitespace-nowrap text-right text-[28px] font-bold leading-10 tracking-tight text-[#0d141c]"><AnimatedText text={r.value} /></p>
              <div className="mt-3">
                <GoalBar progress={r.progress} color={r.state === "met" ? "#1f8a52" : r.state === "behind" ? "#d9453d" : r.state === "near" ? "#ff8a3d" : "#b7bdd3"} label={`${r.label}: ${Math.round(r.progress * 100)}% من الهدف`} />
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-[#e1e7ef] pt-3 text-[13px] text-ink-600">
                <span className={`inline-flex items-center gap-1.5 font-semibold ${status[r.state].cls}`}>
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: status[r.state].color }} />{status[r.state].text}
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

function PhaseChip({ phases }: { phases: Phases }) {
  const canManage = usePermission(PERMISSIONS.DASHBOARDS_MANAGE);
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [start, setStart] = useState(phases.project_start_date ?? "");
  const [launch, setLaunch] = useState(phases.full_launch_date ?? "");
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => kpiApi.updateSettings({ project_start_date: start || null, full_launch_date: launch || null }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["kpi-summary"] }),
  });
  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try { await save.mutateAsync(); setEditing(false); } catch (err) { setError(apiErrorMessage(err)); }
  }
  const label = phases.current_phase === "full_launch" ? "الضخ الفعلي" : "اختبار السوق";
  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-2 rounded-full border border-[#e1e7ef] bg-white px-3.5 py-1.5 text-[14px] font-medium text-ink-800">
          <span className="h-2 w-2 rounded-full bg-[#2fa56f]" />المرحلة الحالية: {label}
        </span>
        {canManage && !editing && <button onClick={() => setEditing(true)} className="text-[14px] font-semibold text-brand-600 hover:underline">تعديل التواريخ</button>}
      </div>
      {editing && canManage && (
        <form onSubmit={handleSave} className={`${CARD} mt-2 grid w-full grid-cols-1 items-end gap-4 p-4 sm:grid-cols-3`}>
          <FormField label="تاريخ بداية المشروع"><Input type="date" dir="ltr" value={start} onChange={(e) => setStart(e.target.value)} /></FormField>
          <FormField label="تاريخ الانطلاق الفعلي (الضخ)"><Input type="date" dir="ltr" value={launch} onChange={(e) => setLaunch(e.target.value)} /></FormField>
          <div className="flex gap-2">
            <Button type="submit" variant="primary" isLoading={save.isPending}>حفظ</Button>
            <Button type="button" variant="ghost" onClick={() => setEditing(false)}>إلغاء</Button>
          </div>
          {error && <p className="text-[14px] text-danger-700 sm:col-span-3">{error}</p>}
        </form>
      )}
    </div>
  );
}

/* ----------------------------- funnel ----------------------------- */

function Funnel({ cur }: { cur: PeriodMetrics }) {
  const f = cur.funnel;
  const r = cur.funnel_rates;
  const steps = [
    { name: "محتملون", v: f.leads, rate: null as number | null, from: "" },
    { name: "حجزوا", v: f.booked, rate: r.lead_to_booked, from: "من المحتملين" },
    { name: "حضروا", v: f.attended, rate: r.booked_to_attended, from: "من الحجوزات" },
    { name: "اشتركوا", v: f.subscribers, rate: r.attended_to_subscriber, from: "من الحاضرين" },
  ];
  const max = Math.max(f.leads, 1);
  return (
    <section className={`${CARD} p-5 sm:p-6`}>
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[20px] font-bold text-[#0d141c]">رحلة العميل</h2>
        <p className="text-[13.5px] text-ink-600">من التسجيل إلى الاشتراك المدفوع</p>
      </div>
      <div className="space-y-4">
        {steps.map((s) => (
          <div key={s.name}>
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <span className="text-[15px] font-medium text-ink-800">{s.name}</span>
              <span className="flex items-baseline gap-2">
                {s.rate !== null && <span className="text-[13px] text-ink-600"><span className="ltr-content font-semibold text-brand-700">{pct(s.rate)}</span> {s.from}</span>}
                <span className="ltr-content text-[22px] font-bold text-[#0d141c]">{formatNumber(s.v)}</span>
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-[#eef1f6]">
              <div className="h-full rounded-full bg-brand-600" style={{ width: `${Math.max((s.v / max) * 100, s.v > 0 ? 2 : 0)}%` }} />
            </div>
          </div>
        ))}
      </div>
      {(f.booked > 0 || f.pending_attendance > 0) && (
        <div className="mt-6 rounded-xl border border-[#e1e7ef] bg-[#f5f7fa] p-4">
          <div className="mb-2.5 flex flex-wrap items-center justify-between gap-1 text-[14.5px]">
            <span className="font-semibold text-ink-900">الحجوزات</span>
            <span className="ltr-content font-semibold text-ink-900">{formatNumber(f.attended)} + {formatNumber(f.not_attended)} = {formatNumber(f.booked)}</span>
          </div>
          <div className="flex h-3 overflow-hidden rounded-full bg-white">
            {f.attended > 0 && <div className="bg-[#2fa56f]" style={{ width: `${(f.attended / Math.max(f.booked, 1)) * 100}%` }} />}
            {f.not_attended > 0 && <div className="bg-[#ff8a3d]" style={{ width: `${(f.not_attended / Math.max(f.booked, 1)) * 100}%` }} />}
          </div>
          <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-[13.5px] text-ink-700">
            <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-[#2fa56f]" />حضروا <b className="ltr-content text-ink-900">{formatNumber(f.attended)}</b></span>
            <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-[#ff8a3d]" />لم يحضروا <b className="ltr-content text-ink-900">{formatNumber(f.not_attended)}</b></span>
          </div>
          {f.pending_attendance > 0 && (
            <p className="mt-3 text-[13px] text-ink-600">
              <b className="ltr-content text-ink-900">{formatNumber(f.pending_attendance)}</b> حجز لم يُسجَّل حضوره بعد، ولا يدخل في الحجوزات حتى يُسجَّل.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

/* ----------------------------- platforms ----------------------------- */

function PlatformCard({ cur }: { cur: PeriodMetrics }) {
  const rows = cur.marketing.platforms;
  const total = Number(cur.marketing.total_spend) || 0;
  const pie = rows.map((p) => ({ name: PLATFORM_LABELS[p.platform], value: Number(p.spend) || 0 })).filter((d) => d.value > 0);
  return (
    <section className={`${CARD} p-5 sm:p-6`}>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-[20px] font-bold text-[#0d141c]">الإنفاق الإعلاني</h2>
          <p className="mt-1 text-[13.5px] text-ink-600">
            تكلفة العميل المحتمل: <b className="ltr-content text-ink-900">{cur.marketing.cost_per_lead ? formatSAR(cur.marketing.cost_per_lead) : "—"}</b>
          </p>
        </div>
        <Link to="/marketing/campaigns"><Button variant="outline" size="sm" type="button">إدارة الحملات</Button></Link>
      </div>
      <div className="flex flex-col items-center gap-5">
        <div className="relative h-[160px] w-[160px] shrink-0">
          {pie.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pie} dataKey="value" innerRadius={54} outerRadius={78} paddingAngle={3} stroke="none" cornerRadius={6}>
                  {pie.map((_, i) => <Cell key={i} fill={PLATFORM_COLORS[i % PLATFORM_COLORS.length]} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          ) : <div className="flex h-full items-center justify-center rounded-full bg-[#eef1f6] text-[14px] text-ink-600">لا إنفاق</div>}
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[12px] text-ink-600">الإجمالي</span>
            <span className="ltr-content text-[22px] font-bold text-[#0d141c]">{formatNumber(Math.round(total))}</span>
            <span className="text-[12px] text-ink-600">ر.س</span>
          </div>
        </div>
        <div className="w-full overflow-x-auto">
          <table className="w-full text-[14px]">
            <thead>
              <tr className="border-b border-[#e1e7ef] text-ink-600">
                <th className="py-2.5 text-start font-semibold">المنصة</th>
                <th className="py-2.5 text-start font-semibold">الحصة</th>
                <th className="py-2.5 text-start font-semibold">عملاء</th>
                <th className="py-2.5 text-start font-semibold">تكلفة/عميل</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eef1f6]">
              {rows.map((p, i) => (
                <tr key={p.platform}>
                  <td className="whitespace-nowrap py-3 font-semibold text-ink-900">
                    <span className="me-2 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ backgroundColor: PLATFORM_COLORS[i % PLATFORM_COLORS.length] }} />
                    {PLATFORM_LABELS[p.platform]}
                  </td>
                  <td className="ltr-content py-3 text-start text-ink-800">{total > 0 ? pct((Number(p.spend) / total) * 100) : "—"}</td>
                  <td className="ltr-content py-3 text-start text-ink-800">{formatNumber(p.leads)}</td>
                  <td className="ltr-content whitespace-nowrap py-3 text-start font-medium text-ink-900">{p.cost_per_lead ? formatSAR(p.cost_per_lead) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {cur.marketing.includes_cumulative && (
        <p className="mt-4 flex gap-2 border-t border-[#e1e7ef] pt-4 text-[13px] leading-relaxed text-ink-600">
          <Info size={16} className="mt-0.5 shrink-0" />
          بعض الحملات أرقامها تراكمية بدون تواريخ، لذلك تُحتسب كاملةً على النصف الحالي.
        </p>
      )}
    </section>
  );
}

/** Secondary figures, collapsed by default to keep the page short. */
function MoreDetails({ cur, prev, children }: { cur: PeriodMetrics; prev: PeriodMetrics; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const rows: { label: string; value: string; c: number | null; p: number | null; low?: boolean }[] = [
    { label: "المشتركون الجدد", value: formatNumber(cur.revenue.subscribers), c: cur.revenue.subscribers, p: prev.revenue.subscribers },
    { label: "متوسط قيمة المشترك", value: formatSAR(cur.revenue.avg_paid), c: num(cur.revenue.avg_paid), p: num(prev.revenue.avg_paid) },
    { label: "الخصومات", value: formatSAR(cur.revenue.total_discount), c: num(cur.revenue.total_discount), p: num(prev.revenue.total_discount), low: true },
    { label: "عملاء محتملون (إعلانات)", value: formatNumber(cur.marketing.reported_leads), c: cur.marketing.reported_leads, p: prev.marketing.reported_leads },
    { label: "التحويل من الحاضرين", value: pct(cur.funnel_rates.attended_to_subscriber), c: cur.funnel_rates.attended_to_subscriber, p: prev.funnel_rates.attended_to_subscriber },
    { label: "لم يحضروا", value: formatNumber(cur.funnel.not_attended), c: cur.funnel.not_attended, p: prev.funnel.not_attended, low: true },
  ];
  return (
    <section className={CARD}>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 p-5 text-start sm:px-6">
        <span className="text-[16px] font-bold text-[#0d141c]">تفاصيل ومقارنة بالنصف السابق</span>
        <ChevronDown size={20} className={`text-ink-600 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="grid grid-cols-1 divide-y divide-[#eef1f6] border-t border-[#e1e7ef] px-5 sm:grid-cols-2 sm:gap-x-10 sm:divide-y-0 sm:px-6">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center justify-between gap-3 border-b border-[#eef1f6] py-3.5">
              <div>
                <p className="text-[14.5px] text-ink-700">{r.label}</p>
                <Delta current={r.c} previous={r.p} lowerIsBetter={r.low} />
              </div>
              <span className="ltr-content whitespace-nowrap text-[20px] font-bold text-[#0d141c]">{r.value}</span>
            </div>
          ))}
        </div>
      )}
      {children}
    </section>
  );
}

/* ----------------------------- page ----------------------------- */

function PageSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true">
      <div className="skeleton h-[150px] !rounded-xl" />
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-[170px] !rounded-xl" />)}</div>
    </div>
  );
}

export function KpiDashboardPage() {
  const now = currentHalf();
  const [sel, setSel] = useState(now);
  const period = `${sel.year}-H${sel.half}`;
  const { data, isLoading, isError } = useQuery({ queryKey: ["kpi-summary", period], queryFn: () => kpiApi.summary(period) });
  const go = (d: number) => setSel((s) => shiftHalf(s.year, s.half, d));
  const cur = data?.current;
  const prev = data?.previous;

  return (
    <div className="rounded-3xl bg-[#f5f7fa] p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold leading-9 tracking-tight text-[#0d141c] sm:text-[34px] sm:leading-[42px]">مؤشرات أداء المشروع</h1>
          <p className="mt-1 text-[15px] text-ink-600">{HALF_LABEL[sel.half]} · {sel.year}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 rounded-full border border-[#e1e7ef] bg-white p-1">
            <button onClick={() => go(-2)} className="rounded-full p-2 text-ink-800 hover:bg-[#f5f7fa]" aria-label="السنة السابقة"><ChevronRight size={17} /></button>
            <span className="ltr-content min-w-[52px] text-center text-[15px] font-semibold text-ink-900">{sel.year}</span>
            <button onClick={() => go(2)} disabled={sel.year >= now.year} className="rounded-full p-2 text-ink-800 hover:bg-[#f5f7fa] disabled:opacity-30" aria-label="السنة التالية"><ChevronLeft size={17} /></button>
          </div>
          <div className="flex rounded-full border border-[#e1e7ef] bg-white p-1" role="tablist">
            {([1, 2] as const).map((h) => {
              const future = sel.year === now.year && h > now.half;
              const active = sel.half === h;
              return (
                <button key={h} role="tab" aria-selected={active} disabled={future} onClick={() => setSel({ year: sel.year, half: h })}
                  className={"rounded-full px-4 py-2 text-[14px] font-semibold transition-colors disabled:opacity-30 " + (active ? "bg-[#0d141c] text-white" : "text-ink-700 hover:bg-[#f5f7fa]")}>
                  {h === 1 ? "النصف الأول" : "النصف الثاني"}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {isLoading && <PageSkeleton />}
      {isError && <p className="rounded-xl bg-danger-50 px-5 py-4 text-[16px] font-medium text-danger-700">تعذّر تحميل المؤشرات.</p>}

      {data && cur && prev && (
        <div className="space-y-6">
          <PhaseChip key={JSON.stringify(data.phases)} phases={data.phases} />
          <Summary cur={cur} prev={prev} />
          <TargetsStrip tp={data.test_phase} />
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <Funnel cur={cur} />
            <PlatformCard cur={cur} />
          </div>
          <MoreDetails cur={cur} prev={prev} />
        </div>
      )}
    </div>
  );
}
