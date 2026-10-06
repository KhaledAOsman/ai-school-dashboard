/**
 * Main dashboard: half-yearly project KPIs for management.
 * Funnel (CRM cohort) -> subscribers & revenue -> marketing cost.
 * Contains NO finance/expense figures - those live in the Finance section.
 */
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownRight, ArrowUpRight, CalendarRange, ChevronLeft, ChevronRight, Flag, FlaskConical, Rocket } from "lucide-react";
import { Card, CardHeader, CardSubtitle, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { FormField, Input } from "@/components/ui/Field";
import { usePermission } from "@/permissions/usePermission";
import { PERMISSIONS } from "@/permissions/constants";
import { kpiApi, type PeriodMetrics, type Phases } from "@/modules/kpi/services/kpiApi";
import { apiErrorMessage, formatNumber, formatSAR, PLATFORM_LABELS } from "@/modules/marketing/lib";

const HALF_LABEL: Record<number, string> = { 1: "النصف الأول (يناير – يونيو)", 2: "النصف الثاني (يوليو – ديسمبر)" };

function currentHalf(): { year: number; half: 1 | 2 } {
  const d = new Date();
  return { year: d.getFullYear(), half: d.getMonth() < 6 ? 1 : 2 };
}

function shiftHalf(year: number, half: 1 | 2, delta: number): { year: number; half: 1 | 2 } {
  const idx = year * 2 + (half - 1) + delta;
  return { year: Math.floor(idx / 2), half: ((idx % 2) + 1) as 1 | 2 };
}

/** Percentage change vs the previous half. `lowerIsBetter` flips the colour (e.g. cost per acquisition). */
function Delta({ current, previous, lowerIsBetter = false }: { current: number | null; previous: number | null; lowerIsBetter?: boolean }) {
  if (current === null || previous === null) return <span className="text-xs text-ink-400">لا مقارنة</span>;
  if (previous === 0) return <span className="text-xs text-ink-400">{current === 0 ? "—" : "جديد"}</span>;
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  if (Math.abs(pct) < 0.05) return <span className="text-xs text-ink-400">دون تغيير</span>;
  const up = pct > 0;
  const good = lowerIsBetter ? !up : up;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={"inline-flex items-center gap-0.5 text-xs font-medium " + (good ? "text-success-600" : "text-danger-600")}>
      <Icon size={13} />
      <span className="ltr-content">{Math.abs(pct).toFixed(0)}%</span>
      <span className="text-ink-400">عن النصف السابق</span>
    </span>
  );
}

function KpiCard({
  label, value, hint, current, previous, lowerIsBetter,
}: { label: string; value: string; hint?: string; current: number | null; previous: number | null; lowerIsBetter?: boolean }) {
  return (
    <Card className="p-5">
      <p className="text-[13px] font-medium text-ink-500">{label}</p>
      <p className="ltr-content mt-2 text-[26px] font-bold tracking-tight text-ink-900">{value}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2">
        <Delta current={current} previous={previous} lowerIsBetter={lowerIsBetter} />
      </div>
      {hint && <p className="mt-1 text-[11px] text-ink-400">{hint}</p>}
    </Card>
  );
}

const num = (v: string | number | null | undefined): number | null => (v === null || v === undefined ? null : Number(v));
const pct = (v: number | null) => (v === null ? "—" : `${v.toFixed(1)}٪`);

