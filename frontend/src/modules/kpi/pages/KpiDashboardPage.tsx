/**
 * Executive KPI dashboard (half-yearly) for management.
 *
 * Reading order, top to bottom:
 *   1. Period switcher + project phase timeline
 *   2. Executive summary hero (4 headline numbers + plain-language insights)
 *   3. KPI groups: growth & revenue / marketing efficiency
 *   4. Funnel (this half vs previous half) and ad-spend split by platform
 * Contains NO finance/expense figures - those live in the Finance section.
 */
import { useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  ArrowDownRight, ArrowUpRight, BadgeDollarSign, CalendarRange, ChevronLeft, ChevronRight, Coins,
  FlaskConical, Info, Lightbulb, Megaphone, Percent, Rocket, Target, TrendingUp, UserCheck, Users, Wallet,
  type LucideIcon,
} from "lucide-react";
import { Card, CardHeader, CardSubtitle, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FormField, Input } from "@/components/ui/Field";
import { usePermission } from "@/permissions/usePermission";
import { PERMISSIONS } from "@/permissions/constants";
import { kpiApi, type PeriodMetrics, type Phases } from "@/modules/kpi/services/kpiApi";
import { apiErrorMessage, formatNumber, formatSAR, PLATFORM_LABELS } from "@/modules/marketing/lib";

const HALF_LABEL: Record<number, string> = { 1: "النصف الأول · يناير – يونيو", 2: "النصف الثاني · يوليو – ديسمبر" };
const PLATFORM_COLORS = ["#6d3af2", "#a98af9", "#ff8a3d", "#2fbf8a"];

function currentHalf(): { year: number; half: 1 | 2 } {
  const d = new Date();
  return { year: d.getFullYear(), half: d.getMonth() < 6 ? 1 : 2 };
}
function shiftHalf(year: number, half: 1 | 2, delta: number): { year: number; half: 1 | 2 } {
  const idx = year * 2 + (half - 1) + delta;
  return { year: Math.floor(idx / 2), half: ((idx % 2) + 1) as 1 | 2 };
}

const num = (v: string | number | null | undefined): number | null => (v === null || v === undefined ? null : Number(v));
const pct = (v: number | null) => (v === null ? "—" : `${v.toLocaleString("ar-SA-u-nu-latn", { maximumFractionDigits: 1 })}٪`);

