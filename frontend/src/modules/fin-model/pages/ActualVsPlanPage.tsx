import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import clsx from "clsx";
import { useFM } from "../context";
import { fmApi } from "../api";
import { COLORS, compact, money, monthLabel, pct } from "../i18n";
import { ChartTooltip, Kpi, Note, Panel, Segmented, useMoney } from "../components/ui";

type Metric = "sales" | "subs" | "leads" | "ads" | "spend";

export default function ActualVsPlanPage() {
  const { result: r, t, lang } = useFM();
  const { big } = useMoney();
  const aq = useQuery({ queryKey: ["fm", "actuals"], queryFn: fmApi.actuals, staleTime: 60_000 });
  const [metric, setMetric] = useState<Metric>("sales");
  const ar = lang === "ar";
  const today = new Date().toISOString().slice(0, 7);

  const rows = useMemo(() => {
    if (!r || !aq.data) return [];
    const plan = new Map(r.months.map((m) => [m.month, m]));
    const act = new Map(aq.data.months.map((m) => [m.month, m]));
    const first = aq.data.months.find((m) => m.spend_total > 0 || m.leads > 0 || m.sales_paid > 0)?.month ?? r.start_month;
    const keys: string[] = [];
    const [fy, fmn] = first.split("-").map(Number);
    for (let i = 0; ; i++) {
      const tt = fy * 12 + fmn - 1 + i;
      const k = `${Math.floor(tt / 12)}-${String((tt % 12) + 1).padStart(2, "0")}`;
      if (k > today && keys.length) break;
      keys.push(k);
      if (i > 120) break;
    }
    return keys.map((k) => {
      const a = act.get(k);
      const p = plan.get(k);
      const val = (m: Metric, side: "a" | "p"): number | null => {
        if (side === "a") {
          if (!a) return 0;
          return m === "sales" ? a.sales_paid : m === "subs" ? a.new_subs + a.renewals : m === "leads" ? a.leads : m === "ads" ? a.spend.marketing ?? 0 : a.spend_total;
        }
        if (!p) return null;
        return m === "sales" ? p.billed_gross : m === "subs" ? p.new_customers + p.renewals : m === "leads" ? p.leads : m === "ads" ? p.marketing
          : p.teacher_cost + p.trial_cost + p.commissions + p.opex;
      };
      return { month: k, partial: k === today, actual: val(metric, "a"), plan: val(metric, "p"),
        all: (["sales", "subs", "leads", "ads", "spend"] as Metric[]).map((m) => [m, val(m, "a"), val(m, "p")] as const) };
    });
  }, [r, aq.data, metric, today]);

  if (!r || aq.isLoading) return <p className="py-10 text-center text-ink-600">{t("loading")}</p>;
  if (!aq.data) return null;
  const tot = aq.data.totals;
  const labels: Record<Metric, [string, string]> = {
    sales: ["مبيعات الاشتراكات (المدفوع)", "Subscription sales (paid)"],
    subs: ["الاشتراكات (جديد + تجديد)", "Subscriptions (new + renewals)"],
    leads: ["الليدز", "Leads"],
    ads: ["الإنفاق الإعلاني", "Ad spend"],
    spend: ["إجمالي المصروفات", "Total spend"],
  };
  const isMoney = metric === "sales" || metric === "ads" || metric === "spend";
  const fmt = (v: number | null) => (v === null ? "—" : isMoney ? money(v) : money(v, { decimals: 0 }));
  const planned = rows.filter((x) => x.plan !== null && !x.partial);
  const sumA = planned.reduce((s, x) => s + (x.actual ?? 0), 0);
  const sumP = planned.reduce((s, x) => s + (x.plan ?? 0), 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={ar ? "تمويل الملاك حتى الآن" : "Owner funding to date"} value={big(tot.invested)} />
        <Kpi label={ar ? "إجمالي المصروفات حتى الآن" : "Total spend to date"} value={big(tot.spent)} delay={60} />
        <Kpi label={ar ? "اشتراكات مدفوعة" : "Paid subscriptions"} value={String(tot.subscriptions)} sub={ar ? `${tot.customers} عميل، ${tot.renewals} تجديد` : `${tot.customers} customers, ${tot.renewals} renewals`} delay={120} />
        <Kpi label={ar ? "مبيعات محصلة" : "Sales collected"} value={big(tot.sales_paid)} sub={ar ? `خصومات ${money(tot.sales_discount)} ر.س` : `Discounts SAR ${money(tot.sales_discount)}`} delay={180} />
      </div>
      <Panel title={t("tab_actual")} subtitle={ar ? `بيانات حية من الداشبورد حتى ${aq.data.as_of}. الشهر الحالي جزئي.` : `Live data from the dashboard as of ${aq.data.as_of}. The current month is partial.`}
        action={<Segmented size="sm" value={metric} onChange={setMetric} options={(Object.keys(labels) as Metric[]).map((m) => ({ value: m, label: labels[m][ar ? 0 : 1] }))} />}>
        <div className="h-[300px]" dir="ltr">
          <ResponsiveContainer>
            <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={COLORS.grid} />
              <XAxis dataKey="month" tickFormatter={(v) => monthLabel(v, "en", true)} tickLine={false} axisLine={false} fontSize={11} />
              <YAxis tickFormatter={(v) => compact(v, "en")} tickLine={false} axisLine={false} fontSize={12} width={52} />
              <Tooltip content={<ChartTooltip labelFormatter={(l) => monthLabel(l, lang)} formatter={(v) => fmt(v)} />} cursor={{ fill: "#f4f1ff" }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="actual" name={ar ? "الفعلي" : "Actual"} fill={COLORS.purple} radius={[4, 4, 0, 0]} />
              <Line dataKey="plan" name={ar ? "الخطة" : "Plan"} stroke={COLORS.orange} strokeWidth={2.5} dot={{ r: 3 }} connectNulls={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        {planned.length > 0 && (
          <p className="mt-3 text-[13.5px] text-ink-700">
            {ar ? `مجموع الأشهر المكتملة في فترة الخطة: الفعلي ${fmt(sumA)} مقابل الخطة ${fmt(sumP)} (` : `Completed months in the plan period: actual ${fmt(sumA)} vs plan ${fmt(sumP)} (`}
            <span className={clsx("font-semibold", sumP && sumA / sumP >= 1 ? "text-[#136c3a]" : "text-[#a02a24]")}>{sumP ? pct(sumA / sumP, 0) : "—"}</span>{ar ? " من المستهدف)." : " of target)."}
          </p>
        )}
      </Panel>
      <Panel title={ar ? "التفاصيل الشهرية" : "Monthly detail"}>
        <div className="thin-scrollbar overflow-x-auto">
          <table className="w-full min-w-[820px] text-[13px]">
            <thead>
              <tr className="border-b border-[#e1e7ef] text-ink-600">
                <th className="px-2 py-2 text-start font-semibold">{t("month")}</th>
                {(Object.keys(labels) as Metric[]).map((m) => <th key={m} className="px-2 py-2 text-start font-semibold" colSpan={2}>{labels[m][ar ? 0 : 1]}</th>)}
              </tr>
              <tr className="border-b border-[#e1e7ef] text-[12px] text-ink-500">
                <th />
                {(Object.keys(labels) as Metric[]).map((m) => [<th key={`${m}a`} className="px-2 py-1 text-start">{ar ? "فعلي" : "Actual"}</th>, <th key={`${m}p`} className="px-2 py-1 text-start">{ar ? "خطة" : "Plan"}</th>])}
              </tr>
            </thead>
            <tbody>
              {rows.map((x) => (
                <tr key={x.month} className="border-b border-[#f0f2f7]">
                  <td className="whitespace-nowrap px-2 py-1.5 font-semibold text-ink-900">{monthLabel(x.month, lang)}{x.partial ? (ar ? " (جزئي)" : " (partial)") : ""}</td>
                  {x.all.map(([m, a, p]) => {
                    const money_ = m === "sales" || m === "ads" || m === "spend";
                    const f = (v: number | null) => (v === null ? "—" : money_ ? money(v) : money(v));
                    return [
                      <td key={`${m}a`} className="ltr-content px-2 py-1.5 font-semibold text-ink-900">{f(a)}</td>,
                      <td key={`${m}p`} className="ltr-content px-2 py-1.5 text-ink-600">{f(p)}</td>,
                    ];
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <Note>{ar ? "الأشهر قبل بداية الخطة (أكتوبر 2026) فعلي فقط. المبيعات = اللي دفعه العملاء فعلًا في «الاشتراكات»، والمصروفات من «الفواتير والمصروفات» حسب شهر الاستحقاق." : "Months before the plan start (Oct 2026) are actuals only. Sales = what customers actually paid (Subscriptions); spend comes from Invoices & expenses by accrual month."}</Note>
    </div>
  );
}