function PhaseMap({ phases }: { phases: Phases }) {
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
    try {
      await save.mutateAsync();
      setEditing(false);
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  const stages = [
    {
      key: "test",
      icon: FlaskConical,
      title: "اختبار السوق (Test)",
      desc: "أول 6 أشهر من بداية المشروع",
      range: phases.project_start_date ? `${phases.project_start_date} → ${phases.test_end_date ?? "—"}` : "لم يُحدَّد تاريخ البداية",
      active: phases.current_phase === "test",
    },
    {
      key: "full_launch",
      icon: Rocket,
      title: "الضخ الفعلي",
      desc: "يبدأ مع إجازة الصيف",
      range: phases.full_launch_date ? `من ${phases.full_launch_date}` : "لم يُحدَّد تاريخ الانطلاق",
      active: phases.current_phase === "full_launch",
    },
  ];

  return (
    <Card className="mb-5">
      <CardHeader>
        <div>
          <CardTitle>خريطة مراحل المشروع</CardTitle>
          <CardSubtitle>
            {phases.configured ? "المرحلة الحالية مُظلَّلة" : "حدِّد تاريخ بداية المشروع وتاريخ الانطلاق الفعلي لتفعيل الخريطة"}
          </CardSubtitle>
        </div>
        {canManage && !editing && (
          <button onClick={() => setEditing(true)} className="link-underline text-[13px] font-medium text-brand-600">
            تعديل التواريخ
          </button>
        )}
      </CardHeader>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {stages.map((s) => (
          <div
            key={s.key}
            className={"flex items-start gap-3 rounded-xl p-4 ring-1 ring-inset " + (s.active ? "bg-brand-50 ring-brand-200" : "bg-ink-50 ring-ink-100")}
          >
            <span className={"flex h-9 w-9 shrink-0 items-center justify-center rounded-full " + (s.active ? "bg-brand-600 text-white" : "bg-white text-ink-400")}>
              <s.icon size={17} />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-ink-900">{s.title}</p>
                {s.active && <Badge tone="brand" dot={false}>الحالية</Badge>}
              </div>
              <p className="text-xs text-ink-500">{s.desc}</p>
              <p className="ltr-content mt-1 text-xs text-ink-600">{s.range}</p>
            </div>
          </div>
        ))}
      </div>
      {phases.current_phase === "not_started" && <p className="mt-3 text-xs text-warning-700">لم يبدأ المشروع بعد وفق التاريخ المُدخَل.</p>}

      {editing && canManage && (
        <form onSubmit={handleSave} className="mt-4 grid grid-cols-1 items-end gap-3 border-t border-ink-100 pt-4 sm:grid-cols-3">
          <FormField label="تاريخ بداية المشروع">
            <Input type="date" dir="ltr" value={start} onChange={(e) => setStart(e.target.value)} />
          </FormField>
          <FormField label="تاريخ الانطلاق الفعلي (الضخ)">
            <Input type="date" dir="ltr" value={launch} onChange={(e) => setLaunch(e.target.value)} />
          </FormField>
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

function Funnel({ cur, prev }: { cur: PeriodMetrics; prev: PeriodMetrics }) {
  const f = cur.funnel;
  const max = Math.max(f.leads, 1);
  const steps = [
    { label: "عملاء محتملون", value: f.leads, prev: prev.funnel.leads, rate: null as number | null, rateLabel: "" },
    { label: "حجزوا حصة تجريبية", value: f.booked, prev: prev.funnel.booked, rate: cur.funnel_rates.lead_to_booked, rateLabel: "من المحتملين" },
    { label: "حضروا الحصة", value: f.attended, prev: prev.funnel.attended, rate: cur.funnel_rates.booked_to_attended, rateLabel: "من الحاجزين" },
    { label: "اشتركوا", value: f.subscribers, prev: prev.funnel.subscribers, rate: cur.funnel_rates.attended_to_subscriber, rateLabel: "من الحاضرين" },
  ];
  const colors = ["#6d3af2", "#8a5cf6", "#a98af9", "#ff8a3d"];
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>قمع التحويل</CardTitle>
          <CardSubtitle>العملاء المسجَّلون في الفترة ← حجز ← حضور ← اشتراك مدفوع</CardSubtitle>
        </div>
        <div className="text-left">
          <p className="ltr-content text-lg font-bold text-ink-900">{pct(cur.funnel_rates.overall)}</p>
          <p className="text-xs text-ink-400">التحويل الكلي</p>
        </div>
      </CardHeader>
      <div className="space-y-4">
        {steps.map((s, i) => (
          <div key={s.label}>
            <div className="mb-1.5 flex items-center justify-between text-sm">
              <span className="font-medium text-ink-800">{s.label}</span>
              <span className="flex items-center gap-3">
                {s.rate !== null && <span className="text-xs text-ink-500"><span className="ltr-content font-semibold text-ink-800">{pct(s.rate)}</span> {s.rateLabel}</span>}
                <span className="ltr-content w-12 text-left font-bold text-ink-900">{formatNumber(s.value)}</span>
              </span>
            </div>
            <div className="h-7 overflow-hidden rounded-lg bg-ink-100">
              <div className="h-full rounded-lg transition-all duration-500" style={{ width: `${Math.max((s.value / max) * 100, s.value > 0 ? 2 : 0)}%`, backgroundColor: colors[i] }} />
            </div>
            <div className="mt-1"><Delta current={s.value} previous={s.prev} /></div>
          </div>
        ))}
      </div>
      <p className="mt-4 border-t border-ink-100 pt-3 text-[11px] leading-relaxed text-ink-400">
        المحتملون/الحجز/الحضور من سجلات العملاء المُنشأة خلال الفترة. «اشتركوا» = الاشتراكات المدفوعة المسجَّلة بتاريخ داخل الفترة (قد تشمل اشتراكات من عملاء سُجِّلوا قبلها).
      </p>
    </Card>
  );
}

function PlatformTable({ cur }: { cur: PeriodMetrics }) {
  const rows = cur.marketing.platforms;
  const total = Number(cur.marketing.total_spend) || 0;
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>أداء المنصات الإعلانية</CardTitle>
          <CardSubtitle>الإنفاق والعملاء المحتملون المُبلَّغ عنهم من حسابات الإعلانات</CardSubtitle>
        </div>
        <Link to="/marketing/campaigns" className="link-underline text-[13px] font-medium text-brand-600">إدارة الحملات</Link>
      </CardHeader>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-100 text-xs text-ink-500">
              <th className="py-2 text-start font-medium">المنصة</th>
              <th className="py-2 text-start font-medium">الإنفاق</th>
              <th className="py-2 text-start font-medium">الحصة</th>
              <th className="py-2 text-start font-medium">عملاء محتملون</th>
              <th className="py-2 text-start font-medium">تكلفة العميل المحتمل</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {rows.map((p) => (
              <tr key={p.platform}>
                <td className="py-3 font-medium text-ink-900">{PLATFORM_LABELS[p.platform]}</td>
                <td className="ltr-content py-3 font-semibold text-ink-900">{formatSAR(p.spend)}</td>
                <td className="ltr-content py-3 text-ink-600">{total > 0 ? `${((Number(p.spend) / total) * 100).toFixed(0)}٪` : "—"}</td>
                <td className="ltr-content py-3 text-ink-700">{formatNumber(p.leads)}</td>
                <td className="ltr-content py-3 text-ink-700">{p.cost_per_lead ? formatSAR(p.cost_per_lead) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {cur.marketing.includes_cumulative && (
        <p className="mt-3 border-t border-ink-100 pt-3 text-[11px] text-ink-400">
          بعض الحملات أرقامها تراكمية بدون تواريخ، لذلك تُحتسب كاملةً على النصف الحالي. أضف تواريخ الحملات لتوزيعها على الفترات بدقة.
        </p>
      )}
    </Card>
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

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight text-ink-900">مؤشرات أداء المشروع</h1>
          <p className="mt-1 text-sm text-ink-500">تقرير نصف سنوي لمتابعة الإدارة</p>
        </div>
        <div className="flex items-center gap-1 rounded-xl bg-white p-1 shadow-xs ring-1 ring-inset ring-ink-200">
          <button onClick={() => go(-1)} className="rounded-lg p-2 text-ink-500 hover:bg-ink-100" aria-label="النصف السابق"><ChevronRight size={16} /></button>
          <div className="flex min-w-[250px] items-center justify-center gap-2 px-2 text-sm font-semibold text-ink-800">
            <CalendarRange size={15} className="text-brand-500" />
            {HALF_LABEL[sel.half]} <span className="ltr-content">{sel.year}</span>
          </div>
          <button onClick={() => go(1)} disabled={isCurrent} className="rounded-lg p-2 text-ink-500 hover:bg-ink-100 disabled:opacity-30" aria-label="النصف التالي"><ChevronLeft size={16} /></button>
        </div>
      </div>

      {data && <PhaseMap key={JSON.stringify(data.phases)} phases={data.phases} />}

      {isLoading && <p className="py-10 text-center text-sm text-ink-400">جارٍ التحميل…</p>}
      {isError && <p className="rounded-lg bg-danger-50 px-4 py-3 text-sm text-danger-700">تعذّر تحميل المؤشرات.</p>}

      {cur && prev && (
        <>
          <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KpiCard label="المشتركون الجدد" value={formatNumber(cur.revenue.subscribers)} current={cur.revenue.subscribers} previous={prev.revenue.subscribers} />
            <KpiCard
              label="الإيراد المحصَّل" value={formatSAR(cur.revenue.total_paid)}
              hint={`خصومات ${formatSAR(cur.revenue.total_discount)} · متوسط المشترك ${formatSAR(cur.revenue.avg_paid)}`}
              current={num(cur.revenue.total_paid)} previous={num(prev.revenue.total_paid)}
            />
            <KpiCard
              label="تكلفة اكتساب المشترك (CAC)" value={cur.marketing.cac ? formatSAR(cur.marketing.cac) : "—"}
              hint="إجمالي الإنفاق الإعلاني ÷ المشتركين الجدد"
              current={num(cur.marketing.cac)} previous={num(prev.marketing.cac)} lowerIsBetter
            />
            <KpiCard
              label="العائد على الإنفاق (ROAS)" value={cur.marketing.roas === null ? "—" : cur.marketing.roas.toFixed(2)}
              hint="الإيراد المحصَّل ÷ الإنفاق الإعلاني"
              current={cur.marketing.roas} previous={prev.marketing.roas}
            />
          </div>

          <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KpiCard label="إجمالي الإنفاق الإعلاني" value={formatSAR(cur.marketing.total_spend)} current={num(cur.marketing.total_spend)} previous={num(prev.marketing.total_spend)} lowerIsBetter />
            <KpiCard label="عملاء محتملون (من الإعلانات)" value={formatNumber(cur.marketing.reported_leads)} current={cur.marketing.reported_leads} previous={prev.marketing.reported_leads} />
            <KpiCard label="تكلفة العميل المحتمل" value={cur.marketing.cost_per_lead ? formatSAR(cur.marketing.cost_per_lead) : "—"} current={num(cur.marketing.cost_per_lead)} previous={num(prev.marketing.cost_per_lead)} lowerIsBetter />
            <KpiCard label="التحويل الكلي (محتمل ← مشترك)" value={pct(cur.funnel_rates.overall)} current={cur.funnel_rates.overall} previous={prev.funnel_rates.overall} />
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <Funnel cur={cur} prev={prev} />
            <PlatformTable cur={cur} />
          </div>

          <p className="mt-4 flex items-center gap-1.5 text-xs text-ink-400">
            <Flag size={12} />
            المقارنة مع {HALF_LABEL[prev.half]} <span className="ltr-content">{prev.year}</span>. الأرقام المالية التفصيلية في قسم «الشؤون المالية».
          </p>
        </>
      )}
    </div>
  );
}
