/**
 * Chapter 5 — Expenses & use of funds: every cost in the model, grouped into
 * the categories management uses (teachers per lecture, content team,
 * marketing team, ads, influencers & UGC, customer service, quality team,
 * monthly subscriptions ...). Annual totals tie to cost of sales + operating
 * expenses in the income statement; the use-of-funds table adds up to the
 * amount raised.
 */
import { useMemo } from "react";
import clsx from "clsx";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useFM } from "../context";
import { compact, money, monthLabel, pct } from "../i18n";
import { CARD, ChartTooltip } from "../components/ui";
import { Block, ChapterHeader, ChapterNav } from "../components/chapters";
import { EXPENSE_LABELS, EXPENSE_ORDER } from "../components/expenses";
import { roundTo } from "../components/unitmath";
import { FUND_LABELS, computeUseOfFunds } from "../components/funds";
import type { ExpenseCategory } from "../api";

export default function ExpensesPage() {
  const { result: r, t, lang } = useFM();
  const ar = lang === "ar";

  const table = useMemo(() => {
    if (!r) return null;
    const cats = EXPENSE_ORDER.filter((c) => r.years.some((y) => Math.abs(y.expense_by_category[c] ?? 0) >= 0.5));
    // per year: whole riyals that add up to the rounded total (cost of sales + operating expenses)
    const perYear = r.years.map((y) => {
      const total = Math.round(y.cogs + y.opex);
      const vals = roundTo(cats.map((c) => y.expense_by_category[c] ?? 0), total);
      return { total, vals: Object.fromEntries(cats.map((c, i) => [c, vals[i]])) as Record<ExpenseCategory, number> };
    });
    return { cats, perYear };
  }, [r]);

  if (!r?.resolved_assumptions || !table) return <p className="py-10 text-center text-ink-600">{t("loading")}</p>;
  const { cats, perYear } = table;
  const total5 = perYear.reduce((a, y) => a + y.total, 0);
  const cat5 = (c: ExpenseCategory) => perYear.reduce((a, y) => a + y.vals[c], 0);
  const chart = r.years.map((y, i) => ({ name: `${t("y")}${y.year}`, ...perYear[i].vals }));
  const funds = computeUseOfFunds(r);
  const yearEnd = r.years.map((y) => r.months.find((m) => m.month === y.to)!);

  return (
    <div className="space-y-10">
      <ChapterHeader id="expenses" />

      <Block n="5.1" title={ar ? "المصروفات السنوية حسب البند" : "Annual expenses by category"}
        lede={ar ? "جميع تكاليف التشغيل، ومجموع كل عمود يساوي تكلفة الإيرادات والمصروفات التشغيلية في قائمة الدخل." : "All operating costs; each column adds up to cost of sales plus operating expenses in the income statement."}>
        <div className={clsx(CARD, "overflow-hidden print:shadow-none")}>
          <div className="thin-scrollbar overflow-x-auto">
            <table className="w-full min-w-[860px] text-[13.5px]">
              <thead>
                <tr className="border-b border-[#e1e7ef] bg-[#f8f9fc] text-[12.5px] text-ink-600">
                  <th className="px-3 py-2.5 text-start font-semibold">{ar ? "البند (بالريال)" : "Category (SAR)"}</th>
                  {r.years.map((y) => <th key={y.year} className="px-3 py-2.5 text-end font-semibold">{t("y")}{y.year}</th>)}
                  <th className="bg-ink-100/60 px-3 py-2.5 text-end font-semibold">{ar ? "الإجمالي" : "Total"}</th>
                  <th className="px-3 py-2.5 text-end font-semibold">{ar ? "النسبة" : "Share"}</th>
                </tr>
              </thead>
              <tbody>
                {cats.map((c) => {
                  const L = EXPENSE_LABELS[c];
                  return (
                    <tr key={c} className="border-b border-[#f0f2f7]">
                      <td className="px-3 py-2.5 align-top">
                        <span className="flex items-center gap-2 font-semibold text-ink-900"><span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: L.color }} />{ar ? L.ar : L.en}</span>
                        <span className="mt-0.5 block max-w-[380px] ps-[18px] text-[12px] leading-5 text-ink-500">{ar ? L.d_ar : L.d_en}</span>
                      </td>
                      {perYear.map((y, i) => <td key={i} className="ltr-content px-3 py-2.5 text-end align-top tabular-nums text-ink-800">{money(y.vals[c])}</td>)}
                      <td className="ltr-content bg-ink-100/40 px-3 py-2.5 text-end align-top font-semibold tabular-nums text-ink-900">{money(cat5(c))}</td>
                      <td className="ltr-content px-3 py-2.5 text-end align-top text-ink-500">{pct(total5 ? cat5(c) / total5 : null, 0)}</td>
                    </tr>
                  );
                })}
                <tr className="bg-brand-50/50 font-bold">
                  <td className="px-3 py-2.5 text-ink-900">{ar ? "إجمالي المصروفات" : "Total expenses"}</td>
                  {perYear.map((y, i) => <td key={i} className="ltr-content px-3 py-2.5 text-end tabular-nums text-ink-900">{money(y.total)}</td>)}
                  <td className="ltr-content bg-ink-100/40 px-3 py-2.5 text-end tabular-nums text-ink-900">{money(total5)}</td>
                  <td className="ltr-content px-3 py-2.5 text-end text-ink-900">100%</td>
                </tr>
                <tr className="text-ink-600">
                  <td className="px-3 py-2">{ar ? "الإيراد للمقارنة" : "Revenue, for comparison"}</td>
                  {r.years.map((y) => <td key={y.year} className="ltr-content px-3 py-2 text-end tabular-nums">{money(Math.round(y.revenue))}</td>)}
                  <td className="ltr-content bg-ink-100/40 px-3 py-2 text-end tabular-nums">{money(r.years.reduce((a, y) => a + Math.round(y.revenue), 0))}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <p className="mt-2 text-[12.5px] leading-6 text-ink-500">
          {ar ? "لا تشمل المصروفات أعلاه الإهلاك والزكاة والاستثمار في المنصة، وتظهر في القوائم المالية." : "Depreciation, zakat and the platform investment are shown in the financial statements, not above."}
        </p>
      </Block>

      <Block n="5.2" title={ar ? "توزيع المصروفات" : "Expense mix"}>
        <div className={clsx(CARD, "p-4 print:shadow-none")}>
          <div className="h-[320px]" dir="ltr">
            <ResponsiveContainer>
              <BarChart data={chart} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={"#eef1f6"} />
                <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickFormatter={(v) => compact(v, "en")} tickLine={false} axisLine={false} fontSize={12} width={56} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "#f4f1ff" }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {cats.map((c) => <Bar key={c} dataKey={c} stackId="e" name={ar ? EXPENSE_LABELS[c].ar : EXPENSE_LABELS[c].en} fill={EXPENSE_LABELS[c].color} />)}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </Block>

      <Block n="5.3" title={ar ? "الفريق في نهاية كل سنة" : "Team at the end of each year"}
        lede={ar ? `يتقاضى المعلمون أجرًا عن كل محاضرة، بينما يتقاضى بقية الفريق رواتب شهرية تزيد ${pct(r.resolved_assumptions.team.annual_raise, 0)} سنويًا.` : `Teachers are paid per lecture; the rest of the team is salaried, with a ${pct(r.resolved_assumptions.team.annual_raise, 0)} yearly raise.`}>
        <div className={clsx(CARD, "overflow-hidden print:shadow-none")}>
          <div className="thin-scrollbar overflow-x-auto">
            <table className="w-full min-w-[620px] text-[13.5px]">
              <thead>
                <tr className="border-b border-[#e1e7ef] bg-[#f8f9fc] text-[12.5px] text-ink-600">
                  <th className="px-3 py-2.5 text-start font-semibold" />
                  {r.years.map((y) => <th key={y.year} className="px-3 py-2.5 text-end font-semibold">{t("y")}{y.year}</th>)}
                </tr>
              </thead>
              <tbody>
                {([
                  [ar ? "المعلمون (بالمحاضرة)" : "Teachers (per lecture)", (m: typeof yearEnd[number]) => m.headcount.teachers],
                  [ar ? "خدمة العملاء" : "Customer service", (m: typeof yearEnd[number]) => m.headcount.cs_agents],
                  [ar ? "الجودة ومتابعة المحاضرات" : "Quality & lecture review", (m: typeof yearEnd[number]) => m.headcount.quality],
                  [ar ? "مشترو الإعلانات" : "Media buyers", (m: typeof yearEnd[number]) => m.headcount.media_buyers],
                  [ar ? "إجمالي الموظفين برواتب ثابتة" : "Total salaried staff", (m: typeof yearEnd[number]) => m.headcount.fixed],
                ] as const).map(([l, f], i, arr) => (
                  <tr key={l} className={clsx("border-b border-[#f0f2f7] last:border-0", i === arr.length - 1 && "font-bold")}>
                    <td className="px-3 py-2.5 text-ink-800">{l}</td>
                    {yearEnd.map((m) => <td key={m.month} className="ltr-content px-3 py-2.5 text-end tabular-nums">{money(f(m))}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <p className="mt-2 text-[12.5px] leading-6 text-ink-500">
          {ar ? "فريق تطوير المحتوى يُحتسب ضمن بند «تطوير المحتوى والمناهج» بتكلفة شهرية." : "The content team is costed as a monthly amount under “Content & curriculum”."}
        </p>
      </Block>

      <Block n="5.4" title={ar ? "استخدام التمويل" : "Use of funds"}
        lede={ar
          ? `أوجه إنفاق التمويل من تاريخ استلامه حتى ${monthLabel(funds.until, lang)}، وهو الشهر الذي يغطي فيه التشغيل مصروفاته. ويغطي ربح الاشتراكات خلال هذه الفترة جزءًا من الإنفاق، ويغطي التمويل الباقي.`
          : `How the financing is spent from receipt until ${monthLabel(funds.until, lang)}, when operations cover their costs. Subscription profit in that period covers part of the spending; the financing covers the rest.`}>
        <div className={clsx(CARD, "overflow-hidden print:shadow-none")}>
          <table className="w-full text-[13.5px] [&_td]:px-3 sm:[&_td]:px-4">
            <tbody>
              {funds.rows.map((x) => (
                <tr key={x.key} className="border-b border-[#f0f2f7]">
                  <td className="py-2.5 text-ink-800">{FUND_LABELS[x.key][ar ? 0 : 1]}</td>
                  <td className="ltr-content py-2.5 text-end font-semibold tabular-nums">{money(x.value)}</td>
                  <td className="ltr-content w-16 py-2.5 text-end text-ink-500">{pct(funds.funded ? x.value / funds.funded : null, 0)}</td>
                </tr>
              ))}
              <tr className="bg-brand-50/50 font-bold">
                <td className="py-2.5">{ar ? "إجمالي التمويل" : "Total financing"}</td>
                <td className="ltr-content py-2.5 text-end tabular-nums">{money(funds.funded)}</td>
                <td className="ltr-content py-2.5 text-end">100%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Block>

      <ChapterNav id="expenses" />
    </div>
  );
}
