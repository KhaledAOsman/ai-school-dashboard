import { Area, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useFM } from "../context";
import { COLORS, compact, money, monthLabel, pct } from "../i18n";
import { ChartTooltip, Kpi, Note, Panel, useMoney } from "../components/ui";
import { computeUseOfFunds } from "./OverviewPage";
import { ChapterHeader, ChapterNav } from "../components/chapters";

export default function FundingPage() {
  const { result: r, t, lang } = useFM();
  const { big, full } = useMoney();
  if (!r) return <p className="py-10 text-center text-ink-600">{t("loading")}</p>;
  const ar = lang === "ar";
  const k = r.kpis;
  const f = r.resolved_assumptions?.financing;
  const v = r.valuation;
  const data = r.months.map((m) => ({ name: m.month, loan: Math.round(m.loan_balance), cash: Math.round(m.cash) }));
  const funds = computeUseOfFunds(r);
  const fundLabels: Record<string, [string, string]> = {
    marketing: ["التسويق واكتساب العملاء", "Marketing & acquisition"], team: ["الفريق والتوظيف", "Team & hiring"],
    product: ["المنتجات والمحتوى والمنصة", "Products, content & platform"], finance: ["تكلفة التمويل", "Financing cost"], buffer: ["احتياطي نقدي", "Cash buffer"],
  };

  return (
    <div className="space-y-5">
      <ChapterHeader id="funding" />
      <div className="grid gap-3 md:grid-cols-3">
        {(ar ? [
          ["كام محتاجين؟", `${big(k.loan_amount)} قرض${k.owner_bridge ? ` + ${big(k.owner_bridge)} من الملاك لحد ما القرض يتصرف` : ""}.`],
          ["هيتصرف في إيه؟", `أكبر بند ${fundLabels[[...funds.rows].sort((a, b) => b.value - a.value)[0].key][0]} (${big([...funds.rows].sort((a, b) => b.value - a.value)[0].value)}) — التفاصيل في الجدول تحت.`],
          ["هيرجع إزاي؟", `${f?.loan_grace_months} شهر سماح بندفع فيهم الأرباح بس، وبعدها قسط ${full(k.loan_monthly_payment)} شهريًا من أرباح التشغيل${k.loan_repaid_month ? ` لحد ${monthLabel(k.loan_repaid_month, lang)}` : ""}.`],
        ] : [
          ["How much?", `A ${big(k.loan_amount)} loan${k.owner_bridge ? ` + ${big(k.owner_bridge)} from owners until it is drawn` : ""}.`],
          ["Spent on what?", `Largest item: ${fundLabels[[...funds.rows].sort((a, b) => b.value - a.value)[0].key][1]} (${big([...funds.rows].sort((a, b) => b.value - a.value)[0].value)}) — details below.`],
          ["Paid back how?", `${f?.loan_grace_months} months of profit-only payments, then ${full(k.loan_monthly_payment)} a month from operating profit${k.loan_repaid_month ? ` until ${monthLabel(k.loan_repaid_month, lang)}` : ""}.`],
        ]).map(([h, d]) => (
          <div key={h} className="rounded-xl border border-[#e1e7ef] bg-white p-4"><p className="text-[14.5px] font-bold text-ink-900">{h}</p><p className="mt-1 text-[14px] leading-6 text-ink-700">{d}</p></div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={ar ? "القرض المقترح" : "Proposed loan"} value={big(k.loan_amount)} tone="accent" sub={ar ? `يغطي أقل رصيد + احتياطي ${f?.cash_buffer_months} شهور` : `Covers the trough + ${f?.cash_buffer_months}-month buffer`} />
        <Kpi label={ar ? "التمويل المطلوب بدون قرض" : "Funding need without a loan"} value={big(k.funding_need_without_loan)} sub={ar ? "أعمق عجز تراكمي في الكاش" : "Deepest cumulative cash deficit"} delay={60} />
        <Kpi label={ar ? "القسط الشهري بعد فترة السماح" : "Monthly instalment after grace"} value={full(k.loan_monthly_payment)}
          sub={k.loan_repaid_month ? (ar ? `يُسدد بالكامل ${monthLabel(k.loan_repaid_month, lang)}` : `Fully repaid ${monthLabel(k.loan_repaid_month, lang)}`) : (ar ? "يمتد بعد السنة الخامسة" : "Runs beyond year 5")} delay={120} />
        <Kpi label={ar ? "تمويل جسر من الملاك" : "Owner bridge"} value={big(k.owner_bridge)} sub={ar ? `حتى صرف القرض ${monthLabel(f?.loan_draw_month, lang)}` : `Until the loan is drawn ${monthLabel(f?.loan_draw_month, lang)}`} delay={180} />
      </div>
      {f && (
        <Note tone={k.financeable ? "info" : "warn"}>
          {ar
            ? `شروط القرض في الخطة: ربح ${pct(f.loan_rate, 1)} سنويًا (سايبور + هامش البنك)، مدة ${f.loan_tenor_months} شهر منها ${f.loan_grace_months} شهر سماح (سداد الأرباح فقط)، ورسوم ${pct(f.loan_upfront_fee, 1)} (ترتيب + ضمان كفالة). ${k.financeable ? "الكاش يفضل موجب طول الفترة بعد الصرف." : `الأقساط تبدأ قبل ما التشغيل يقدر يغطيها${k.suggested_grace_months ? ` — فترة سماح ${k.suggested_grace_months} شهر تحل المشكلة` : " — محتاج فترة سماح أطول أو جزء تمويل بالحصص"}.`} البنوك عادة بتطلب قوائم مالية لسنة على الأقل وتدفق نقدي يغطي الأقساط (DSCR ≥ 1.25)، فالأرقام دي تأكيدها مع البنك أو برنامج كفالة.`
            : `Loan terms in the plan: ${pct(f.loan_rate, 1)} annual profit rate (SAIBOR + bank margin), ${f.loan_tenor_months}-month tenor incl. ${f.loan_grace_months} months grace (profit only), ${pct(f.loan_upfront_fee, 1)} fees (arrangement + Kafalah guarantee). ${k.financeable ? "Cash stays positive throughout after the draw." : `Repayments start before operations can carry them${k.suggested_grace_months ? ` — a ${k.suggested_grace_months}-month grace period fixes it` : " — needs a longer grace period or partial equity"}.`} Banks usually ask for at least a year of financial statements and cash flow covering the instalments (DSCR ≥ 1.25); confirm these terms with the bank or the Kafalah programme.`}
        </Note>
      )}
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title={ar ? "رصيد القرض والكاش" : "Loan balance & cash"}>
          <div className="h-[280px]" dir="ltr">
            <ResponsiveContainer>
              <ComposedChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={COLORS.grid} />
                <XAxis dataKey="name" tickFormatter={(x) => monthLabel(x, "en", true)} tickLine={false} axisLine={false} fontSize={11} minTickGap={24} />
                <YAxis tickFormatter={(x) => compact(x, "en")} tickLine={false} axisLine={false} fontSize={12} width={56} />
                <Tooltip content={<ChartTooltip labelFormatter={(l) => monthLabel(l, lang)} />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area dataKey="cash" name={t("cash")} stroke={COLORS.purple} fill={COLORS.purple} fillOpacity={0.12} strokeWidth={2} />
                <Line dataKey="loan" name={ar ? "رصيد القرض" : "Loan balance"} stroke={COLORS.orange} strokeWidth={2.5} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title={t("use_of_funds")} subtitle={ar ? `إجمالي ${big(funds.funded)} حتى ${monthLabel(funds.until, lang)}` : `Total ${big(funds.funded)} until ${monthLabel(funds.until, lang)}`} delay={80}>
          <table className="w-full text-[13.5px]">
            <tbody>
              {funds.rows.map((x) => (
                <tr key={x.key} className="border-b border-[#f0f2f7]">
                  <td className="py-2 text-ink-700">{fundLabels[x.key][ar ? 0 : 1]}</td>
                  <td className="ltr-content py-2 text-end font-semibold">{money(x.value)}</td>
                  <td className="ltr-content w-16 py-2 text-end text-ink-600">{pct(funds.funded ? x.value / funds.funded : null, 0)}</td>
                </tr>
              ))}
              <tr className="font-bold"><td className="py-2">{t("total")}</td><td className="ltr-content py-2 text-end">{money(funds.rows.reduce((s, x) => s + x.value, 0))}</td><td className="ltr-content py-2 text-end">100%</td></tr>
            </tbody>
          </table>
        </Panel>
      </div>
      <Panel title={ar ? "خدمة الدين سنويًا" : "Debt service by year"}>
        <div className="thin-scrollbar overflow-x-auto">
          <table className="w-full min-w-[620px] text-[13px]">
            <thead><tr className="border-b border-[#e1e7ef] text-ink-600">
              <th className="px-2 py-2 text-start" />{r.years.map((y) => <th key={y.year} className="px-2 py-2 text-end font-semibold">{t("y")}{y.year}</th>)}
            </tr></thead>
            <tbody>
              {([
                [ar ? "EBITDA" : "EBITDA", (y: typeof r.years[0]) => money(y.ebitda)],
                [ar ? "أرباح القرض" : "Loan profit", (y: typeof r.years[0]) => money(-y.interest)],
                [ar ? "سداد الأصل" : "Principal", (y: typeof r.years[0]) => money(-y.loan_principal)],
                [ar ? "رصيد القرض آخر السنة" : "Loan balance (year end)", (y: typeof r.years[0]) => money(y.loan_balance)],
                [ar ? "تغطية خدمة الدين (DSCR)" : "Debt service coverage (DSCR)", (y: typeof r.years[0]) => (y.dscr === null ? "—" : `${y.dscr.toFixed(2)}x`)],
              ] as const).map(([l, fn]) => (
                <tr key={l} className="border-b border-[#f0f2f7]"><td className="px-2 py-1.5 text-ink-700">{l}</td>{r.years.map((y) => <td key={y.year} className="ltr-content px-2 py-1.5 text-end">{fn(y)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title={ar ? "التقييم بالتدفقات المخصومة (DCF)" : "Discounted cash flow valuation (DCF)"}
          subtitle={ar ? `معدل خصم ${pct(v.discount_rate, 0)} — القيمة النهائية ${v.method === "gordon" ? "بالنمو الدائم" : "بمضاعف الإيرادات"}` : `${pct(v.discount_rate, 0)} discount rate — terminal value by ${v.method === "gordon" ? "perpetual growth" : "revenue multiple"}`}>
          <table className="w-full text-[13.5px]">
            <tbody>
              {v.fcf.map((x, i) => (
                <tr key={i} className="border-b border-[#f0f2f7]"><td className="py-1.5 text-ink-700">{ar ? `التدفق الحر ${t("y")}${i + 1}` : `Free cash flow Y${i + 1}`}</td><td className="ltr-content py-1.5 text-end">{money(x)}</td></tr>
              ))}
              <tr className="border-b border-[#f0f2f7]"><td className="py-1.5 text-ink-700">{ar ? "القيمة الحالية للتدفقات" : "PV of cash flows"}</td><td className="ltr-content py-1.5 text-end font-semibold">{money(v.pv_fcf)}</td></tr>
              <tr className="border-b border-[#f0f2f7]"><td className="py-1.5 text-ink-700">{ar ? "القيمة النهائية (السنة 5)" : "Terminal value (year 5)"}</td><td className="ltr-content py-1.5 text-end">{money(v.terminal_value)}</td></tr>
              <tr className="border-b border-[#f0f2f7]"><td className="py-1.5 text-ink-700">{ar ? "قيمتها الحالية" : "Its present value"}</td><td className="ltr-content py-1.5 text-end font-semibold">{money(v.pv_terminal)}</td></tr>
              <tr className="font-bold"><td className="py-2">{t("ev")}</td><td className="ltr-content py-2 text-end text-brand-700">{money(v.enterprise_value)}</td></tr>
            </tbody>
          </table>
        </Panel>
        <Panel title={ar ? "عائد الملاك" : "Owners' return"} delay={80}>
          <div className="grid grid-cols-2 gap-3">
            {[
              [ar ? "رأس المال المستثمر" : "Capital invested", big(k.owner_invested)],
              [ar ? "قيمة حقوق الملكية في السنة 5" : "Equity value at year 5", big(k.exit_equity_value)],
              [ar ? "مضاعف رأس المال (MOIC)" : "Multiple on capital (MOIC)", k.owner_moic === null ? "—" : `${k.owner_moic.toFixed(1)}x`],
              [ar ? "العائد الداخلي السنوي (IRR)" : "Annual IRR", pct(k.owner_irr, 0)],
            ].map(([l, val]) => (
              <div key={l} className="rounded-lg bg-[#f8f9fc] p-3"><p className="text-[12px] text-ink-600">{l}</p><p className="ltr-content mt-1 text-right text-[18px] font-bold text-ink-900">{val}</p></div>
            ))}
          </div>
          <p className="mt-3 text-[12.5px] leading-6 text-ink-600">
            {ar
              ? "قيمة حقوق الملكية = القيمة النهائية − رصيد القرض + الكاش في نهاية السنة الخامسة. العائد محسوب من تواريخ دفعات تمويل الملاك الفعلية المسجلة في المالية. لأن المبلغ المستثمر حتى الآن صغير مقارنة بقيمة المنشأة، المضاعف كبير؛ المستثمر الجديد يتقيّم على «قيمة المنشأة اليوم»."
              : "Equity value = terminal value − loan balance + cash at the end of year 5. Returns use the actual dates of owner funding recorded in Finance. Because little has been invested so far relative to the business value, the multiple is high; a new investor would price off today's enterprise value."}
          </p>
        </Panel>
      </div>
      <ChapterNav id="funding" />
    </div>
  );
}
