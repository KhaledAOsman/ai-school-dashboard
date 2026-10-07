/**
 * Executive KPI dashboard (half-yearly) for management.
 * Visual language follows the SaasAble kit: Material-3 purple (#6750A4) on
 * white, lavender (#F7F2FA) containers, pill buttons/chips, bordered cards
 * with lavender icon chips and green/red delta pills.
 *
 * Reading order: period switcher -> project phases -> executive summary
 * -> KPI groups -> funnel + ad spend split. No finance figures here.
 */
import { Children, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  ArrowDownRight, ArrowUpRight, BadgeDollarSign, CalendarCheck, Clock, UserX, ChevronLeft, ChevronRight, Coins,   Info, Megaphone, Percent, Target, UserCheck, Users, Wallet, type LucideIcon,
} from "lucide-react";
import { Card, CardHeader, CardSubtitle, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FormField, Input } from "@/components/ui/Field";
import { usePermission } from "@/permissions/usePermission";
import { PERMISSIONS } from "@/permissions/constants";
import { kpiApi, type PeriodMetrics, type Phases, type TestPhase } from "@/modules/kpi/services/kpiApi";
import { AnimatedText, Reveal, useCountUp, useMounted } from "@/components/motion";
import { apiErrorMessage, formatNumber, formatSAR, PLATFORM_LABELS } from "@/modules/marketing/lib";

const HALF_LABEL: Record<number, string> = { 1: "النصف الأول · يناير – يونيو", 2: "النصف الثاني · يوليو – ديسمبر" };
// Kit purple tones (Primary 40 / 80 / 90) + brand orange accent.
const PLATFORM_COLORS = ["#6d3af2", "#bea3ff", "#ff8a3d", "#2fa56f"];

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

/** Small pill: green/red arrow + % vs previous half (kit "12.3% ▲" chip). */
function DeltaPill({ current, previous, lowerIsBetter = false }: { current: number | null; previous: number | null; lowerIsBetter?: boolean }) {
  const base = "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[13px] font-semibold";
  const p = change(current, previous);
  if (p === null) return null; // nothing to compare against -> show nothing
  if (Math.abs(p) < 0.05) return <span className={`${base} bg-ink-100 text-ink-600`}>دون تغيير</span>;
  const up = p > 0;
  const good = lowerIsBetter ? !up : up;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`${base} ${good ? "bg-[#e3f7ea] text-[#136c3a]" : "bg-[#fde8e7] text-[#a02a24]"}`}>
      <span className="ltr-content">{Math.abs(p) > 999 ? "999%+" : `${Math.abs(p).toLocaleString("en-US", { maximumFractionDigits: 0 })}%`}</span>
      <Icon size={14} strokeWidth={2.5} />
    </span>
  );
}

function KpiCard({ icon: Icon, label, value, hint, current, previous, lowerIsBetter }: {
  icon: LucideIcon; label: string; value: string; hint?: string; current: number | null; previous: number | null; lowerIsBetter?: boolean;
}) {
  return (
    <Card className="flex h-full flex-col p-5 transition-shadow duration-300 hover:shadow-md sm:p-6">
      <div className="mb-5 flex items-start justify-between gap-2">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-200/70"><Icon size={22} /></span>
        <DeltaPill current={current} previous={previous} lowerIsBetter={lowerIsBetter} />
      </div>
      <p className="text-[16px] font-medium text-ink-600">{label}</p>
      <p className="ltr-content mt-2 whitespace-nowrap text-right text-[28px] font-medium leading-10 tracking-tight text-ink-900 sm:text-[32px]"><AnimatedText text={value} /></p>
      {hint && <p className="mt-3 text-[14px] leading-snug text-ink-600">{hint}</p>}
    </Card>
  );
}

/** Grid whose children rise in one after another. */
function RevealGrid({ className, children }: { className: string; children: ReactNode }) {
  return (
    <div className={className}>
      {Children.toArray(children).map((c, i) => <Reveal key={i} delay={i * 80} className="h-full">{c}</Reveal>)}
    </div>
  );
}

