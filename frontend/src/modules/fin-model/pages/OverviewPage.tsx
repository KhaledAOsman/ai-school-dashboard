import { useMemo } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CheckCircle2, AlertTriangle, ExternalLink } from "lucide-react";
import { useFM } from "../context";
import { COLORS, STREAM_COLORS, compact, money, monthLabel, pct } from "../i18n";
import { ChartTooltip, Kpi, Note, Panel, useMoney } from "../components/ui";
import { MARKET, onlineTutoringMarketSar } from "../components/market";
import type { ModelResult } from "../api";

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
  const { result: r, t, nm, lang, resultLoading } = useFM();
  const { big } = useMoney();
  const ar = lang === "ar";

  const yearData = useMemo(() => (r ? r.years.map((y) => ({
    name: `${t("y")}${y.year}`, ...Object.fromEntries(Object.entries(y.revenue_by_stream).map(([k, v]) => [k, Math.round(v)])),
    revenue: Math.round(y.revenue), ebitda: Math.round(y.ebitda), net_income: Math.round(y.net_income),
  })) : []), [r, t]);
  const monthData = useMemo(() => (r ? r.months.map((m) => ({
    name: m.month, cash: Math.round(m.cash), loan: Math.round(m.loan_balance),
    students: Math.round(m.active_students), teachers: m.headcount.teachers,
  })) : []), [r]);

  if (!r) return <p className="py-10 text-center text-ink-600">{resultLoading ? t("loading") : "—"}</p>;
  const k = r.kpis;
  const y1 = r.years[0], y5 = r.years[r.years.length - 1];
  const marketY5 = onlineTutoringMarketSar(5);
  const share = y5.revenue / marketY5;
  const funds = computeUseOfFunds(r);
  const fundLabels: Record<string, [string, string]> = {
    marketing: ["التسويق واكتساب العملاء", "Marketing & customer acquisition"],
    team: ["الفريق والتوظيف", "Team & hiring"],
    product: ["المنتجات الجديدة والمحتوى والمنصة", "New products, content & platform"],
    finance: ["تكلفة التمويل", "Financing cost"],
    buffer: ["احتياطي نقدي", "Cash buffer"],
  };
  const ok = r.checks.all_ok === true;
  const ra = r.resolved_assumptions;
  const ksa = ra?.markets.find((m) => m.id === "ksa");
  const core = ra?.streams.find((s) => s.id === "core_b2c");
  const schoolsShare = (y5.revenue_by_stream["schools"] ?? 0) / (y5.revenue || 1);

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-[#e1e7ef] bg-white p-5 sm:p-6">
        <p className="text-[13px] font-semibold text-brand-600">AI School · {ar ? "خطة النمو 5 سنوات" : "5-year growth plan"}</p>
        <h2 className="mt-1 text-[20px] font-bold leading-8 text-ink-900 sm:text-[22px]">
          {ar
            ? `من ${big(y1.revenue)} في السنة الأولى إلى ${big(y5.revenue)} في السنة الخامسة`
            : `From ${big(y1.revenue)} in year 1 to ${big(y5.revenue)} in year 5`}
        </h2>
        <p className="mt-2 max-w-[900px] text-[14.5px] leading-7 text-ink-700">
          {ar
            ? `منصة تعليم برمجة وذكاء اصطناعي للأطفال أونلاين بمعلمين عن بُعد. النمو ${k.revenue_cagr !== null ? `مركب ${pct(k.revenue_cagr, 0)} سنويًا` : ""}، والتعادل التشغيلي ${k.ebitda_breakeven_month ? `في ${monthLabel(k.ebitda_breakeven_month, lang)}` : "لا يتحقق خلال الفترة"}، وهامش EBITDA ${pct(y5.ebitda_margin, 0)} في السنة الخامسة. التمويل المطلوب ${big(k.loan_amount)} كقرض${k.owner_bridge ? ` + ${big(k.owner_bridge)} تمويل جسر من الملاك حتى صرف القرض` : ""}.`
            : `An online coding & AI school for children taught by remote teachers. Revenue grows ${k.revenue_cagr !== null ? `${pct(k.revenue_cagr, 0)} a year` : ""}, operating break-even ${k.ebitda_breakeven_month ? `in ${monthLabel(k.ebitda_breakeven_month, lang)}` : "is not reached in the period"}, and year-5 EBITDA margin is ${pct(y5.ebitda_margin, 0)}. Funding required: a ${big(k.loan_amount)} loan${k.owner_bridge ? ` + ${big(k.owner_bridge)} owner bridge until the loan is drawn` : ""}.`}
        </p>
        <p className={`mt-3 flex items-center gap-1.5 text-[12.5px] font-semibold ${ok ? "text-[#136c3a]" : "text-[#a02a24]"}`}>
          {ok ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />} {ok ? t("checks_ok") : t("checks_bad")}
        </p>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Kpi label={t("revenue_y5")} value={big(k.revenue_y5)} sub={`${t("cagr")}: ${pct(k.revenue_cagr, 0)}`} delay={0} />
        <Kpi label={t("ebitda_y5")} value={big(k.ebitda_y5)} tone={k.ebitda_y5 >= 0 ? "good" : "bad"} sub={`${t("margin")}: ${pct(k.ebitda_margin_y5, 0)}`} delay={60} />
        <Kpi label={t("breakeven")} value={k.ebitda_breakeven_month ? monthLabel(k.ebitda_breakeven_month, lang) : t("not_reached")} hint={t("breakeven_hint")} delay={120} animate={false} />
        <Kpi label={t("funding_need")} value={big(k.loan_amount)} tone="accent"
          sub={k.financeable ? (ar ? "يغطي العجز + احتياطي 3 شهور" : "Covers the deficit + 3-month buffer") : (ar ? "⚠ السداد يسبق قدرة التشغيل" : "⚠ repayments outrun operations")} delay={180} />
        <Kpi label={t("ev")} value={big(k.enterprise_value)} sub={`${t("exit_equity")}: ${big(k.exit_equity_value)}`} delay={240} />
        <Kpi label={t("students")} value={money(Math.round(k.students_active_end))} sub={`${t("teachers")}: ${k.teachers_end}`} delay={300} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title={t("rev_by_stream")} subtitle={ar ? "إيراد معترف به (بعد الضريبة عند التسجيل)" : "Recognised revenue (net of VAT once registered)"}>
          <div className="h-[300px]" dir="ltr">
            <ResponsiveContainer>
              <BarChart data={yearData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={COLORS.grid} />
                <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickFormatter={(v) => compact(v, "en")} tickLine={false} axisLine={false} fontSize={12} width={56} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "#f4f1ff" }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {r.streams.map((s, i) => (
                  <Bar key={s.id} dataKey={s.id} name={nm(s)} stackId="a" fill={STREAM_COLORS[i % STREAM_COLORS.length]} radius={i === r.streams.length - 1 ? [4, 4, 0, 0] : 0} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title={t("profit_path")} subtitle={ar ? "الإيرادات و EBITDA وصافي الربح سنويًا" : "Revenue, EBITDA and net income per year"} delay={80}>
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
        </Panel>
        <Panel title={t("cash_path")} subtitle={ar ? `أقل رصيد ${big(k.min_cash)} في ${monthLabel(k.min_cash_month, lang)}` : `Lowest balance ${big(k.min_cash)} in ${monthLabel(k.min_cash_month, lang)}`} delay={120}>
          <div className="h-[260px]" dir="ltr">
            <ResponsiveContainer>
              <AreaChart data={monthData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="fmcash" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COLORS.purple} stopOpacity={0.25} />
                    <stop offset="100%" stopColor={COLORS.purple} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke={COLORS.grid} />
                <XAxis dataKey="name" tickFormatter={(v) => monthLabel(v, "en", true)} tickLine={false} axisLine={false} fontSize={11} minTickGap={24} />
                <YAxis tickFormatter={(v) => compact(v, "en")} tickLine={false} axisLine={false} fontSize={12} width={56} />
                <Tooltip content={<ChartTooltip labelFormatter={(l) => monthLabel(l, lang)} />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area dataKey="cash" name={t("cash")} stroke={COLORS.purple} strokeWidth={2} fill="url(#fmcash)" />
                <Line dataKey="loan" name={ar ? "رصيد القرض" : "Loan balance"} stroke={COLORS.orange} strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title={t("growth_ops")} subtitle={ar ? "الطلاب النشطون والمعلمون المطلوبون شهريًا" : "Active students and teachers needed per month"} delay={160}>
          <div className="h-[260px]" dir="ltr">
            <ResponsiveContainer>
              <LineChart data={monthData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={COLORS.grid} />
                <XAxis dataKey="name" tickFormatter={(v) => monthLabel(v, "en", true)} tickLine={false} axisLine={false} fontSize={11} minTickGap={24} />
                <YAxis yAxisId="s" tickLine={false} axisLine={false} fontSize={12} width={44} />
                <YAxis yAxisId="t" orientation="right" tickLine={false} axisLine={false} fontSize={12} width={36} />
                <Tooltip content={<ChartTooltip formatter={(v) => compact(v, "en")} labelFormatter={(l) => monthLabel(l, lang)} />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line yAxisId="s" dataKey="students" name={t("students")} stroke={COLORS.purple} strokeWidth={2.5} dot={false} />
                <Line yAxisId="t" dataKey="teachers" name={t("teachers")} stroke={COLORS.orange} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title={t("market")} className="xl:col-span-2">
          <div className="grid grid-cols-2 gap-3">
            {[
              [ar ? "طلاب التعليم العام بالسعودية" : "Saudi K-12 students", `${compact(MARKET.ksaStudents, lang)}+`],
              [ar ? "طلاب الخليج" : "GCC students", compact(MARKET.gccStudents, lang)],
              [ar ? "سوق الدروس الأونلاين بالسعودية في السنة الخامسة" : "Saudi online tutoring market, year 5", big(marketY5)],
              [ar ? "حصتنا المطلوبة منه" : "Share we need of it", pct(share, 1)],
            ].map(([l, v]) => (
              <div key={l} className="rounded-lg bg-[#f8f9fc] p-3">
                <p className="text-[12px] text-ink-600">{l}</p>
                <p className="ltr-content mt-1 text-right text-[18px] font-bold text-ink-900">{v}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[13.5px] leading-6 text-ink-700">
            {ar
              ? `في السنة الخامسة تحتاج الخطة ${money(Math.round(k.students_active_end))} طالب نشط، يعني ${pct(k.students_active_end / MARKET.ksaStudents, 2)} فقط من طلاب السعودية، و${pct(share, 1)} من سوق الدروس الأونلاين المتوقع. التوسع سهل لأن التدريس أونلاين والمعلمين عن بُعد بأجر للحصة، فالطاقة تزيد بتعيين معلمين بدون تكلفة ثابتة.`
              : `By year 5 the plan needs ${money(Math.round(k.students_active_end))} active students — just ${pct(k.students_active_end / MARKET.ksaStudents, 2)} of Saudi students and ${pct(share, 1)} of the projected online-tutoring market. Scaling is simple: teaching is online and teachers are remote and paid per lesson, so capacity grows by hiring teachers with no fixed cost.`}
          </p>
          <ul className="mt-3 space-y-1 text-[12px] text-ink-600">
            {MARKET.sources.map((s) => (
              <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-brand-600">{ar ? s.ar : s.en} <ExternalLink size={11} /></a></li>
            ))}
          </ul>
        </Panel>
        <Panel title={t("use_of_funds")} subtitle={ar ? `من صرف التمويل حتى ${monthLabel(funds.until, lang)}` : `From funding until ${monthLabel(funds.until, lang)}`} delay={80}>
          <div className="space-y-2.5">
            {funds.rows.map((x, i) => (
              <div key={x.key}>
                <div className="flex justify-between text-[13px]"><span className="text-ink-700">{fundLabels[x.key][ar ? 0 : 1]}</span><span className="ltr-content font-semibold text-ink-900">{big(x.value)}</span></div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink-100">
                  <div className="h-full rounded-full" style={{ width: `${funds.funded ? (x.value / funds.funded) * 100 : 0}%`, backgroundColor: STREAM_COLORS[i] }} />
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title={t("key_assumptions")}>
          <ul className="space-y-2 text-[13.5px] text-ink-700">
            {core && <li>• {ar ? `الاشتراك الأساسي ${core.list_price} ر.س لـ ${core.lessons} حصة فردية، متوسط خصم ${pct(core.avg_discount, 0)}، أجر المعلم ${core.teacher_cost_per_lesson} ر.س للحصة المحجوزة.` : `Core plan SAR ${core.list_price} for ${core.lessons} one-to-one lessons, ${pct(core.avg_discount, 0)} average discount, teacher paid SAR ${core.teacher_cost_per_lesson} per booked lesson.`}</li>}
            {ksa && <li>• {ar ? `تكلفة الليد ${Math.round(ksa.cpl)} ر.س، والتحويل من الحضور للاشتراك يتحسن من ${pct(ksa.trial_to_paid, 1)} إلى ${pct(ksa.trial_to_paid_target, 0)} خلال ${ksa.ramp_months} شهر.` : `Cost per lead SAR ${Math.round(ksa.cpl)}; trial-to-paid conversion improves from ${pct(ksa.trial_to_paid, 1)} to ${pct(ksa.trial_to_paid_target, 0)} over ${ksa.ramp_months} months.`}</li>}
            {core && <li>• {ar ? `التجديد يرتفع من ${pct(core.renewal_rate, 0)} (الفعلي) إلى ${pct(core.renewal_rate_target, 0)} بمنهج متدرج المستويات.` : `Renewals rise from ${pct(core.renewal_rate, 0)} (actual) to ${pct(core.renewal_rate_target, 0)} with a levelled curriculum.`}</li>}
            <li>• {ar ? `المدارس والشركات بخصم 50% تمثل ${pct(schoolsShare, 0)} من إيراد السنة الخامسة.` : `Schools & companies at 50% off make ${pct(schoolsShare, 0)} of year-5 revenue.`}</li>
            <li>• {ar ? `التسجيل في ضريبة القيمة المضافة ${k.vat_registration_month ? `في ${monthLabel(k.vat_registration_month, lang)} (عند تجاوز 375 ألف ر.س)` : "غير مطلوب"}، والأسعار ثابتة شاملة الضريبة. الزكاة 2.5%.` : `VAT registration ${k.vat_registration_month ? `in ${monthLabel(k.vat_registration_month, lang)} (on passing SAR 375K)` : "not required"}; prices stay VAT-inclusive. Zakat 2.5%.`}</li>
          </ul>
        </Panel>
        <Panel title={t("risks")} delay={80}>
          <ul className="space-y-2 text-[13.5px] text-ink-700">
            {(ar ? [
              ["الاعتماد على المدارس", "عقود شراكة على فصول كاملة + فريق مبيعات مخصص من فبراير 2027؛ السيناريو المتحفظ يخفض حجمها 40%."],
              ["تحويل التجربة لاشتراك", "متابعة كل محاضرة تجريبية خلال 24 ساعة وعرض محدود المدة؛ يتابع شهريًا في «الفعلي مقابل الخطة»."],
              ["التجديد", "منهج بمستويات وشهادات + تقارير للأهل؛ أكبر محرك في تحليل الحساسية."],
              ["تكلفة الإعلانات", "رفع نسبة الزيارات المباشرة والإحالات، وميزانية موسمية تتضاعف في الصيف فقط."],
              ["جودة المعلمين مع التوسع", "مشرف أكاديمي لكل 20 معلم وتكلفة تدريب لكل معلم جديد محسوبة في الخطة."],
              ["التنظيم والترخيص", "ترخيص التعليم الإلكتروني والتسجيل الضريبي ضمن بند الرسوم الحكومية."],
            ] : [
              ["Dependence on schools", "Whole-class partnership contracts + a dedicated sales lead from Feb 2027; the conservative case cuts volume 40%."],
              ["Trial-to-paid conversion", "Follow up every trial within 24h with a time-limited offer; tracked monthly in Actual vs plan."],
              ["Renewals", "Levelled curriculum with certificates and parent reports; the biggest driver in the sensitivity analysis."],
              ["Ad costs", "Grow direct visits and referrals; seasonal budget that doubles only in summer."],
              ["Teacher quality at scale", "One academic supervisor per 20 teachers and an onboarding cost per new teacher are in the plan."],
              ["Regulation & licensing", "E-learning licence and VAT registration are covered by the government-fees line."],
            ]).map(([h, d]) => (
              <li key={h}><span className="font-semibold text-ink-900">{h}: </span>{d}</li>
            ))}
          </ul>
        </Panel>
      </div>

      {!k.financeable && (
        <Note tone="warn">
          {ar
            ? `بشروط القرض الحالية (سماح ${ra?.financing.loan_grace_months} شهر، مدة ${ra?.financing.loan_tenor_months} شهر) الأقساط تبدأ قبل ما التشغيل يقدر يغطيها. جرّب فترة سماح أطول أو تمويل جزئي بحصص من صفحة الافتراضات.`
            : `With the current loan terms (grace ${ra?.financing.loan_grace_months} months, tenor ${ra?.financing.loan_tenor_months} months) repayments start before operations can carry them. Try a longer grace period or partial equity in Assumptions.`}
        </Note>
      )}
    </div>
  );
}