/** Percent change vs previous half; null when it can't be computed. */
function change(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

/** Pill showing the change vs the previous half. `lowerIsBetter` flips the colour (e.g. CAC, spend). */
function DeltaPill({ current, previous, lowerIsBetter = false, onDark = false }: {
  current: number | null; previous: number | null; lowerIsBetter?: boolean; onDark?: boolean;
}) {
  const base = "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold";
  const muted = onDark ? "bg-white/15 text-white/85" : "bg-ink-100 text-ink-600";
  const p = change(current, previous);
  if (p === null) {
    const label = current === null || previous === null ? "لا مقارنة" : previous === 0 && current !== 0 ? "جديد" : "—";
    return <span className={`${base} ${muted}`}>{label}</span>;
  }
  if (Math.abs(p) < 0.05) return <span className={`${base} ${muted}`}>دون تغيير</span>;
  const up = p > 0;
  const good = lowerIsBetter ? !up : up;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  const tone = onDark
    ? good ? "bg-emerald-400/25 text-emerald-100" : "bg-rose-400/25 text-rose-100"
    : good ? "bg-success-50 text-success-700" : "bg-danger-50 text-danger-700";
  return (
    <span className={`${base} ${tone}`}>
      <Icon size={13} strokeWidth={2.5} />
      <span className="ltr-content">{Math.abs(p).toLocaleString("ar-SA-u-nu-latn", { maximumFractionDigits: 0 })}٪</span>
    </span>
  );
}

function KpiCard({ icon: Icon, label, value, hint, current, previous, lowerIsBetter, tint = "brand" }: {
  icon: LucideIcon; label: string; value: string; hint?: string;
  current: number | null; previous: number | null; lowerIsBetter?: boolean; tint?: "brand" | "accent" | "success";
}) {
  const chip = { brand: "bg-brand-50 text-brand-600", accent: "bg-accent-50 text-accent-600", success: "bg-success-50 text-success-600" }[tint];
  return (
    <Card className="flex flex-col p-5">
      <div className="mb-4 flex items-start justify-between gap-2">
        <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${chip}`}><Icon size={20} /></span>
        <DeltaPill current={current} previous={previous} lowerIsBetter={lowerIsBetter} />
      </div>
      <p className="text-[14px] font-medium text-ink-600">{label}</p>
      <p className="ltr-content mt-1.5 whitespace-nowrap text-right text-[26px] font-bold leading-tight tracking-tight text-ink-900">{value}</p>
      <p className="mt-3 min-h-[16px] text-[12px] leading-snug text-ink-500">{hint}</p>
    </Card>
  );
}

function SectionTitle({ children, note }: { children: ReactNode; note?: string }) {
  return (
    <div className="mb-3 mt-8 flex items-baseline gap-3">
      <h2 className="text-[17px] font-bold text-ink-900">{children}</h2>
      {note && <span className="text-xs text-ink-500">{note}</span>}
    </div>
  );
}

/* ----------------------------- phases ----------------------------- */

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

  const stages = [
    {
      key: "test", icon: FlaskConical, title: "اختبار السوق", desc: "أول 6 أشهر من بداية المشروع",
      range: phases.project_start_date ? `${phases.project_start_date} ← ${phases.test_end_date ?? "—"}` : "لم يُحدَّد تاريخ البداية",
      active: phases.current_phase === "test",
    },
    {
      key: "full_launch", icon: Rocket, title: "الضخ الفعلي", desc: "يبدأ مع إجازة الصيف",
      range: phases.full_launch_date ? `${phases.full_launch_date} ←` : "لم يُحدَّد تاريخ الانطلاق",
      active: phases.current_phase === "full_launch",
    },
  ];

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <CardTitle>مراحل المشروع</CardTitle>
          <CardSubtitle>{phases.configured ? "المرحلة الحالية مُظلَّلة" : "حدِّد تاريخ بداية المشروع والانطلاق الفعلي لتفعيل الخريطة"}</CardSubtitle>
        </div>
        {canManage && !editing && (
          <button onClick={() => setEditing(true)} className="rounded-lg px-3 py-1.5 text-[13px] font-semibold text-brand-700 ring-1 ring-inset ring-brand-200 hover:bg-brand-50">
            تعديل التواريخ
          </button>
        )}
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {stages.map((s, i) => (
          <div key={s.key} className={"flex items-center gap-4 rounded-2xl p-4 ring-1 ring-inset " + (s.active ? "bg-brand-50 ring-brand-300" : "bg-ink-50 ring-ink-200")}>
            <span className={"flex h-11 w-11 shrink-0 items-center justify-center rounded-full " + (s.active ? "bg-brand-600 text-white" : "bg-white text-ink-500 ring-1 ring-ink-200")}>
              <s.icon size={19} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-[15px] font-bold text-ink-900">{i + 1}. {s.title}</p>
                {s.active && <span className="rounded-full bg-brand-600 px-2 py-0.5 text-[11px] font-semibold text-white">الحالية</span>}
              </div>
              <p className="text-xs text-ink-600">{s.desc}</p>
              <p className="ltr-content mt-1 text-xs font-medium text-ink-700">{s.range}</p>
            </div>
          </div>
        ))}
      </div>
      {phases.current_phase === "not_started" && <p className="mt-3 text-xs font-medium text-warning-700">لم يبدأ المشروع بعد وفق التاريخ المُدخَل.</p>}
      {editing && canManage && (
        <form onSubmit={handleSave} className="mt-4 grid grid-cols-1 items-end gap-3 border-t border-ink-100 pt-4 sm:grid-cols-3">
          <FormField label="تاريخ بداية المشروع"><Input type="date" dir="ltr" value={start} onChange={(e) => setStart(e.target.value)} /></FormField>
          <FormField label="تاريخ الانطلاق الفعلي (الضخ)"><Input type="date" dir="ltr" value={launch} onChange={(e) => setLaunch(e.target.value)} /></FormField>
          <div className="flex gap-2">
            <Button type="submit" variant="primary" isLoading={save.isPending}>حفظ</Button>
            <Button type="button" variant="ghost" onClick={() => setEditing(false)}>إلغاء</Button>
          </div>
          {error && <p className="text-sm text-danger-700 sm:col-span-3">{error}</p>}
        </form>
      )}
    </Card>
  );
}

/* ----------------------------- hero ----------------------------- */

function insights(cur: PeriodMetrics, prev: PeriodMetrics): string[] {
  const out: string[] = [];
  const fmt = (p: number) => Math.abs(p).toLocaleString("ar-SA-u-nu-latn", { maximumFractionDigits: 0 }) + "٪";
  const rev = change(num(cur.revenue.total_paid), num(prev.revenue.total_paid));
  if (rev !== null) out.push(`الإيراد المحصَّل ${rev >= 0 ? "ارتفع" : "انخفض"} ${fmt(rev)} مقارنة بالنصف السابق.`);
  else if (cur.revenue.subscribers > 0) out.push(`تم تسجيل ${formatNumber(cur.revenue.subscribers)} مشتركين بإيراد ${formatSAR(cur.revenue.total_paid)} في هذه الفترة.`);
  const cac = change(num(cur.marketing.cac), num(prev.marketing.cac));
  if (cac !== null) out.push(`تكلفة اكتساب المشترك ${cac <= 0 ? "تحسّنت (انخفضت)" : "ارتفعت"} بنسبة ${fmt(cac)}.`);
  else if (cur.marketing.cac) out.push(`تكلفة اكتساب المشترك الحالية ${formatSAR(cur.marketing.cac)}.`);
  const rates = cur.funnel_rates;
  const steps: [string, number | null][] = [
    ["من عميل محتمل إلى حجز", rates.lead_to_booked], ["من حجز إلى حضور", rates.booked_to_attended], ["من حضور إلى اشتراك", rates.attended_to_subscriber],
  ];
  const known = steps.filter((s): s is [string, number] => s[1] !== null);
  if (known.length) {
    const weakest = known.reduce((a, b) => (b[1] < a[1] ? b : a));
    out.push(`أضعف حلقات القمع: ${weakest[0]} (${pct(weakest[1])}) — هي أولى فرص التحسين.`);
  }
  if (!out.length) out.push("لا توجد بيانات كافية في هذه الفترة بعد؛ ستظهر الملاحظات تلقائياً مع تسجيل العملاء والاشتراكات.");
  return out;
}

function HeroSummary({ cur, prev, label }: { cur: PeriodMetrics; prev: PeriodMetrics; label: string }) {
  const items = [
    { icon: Wallet, label: "الإيراد المحصَّل", value: formatSAR(cur.revenue.total_paid), c: num(cur.revenue.total_paid), p: num(prev.revenue.total_paid), low: false },
    { icon: Users, label: "المشتركون الجدد", value: formatNumber(cur.revenue.subscribers), c: cur.revenue.subscribers, p: prev.revenue.subscribers, low: false },
    { icon: Target, label: "تكلفة اكتساب المشترك", value: cur.marketing.cac ? formatSAR(cur.marketing.cac) : "—", c: num(cur.marketing.cac), p: num(prev.marketing.cac), low: true },
    { icon: TrendingUp, label: "العائد على الإنفاق", value: cur.marketing.roas === null ? "—" : cur.marketing.roas.toLocaleString("ar-SA-u-nu-latn", { minimumFractionDigits: 2, maximumFractionDigits: 2 }), c: cur.marketing.roas, p: prev.marketing.roas, low: false },
  ];
  const notes = insights(cur, prev);
  return (
    <section className="relative overflow-hidden rounded-card bg-brand-gradient p-6 text-white shadow-lg sm:p-7">
      <div className="pointer-events-none absolute -bottom-24 -start-16 h-64 w-64 rounded-full bg-accent-400/25 blur-3xl" />
      <div className="pointer-events-none absolute -top-24 end-10 h-56 w-56 rounded-full bg-white/10 blur-3xl" />
      <div className="relative">
        <p className="text-[13px] font-medium text-white/80">الملخص التنفيذي</p>
        <h2 className="mt-1 text-[22px] font-bold">{label}</h2>

        <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-6 lg:grid-cols-4">
          {items.map((it) => (
            <div key={it.label} className="border-white/20 lg:border-s lg:ps-6 lg:first:border-s-0 lg:first:ps-0">
              <div className="flex items-center gap-2 text-[13px] text-white/85"><it.icon size={15} /> {it.label}</div>
              <p className="ltr-content mt-2 text-[30px] font-bold leading-none">{it.value}</p>
              <div className="mt-2.5 flex items-center gap-2">
                <DeltaPill current={it.c} previous={it.p} lowerIsBetter={it.low} onDark />
                <span className="text-[11px] text-white/70">عن النصف السابق</span>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-2xl bg-white/12 p-4 ring-1 ring-inset ring-white/20 backdrop-blur-sm">
          <p className="mb-2 flex items-center gap-2 text-[13px] font-semibold"><Lightbulb size={15} className="text-accent-300" /> أبرز الملاحظات</p>
          <ul className="space-y-1.5 text-[14px] leading-relaxed text-white/95">
            {notes.map((n) => <li key={n} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-300" />{n}</li>)}
          </ul>
        </div>
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
    { name: "اشتركوا", now: f.subscribers, before: prev.funnel.subscribers, rate: cur.funnel_rates.attended_to_subscriber, from: "من الحاضرين" },
  ];
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>قمع التحويل</CardTitle>
          <CardSubtitle>عملاء الفترة ← حجز ← حضور ← اشتراك مدفوع</CardSubtitle>
        </div>
        <div className="text-end">
          <p className="ltr-content text-[22px] font-bold leading-none text-brand-700">{pct(cur.funnel_rates.overall)}</p>
          <p className="mt-1 text-xs text-ink-500">التحويل الكلي</p>
        </div>
      </CardHeader>

      <div className="grid grid-cols-4 gap-2">
        {rows.map((r, i) => (
          <div key={r.name} className="rounded-xl bg-ink-50 p-3 text-center ring-1 ring-inset ring-ink-100">
            <p className="text-xs font-medium text-ink-600">{r.name}</p>
            <p className="ltr-content mt-1 text-[22px] font-bold text-ink-900">{formatNumber(r.now)}</p>
            <p className="mt-0.5 min-h-[16px] text-[11px] text-ink-500">
              {i > 0 && r.rate !== null ? <><span className="ltr-content font-bold text-brand-700">{pct(r.rate)}</span> {r.from}</> : i > 0 ? "—" : ""}
            </p>
          </div>
        ))}
      </div>

      <div className="ltr-content mt-5 h-[240px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} barGap={6} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e6e9f2" vertical={false} />
            <XAxis dataKey="name" tick={{ fill: "#40455f", fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} tick={{ fill: "#555b7a", fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip cursor={{ fill: "rgba(109,58,242,0.06)" }} contentStyle={{ borderRadius: 12, border: "1px solid #e6e9f2", fontSize: 12 }} />
            <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="before" name={prevLabel} fill="#c6cadb" radius={[6, 6, 0, 0]} maxBarSize={28} />
            <Bar dataKey="now" name="هذه الفترة" fill="#6d3af2" radius={[6, 6, 0, 0]} maxBarSize={28} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <p className="mt-3 flex gap-2 border-t border-ink-100 pt-3 text-[11.5px] leading-relaxed text-ink-500">
        <Info size={14} className="mt-0.5 shrink-0" />
        المحتملون والحجز والحضور من العملاء المسجَّلين خلال الفترة. «اشتركوا» = الاشتراكات المدفوعة بتاريخ داخل الفترة (قد تشمل عملاء سُجِّلوا قبلها).
      </p>
    </Card>
  );
}

/* ----------------------------- platforms ----------------------------- */

function PlatformCard({ cur }: { cur: PeriodMetrics }) {
  const rows = cur.marketing.platforms;
  const total = Number(cur.marketing.total_spend) || 0;
  const pie = rows.map((p) => ({ name: PLATFORM_LABELS[p.platform], value: Number(p.spend) || 0 })).filter((d) => d.value > 0);
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>توزيع الإنفاق الإعلاني</CardTitle>
          <CardSubtitle>الإنفاق والعملاء المحتملون المُبلَّغ عنهم من حسابات الإعلانات</CardSubtitle>
        </div>
        <Link to="/marketing/campaigns" className="rounded-lg px-3 py-1.5 text-[13px] font-semibold text-brand-700 ring-1 ring-inset ring-brand-200 hover:bg-brand-50">إدارة الحملات</Link>
      </CardHeader>

      <div className="flex flex-col items-center gap-6 sm:flex-row">
        <div className="relative h-[190px] w-[190px] shrink-0">
          {pie.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pie} dataKey="value" innerRadius={62} outerRadius={90} paddingAngle={3} stroke="none" cornerRadius={6}>
                  {pie.map((_, i) => <Cell key={i} fill={PLATFORM_COLORS[i % PLATFORM_COLORS.length]} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          ) : <div className="flex h-full items-center justify-center rounded-full bg-ink-100 text-xs text-ink-500">لا إنفاق</div>}
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[11px] text-ink-600">إجمالي الإنفاق</span>
            <span className="ltr-content text-[18px] font-bold text-ink-900">{formatNumber(Math.round(Number(cur.marketing.total_spend) || 0))}</span>
            <span className="text-[11px] text-ink-500">ر.س</span>
          </div>
        </div>

        <div className="w-full flex-1 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-100 text-xs text-ink-600">
                <th className="py-2 text-start font-semibold">المنصة</th>
                <th className="py-2 text-start font-semibold">الحصة</th>
                <th className="py-2 text-start font-semibold">عملاء</th>
                <th className="py-2 text-start font-semibold">تكلفة العميل</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {rows.map((p, i) => (
                <tr key={p.platform}>
                  <td className="py-3 font-semibold text-ink-900">
                    <span className="me-2 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ backgroundColor: PLATFORM_COLORS[i % PLATFORM_COLORS.length] }} />
                    {PLATFORM_LABELS[p.platform]}
                  </td>
                  <td className="ltr-content py-3 text-start text-ink-700">{total > 0 ? pct((Number(p.spend) / total) * 100) : "—"}</td>
                  <td className="ltr-content py-3 text-start text-ink-700">{formatNumber(p.leads)}</td>
                  <td className="ltr-content py-3 text-start font-medium text-ink-800">{p.cost_per_lead ? formatSAR(p.cost_per_lead) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {cur.marketing.includes_cumulative && (
        <p className="mt-4 flex gap-2 border-t border-ink-100 pt-3 text-[11.5px] leading-relaxed text-ink-500">
          <Info size={14} className="mt-0.5 shrink-0" />
          بعض الحملات أرقامها تراكمية بدون تواريخ، لذلك تُحتسب كاملةً على النصف الحالي. أضف تواريخ الحملات لتوزيعها على الفترات بدقة.
        </p>
      )}
    </Card>
  );
}

/* ----------------------------- page ----------------------------- */

function PageSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true">
      <div className="skeleton h-[250px] !rounded-card" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-[150px] !rounded-card" />)}
      </div>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <div className="skeleton h-[380px] !rounded-card" />
        <div className="skeleton h-[380px] !rounded-card" />
      </div>
    </div>
  );
}

export function KpiDashboardPage() {
  const now = currentHalf();
  const [sel, setSel] = useState(now);
  const period = `${sel.year}-H${sel.half}`;
  const { data, isLoading, isError } = useQuery({ queryKey: ["kpi-summary", period], queryFn: () => kpiApi.summary(period) });

  const isCurrent = sel.year === now.year && sel.half === now.half;
  const go = (delta: number) => setSel((s) => shiftHalf(s.year, s.half, delta));
  const cur = data?.current;
  const prev = data?.previous;
  const periodLabel = `${HALF_LABEL[sel.half]} · ${sel.year.toLocaleString("en-US", { useGrouping: false })}`;
  const prevLabel = prev ? `${prev.half === 1 ? "النصف الأول" : "النصف الثاني"} ${prev.year}` : "";

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight text-ink-900">مؤشرات أداء المشروع</h1>
          <p className="mt-1 text-[14px] text-ink-600">تقرير نصف سنوي لمتابعة الإدارة — مقارنة بالنصف السابق</p>
        </div>
        <div className="flex items-center gap-1 rounded-2xl border border-[#e6e9f2] bg-white p-1.5 shadow-xs">
          <button onClick={() => go(-1)} className="rounded-xl p-2.5 text-ink-600 hover:bg-ink-100" aria-label="النصف السابق"><ChevronRight size={17} /></button>
          <div className="flex min-w-[270px] items-center justify-center gap-2 px-2 text-[14px] font-semibold text-ink-900">
            <CalendarRange size={16} className="text-brand-600" />{periodLabel}
          </div>
          <button onClick={() => go(1)} disabled={isCurrent} className="rounded-xl p-2.5 text-ink-600 hover:bg-ink-100 disabled:opacity-30" aria-label="النصف التالي"><ChevronLeft size={17} /></button>
        </div>
      </div>

      {isLoading && <PageSkeleton />}
      {isError && <p className="rounded-xl bg-danger-50 px-4 py-3 text-sm font-medium text-danger-700">تعذّر تحميل المؤشرات.</p>}

      {data && cur && prev && (
        <div className="space-y-5">
          <PhaseTimeline key={JSON.stringify(data.phases)} phases={data.phases} />
          <HeroSummary cur={cur} prev={prev} label={periodLabel} />

          <SectionTitle note="الاشتراكات والإيراد">النمو والإيراد</SectionTitle>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KpiCard icon={Users} tint="brand" label="المشتركون الجدد" value={formatNumber(cur.revenue.subscribers)} current={cur.revenue.subscribers} previous={prev.revenue.subscribers} hint="اشتراكات مدفوعة داخل الفترة" />
            <KpiCard icon={Wallet} tint="success" label="الإيراد المحصَّل" value={formatSAR(cur.revenue.total_paid)} current={num(cur.revenue.total_paid)} previous={num(prev.revenue.total_paid)} hint={`خصومات ${formatSAR(cur.revenue.total_discount)}`} />
            <KpiCard icon={BadgeDollarSign} tint="accent" label="متوسط قيمة المشترك" value={formatSAR(cur.revenue.avg_paid)} current={num(cur.revenue.avg_paid)} previous={num(prev.revenue.avg_paid)} hint="الإيراد ÷ عدد المشتركين" />
            <KpiCard icon={Percent} tint="brand" label="التحويل الكلي" value={pct(cur.funnel_rates.overall)} current={cur.funnel_rates.overall} previous={prev.funnel_rates.overall} hint="من عميل محتمل إلى مشترك" />
          </div>

          <SectionTitle note="كفاءة الإنفاق الإعلاني">التسويق</SectionTitle>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KpiCard icon={Megaphone} tint="accent" label="إجمالي الإنفاق الإعلاني" value={formatSAR(cur.marketing.total_spend)} current={num(cur.marketing.total_spend)} previous={num(prev.marketing.total_spend)} lowerIsBetter hint="سناب شات + ميتا + تيك توك" />
            <KpiCard icon={Target} tint="brand" label="تكلفة اكتساب المشترك (CAC)" value={cur.marketing.cac ? formatSAR(cur.marketing.cac) : "—"} current={num(cur.marketing.cac)} previous={num(prev.marketing.cac)} lowerIsBetter hint="الإنفاق الإعلاني ÷ المشتركين الجدد" />
            <KpiCard icon={UserCheck} tint="success" label="عملاء محتملون (إعلانات)" value={formatNumber(cur.marketing.reported_leads)} current={cur.marketing.reported_leads} previous={prev.marketing.reported_leads} hint="كما تُبلِّغ عنه المنصات" />
            <KpiCard icon={Coins} tint="accent" label="تكلفة العميل المحتمل" value={cur.marketing.cost_per_lead ? formatSAR(cur.marketing.cost_per_lead) : "—"} current={num(cur.marketing.cost_per_lead)} previous={num(prev.marketing.cost_per_lead)} lowerIsBetter hint="الإنفاق ÷ العملاء المحتملين" />
          </div>

          <SectionTitle note="هذه الفترة مقابل السابقة">القمع والمنصات</SectionTitle>
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <Funnel cur={cur} prev={prev} prevLabel={prevLabel} />
            <PlatformCard cur={cur} />
          </div>
        </div>
      )}
    </div>
  );
}
