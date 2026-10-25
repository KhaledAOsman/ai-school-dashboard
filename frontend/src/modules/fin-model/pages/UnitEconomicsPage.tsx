import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useFM } from "../context";
import { COLORS, money, pct } from "../i18n";
import { ChartTooltip, Kpi, Note, Panel, useMoney } from "../components/ui";

export default function UnitEconomicsPage() {
  const { result: r, t, nm, lang } = useFM();
  const { full } = useMoney();
  const [sel, setSel] = useState<string>("core_b2c");
  if (!r) return <p className="py-10 text-center text-ink-600">{t("loading")}</p>;
  const ar = lang === "ar";
  const ue = r.unit_economics.find((u) => u.stream === sel) ?? r.unit_economics[0];
  const ra = r.resolved_assumptions;
  const ksa = ra?.markets.find((m) => m.id === "ksa");

  const vat = ue.price_paid - ue.price_net;
  const water = [
    { name: ar ? "سعر القائمة" : "List price", v: ue.price_list, c: COLORS.purpleSoft },
    { name: ar ? "الخصم" : "Discount", v: -(ue.price_list - ue.price_paid), c: COLORS.slate },
    { name: ar ? "الضريبة" : "VAT", v: -vat, c: COLORS.slate },
    { name: ar ? "أجر المعلم" : "Teacher", v: -ue.teacher_cost, c: COLORS.orange },
    { name: ar ? "العمولة" : "Commission", v: -ue.commission, c: COLORS.orangeSoft },
    { name: ar ? "بوابة الدفع" : "Gateway", v: -ue.gateway_fee, c: COLORS.orangeSoft },
    { name: ar ? "هامش المساهمة" : "Contribution", v: ue.contribution, c: COLORS.purple },
  ];
  // per 1,000 leads, today vs target
  const funnel = ksa ? [
    { k: ar ? "ليدز" : "Leads", now: 1000, tgt: 1000 },
    { k: ar ? "حجزوا تجربة" : "Booked a trial", now: 1000 * ksa.lead_to_trial, tgt: 1000 * ksa.lead_to_trial_target },
    { k: ar ? "حضروا" : "Attended", now: 1000 * ksa.lead_to_trial * ksa.show_rate, tgt: 1000 * ksa.lead_to_trial_target * ksa.show_rate_target },
    { k: ar ? "اشتركوا" : "Subscribed", now: 1000 * ksa.lead_to_trial * ksa.show_rate * ksa.trial_to_paid, tgt: 1000 * ksa.lead_to_trial_target * ksa.show_rate_target * ksa.trial_to_paid_target },
  ] : [];
  const cacNow = ksa ? (ksa.cpl * (1 - ksa.organic_share) + ksa.lead_to_trial * ksa.trial_cost) / (ksa.lead_to_trial * ksa.show_rate * ksa.trial_to_paid) : null;
  const core = r.unit_economics.find((u) => u.stream === "core_b2c");
  const cap = r.kpis.teacher_capacity_lessons;
  const perTeacherRev = core?.lesson_net_revenue ? core.lesson_net_revenue * cap : null;
  const perTeacherCost = (core?.teacher_cost_per_lesson ?? 15) * cap;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {r.unit_economics.map((u) => (
          <button key={u.stream} type="button" onClick={() => setSel(u.stream)}
            className={`rounded-full border px-3.5 py-1.5 text-[13px] font-semibold ${u.stream === ue.stream ? "border-brand-600 bg-brand-600 text-white" : "border-[#e1e7ef] bg-white text-ink-700 hover:bg-brand-50"}`}>
            {nm(u)}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={ar ? "هامش المساهمة لكل اشتراك" : "Contribution per enrolment"} value={full(ue.contribution)} sub={`${t("margin")}: ${pct(ue.contribution_margin, 0)}`} />
        <Kpi label={ar ? "قيمة العميل مدى الحياة (LTV)" : "Customer lifetime value (LTV)"} value={full(ue.ltv)} sub={ar ? `${ue.expected_purchases?.toFixed(2)} عملية شراء متوقعة (تجديد ${pct(ue.renewal_rate_target, 0)})` : `${ue.expected_purchases?.toFixed(2)} expected purchases (${pct(ue.renewal_rate_target, 0)} renewal)`} delay={60} />
        <Kpi label={ar ? "تكلفة اكتساب العميل (CAC)" : "Customer acquisition cost (CAC)"} value={ue.cac !== null ? full(ue.cac) : (ar ? "بدون إعلانات" : "No ad spend")} sub={ar ? "إعلانات + محاضرات تجريبية ÷ مشتركين جدد" : "Ads + trial lectures ÷ new subscribers"} delay={120} />
        <Kpi label="LTV / CAC" value={ue.ltv_cac !== null ? `${ue.ltv_cac.toFixed(2)}x` : "—"} tone={ue.ltv_cac === null ? "default" : ue.ltv_cac >= 3 ? "good" : ue.ltv_cac >= 1 ? "accent" : "bad"}
          sub={ue.payback_months !== null ? (ar ? `استرداد التكلفة خلال ${ue.payback_months.toFixed(1)} شهر` : `Payback in ${ue.payback_months.toFixed(1)} months`) : ""} delay={180} />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title={ar ? "من سعر الاشتراك إلى هامش المساهمة" : "From price to contribution"} subtitle={ar ? `لكل اشتراك واحد (${ue.vat_registered ? "بعد التسجيل الضريبي" : "قبل التسجيل الضريبي"})` : `Per enrolment (${ue.vat_registered ? "after VAT registration" : "before VAT registration"})`}>
          <div className="h-[300px]" dir="ltr">
            <ResponsiveContainer>
              <BarChart data={water} margin={{ top: 20, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={COLORS.grid} />
                <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={11} interval={0} />
                <YAxis tickLine={false} axisLine={false} fontSize={12} width={48} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "#f4f1ff" }} />
                <Bar dataKey="v" name={t("sar")} radius={[4, 4, 0, 0]}>
                  {water.map((w) => <Cell key={w.name} fill={w.c} />)}
                  <LabelList dataKey="v" position="top" fontSize={11} formatter={(v: number) => money(v)} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        {ksa && (
          <Panel title={ar ? "قمع المبيعات لكل 1,000 ليد (السعودية)" : "Sales funnel per 1,000 leads (KSA)"} subtitle={ar ? `الآن مقابل المستهدف بعد ${ksa.ramp_months} شهر` : `Today vs target after ${ksa.ramp_months} months`} delay={80}>
            <div className="space-y-3">
              {funnel.map((f) => (
                <div key={f.k}>
                  <div className="flex justify-between text-[13px]"><span className="font-semibold text-ink-800">{f.k}</span>
                    <span className="ltr-content text-ink-700">{Math.round(f.now)} → <b className="text-brand-700">{Math.round(f.tgt)}</b></span></div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-ink-100"><div className="h-full rounded-full bg-[#bea3ff]" style={{ width: `${(f.now / 1000) * 100}%` }} /></div>
                  <div className="mt-0.5 h-2 overflow-hidden rounded-full bg-ink-100"><div className="h-full rounded-full bg-brand-600" style={{ width: `${(f.tgt / 1000) * 100}%` }} /></div>
                </div>
              ))}
            </div>
            <p className="mt-4 text-[13px] leading-6 text-ink-700">
              {ar
                ? `تكلفة الليد ${money(ksa.cpl)} ر.س، و${pct(ksa.organic_share, 0)} من الليدز مجانية (زيارات مباشرة). تكلفة اكتساب المشترك اليوم ≈ ${money(cacNow)} ر.س، وتنزل مع تحسن التحويل لـ ${money(r.unit_economics.find((u) => u.stream === "core_b2c")?.cac)} ر.س.`
                : `Cost per lead SAR ${money(ksa.cpl)}; ${pct(ksa.organic_share, 0)} of leads are free (direct visits). CAC today ≈ SAR ${money(cacNow)}, falling to SAR ${money(r.unit_economics.find((u) => u.stream === "core_b2c")?.cac)} as conversion improves.`}
            </p>
          </Panel>
        )}
      </div>
      <Panel title={ar ? "اقتصاديات المعلم الواحد (طاقة كاملة)" : "One teacher at full capacity"}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            [ar ? "حصص في الشهر" : "Lessons / month", money(cap)],
            [ar ? "إيراد الحصص (اشتراك أساسي)" : "Lesson revenue (core plan)", full(perTeacherRev)],
            [ar ? "أجر المعلم" : "Teacher pay", full(perTeacherCost)],
            [ar ? "مساهمة المعلم شهريًا" : "Contribution per teacher / month", full(perTeacherRev !== null ? perTeacherRev - perTeacherCost : null)],
          ].map(([l, v]) => (
            <div key={l} className="rounded-lg bg-[#f8f9fc] p-3"><p className="text-[12px] text-ink-600">{l}</p><p className="ltr-content mt-1 text-right text-[17px] font-bold text-ink-900">{v}</p></div>
          ))}
        </div>
      </Panel>
      <Panel title={ar ? "كل مصادر الإيراد" : "All revenue streams"}>
        <div className="thin-scrollbar overflow-x-auto">
          <table className="w-full min-w-[900px] text-[13px]">
            <thead><tr className="border-b border-[#e1e7ef] text-ink-600">
              {(ar ? ["المصدر", "السعر", "الخصم", "الصافي", "أجر المعلم", "المساهمة", "الهامش", "LTV", "CAC", "LTV/CAC"] : ["Stream", "Price", "Discount", "Net", "Teacher", "Contribution", "Margin", "LTV", "CAC", "LTV/CAC"]).map((h) => <th key={h} className="px-2 py-2 text-start font-semibold">{h}</th>)}
            </tr></thead>
            <tbody>
              {r.unit_economics.map((u) => (
                <tr key={u.stream} className="border-b border-[#f0f2f7]">
                  <td className="px-2 py-2 font-semibold text-ink-900">{nm(u)}</td>
                  <td className="ltr-content px-2 py-2">{money(u.price_list)}</td>
                  <td className="ltr-content px-2 py-2">{pct(u.discount, 0)}</td>
                  <td className="ltr-content px-2 py-2">{money(u.price_net)}</td>
                  <td className="ltr-content px-2 py-2">{money(u.teacher_cost)}</td>
                  <td className="ltr-content px-2 py-2 font-semibold">{money(u.contribution)}</td>
                  <td className="ltr-content px-2 py-2">{pct(u.contribution_margin, 0)}</td>
                  <td className="ltr-content px-2 py-2">{money(u.ltv)}</td>
                  <td className="ltr-content px-2 py-2">{u.cac === null ? "—" : money(u.cac)}</td>
                  <td className="ltr-content px-2 py-2">{u.ltv_cac === null ? "—" : `${u.ltv_cac.toFixed(2)}x`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <Note>{ar ? "LTV/CAC فوق 3x صحي، وبين 1x و3x مقبول في مرحلة النمو بشرط تحسن التجديد. المصادر بدون إعلانات (المدارس والبرامج) تكلفتها في فريق المبيعات وإطلاق المنتج." : "LTV/CAC above 3x is healthy; 1x–3x is acceptable while growing if renewals improve. Streams without ad spend (schools, programs) carry their cost in the sales team and launch budget."}</Note>
    </div>
  );
}
