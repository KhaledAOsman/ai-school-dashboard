/**
 * Chapter 4 — Sales & revenue plan. Volume is driven by the free trial
 * lectures given each month; a share converts into paid subscriptions.
 * Revenue = paid subscriptions in the period (billing basis), so
 * "subscriptions x price" reads straight across to the income statement.
 * Tables are whole numbers that add up across rows, months and years.
 */
import { useMemo, useState } from "react";
import clsx from "clsx";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Banknote, Briefcase, Flag, Globe2, Receipt, Rocket, Server, TrendingUp } from "lucide-react";
import { Reveal } from "@/components/motion";
import { useFM } from "../context";
import { COLORS, compact, money, monthLabel, pct } from "../i18n";
import { CARD, ChartTooltip, Segmented, useMoney } from "../components/ui";
import { Block, ChapterHeader, ChapterNav, ReportMode } from "../components/chapters";
import { salesRow, yearTable, type SalesRow } from "../components/unitmath";
import { useContext } from "react";

type Kind = "launch" | "market" | "hire" | "capex" | "funding" | "milestone" | "tax";
const ICON: Record<Kind, typeof Rocket> = { launch: Rocket, market: Globe2, hire: Briefcase, capex: Server, funding: Banknote, milestone: Flag, tax: Receipt };

