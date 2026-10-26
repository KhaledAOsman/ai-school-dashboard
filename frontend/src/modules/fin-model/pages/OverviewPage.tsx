/**
 * Chapter 1 — Executive summary for owners and the board: what the company is,
 * where it stands today (live dashboard data), the plan's headline figures,
 * the path to profit and links to every chapter.
 */
import { useContext, useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";
import { Reveal } from "@/components/motion";
import { useFM } from "../context";
import { fmApi } from "../api";
import { COLORS, compact, money, monthLabel, pct } from "../i18n";
import { CARD, ChartTooltip, Kpi, Note, useMoney } from "../components/ui";
import { Block, CHAPTERS, ChapterHeader, ChapterNav, ReportMode } from "../components/chapters";

export default function OverviewPage() {
  const { result: r, t, lang, resultLoading } = useFM();
  const { big } = useMoney();
  const { search } = useLocation();
  const inReport = useContext(ReportMode);
  const aq = useQuery({ queryKey: ["fm", "actuals"], queryFn: fmApi.actuals, staleTime: 60_000 });
  const ar = lang === "ar";

  const yearData = useMemo(() => (r ? r.years.map((y) => ({
    name: `${t("y")}${y.year}`, revenue: Math.round(y.revenue), ebitda: Math.round(y.ebitda), net_income: Math.round(y.net_income),
  })) : []), [r, t]);

  if (!r?.resolved_assumptions) return <p className="py-10 text-center text-ink-600">{resultLoading ? t("loading") : "—"}</p>;
  const k = r.kpis;
  const ra = r.resolved_assumptions;
  const y1 = r.years[0], y5 = r.years[r.years.length - 1];
  const ok = r.checks.all_ok === true;
  const core = ra.streams.find((s) => s.id === "core_b2c") ?? ra.streams[0];
  const seg = new Map(r.streams.map((s) => [s.id, s.category]));
  const b2bShare = Object.entries(y5.revenue_by_stream).filter(([id]) => seg.get(id) === "b2b").reduce((a, [, v]) => a + v, 0) / (y5.revenue || 1);
  const subsY1 = Math.round(y1.subscriptions), subsY5 = Math.round(y5.subscriptions);
  const tot = aq.data?.totals;
  const sar = t("sar");
  const Fwd = ar ? ArrowLeft : ArrowRight;
  const lossYears = r.years.filter((y) => y.ebitda < 0).map((y) => `${t("y")}${y.year}`);

  const story: Record<string, [string, string]> = {
    "business-model": ar ? ["قطاعان", "الاشتراكات الفردية، والاشتراكات المؤسسية للمدارس والجمعيات والشركات"] : ["2 segments", "individual subscriptions, and institutional ones for schools, associations and companies"],
    "unit-economics": ar ? [`${money(core.list_price)} ${sar}`, `سعر باقة ${core.lessons} محاضرة، وأجر المعلم ${money(core.teacher_cost_per_lesson)} ${sar} للمحاضرة`] : [`${sar} ${money(core.list_price)}`, `per ${core.lessons}-lecture package; teacher fee ${sar} ${money(core.teacher_cost_per_lesson)} per lecture`],
    "sales-plan": ar ? [money(subsY5), "اشتراك مدفوع في السنة الخامسة"] : [money(subsY5), "paid subscriptions in year 5"],
    expenses: ar ? [big(y5.cogs + y5.opex), "مصروفات السنة الخامسة موزعة على بنود واضحة"] : [big(y5.cogs + y5.opex), "year-5 expenses by clear category"],
    statements: ar ? [k.ebitda_breakeven_month ? monthLabel(k.ebitda_breakeven_month, lang) : t("not_reached"), "نقطة التعادل التشغيلي"] : [k.ebitda_breakeven_month ? monthLabel(k.ebitda_breakeven_month, lang) : t("not_reached"), "operating break-even"],
    funding: ar ? [big(k.loan_amount), "قرض دون فوائد"] : [big(k.loan_amount), "interest-free loan"],
    scenarios: ar ? ["3", "سيناريوهات وتحليل حساسية لأهم المتغيرات"] : ["3", "scenarios and a sensitivity analysis of the main drivers"],
  };

  return (
    <div className="space-y-10">
      <ChapterHeader id="overview" />

      <Reveal>
        <section className={clsx(CARD, "p-5 sm:p-7 print:shadow-none")}>
          <p className="text-[13px] font-semibold text-brand-600">AI School · {ar ? "خطة خمس سنوات" : "5-year plan"} · {monthLabel(y1.from, lang)} – {monthLabel(y5.to, lang)}</p>
          <h3 className="mt-2 max-w-[880px] text-[22px] font-bold leading-9 text-ink-900 sm:text-[27px] sm:leading-[42px]">
            {ar ? `من ${money(subsY1)} اشتراك مدفوع في السنة الأولى إلى ${money(subsY5)} اشتراك في السنة الخامسة، بإيراد ${big(y5.revenue)}` : `From ${money(subsY1)} paid subscriptions in year 1 to ${money(subsY5)} in year 5, with revenue of ${big(y5.revenue)}`}
          </h3>
          <dl className="mt-5 grid gap-4 md:grid-cols-3">
            {(ar ? [
              ["النشاط", "منصة تعليمية إلكترونية تعلّم الأطفال البرمجة والذكاء الاصطناعي عبر محاضرات فردية يقدّمها معلمون يعملون عن بُعد."],
              ["مصدر الإيراد", `اشتراكات مدفوعة مقدمًا: باقة من ${core.lessons} محاضرة بسعر ${money(core.list_price)} ${sar}، تسبقها محاضرة تجريبية مجانية، إضافة إلى اشتراكات مؤسسية تبدأ في السنة الثانية.`],
              ["محركات النمو", "زيادة المحاضرات المجانية وتحسين نسبة التحويل والتجديد، ثم الشراكات مع المدارس والجمعيات والشركات، ثم التوسع في دول الخليج."],
            ] : [
              ["Business", "An online school teaching children coding and AI through one-to-one lectures given by remote teachers."],
              ["Revenue", `Prepaid subscriptions: a ${core.lessons}-lecture package for ${sar} ${money(core.list_price)} after a free trial lecture, plus institutional subscriptions from year 2.`],
              ["Growth drivers", "More free lectures, better conversion and renewals, then partnerships with schools, associations and companies, then the GCC."],
            ]).map(([h, d]) => (
              <div key={h} className="border-s-2 border-brand-200 ps-4">
                <dt className="text-[14px] font-bold text-ink-900">{h}</dt>
                <dd className="mt-1 text-[14.5px] leading-7 text-ink-700">{d}</dd>
              </div>
            ))}
          </dl>
          <p className={clsx("mt-5 flex items-center gap-1.5 text-[12.5px] font-semibold", ok ? "text-[#136c3a]" : "text-[#a02a24]")}>
            {ok ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />} {ok ? t("checks_ok") : t("checks_bad")}
          </p>
        </section>
      </Reveal>

      {tot && (
        <Block n="1.1" title={ar ? "الوضع الحالي" : "Where we stand today"}
          lede={ar ? `أرقام فعلية من لوحة التحكم حتى ${aq.data!.as_of}.` : `Actual figures from the dashboard as of ${aq.data!.as_of}.`}>
          <div className="grid gap-3 sm:grid-cols-3">
            <Kpi label={ar ? "المبيعات المحصلة" : "Sales collected"} value={big(tot.sales_paid)} delay={60} />
            <Kpi label={ar ? "الاشتراكات المدفوعة" : "Paid subscriptions"} value={money(tot.subscriptions)} animate={false}
              sub={ar ? `${tot.customers} اشتراك جديد + ${tot.renewals} تجديد` : `${tot.customers} new + ${tot.renewals} renewal(s)`} delay={120} />
            <Kpi label={ar ? "إجمالي المصروفات" : "Total spend"} value={big(tot.spent)} delay={180} />
          </div>
        </Block>
      )}

      <Block n={tot ? "1.2" : "1.1"} title={ar ? "أهم أرقام الخطة" : "The plan in numbers"}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Kpi label={ar ? "الاشتراكات المدفوعة في السنة الخامسة" : "Paid subscriptions, year 5"} value={money(subsY5)} animate={false}
            sub={ar ? `منها ${pct(b2bShare, 0)} من الإيراد مؤسسي` : `${pct(b2bShare, 0)} of revenue institutional`} />
          <Kpi label={t("revenue_y5")} value={big(k.revenue_y5)} sub={`${t("cagr")}: ${pct(k.revenue_cagr, 0)}`} delay={60} />
          <Kpi label={t("ebitda_y5")} value={big(k.ebitda_y5)} tone={k.ebitda_y5 >= 0 ? "good" : "bad"} sub={`${t("margin")}: ${pct(k.ebitda_margin_y5, 0)}`} delay={120} />
          <Kpi label={t("breakeven")} value={k.ebitda_breakeven_month ? monthLabel(k.ebitda_breakeven_month, lang) : t("not_reached")} hint={t("breakeven_hint")} delay={180} animate={false} />
          <Kpi label={t("funding_need")} value={big(k.loan_amount)} tone="accent"
            sub={k.financeable ? (ar ? "قرض دون فوائد يغطي العجز واحتياطيًا نقديًا" : "Interest-free loan covering the deficit and a cash reserve") : (ar ? "يلزم مراجعة شروط القرض" : "Loan terms need review")} delay={240} />
          <Kpi label={t("ev")} value={big(k.enterprise_value)} sub={`${t("exit_equity")}: ${big(k.exit_equity_value)}`} delay={300} />
        </div>
      </Block>

      <Block n={tot ? "1.3" : "1.2"} title={t("profit_path")}
        lede={lossYears.length
          ? (ar ? `تسجّل الخطة خسارة تشغيلية في ${lossYears.join(" و")} نتيجة الإنفاق على التسويق والفريق قبل نمو الإيراد، ثم ترتفع الأرباح لأن معظم التكاليف (أجور المعلمين والعمولات) تتغير مع عدد المحاضرات.`
            : `${lossYears.join(" & ")} run at an operating loss while marketing and the team are built ahead of revenue; profit then rises because most costs (teacher fees, commissions) move with lectures.`)
          : (ar ? "يحقق التشغيل ربحًا من السنة الأولى." : "Operations are profitable from year 1.")}>
        <div className={clsx(CARD, "p-4 print:shadow-none")}>
          <div className="h-[300px]" dir="ltr">
            <ResponsiveContainer>
              <ComposedChart data={yearData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={COLORS.grid} />
                <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickFormatter={(v) => compact(v, "en")} tickLine={false} axisLine={false} fontSize={12} width={56} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "#f4f1ff" }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="revenue" name={t("revenue")} fill={COLORS.purpleSoft} radius={[4, 4, 0, 0]} />
                <Line dataKey="ebitda" name={t("ebitda")} stroke={COLORS.purple} strokeWidth={2.5} dot={{ r: 3 }} />
                <Line dataKey="net_income" name={t("net_income")} stroke={COLORS.orange} strokeWidth={2.5} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </Block>

      {!inReport && (
        <Block n={tot ? "1.4" : "1.3"} title={ar ? "فصول الدراسة" : "Chapters"}>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {CHAPTERS.slice(1).map((c, i) => (
              <Reveal key={c.to} delay={i * 50} className="h-full">
                <Link to={`../${c.to}${search}`} className={clsx(CARD, "group flex h-full flex-col p-4 transition-colors hover:border-brand-600")}>
                  <span className="ltr-content text-right text-[12.5px] font-bold text-accent-600">{String(i + 2).padStart(2, "0")}</span>
                  <span className="mt-0.5 text-[15.5px] font-bold text-ink-900 group-hover:text-brand-700">{ar ? c.ar : c.en}</span>
                  <span className="ltr-content mt-3 text-right text-[20px] font-bold text-brand-700">{story[c.to]?.[0]}</span>
                  <span className="mt-0.5 text-[13px] leading-5 text-ink-600">{story[c.to]?.[1]}</span>
                  <span className="mt-auto flex items-center gap-1 pt-3 text-[12.5px] font-semibold text-brand-600">{ar ? "عرض الفصل" : "Open"} <Fwd size={13} /></span>
                </Link>
              </Reveal>
            ))}
          </div>
        </Block>
      )}

      {!k.financeable && (
        <Note tone="warn">
          {ar
            ? `بشروط التمويل الحالية (فترة سماح ${ra.financing.loan_grace_months} شهرًا ومدة ${ra.financing.loan_tenor_months} شهرًا) تبدأ الأقساط قبل أن يتمكن التشغيل من سدادها؛ ويمكن معالجة ذلك بفترة سماح أطول أو بتمويل جزئي عبر حصص ملكية من صفحة الافتراضات.`
            : `With the current terms (grace ${ra.financing.loan_grace_months} months, tenor ${ra.financing.loan_tenor_months} months) repayments start before operations can carry them; a longer grace period or partial equity in Assumptions resolves it.`}
        </Note>
      )}

      <ChapterNav id="overview" />
    </div>
  );
}
