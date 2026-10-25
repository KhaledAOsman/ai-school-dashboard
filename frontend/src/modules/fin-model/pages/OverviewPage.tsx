import { useContext, useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";
import { Reveal } from "@/components/motion";
import { useFM } from "../context";
import { fmApi, type ModelResult } from "../api";
import { COLORS, compact, money, monthLabel, pct } from "../i18n";
import { CARD, ChartTooltip, Kpi, Note, useMoney } from "../components/ui";
import { Block, CHAPTERS, ChapterHeader, ChapterNav, ReportMode } from "../components/chapters";

export function computeUseOfFunds(r: ModelResult) {
  // cash burnt from the loan draw until operating cash flow turns positive, by what it paid for
  const k = r.kpis;
  const end = k.cash_flow_breakeven_month ?? r.months[r.months.length - 1].month;
  const ms = r.months.filter((m) => m.month <= end);
  const parts = {
    marketing: ms.reduce((s, m) => s + m.marketing + m.trial_cost, 0),
    team: ms.reduce((s, m) => s + m.payroll + m.teacher_onboarding, 0),
    product: ms.reduce((s, m) => s + m.launch_costs + m.other_opex + m.capex, 0),
    finance: ms.reduce((s, m) => s + m.interest + m.loan_fees, 0),
  };
  const funded = k.loan_amount + k.owner_bridge;
  const used = Object.values(parts).reduce((a, b) => a + b, 0);
  // the gross margin earned meanwhile covers part of the spend; the funding covers the rest + the buffer
  const scale = used > 0 ? Math.min(1, Math.max(0, funded - k.cash_buffer) / used) : 0;
  const rows = Object.entries(parts).map(([key, v]) => ({ key, value: v * scale }));
  const allocated = rows.reduce((s, x) => s + x.value, 0);
  rows.push({ key: "buffer", value: Math.max(0, funded - allocated) });
  return { rows, funded, until: end };
}

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
  const schoolsShare = (y5.revenue_by_stream["schools"] ?? 0) / (y5.revenue || 1);
  const tot = aq.data?.totals;
  const sar = t("sar");
  const Fwd = ar ? ArrowLeft : ArrowRight;

  const story: Record<string, [string, string]> = {
    "how-it-works": ar
      ? [`${money(core.list_price)} ${sar}`, `اشتراك ${core.lessons} حصة بعد حصة تجريبية مجانية، وعمولة ${money(core.commission_per_enrolment)} ${sar} على كل اشتراك`]
      : [`${sar} ${money(core.list_price)}`, `a ${core.lessons}-lesson plan after a free trial, ${sar} ${money(core.commission_per_enrolment)} commission per sale`],
    growth: ar
      ? [big(y5.revenue), `إيراد السنة الخامسة، ${pct(schoolsShare, 0)} منه من المدارس والشراكات`]
      : [big(y5.revenue), `year-5 revenue, ${pct(schoolsShare, 0)} from schools & partnerships`],
    statements: ar
      ? [k.ebitda_breakeven_month ? monthLabel(k.ebitda_breakeven_month, lang) : t("not_reached"), "الشهر اللي التشغيل بيبدأ يكسب فيه بشكل مستمر"]
      : [k.ebitda_breakeven_month ? monthLabel(k.ebitda_breakeven_month, lang) : t("not_reached"), "when operations turn sustainably profitable"],
    funding: ar
      ? [big(k.loan_amount), `قرض${k.owner_bridge ? ` + ${big(k.owner_bridge)} من الملاك لحد صرفه` : ""}`]
      : [big(k.loan_amount), `loan${k.owner_bridge ? ` + ${big(k.owner_bridge)} owner bridge until drawn` : ""}`],
    scenarios: ar ? ["3", "سيناريوهات (متحفظ / أساسي / متفائل) و9 عوامل حساسية"] : ["3", "scenarios (conservative / base / optimistic) and 9 sensitivity drivers"],
  };

  return (
    <div className="space-y-10">
      <ChapterHeader id="overview" />

      <Reveal>
        <section className={clsx(CARD, "p-5 sm:p-7 print:shadow-none")}>
          <p className="text-[13px] font-semibold text-brand-600">AI School · {ar ? "خطة 5 سنوات" : "5-year plan"} · {monthLabel(y1.from, lang)} – {monthLabel(y5.to, lang)}</p>
          <h3 className="mt-2 max-w-[860px] text-[22px] font-bold leading-9 text-ink-900 sm:text-[27px] sm:leading-[42px]">
            {ar ? `من ${big(y1.revenue)} في السنة الأولى إلى ${big(y5.revenue)} في السنة الخامسة` : `From ${big(y1.revenue)} in year 1 to ${big(y5.revenue)} in year 5`}
          </h3>
          <dl className="mt-5 grid gap-4 md:grid-cols-3">
            {(ar ? [
              ["إحنا مين", "منصة أونلاين بتعلّم الأطفال البرمجة والذكاء الاصطناعي بحصص فردية مع معلمين بيشتغلوا عن بُعد."],
              ["بنكسب إزاي", `ولي الأمر بيجرّب حصة مجانية، وبعدين يشترك في باقة ${core.lessons} حصة بـ${money(core.list_price)} ${sar}. المعلم بياخد ${money(core.teacher_cost_per_lesson)} ${sar} عن كل حصة.`],
              ["هنكبر إزاي", "رفع التحويل والتجديد، ثم المدارس والشركات، ومنتجات المناهج وأولمبياد البرمجة، ثم دول الخليج."],
            ] : [
              ["Who we are", "An online school teaching children coding and AI in one-to-one lessons with remote teachers."],
              ["How we earn", `Parents try a free lesson, then buy a ${core.lessons}-lesson plan for ${sar} ${money(core.list_price)}. Teachers earn ${sar} ${money(core.teacher_cost_per_lesson)} per lesson.`],
              ["How we grow", "Better conversion and renewals, then schools and companies, curriculum and olympiad products, then the GCC."],
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
        <Block n="1.1" title={ar ? "إحنا فين النهارده" : "Where we are today"}
          lede={ar ? `أرقام حقيقية من الداشبورد حتى ${aq.data!.as_of}.` : `Actual figures from the dashboard as of ${aq.data!.as_of}.`}>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label={ar ? "تمويل الملاك حتى الآن" : "Owner funding to date"} value={big(tot.invested)} />
            <Kpi label={ar ? "مبيعات محصلة" : "Sales collected"} value={big(tot.sales_paid)} delay={60} />
            <Kpi label={ar ? "اشتراكات مدفوعة" : "Paid subscriptions"} value={money(tot.subscriptions)} animate={false}
              sub={ar ? `${tot.customers} عميل + ${tot.renewals} تجديد` : `${tot.customers} customers + ${tot.renewals} renewals`} delay={120} />
            <Kpi label={ar ? "إجمالي المصروفات" : "Total spend"} value={big(tot.spent)} delay={180} />
          </div>
        </Block>
      )}

      <Block n={tot ? "1.2" : "1.1"} title={ar ? "الخطة في أرقام" : "The plan in numbers"}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Kpi label={t("revenue_y5")} value={big(k.revenue_y5)} sub={`${t("cagr")}: ${pct(k.revenue_cagr, 0)}`} />
          <Kpi label={t("ebitda_y5")} value={big(k.ebitda_y5)} tone={k.ebitda_y5 >= 0 ? "good" : "bad"} sub={`${t("margin")}: ${pct(k.ebitda_margin_y5, 0)}`} delay={60} />
          <Kpi label={t("breakeven")} value={k.ebitda_breakeven_month ? monthLabel(k.ebitda_breakeven_month, lang) : t("not_reached")} hint={t("breakeven_hint")} delay={120} animate={false} />
          <Kpi label={t("funding_need")} value={big(k.loan_amount)} tone="accent"
            sub={k.financeable ? (ar ? "قرض يغطي العجز + احتياطي 3 شهور" : "Loan covering the deficit + 3-month buffer") : (ar ? "⚠ السداد يسبق قدرة التشغيل" : "⚠ repayments outrun operations")} delay={180} />
          <Kpi label={t("ev")} value={big(k.enterprise_value)} sub={`${t("exit_equity")}: ${big(k.exit_equity_value)}`} delay={240} />
          <Kpi label={t("students")} value={money(Math.round(k.students_active_end))} sub={`${t("teachers")}: ${k.teachers_end}`} delay={300} />
        </div>
      </Block>

      <Block n={tot ? "1.3" : "1.2"} title={t("profit_path")}
        lede={(() => {
          const loss = r.years.filter((y) => y.ebitda < 0).map((y) => y.year);
          if (!loss.length) return ar ? "التشغيل بيكسب من السنة الأولى، والربح بيكبر مع الحصص لأن أغلب التكاليف بتتحرك معاها." : "Operations are profitable from year 1, and profit grows with lessons because most costs move with them.";
          const yrs = loss.map((n) => `${t("y")}${n}`).join(ar ? " و" : " & ");
          return ar
            ? `في ${yrs} فيه خسارة تشغيلية لأننا بنصرف على التسويق والفريق قبل ما الإيراد يكبر، وبعدها الربح بيزيد بسرعة لأن أغلب التكاليف (المعلم والعمولة) بتتحرك مع الحصص.`
            : `${yrs} run at an operating loss while marketing and the team are built ahead of revenue; profit then grows fast because most costs (teachers, commission) move with lessons.`;
        })()}>
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
        <Block n={tot ? "1.4" : "1.3"} title={ar ? "القصة كاملة في 5 فصول" : "The full story in 5 chapters"}>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {CHAPTERS.slice(1).map((c, i) => (
              <Reveal key={c.to} delay={i * 60} className="h-full">
                <Link to={`../${c.to}${search}`} className={clsx(CARD, "group flex h-full flex-col p-4 transition-colors hover:border-brand-600")}>
                  <span className="ltr-content text-right text-[12.5px] font-bold text-accent-600">{String(i + 2).padStart(2, "0")}</span>
                  <span className="mt-0.5 text-[15.5px] font-bold text-ink-900 group-hover:text-brand-700">{ar ? c.ar : c.en}</span>
                  <span className="ltr-content mt-3 text-right text-[20px] font-bold text-brand-700">{story[c.to][0]}</span>
                  <span className="mt-0.5 text-[13px] leading-5 text-ink-600">{story[c.to][1]}</span>
                  <span className="mt-auto flex items-center gap-1 pt-3 text-[12.5px] font-semibold text-brand-600">{ar ? "اقرأ الفصل" : "Read"} <Fwd size={13} /></span>
                </Link>
              </Reveal>
            ))}
          </div>
        </Block>
      )}

      {!k.financeable && (
        <Note tone="warn">
          {ar
            ? `بشروط القرض الحالية (سماح ${ra.financing.loan_grace_months} شهر، مدة ${ra.financing.loan_tenor_months} شهر) الأقساط تبدأ قبل ما التشغيل يقدر يغطيها. جرّب فترة سماح أطول أو تمويل جزئي بحصص من صفحة الافتراضات.`
            : `With the current loan terms (grace ${ra.financing.loan_grace_months} months, tenor ${ra.financing.loan_tenor_months} months) repayments start before operations can carry them. Try a longer grace period or partial equity in Assumptions.`}
        </Note>
      )}

      <ChapterNav id="overview" />
    </div>
  );
}