export default function SalesPlanPage() {
  const { result: r, t, nm, lang, scenario } = useFM();
  const { big } = useMoney();
  const inReport = useContext(ReportMode);
  const ar = lang === "ar";
  const [year, setYear] = useState(1);

  const annual = useMemo(() => (r ? r.years.map((y) => yearTable(r, y.year, (m) => m, "").total) : []), [r]);
  const monthly = useMemo(() => (r ? r.months.map((m) => {
    const x = salesRow(m.month, [m], r);
    return { name: m.month, b2c_new: Math.round(x.fromTrials + x.otherB2c), renewals: Math.round(x.renewals), b2b: Math.round(x.b2b) };
  }) : []), [r]);
  const revData = useMemo(() => annual.map((x, i) => ({ name: `${t("y")}${i + 1}`, b2c: x.revenueB2c, b2b: x.revenueB2b })), [annual, t]);

  if (!r?.resolved_assumptions) return <p className="py-10 text-center text-ink-600">{t("loading")}</p>;
  const ra = r.resolved_assumptions;
  const k = r.kpis;
  const start = ra.general.start_month;
  const sar = t("sar");
  const total5 = annual.reduce((acc, x) => {
    const o = { ...acc } as SalesRow;
    (["trials", "attended", "fromTrials", "otherB2c", "renewals", "b2b", "subs", "revenue", "revenueB2c", "revenueB2b", "grossProfit"] as const).forEach((key) => { o[key] = (acc[key] ?? 0) + x[key]; });
    return o;
  }, {} as SalesRow);
  const hasOther = annual.some((x) => x.otherB2c > 0);
  const cols = [...annual, total5];
  const colLabels = [...r.years.map((y) => `${t("y")}${y.year}`), ar ? "الإجمالي" : "Total"];

  // new partner institutions signed per year = new institutional students / students per institution
  const partnerStreams = ra.streams.filter((st) => st.enabled && st.driver === "partners" && st.students_per_partner > 0);
  const partnersYear = r.years.map((y) => Math.round(r.months.filter((m) => m.year === y.year)
    .reduce((acc, m) => acc + partnerStreams.reduce((a2, st) => a2 + (m.new_by_stream[st.id] ?? 0) / st.students_per_partner, 0), 0)));
  const partnersCols = [...partnersYear, partnersYear.reduce((a2, b) => a2 + b, 0)];
  const perPartner = partnerStreams[0]?.students_per_partner;
  // assumed renewal probability of an individual package: starts at the actual rate and ramps to the
  // target (engine: ramp(renewal_rate, renewal_rate_target, renewal_ramp_months)), times the scenario factor
  const coreS = ra.streams.find((st) => st.id === "core_b2c") ?? ra.streams[0];
  const renF = Number((ra.scenarios as unknown as Record<string, { renewal?: number }>)?.[scenario]?.renewal ?? 1);
  const ymI = (ym: string) => { const [a1, b1] = ym.split("-").map(Number); const [a0, b0] = r.months[0].month.split("-").map(Number); return (a1 - a0) * 12 + (b1 - b0); };
  const renewP = (i: number) => {
    const t0 = i - ymI(coreS.start_month), rm = Number(coreS.renewal_ramp_months ?? 12);
    const v = t0 < 0 ? coreS.renewal_rate : coreS.renewal_rate + (coreS.renewal_rate_target - coreS.renewal_rate) * Math.min(rm > 0 ? t0 / rm : 1, 1);
    return Math.min(v * renF, 0.95);
  };
  const renewYear = r.years.map((y) => { const ms = r.months.map((m, i) => ({ m, i })).filter((x) => x.m.year === y.year); return ms.reduce((a2, x) => a2 + renewP(x.i), 0) / (ms.length || 1); });
  type Row = { label: string; v: (x: SalesRow, i: number) => string; kind?: "total" | "sub" | "pct" };
  const rows: Row[] = [
    { label: ar ? "المحاضرات المجانية المقدَّمة" : "Free lectures given", v: (x) => money(x.trials) },
    { label: ar ? "المحاضرات المجانية التي تم حضورها" : "Free lectures attended", v: (x) => money(x.attended) },
    { label: ar ? "نسبة الاشتراك ممن حضروا" : "Conversion of attendees", v: (x) => pct(x.attended ? x.fromTrials / x.attended : null, 1), kind: "pct" },
    { label: ar ? "اشتراكات جديدة من المحاضرات المجانية" : "New subscriptions from free lectures", v: (x) => money(x.fromTrials) },
    { label: ar ? "احتمال تجديد الباقة الفردية (متوسط السنة)" : "Individual package renewal probability (year average)", v: (_x, i) => (i < renewYear.length ? pct(renewYear[i], 1) : "—"), kind: "pct" },
    { label: ar ? "تجديدات الاشتراكات الفردية" : "Individual renewals", v: (x) => money(x.renewals) },
    ...(hasOther ? [{ label: ar ? "برامج ومعسكرات فردية" : "Individual programmes & camps", v: (x: SalesRow) => money(x.otherB2c) }] : []),
    ...(partnerStreams.length ? [{ label: ar ? `جهات شريكة جديدة (كل جهة ${perPartner} طالبًا)` : `New partner institutions (${perPartner} students each)`, v: (_x: SalesRow, i: number) => money(partnersCols[i]), kind: "pct" as const }] : []),
    { label: ar ? "اشتراكات مؤسسية (B2B) شاملة التجديد" : "Institutional subscriptions (B2B) incl. renewals", v: (x) => money(x.b2b) },
    { label: ar ? "إجمالي الاشتراكات المدفوعة" : "Total paid subscriptions", v: (x) => money(x.subs), kind: "total" },
    { label: ar ? "إيراد الاشتراكات الفردية" : "Individual subscription revenue", v: (x) => money(x.revenueB2c) },
    { label: ar ? "إيراد الاشتراكات المؤسسية" : "Institutional subscription revenue", v: (x) => money(x.revenueB2b) },
    { label: ar ? "إجمالي الإيراد" : "Total revenue", v: (x) => money(x.revenue), kind: "total" },
    { label: ar ? "مجمل الربح (بعد أجور المعلمين والعمولات والمحاضرات المجانية)" : "Gross profit (after teachers, commissions and free lectures)", v: (x) => money(x.grossProfit), kind: "sub" },
  ];

  const mt = yearTable(r, year, (m) => monthLabel(m, lang, true), ar ? "الإجمالي" : "Total");

  // ---------------------------------------------------------------- roadmap
  const ev: { month: string; kind: Kind; text: string; sub?: string }[] = [];
  for (const s of ra.streams) {
    if (!s.enabled || s.start_month <= start) continue;
    ev.push({ month: s.start_month, kind: "launch", text: `${ar ? "إطلاق" : "Launch"} ${nm(s)}`, sub: s.suggested ? t("suggested") : undefined });
  }
  for (const m of ra.markets) if (m.start_month > start) ev.push({ month: m.start_month, kind: "market", text: ar ? `دخول سوق ${nm(m)}` : `Enter ${nm(m)}` });
  for (const h of ra.team.hires) ev.push({ month: h.month, kind: "hire", text: `${ar ? "تعيين" : "Hire"} ${h.count > 1 ? `${h.count} × ` : ""}${ar ? h.role_ar : h.role_en}` });
  for (const c of ra.capex) ev.push({ month: c.month, kind: "capex", text: nm(c), sub: `${money(c.amount)} ${sar}` });
  if (k.loan_amount > 0) ev.push({ month: ra.financing.loan_draw_month, kind: "funding", text: ar ? `استلام التمويل ${big(k.loan_amount)}` : `Financing of ${big(k.loan_amount)} received` });
  if (k.vat_registration_month) ev.push({ month: k.vat_registration_month, kind: "tax", text: ar ? "التسجيل في ضريبة القيمة المضافة" : "VAT registration" });
  if (k.ebitda_breakeven_month) ev.push({ month: k.ebitda_breakeven_month, kind: "milestone", text: ar ? "نقطة التعادل التشغيلي" : "Operating break-even" });
  ev.sort((a, b) => a.month.localeCompare(b.month));
  const byYear = r.years.map((y, i) => ({ y, subs: annual[i]?.subs ?? 0, items: ev.filter((e) => e.month >= y.from && e.month <= y.to) }));

  const th = "px-3 py-2.5 text-end font-semibold whitespace-nowrap";

  return (
    <div className="space-y-10">
      <ChapterHeader id="sales-plan" />

      <Block n="4.1" title={ar ? "الاشتراكات والإيرادات سنويًا" : "Subscriptions and revenue by year"}
        lede={ar
          ? "تبدأ الخطة من عدد المحاضرات المجانية التي تُقدَّم شهريًا، ويتحول جزء منها إلى اشتراكات مدفوعة. ويُحتسب الإيراد على أساس الاشتراكات المدفوعة خلال الفترة."
          : "The plan starts from the free lectures given each month; a share converts into paid subscriptions. Revenue is the paid subscriptions of the period."}>
        <div className={clsx(CARD, "overflow-hidden print:shadow-none")}>
          <div className="thin-scrollbar overflow-x-auto">
            <table className="w-full min-w-[820px] text-[13.5px]">
              <thead>
                <tr className="border-b border-[#e1e7ef] bg-[#f8f9fc] text-[12.5px] text-ink-600">
                  <th className="px-3 py-2.5 text-start font-semibold">{ar ? "المبالغ بالريال" : "SAR"}</th>
                  {colLabels.map((l, i) => <th key={l} className={clsx(th, i === colLabels.length - 1 && "bg-ink-100/60")}>{l}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.label} className={clsx("border-b border-[#f0f2f7] last:border-0", row.kind === "total" && "bg-brand-50/50")}>
                    <td className={clsx("px-3 py-2.5", row.kind === "total" || row.kind === "sub" ? "font-bold text-ink-900" : row.kind === "pct" ? "ps-6 text-ink-500" : "text-ink-700")}>{row.label}</td>
                    {cols.map((c, i) => (
                      <td key={i} className={clsx("ltr-content px-3 py-2.5 text-end tabular-nums", i === cols.length - 1 && "bg-ink-100/40",
                        row.kind === "total" ? "font-bold text-ink-900" : row.kind === "sub" ? (c.grossProfit < 0 ? "font-bold text-[#a02a24]" : "font-bold text-[#136c3a]") : row.kind === "pct" ? "text-ink-500" : "text-ink-800")}>
                        {row.v(c, i)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Block>

      <Block n="4.2" title={ar ? "التفصيل الشهري" : "Monthly detail"}
        lede={ar ? "الاشتراكات المدفوعة في كل شهر، ومجموع الأشهر يساوي إجمالي السنة في الجدول السابق." : "Paid subscriptions in each month; the months add up to the year total above."}>
        {!inReport && (
          <div className="mb-3">
            <Segmented value={String(year)} onChange={(v) => setYear(Number(v))} options={r.years.map((y) => ({ value: String(y.year), label: ar ? `السنة ${y.year}` : `Year ${y.year}` }))} />
          </div>
        )}
        <div className={clsx(CARD, "overflow-hidden print:shadow-none")}>
          <div className="thin-scrollbar overflow-x-auto">
            <table className="w-full min-w-[820px] text-[13.5px]">
              <thead>
                <tr className="border-b border-[#e1e7ef] bg-[#f8f9fc] text-[12.5px] text-ink-600">
                  <th className="px-3 py-2.5 text-start font-semibold">{ar ? "الشهر" : "Month"}</th>
                  <th className={th}>{ar ? "محاضرات مجانية" : "Free lectures"}</th>
                  <th className={th}>{ar ? "تم حضورها" : "Attended"}</th>
                  <th className={th}>{ar ? "اشتراكات جديدة" : "New"}</th>
                  <th className={th}>{ar ? "تجديدات" : "Renewals"}</th>
                  {hasOther && <th className={th}>{ar ? "برامج فردية" : "Programmes"}</th>}
                  <th className={th}>{ar ? "مؤسسية" : "B2B"}</th>
                  <th className={th}>{ar ? "إجمالي الاشتراكات" : "Total subs"}</th>
                  <th className={th}>{ar ? "الإيراد" : "Revenue"}</th>
                  <th className={th}>{ar ? "مجمل الربح" : "Gross profit"}</th>
                </tr>
              </thead>
              <tbody>
                {[...mt.rows, mt.total].map((x, i) => {
                  const isTotal = i === mt.rows.length;
                  return (
                    <tr key={x.label + i} className={clsx("border-b border-[#f0f2f7] last:border-0", isTotal && "bg-brand-50/50 font-bold")}>
                      <td className={clsx("whitespace-nowrap px-3 py-2", isTotal ? "text-ink-900" : "text-ink-700")}>{x.label}</td>
                      <td className="ltr-content px-3 py-2 text-end tabular-nums">{money(x.trials)}</td>
                      <td className="ltr-content px-3 py-2 text-end tabular-nums">{money(x.attended)}</td>
                      <td className="ltr-content px-3 py-2 text-end tabular-nums">{money(x.fromTrials)}</td>
                      <td className="ltr-content px-3 py-2 text-end tabular-nums">{money(x.renewals)}</td>
                      {hasOther && <td className="ltr-content px-3 py-2 text-end tabular-nums">{money(x.otherB2c)}</td>}
                      <td className="ltr-content px-3 py-2 text-end tabular-nums">{money(x.b2b)}</td>
                      <td className="ltr-content px-3 py-2 text-end font-semibold tabular-nums text-ink-900">{money(x.subs)}</td>
                      <td className="ltr-content px-3 py-2 text-end tabular-nums">{money(x.revenue)}</td>
                      <td className={clsx("ltr-content px-3 py-2 text-end tabular-nums", x.grossProfit < 0 ? "text-[#a02a24]" : "text-ink-900")}>{money(x.grossProfit)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </Block>

      <Block n="4.3" title={ar ? "النمو بالأرقام" : "Growth in figures"}>
        <div className="grid gap-4 xl:grid-cols-2">
          <div className={clsx(CARD, "p-4 print:shadow-none")}>
            <p className="mb-2 text-[14px] font-bold text-ink-900">{ar ? "الاشتراكات المدفوعة شهريًا" : "Paid subscriptions per month"}</p>
            <div className="h-[280px]" dir="ltr">
              <ResponsiveContainer>
                <BarChart data={monthly} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={COLORS.grid} />
                  <XAxis dataKey="name" tickFormatter={(v) => monthLabel(v, "en", true)} tickLine={false} axisLine={false} fontSize={11} minTickGap={24} />
                  <YAxis tickLine={false} axisLine={false} fontSize={12} width={44} />
                  <Tooltip content={<ChartTooltip formatter={(v) => money(v)} labelFormatter={(l) => monthLabel(l, lang)} />} cursor={{ fill: "#f4f1ff" }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="b2c_new" stackId="s" name={ar ? "فردية جديدة" : "New individual"} fill={COLORS.purple} />
                  <Bar dataKey="renewals" stackId="s" name={ar ? "تجديدات" : "Renewals"} fill={COLORS.purpleSoft} />
                  <Bar dataKey="b2b" stackId="s" name={ar ? "مؤسسية" : "B2B"} fill={COLORS.orange} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className={clsx(CARD, "p-4 print:shadow-none")}>
            <p className="mb-2 text-[14px] font-bold text-ink-900">{ar ? "الإيراد السنوي حسب القطاع" : "Annual revenue by segment"}</p>
            <div className="h-[280px]" dir="ltr">
              <ResponsiveContainer>
                <BarChart data={revData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={COLORS.grid} />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} />
                  <YAxis tickFormatter={(v) => compact(v, "en")} tickLine={false} axisLine={false} fontSize={12} width={56} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: "#f4f1ff" }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="b2c" stackId="r" name={ar ? "الاشتراكات الفردية" : "Individual"} fill={COLORS.purple} />
                  <Bar dataKey="b2b" stackId="r" name={ar ? "الاشتراكات المؤسسية" : "Institutional"} fill={COLORS.orange} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </Block>

      <Block n="4.4" title={ar ? "خارطة الطريق" : "Roadmap"}
        lede={ar ? "المحطات الرئيسية لكل سنة، وكل محطة مرتبطة بافتراض في النموذج." : "The main milestones of each year; each one is tied to a model assumption."}>
        <ol className="space-y-3">
          {byYear.map(({ y, subs, items }, i) => (
            <Reveal key={y.year} delay={i * 50}>
              <li className={clsx(CARD, "grid gap-4 p-4 sm:p-5 lg:grid-cols-[200px_1fr] print:break-inside-avoid print:shadow-none")}>
                <div className="lg:border-e lg:border-ink-100 lg:pe-4">
                  <p className="text-[18px] font-bold text-ink-900">{ar ? `السنة ${y.year}` : `Year ${y.year}`}</p>
                  <p className="text-[12.5px] text-ink-500">{monthLabel(y.from, lang)} – {monthLabel(y.to, lang)}</p>
                  <dl className="mt-3 grid grid-cols-2 gap-2 text-[12px] lg:grid-cols-1">
                    <div><dt className="text-ink-500">{t("revenue")}</dt><dd className="ltr-content text-right text-[15px] font-bold text-ink-900 lg:text-start">{big(y.revenue)}</dd></div>
                    <div><dt className="text-ink-500">EBITDA</dt><dd className={clsx("ltr-content text-right text-[15px] font-bold lg:text-start", y.ebitda >= 0 ? "text-[#136c3a]" : "text-[#a02a24]")}>{big(y.ebitda)}</dd></div>
                  </dl>
                </div>
                <ul className="grid gap-x-5 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
                  {items.map((e) => {
                    const Icon = ICON[e.kind];
                    return (
                      <li key={e.kind + e.month + e.text} className="flex gap-2.5">
                        <Icon size={16} strokeWidth={1.8} className={clsx("mt-0.5 shrink-0", e.kind === "milestone" ? "text-accent-600" : "text-brand-600")} />
                        <div className="min-w-0">
                          <p className={clsx("text-[14px] leading-5", e.kind === "milestone" ? "font-bold text-ink-900" : "font-semibold text-ink-800")}>{e.text}</p>
                          <p className="mt-0.5 text-[12px] text-ink-500">{monthLabel(e.month, lang)}{e.sub ? ` · ${e.sub}` : ""}</p>
                        </div>
                      </li>
                    );
                  })}
                  <li className="flex gap-2.5">
                    <TrendingUp size={16} strokeWidth={1.8} className="mt-0.5 shrink-0 text-ink-400" />
                    <div className="min-w-0">
                      <p className="text-[14px] font-semibold leading-5 text-ink-700">{ar ? `${money(subs)} اشتراك مدفوع خلال السنة` : `${money(subs)} paid subscriptions in the year`}</p>
                      <p className="mt-0.5 text-[12px] text-ink-500">{ar ? `ويحتاج التشغيل إلى ${r.months.find((m) => m.month === y.to)?.headcount.teachers ?? 0} معلمًا في نهاية السنة` : `${r.months.find((m) => m.month === y.to)?.headcount.teachers ?? 0} teachers needed at year end`}</p>
                    </div>
                  </li>
                </ul>
              </li>
            </Reveal>
          ))}
        </ol>
      </Block>

      <ChapterNav id="sales-plan" />
    </div>
  );
}