function SectionTitle({ children, note }: { children: ReactNode; note?: string }) {
  return (
    <div className="mb-4 mt-10 flex flex-wrap items-baseline gap-3">
      <h2 className="text-[24px] font-semibold text-ink-900">{children}</h2>
      {note && <span className="text-[15px] text-ink-600">{note}</span>}
    </div>
  );
}

/* ----------------------------- phases ----------------------------- */

/** Horizontal progress bar that fills in on mount (width transition). */
function GoalBar({ progress, color, label }: { progress: number; color: string; label: string }) {
  const mounted = useMounted(150);
  const pctNow = useCountUp(Math.round(progress * 100), 1200);
  return (
    <div className="flex items-center gap-3" role="img" aria-label={label}>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink-100">
        <div className="h-full rounded-full transition-[width] duration-[1300ms] ease-out-expo" style={{ width: mounted ? `${Math.max(progress * 100, progress > 0 ? 3 : 0)}%` : "0%", backgroundColor: color }} />
      </div>
      <span className="ltr-content w-10 shrink-0 text-end text-[13px] font-semibold text-ink-700">{Math.round(pctNow)}%</span>
    </div>
  );
}

/** Test-phase goals: first block on the page. */
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
      value: pct(m.conversion), goal: `الهدف \u200E${t.min_conversion}%\u200E`,
      progress: Math.min((m.conversion ?? 0) / t.min_conversion, 1), state: st((m.conversion ?? 0) >= t.min_conversion, (m.conversion ?? 0) / t.min_conversion, m.conversion !== null),
    },
    {
      label: "نسبة حضور المحاضرة", info: `${formatNumber(m.attended)} حضروا من ${formatNumber(m.booked)} حجز (حضروا + لم يحضروا)`,
      value: pct(m.attendance_rate), goal: `الهدف \u200E${t.min_attendance}%\u200E`,
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
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-[20px] font-semibold text-ink-900 sm:text-[22px]">أهداف مرحلة الاختبار</h2>
        <p className="ltr-content text-[13px] text-ink-600">
          {tp.start} → {tp.end_inclusive}
          {!tp.configured && <span className="font-sans"> · النصف المحدد (لم تُحدَّد بداية المشروع)</span>}
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {rows.map((r, i) => (
          <Reveal key={r.label} delay={i * 90} className="h-full">
            <div className="flex h-full flex-col rounded-2xl border border-ink-200 bg-white p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md">
              <p className="flex items-center gap-1.5 text-[15px] font-medium text-ink-600">
                <span>{r.label}</span>
                <span title={r.info} className="shrink-0 cursor-help text-ink-400"><Info size={14} /></span>
              </p>
              <p className="ltr-content mt-2 whitespace-nowrap text-right text-[30px] font-medium leading-10 tracking-tight text-ink-900"><AnimatedText text={r.value} /></p>
              <div className="mt-3">
                <GoalBar progress={r.progress} color={r.state === "met" ? "#1f8a52" : r.state === "behind" ? "#d9453d" : r.state === "near" ? "#ff8a3d" : "#b7bdd3"} label={`${r.label}: ${Math.round(r.progress * 100)}% من الهدف`} />
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-ink-100 pt-3 text-[13px] text-ink-600">
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

function PhaseTimeline({ phases }: { phases: Phases }) {
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
  const steps = [
    { key: "test", label: "اختبار السوق", date: phases.project_start_date ?? "—", active: phases.current_phase === "test" },
    { key: "full_launch", label: "الضخ الفعلي", date: phases.full_launch_date ?? "—", active: phases.current_phase === "full_launch" },
  ];
  return (
    <Card className="!p-4 sm:!px-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <span className="text-[15px] font-semibold text-ink-700">مرحلة المشروع</span>
        <div className="flex flex-1 items-center gap-3">
          {steps.map((st, i) => (
            <div key={st.key} className="flex items-center gap-3">
              {i > 0 && <span className="h-px w-8 bg-ink-300" />}
              <span className={"flex items-center gap-2 rounded-full px-4 py-2 text-[15px] font-semibold " + (st.active ? "bg-brand-600 text-white" : "bg-ink-100 text-ink-700")}>
                <span className={"h-2 w-2 rounded-full " + (st.active ? "bg-white" : "bg-ink-400")} />
                {st.label}
                <span className={"ltr-content text-[13px] font-normal " + (st.active ? "text-white/85" : "text-ink-500")}>{st.date}</span>
              </span>
            </div>
          ))}
        </div>
        {canManage && !editing && <button onClick={() => setEditing(true)} className="text-[14px] font-semibold text-brand-600 hover:underline">تعديل التواريخ</button>}
      </div>
      {editing && canManage && (
        <form onSubmit={handleSave} className="mt-4 grid grid-cols-1 items-end gap-4 border-t border-ink-200 pt-4 sm:grid-cols-3">
          <FormField label="تاريخ بداية المشروع"><Input type="date" dir="ltr" value={start} onChange={(e) => setStart(e.target.value)} /></FormField>
          <FormField label="تاريخ الانطلاق الفعلي (الضخ)"><Input type="date" dir="ltr" value={launch} onChange={(e) => setLaunch(e.target.value)} /></FormField>
          <div className="flex gap-2">
            <Button type="submit" variant="primary" isLoading={save.isPending}>حفظ</Button>
            <Button type="button" variant="ghost" onClick={() => setEditing(false)}>إلغاء</Button>
          </div>
          {error && <p className="text-[14px] text-danger-700 sm:col-span-3">{error}</p>}
        </form>
      )}
    </Card>
  );
}

/* ----------------------------- hero ----------------------------- */

function HeroSummary({ cur, prev, label }: { cur: PeriodMetrics; prev: PeriodMetrics; label: string }) {
  const f = cur.funnel;
  const items = [
    {
      icon: Wallet, q: "الإيراد", label: "الإيراد المحصَّل", value: formatSAR(cur.revenue.total_paid),
      sub: `${formatNumber(cur.revenue.subscribers)} مشتركين · متوسط ${cur.revenue.avg_paid ? formatSAR(cur.revenue.avg_paid) : "—"}`,
      c: num(cur.revenue.total_paid), p: num(prev.revenue.total_paid), low: false,
    },
    {
      icon: Target, q: "التكلفة", label: "تكلفة اكتساب المشترك", value: cur.marketing.cac ? formatSAR(cur.marketing.cac) : "—",
      sub: `إجمالي الإنفاق الإعلاني ${formatSAR(cur.marketing.total_spend)}`,
      c: num(cur.marketing.cac), p: num(prev.marketing.cac), low: true,
    },
    {
      icon: UserCheck, q: "الحضور", label: "نسبة الحضور", value: pct(cur.funnel_rates.booked_to_attended),
      sub: `حضر ${formatNumber(f.attended)} + لم يحضر ${formatNumber(f.not_attended)} = ${formatNumber(f.booked)} حجز`,
      c: cur.funnel_rates.booked_to_attended, p: prev.funnel_rates.booked_to_attended, low: false,
    },
    {
      icon: Percent, q: "التحويل", label: "التحويل من الحاضرين", value: pct(cur.funnel_rates.attended_to_subscriber),
      sub: `${formatNumber(f.subscribers)} مشتركين من ${formatNumber(f.attended)} حضروا المحاضرة`,
      c: cur.funnel_rates.attended_to_subscriber, p: prev.funnel_rates.attended_to_subscriber, low: false,
    },
  ];
  return (
    <section className="rounded-[32px] bg-brand-100/70 p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 px-1">
        <h2 className="text-[22px] font-semibold text-ink-900">الملخص التنفيذي</h2>
        <span className="rounded-full bg-white px-4 py-1.5 text-[14px] font-semibold text-brand-700 ring-1 ring-inset ring-brand-200/70">{label}</span>
      </div>
      <div className="grid grid-cols-1 divide-y divide-ink-200 overflow-hidden rounded-3xl bg-white ring-1 ring-inset ring-brand-200/70 sm:grid-cols-2 sm:divide-y-0 xl:grid-cols-4 xl:divide-x xl:divide-x-reverse">
        {items.map((it) => (
          <div key={it.label} className="flex flex-col gap-3 p-5">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2.5 text-[15px] font-semibold text-ink-800">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><it.icon size={20} /></span>
                {it.q}
              </span>
              <DeltaPill current={it.c} previous={it.p} lowerIsBetter={it.low} />
            </div>
            <div>
              <p className="text-[14px] text-ink-600">{it.label}</p>
              <p className="ltr-content mt-0.5 whitespace-nowrap text-right text-[30px] font-medium leading-10 text-ink-900 sm:text-[34px]"><AnimatedText text={it.value} /></p>
            </div>
            <p className="border-t border-ink-100 pt-3 text-[13.5px] leading-snug text-ink-600">{it.sub}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ----------------------------- funnel ----------------------------- */

function Funnel({ cur, prev, prevLabel }: { cur: PeriodMetrics; prev: PeriodMetrics; prevLabel: string }) {
  const f = cur.funnel;
  const rows = [
    { name: "محتملون", now: f.leads, before: prev.funnel.leads, rate: null as number | null, from: "" },
    { name: "حجزوا", now: f.booked, before: prev.funnel.booked, rate: cur.funnel_rates.lead_to_booked, from: "من المحتملين" },
    { name: "حضروا", now: f.attended, before: prev.funnel.attended, rate: cur.funnel_rates.booked_to_attended, from: "من الحاجزين" },
    { name: "لم يحضروا", now: f.not_attended, before: prev.funnel.not_attended, rate: cur.funnel_rates.booked_to_not_attended, from: "من الحاجزين" },
    { name: "اشتركوا", now: f.subscribers, before: prev.funnel.subscribers, rate: cur.funnel_rates.attended_to_subscriber, from: "من الحاضرين" },
  ];
  return (
    <Card className="p-6">
      <CardHeader>
        <div>
          <CardTitle>قمع التحويل</CardTitle>
          <CardSubtitle>عملاء الفترة ← حجز ← حضور ← اشتراك مدفوع</CardSubtitle>
        </div>
        <div className="text-end">
          <p className="ltr-content text-[28px] font-medium leading-none text-brand-600">{pct(cur.funnel_rates.attended_to_subscriber)}</p>
          <p className="mt-1 text-[13px] text-ink-600">التحويل من الحاضرين</p>
        </div>
      </CardHeader>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {rows.map((r, i) => (
          <div key={r.name} className="rounded-2xl bg-brand-50 p-3 text-center ring-1 ring-inset ring-brand-100">
            <p className="whitespace-nowrap text-[14px] font-medium text-ink-600">{r.name}</p>
            <p className="ltr-content mt-1 text-[26px] font-medium text-ink-900">{formatNumber(r.now)}</p>
            <p className="mt-0.5 min-h-[20px] text-[13px] text-ink-600">
              {i > 0 && r.rate !== null ? <><span className="ltr-content font-semibold text-brand-700">{pct(r.rate)}</span> {r.from}</> : i > 0 ? "—" : ""}
            </p>
          </div>
        ))}
      </div>
      <AttendanceSplit f={f} />
      <div className="ltr-content mt-6 h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} barGap={6} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#dcdfeb" vertical={false} />
            <XAxis dataKey="name" tick={{ fill: "#2d3149", fontSize: 14 }} axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} tick={{ fill: "#40455f", fontSize: 13 }} axisLine={false} tickLine={false} />
            <Tooltip cursor={{ fill: "rgba(109,58,242,0.08)" }} contentStyle={{ borderRadius: 16, border: "1px solid #dcdfeb", fontSize: 14 }} />
            <Legend iconType="circle" wrapperStyle={{ fontSize: 14 }} />
            <Bar dataKey="before" name={prevLabel} fill="#ffcfa1" radius={[8, 8, 0, 0]} maxBarSize={32} />
            <Bar dataKey="now" name="هذه الفترة" fill="#6d3af2" radius={[8, 8, 0, 0]} maxBarSize={32} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-4 flex gap-2 border-t border-ink-200 pt-4 text-[13.5px] leading-relaxed text-ink-600">
        <Info size={16} className="mt-0.5 shrink-0" />
        المحتملون والحجز والحضور من العملاء المسجَّلين خلال الفترة. «اشتركوا» = الاشتراكات المدفوعة بتاريخ داخل الفترة (قد تشمل عملاء سُجِّلوا قبلها).
      </p>
    </Card>
  );
}

/** Bookings = attended + did not attend. Not-yet-recorded sessions are shown apart. */
function AttendanceSplit({ f }: { f: PeriodMetrics["funnel"] }) {
  const mounted = useMounted(150);
  if (f.booked <= 0 && f.pending_attendance <= 0) return null;
  const parts = [
    { label: "حضروا", v: f.attended, cls: "bg-success-500", dot: "bg-success-500" },
    { label: "لم يحضروا", v: f.not_attended, cls: "bg-danger-500", dot: "bg-danger-500" },
  ];
  return (
    <div className="mt-5 rounded-2xl border border-ink-200 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-1 text-[15px]">
        <span className="font-semibold text-ink-900">الحضور بعد الحجز</span>
        <span className="text-ink-600">
          <span className="ltr-content font-semibold text-ink-900">{formatNumber(f.attended)} + {formatNumber(f.not_attended)} = {formatNumber(f.booked)}</span> حجز
        </span>
      </div>
      <div className="flex h-4 overflow-hidden rounded-full bg-ink-100">
        {parts.map((p) => p.v > 0 && (
          <div key={p.label} className={`${p.cls} transition-[width] duration-[1200ms] ease-out-expo`} style={{ width: mounted ? `${(p.v / Math.max(f.booked, 1)) * 100}%` : "0%" }} title={`${p.label}: ${p.v}`} />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[14px] text-ink-700">
        {parts.map((p) => (
          <span key={p.label} className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${p.dot}`} />{p.label}
            <span className="ltr-content font-semibold text-ink-900">{formatNumber(p.v)}</span>
          </span>
        ))}
      </div>
      {f.pending_attendance > 0 && (
        <p className="mt-3 border-t border-ink-100 pt-3 text-[13.5px] text-ink-600">
          يوجد <span className="ltr-content font-semibold text-ink-900">{formatNumber(f.pending_attendance)}</span> حجز لم يُسجَّل حضوره بعد (قادم أو مؤجَّل)، ولا يدخل في عدد الحجوزات حتى يُسجَّل.
        </p>
      )}
    </div>
  );
}

/* ----------------------------- platforms ----------------------------- */

function PlatformCard({ cur }: { cur: PeriodMetrics }) {
  const rows = cur.marketing.platforms;
  const total = Number(cur.marketing.total_spend) || 0;
  const pie = rows.map((p) => ({ name: PLATFORM_LABELS[p.platform], value: Number(p.spend) || 0 })).filter((d) => d.value > 0);
  return (
    <Card className="p-6">
      <CardHeader>
        <div>
          <CardTitle>توزيع الإنفاق الإعلاني</CardTitle>
          <CardSubtitle>الإنفاق والعملاء المحتملون المسجَّلون لكل منصة</CardSubtitle>
        </div>
        <Link to="/marketing/campaigns"><Button variant="outline" size="sm" type="button">إدارة الحملات</Button></Link>
      </CardHeader>
      <div className="flex flex-col items-center gap-6">
        <div className="relative h-[180px] w-[180px] shrink-0">
          {pie.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pie} dataKey="value" innerRadius={60} outerRadius={86} paddingAngle={3} stroke="none" cornerRadius={6}>
                  {pie.map((_, i) => <Cell key={i} fill={PLATFORM_COLORS[i % PLATFORM_COLORS.length]} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          ) : <div className="flex h-full items-center justify-center rounded-full bg-ink-100 text-[14px] text-ink-600">لا إنفاق</div>}
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[13px] text-ink-600">إجمالي الإنفاق</span>
            <span className="ltr-content text-[24px] font-medium text-ink-900">{formatNumber(Math.round(total))}</span>
            <span className="text-[13px] text-ink-600">ر.س</span>
          </div>
        </div>
        <div className="w-full flex-1 overflow-x-auto">
          <table className="w-full text-[14px]">
            <thead>
              <tr className="border-b border-ink-200 text-[14px] text-ink-600">
                <th className="py-2.5 text-start font-semibold">المنصة</th>
                <th className="py-2.5 text-start font-semibold">الحصة</th>
                <th className="py-2.5 text-start font-semibold">عملاء</th>
                <th className="py-2.5 text-start font-semibold">تكلفة/عميل</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {rows.map((p, i) => (
                <tr key={p.platform}>
                  <td className="whitespace-nowrap py-3.5 font-semibold text-ink-900">
                    <span className="me-2 inline-block h-3 w-3 rounded-full align-middle" style={{ backgroundColor: PLATFORM_COLORS[i % PLATFORM_COLORS.length] }} />
                    {PLATFORM_LABELS[p.platform]}
                  </td>
                  <td className="ltr-content py-3.5 text-start text-ink-800">{total > 0 ? pct((Number(p.spend) / total) * 100) : "—"}</td>
                  <td className="ltr-content py-3.5 text-start text-ink-800">{formatNumber(p.leads)}</td>
                  <td className="ltr-content whitespace-nowrap py-3.5 text-start font-medium text-ink-900">{p.cost_per_lead ? formatSAR(p.cost_per_lead) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {cur.marketing.includes_cumulative && (
        <p className="mt-4 flex gap-2 border-t border-ink-200 pt-4 text-[13.5px] leading-relaxed text-ink-600">
          <Info size={16} className="mt-0.5 shrink-0" />
          بعض الحملات أرقامها تراكمية بدون تواريخ، لذلك تُحتسب كاملةً على النصف الحالي. أضف تواريخ الحملات لتوزيعها على الفترات بدقة.
        </p>
      )}
    </Card>
  );
}

/* ----------------------------- page ----------------------------- */

function PageSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="skeleton h-[120px] !rounded-[28px]" />
      <div className="skeleton h-[300px] !rounded-[36px]" />
      <div className="grid grid-cols-2 gap-5 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-[190px] !rounded-2xl" />)}</div>
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
  const periodLabel = `${HALF_LABEL[sel.half]} · ${sel.year}`;
  const prevLabel = prev ? `${prev.half === 1 ? "النصف الأول" : "النصف الثاني"} ${prev.year}` : "";

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-medium leading-9 text-ink-900 sm:text-[36px] sm:leading-[44px]">مؤشرات أداء المشروع</h1>
          <p className="mt-1.5 text-[17px] text-ink-600">تقرير نصف سنوي لمتابعة الإدارة — مقارنة بالنصف السابق</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 rounded-full border border-ink-200 bg-white p-1">
            <button onClick={() => go(-2)} className="rounded-full p-2.5 text-ink-800 hover:bg-ink-100" aria-label="السنة السابقة"><ChevronRight size={18} /></button>
            <span className="ltr-content min-w-[56px] text-center text-[16px] font-semibold text-ink-900">{sel.year}</span>
            <button onClick={() => go(2)} disabled={sel.year >= now.year} className="rounded-full p-2.5 text-ink-800 hover:bg-ink-100 disabled:opacity-30" aria-label="السنة التالية"><ChevronLeft size={18} /></button>
          </div>
          <div className="flex rounded-full border border-ink-200 bg-white p-1" role="tablist">
            {([1, 2] as const).map((h) => {
              const future = sel.year === now.year && h > now.half;
              const active = sel.half === h;
              return (
                <button key={h} role="tab" aria-selected={active} disabled={future} onClick={() => setSel({ year: sel.year, half: h })}
                  className={"rounded-full px-5 py-2.5 text-[15px] font-semibold transition-colors disabled:opacity-30 " + (active ? "bg-brand-600 text-white" : "text-ink-700 hover:bg-ink-100")}>
                  {h === 1 ? "النصف الأول" : "النصف الثاني"}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {isLoading && <PageSkeleton />}
      {isError && <p className="rounded-2xl bg-danger-50 px-5 py-4 text-[16px] font-medium text-danger-700">تعذّر تحميل المؤشرات.</p>}

      {data && cur && prev && (
        <div className="space-y-6">
          <TargetsStrip tp={data.test_phase} />
          <Reveal delay={60}><PhaseTimeline key={JSON.stringify(data.phases)} phases={data.phases} /></Reveal>
          <Reveal><HeroSummary cur={cur} prev={prev} label={periodLabel} /></Reveal>

          <Reveal><SectionTitle note="الاشتراكات والإيراد">النمو والإيراد</SectionTitle></Reveal>
          <RevealGrid className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard icon={Users} label="المشتركون الجدد" value={formatNumber(cur.revenue.subscribers)} current={cur.revenue.subscribers} previous={prev.revenue.subscribers} hint="اشتراكات مدفوعة داخل الفترة" />
            <KpiCard icon={Wallet} label="الإيراد المحصَّل" value={formatSAR(cur.revenue.total_paid)} current={num(cur.revenue.total_paid)} previous={num(prev.revenue.total_paid)} hint={`خصومات ${formatSAR(cur.revenue.total_discount)}`} />
            <KpiCard icon={BadgeDollarSign} label="متوسط قيمة المشترك" value={formatSAR(cur.revenue.avg_paid)} current={num(cur.revenue.avg_paid)} previous={num(prev.revenue.avg_paid)} hint="الإيراد ÷ عدد المشتركين" />
            <KpiCard icon={Percent} label="التحويل من الحاضرين" value={pct(cur.funnel_rates.attended_to_subscriber)} current={cur.funnel_rates.attended_to_subscriber} previous={prev.funnel_rates.attended_to_subscriber} hint="مشترك ÷ حضر المحاضرة" />
          </RevealGrid>

          <Reveal><SectionTitle note="بعد الحجز">الحضور وعدم الحضور</SectionTitle></Reveal>
          <RevealGrid className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard icon={CalendarCheck} label="الحجوزات" value={formatNumber(cur.funnel.booked)} current={cur.funnel.booked} previous={prev.funnel.booked} hint="حضروا + لم يحضروا" />
            <KpiCard icon={UserCheck} label="حضروا" value={formatNumber(cur.funnel.attended)} current={cur.funnel.attended} previous={prev.funnel.attended} hint={`${pct(cur.funnel_rates.booked_to_attended)} من الحجوزات`} />
            <KpiCard icon={UserX} label="لم يحضروا" value={formatNumber(cur.funnel.not_attended)} current={cur.funnel.not_attended} previous={prev.funnel.not_attended} lowerIsBetter hint={`${pct(cur.funnel_rates.booked_to_not_attended)} من الحجوزات`} />
            <KpiCard icon={Clock} label="بانتظار تسجيل الحضور" value={formatNumber(cur.funnel.pending_attendance)} current={cur.funnel.pending_attendance} previous={prev.funnel.pending_attendance} lowerIsBetter hint="قادمة أو لم يُسجَّل حضورها، ولا تدخل في الحجوزات" />
          </RevealGrid>

          <Reveal><SectionTitle note="كفاءة الإنفاق الإعلاني">التسويق</SectionTitle></Reveal>
          <RevealGrid className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard icon={Megaphone} label="إجمالي الإنفاق الإعلاني" value={formatSAR(cur.marketing.total_spend)} current={num(cur.marketing.total_spend)} previous={num(prev.marketing.total_spend)} lowerIsBetter hint="سناب شات + ميتا + تيك توك" />
            <KpiCard icon={Target} label="تكلفة اكتساب المشترك (CAC)" value={cur.marketing.cac ? formatSAR(cur.marketing.cac) : "—"} current={num(cur.marketing.cac)} previous={num(prev.marketing.cac)} lowerIsBetter hint="الإنفاق الإعلاني ÷ المشتركين الجدد" />
            <KpiCard icon={UserCheck} label="عملاء محتملون (إعلانات)" value={formatNumber(cur.marketing.reported_leads)} current={cur.marketing.reported_leads} previous={prev.marketing.reported_leads} hint="سُجّلت بياناتهم (اسم + رقم هاتف)" />
            <KpiCard icon={Coins} label="تكلفة العميل المحتمل" value={cur.marketing.cost_per_lead ? formatSAR(cur.marketing.cost_per_lead) : "—"} current={num(cur.marketing.cost_per_lead)} previous={num(prev.marketing.cost_per_lead)} lowerIsBetter hint="الإنفاق ÷ العملاء المحتملين" />
          </RevealGrid>

          <Reveal><SectionTitle note="هذه الفترة مقابل السابقة">القمع والمنصات</SectionTitle></Reveal>
          <RevealGrid className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <Funnel cur={cur} prev={prev} prevLabel={prevLabel} />
            <PlatformCard cur={cur} />
          </RevealGrid>

        </div>
      )}
    </div>
  );
}
