/**
 * Chapter 3 — Unit economics, for a board reader: the profit of one paid
 * subscription, the cost of winning one through free lectures, and what a
 * customer is worth over their renewals. Figures follow the engine exactly
 * (unitmath.ts) and every table adds up as printed.
 */
import clsx from "clsx";
import { useFM } from "../context";
import { COLORS, money, monthLabel, pct } from "../i18n";
import { CARD, Note } from "../components/ui";
import { Block, ChapterHeader, ChapterNav } from "../components/chapters";
import { freeLectureFunnel, r1, subscriptionMath } from "../components/unitmath";

export default function UnitEconomicsPage() {
  const { result: r, t, lang } = useFM();
  if (!r?.resolved_assumptions) return <p className="py-10 text-center text-ink-600">{t("loading")}</p>;
  const ar = lang === "ar";
  const ra = r.resolved_assumptions;
  const sar = t("sar");
  const core = ra.streams.find((s) => s.id === "core_b2c") ?? ra.streams[0];
  const b2b = ra.streams.find((s) => s.enabled && s.category === "b2b");
  const ksa = ra.markets.find((m) => m.id === (core.market ?? "ksa")) ?? ra.markets[0];
  const sub = subscriptionMath(core, r);
  const now = freeLectureFunnel(ksa, false);
  const tgt = freeLectureFunnel(ksa, true);
  const vatMonth = r.kpis.vat_registration_month;

  // whole riyals so that each column adds up exactly as printed
  const W = (v: number) => Math.round(v);
  const col = (c: typeof sub.before) => {
    const list = W(sub.list), disc = W(sub.discount), paid = list - disc;
    const vat = W(c.vat), net = paid - vat, teacher = W(sub.teacher), comm = W(sub.commission), gw = W(sub.gateway);
    return { list, disc, paid, vat, net, teacher, comm, gw, profit: net - teacher - comm - gw };
  };
  const B = col(sub.before), A = col(sub.after);
  const rows: { label: string; b: number; a: number; kind?: "sub" | "total" | "neg" }[] = [
    { label: ar ? "سعر الباقة (شامل الضريبة)" : "Package price (VAT-inclusive)", b: B.list, a: A.list },
    { label: ar ? `الخصم (بحد أقصى ${pct(core.avg_discount, 0)})` : `Discount (maximum ${pct(core.avg_discount, 0)})`, b: -B.disc, a: -A.disc, kind: "neg" },
    { label: ar ? "المبلغ المدفوع" : "Amount paid", b: B.paid, a: A.paid, kind: "sub" },
    { label: ar ? `ضريبة القيمة المضافة ${pct(ra.tax.vat_rate, 0)}` : `VAT ${pct(ra.tax.vat_rate, 0)}`, b: -B.vat, a: -A.vat, kind: "neg" },
    { label: ar ? "إيراد الاشتراك" : "Subscription revenue", b: B.net, a: A.net, kind: "sub" },
    { label: ar ? `أجر المعلم (${core.lessons} محاضرة × ${money(core.teacher_cost_per_lesson)})` : `Teacher (${core.lessons} lectures × ${money(core.teacher_cost_per_lesson)})`, b: -B.teacher, a: -A.teacher, kind: "neg" },
    { label: ar ? "عمولة المبيعات" : "Sales commission", b: -B.comm, a: -A.comm, kind: "neg" },
    { label: ar ? `رسوم الدفع الإلكتروني (${pct(ra.payments.gateway_fee_pct, 1)} + ${money(ra.payments.gateway_fee_fixed)})` : `Payment fees (${pct(ra.payments.gateway_fee_pct, 1)} + ${money(ra.payments.gateway_fee_fixed)})`, b: -B.gw, a: -A.gw, kind: "neg" },
    { label: ar ? "ربح الاشتراك الواحد" : "Profit per subscription", b: B.profit, a: A.profit, kind: "total" },
  ];
  const bar = [
    { k: "teacher", v: A.teacher, c: COLORS.orange, l: ar ? "المعلم" : "Teacher" },
    { k: "comm", v: A.comm, c: COLORS.orangeSoft, l: ar ? "العمولة" : "Commission" },
    { k: "gw", v: A.gw, c: COLORS.slate, l: ar ? "رسوم الدفع" : "Payment fees" },
    { k: "vat", v: A.vat, c: "#c9cee0", l: ar ? "الضريبة" : "VAT" },
    { k: "ours", v: A.profit, c: COLORS.purple, l: ar ? "ربح الشركة" : "Company profit" },
  ];

  const acqRows: { label: string; n: (x: typeof now) => string; kind?: "cost" | "total" | "strong" }[] = [
    { label: ar ? "محاضرات مجانية محجوزة" : "Free lectures booked", n: (x) => money(x.lectures) },
    { label: ar ? "العملاء المحتملون اللازمون لها" : "Leads needed for them", n: (x) => money(x.leads, { decimals: 1 }) },
    { label: ar ? "منهم من الإعلانات الممولة" : "of which from paid ads", n: (x) => money(x.paidLeads, { decimals: 1 }) },
    { label: ar ? `تكلفة الإعلانات (× ${money(ksa.cpl, { decimals: 2 })} ${sar})` : `Ad cost (× ${sar} ${money(ksa.cpl, { decimals: 2 })})`, n: (x) => money(x.adCost), kind: "cost" },
    { label: ar ? `أجر المعلمين للمحاضرات المجانية (× ${money(ksa.trial_cost)} ${sar})` : `Teacher fees for free lectures (× ${sar} ${money(ksa.trial_cost)})`, n: (x) => money(x.lectureCost), kind: "cost" },
    { label: ar ? "حضروا المحاضرة" : "Attended", n: (x) => money(x.attended, { decimals: 1 }) },
    { label: ar ? "اشتركوا" : "Subscribed", n: (x) => money(x.subs, { decimals: 2 }) },
    { label: ar ? "إجمالي التكلفة" : "Total cost", n: (x) => money(x.total), kind: "total" },
    { label: ar ? "تكلفة الحصول على مشترك (الإجمالي ÷ المشتركين)" : "Cost per new subscriber (total ÷ subscribers)", n: (x) => money(x.perSub), kind: "strong" },
  ];

  // customer value over renewals (profit per package x expected packages)
  const purchases = (rr: number) => (rr < 1 ? 1 / (1 - rr) : 1);
  const pkNow = r1(purchases(core.renewal_rate)), pkTgt = r1(purchases(core.renewal_rate_target));
  const valueNow = Math.round(A.profit * pkNow);
  const valueTgt = Math.round(A.profit * pkTgt);
  const cacNow = now.perSub !== null ? Math.round(now.perSub) : null;
  const cacTgt = tgt.perSub !== null ? Math.round(tgt.perSub) : null;

  const b2bMath = b2b ? subscriptionMath(b2b, r) : null;

  return (
    <div className="space-y-10">
      <ChapterHeader id="unit-economics" />

      <Block n="3.1" title={ar ? "ربح الاشتراك الفردي الواحد" : "Profit of one individual subscription"}
        lede={ar
          ? `باقة واحدة من الاشتراك الأساسي. يتضمن العمود الثاني أثر التسجيل في ضريبة القيمة المضافة${vatMonth ? ` المتوقع في ${monthLabel(vatMonth, lang)}` : ""}، إذ تبقى الأسعار ثابتة وتُخصم الضريبة من إيراد الشركة.`
          : `One core package. The second column shows the effect of VAT registration${vatMonth ? ` (expected ${monthLabel(vatMonth, lang)})` : ""}: prices stay the same, so VAT comes out of company revenue.`}>
        <div className="grid gap-4 xl:grid-cols-5">
          <div className={clsx(CARD, "overflow-hidden xl:col-span-3 print:shadow-none")}>
            <table className="w-full text-[13px] sm:text-[14px] [&_td]:px-2.5 [&_th]:px-2.5 sm:[&_td]:px-4 sm:[&_th]:px-4">
              <thead>
                <tr className="border-b border-[#e1e7ef] bg-[#f8f9fc] text-[12.5px] text-ink-600">
                  <th className="py-2.5 text-start font-semibold">{ar ? "بالريال" : "SAR"}</th>
                  <th className="py-2.5 text-end font-semibold">{ar ? "قبل التسجيل الضريبي" : "Before VAT registration"}</th>
                  <th className="py-2.5 text-end font-semibold">{ar ? "بعد التسجيل الضريبي" : "After VAT registration"}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((x) => (
                  <tr key={x.label} className={clsx("border-b border-[#f0f2f7] last:border-0", x.kind === "total" && "bg-brand-50/60")}>
                    <td className={clsx("py-2.5", x.kind === "neg" ? "ps-6 text-ink-600" : "font-semibold text-ink-900", x.kind === "total" && "font-bold")}>{x.label}</td>
                    {[x.b, x.a].map((v, j) => (
                      <td key={j} className={clsx("ltr-content py-2.5 text-end tabular-nums", v < 0 ? "text-[#a02a24]" : "text-ink-900", (x.kind === "sub" || x.kind === "total") && "font-bold", x.kind === "total" && "text-brand-700")}>{money(v)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={clsx(CARD, "flex flex-col p-4 xl:col-span-2 print:shadow-none")}>
            <p className="text-[14px] font-bold text-ink-900">{ar ? `توزيع المبلغ المدفوع (${money(A.paid)} ${sar})` : `How the ${sar} ${money(A.paid)} paid is split`}</p>
            <p className="text-[12.5px] text-ink-600">{ar ? "بعد التسجيل الضريبي" : "After VAT registration"}</p>
            <div className="mt-4 flex h-9 overflow-hidden rounded-lg" dir="ltr">
              {bar.map((b) => <div key={b.k} title={`${b.l}: ${money(b.v)}`} style={{ width: `${(b.v / A.paid) * 100}%`, backgroundColor: b.c }} />)}
            </div>
            <ul className="mt-4 space-y-2 text-[13.5px]">
              {bar.slice().reverse().map((b) => (
                <li key={b.k} className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: b.c }} />
                  <span className="text-ink-700">{b.l}</span>
                  <span className="ltr-content ms-auto font-semibold tabular-nums text-ink-900">{money(b.v)}</span>
                  <span className="ltr-content w-11 text-end text-[12.5px] text-ink-500">{pct(b.v / A.paid, 0)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-auto pt-4 text-[13px] leading-6 text-ink-600">
              {ar ? "يغطي ربح الاشتراكات تكلفة التسويق والمحاضرات المجانية ورواتب الفريق والمصروفات الثابتة (الفصل 05)." : "Subscription profit covers marketing, free lectures, the team and fixed costs (chapter 05)."}
            </p>
          </div>
        </div>
      </Block>

      <Block n="3.2" title={ar ? "تكلفة الحصول على مشترك جديد" : "Cost of winning a new subscriber"}
        lede={ar ? "لكل 100 محاضرة مجانية محجوزة في المملكة: الوضع الحالي مقارنة بالمستهدف بعد تحسين المتابعة والبيع." : "Per 100 free lectures booked in Saudi Arabia: today versus the target once follow-up and selling improve."}>
        <div className="grid gap-4 xl:grid-cols-5">
          <div className={clsx(CARD, "overflow-hidden xl:col-span-3 print:shadow-none")}>
            <table className="w-full text-[13px] sm:text-[14px] [&_td]:px-2.5 [&_th]:px-2.5 sm:[&_td]:px-4 sm:[&_th]:px-4">
              <thead>
                <tr className="border-b border-[#e1e7ef] bg-[#f8f9fc] text-[12.5px] text-ink-600">
                  <th className="py-2.5 text-start font-semibold">{ar ? "المبالغ بالريال" : "SAR"}</th>
                  <th className="py-2.5 text-end font-semibold">{ar ? "حاليًا" : "Today"}</th>
                  <th className="py-2.5 text-end font-semibold">{ar ? `المستهدف بعد ${ksa.ramp_months} شهرًا` : `Target after ${ksa.ramp_months} months`}</th>
                </tr>
              </thead>
              <tbody>
                {acqRows.map((x) => (
                  <tr key={x.label} className={clsx("border-b border-[#f0f2f7] last:border-0", x.kind === "strong" && "bg-brand-50/60")}>
                    <td className={clsx("py-2.5", x.kind === "cost" ? "ps-6 text-ink-600" : x.kind ? "font-bold text-ink-900" : "text-ink-800")}>{x.label}</td>
                    <td className={clsx("ltr-content py-2.5 text-end tabular-nums", x.kind === "cost" ? "text-[#a02a24]" : x.kind ? "font-bold text-ink-900" : "text-ink-800")}>{x.n(now)}</td>
                    <td className={clsx("ltr-content py-2.5 text-end tabular-nums", x.kind === "cost" ? "text-[#a02a24]" : x.kind === "strong" ? "font-bold text-brand-700" : x.kind ? "font-bold text-ink-900" : "text-ink-800")}>{x.n(tgt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-3 xl:col-span-2">
            <Note tone="warn">
              {ar
                ? `حاليًا تبلغ تكلفة الحصول على المشترك ${money(now.perSub)} ${sar}، وهي أعلى من ربح الاشتراك الأول (${money(B.profit)} ${sar}). لذلك تعتمد الخطة على ثلاثة محركات: رفع نسبة التحويل من المحاضرة المجانية، ورفع نسبة التجديد، والاشتراكات المؤسسية التي لا تحتاج إلى إنفاق إعلاني.`
                : `Today a new subscriber costs ${sar} ${money(now.perSub)}, more than the profit of a first package (${sar} ${money(B.profit)}). The plan therefore rests on three levers: higher conversion from free lectures, higher renewals, and institutional subscriptions that need no ad spend.`}
            </Note>
            <Note>
              {ar
                ? `في المستهدف تنخفض التكلفة إلى ${money(tgt.perSub)} ${sar} لكل مشترك، لأن نسبة التحويل ترتفع من ${pct(now.conversion, 1)} إلى ${pct(tgt.conversion, 1)} من المحاضرات المجانية.`
                : `At target the cost falls to ${sar} ${money(tgt.perSub)} per subscriber as conversion rises from ${pct(now.conversion, 1)} to ${pct(tgt.conversion, 1)} of free lectures.`}
            </Note>
          </div>
        </div>
      </Block>

      <Block n="3.3" title={ar ? "قيمة العميل على مدى اشتراكاته" : "Customer value over renewals"}
        lede={ar ? "العميل الذي يجدد اشتراكه يحقق ربحًا متكررًا دون تكلفة اكتساب جديدة؛ لذا تُقارَن قيمته الإجمالية بتكلفة الحصول عليه." : "A customer who renews earns repeat profit with no new acquisition cost, so their total value is compared with what it cost to win them."}>
        <div className={clsx(CARD, "overflow-hidden print:shadow-none")}>
          <table className="w-full text-[13px] sm:text-[14px] [&_td]:px-2.5 [&_th]:px-2.5 sm:[&_td]:px-4 sm:[&_th]:px-4">
            <thead>
              <tr className="border-b border-[#e1e7ef] bg-[#f8f9fc] text-[12.5px] text-ink-600">
                <th className="py-2.5 text-start font-semibold">{ar ? "المبالغ بالريال" : "SAR"}</th>
                <th className="py-2.5 text-end font-semibold">{ar ? "حاليًا" : "Today"}</th>
                <th className="py-2.5 text-end font-semibold">{ar ? "المستهدف" : "Target"}</th>
              </tr>
            </thead>
            <tbody>
              {([
                [ar ? "نسبة التجديد" : "Renewal rate", pct(core.renewal_rate, 0), pct(core.renewal_rate_target, 0)],
                [ar ? "متوسط عدد الباقات لكل عميل = 1 ÷ (1 − نسبة التجديد)" : "Packages per customer = 1 ÷ (1 − renewal)", String(pkNow), String(pkTgt)],
                [ar ? "ربح الباقة الواحدة (بعد الضريبة)" : "Profit per package (after VAT)", money(A.profit), money(A.profit)],
                [ar ? "قيمة العميل = الربح × عدد الباقات" : "Customer value = profit × packages", money(valueNow), money(valueTgt)],
                [ar ? "تكلفة الحصول على العميل" : "Cost to win the customer", money(cacNow), money(cacTgt)],
                [ar ? "مضاعف القيمة إلى التكلفة" : "Value ÷ cost", cacNow ? `${(valueNow / cacNow).toFixed(1)}x` : "—", cacTgt ? `${(valueTgt / cacTgt).toFixed(1)}x` : "—"],
              ] as const).map(([l, a, b], i, arr) => (
                <tr key={l} className={clsx("border-b border-[#f0f2f7] last:border-0", i === arr.length - 1 && "bg-brand-50/60")}>
                  <td className={clsx("py-2.5", i === arr.length - 1 ? "font-bold text-ink-900" : "text-ink-700")}>{l}</td>
                  <td className="ltr-content py-2.5 text-end font-semibold tabular-nums text-ink-900">{a}</td>
                  <td className={clsx("ltr-content py-2.5 text-end font-semibold tabular-nums", i === arr.length - 1 ? "text-brand-700" : "text-ink-900")}>{b}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[13px] leading-6 text-ink-600">
          {ar ? "يُعدّ المضاعف فوق 3 مرات مستوى صحيًا للنمو، وما دون مرة واحدة يعني أن العميل لا يسترد تكلفة الحصول عليه." : "Above 3x is healthy for growth; below 1x means a customer does not pay back their acquisition cost."}
        </p>
      </Block>

      {b2bMath && b2b && (
        <Block n="3.4" title={ar ? "الاشتراك المؤسسي (B2B)" : "Institutional subscription (B2B)"}
          lede={ar ? "تُقدَّم المحاضرات لمجموعات، فيتوزع أجر المعلم على عدة طلاب، ولا توجد تكلفة إعلانات أو محاضرات مجانية." : "Lectures are given to groups, so the teacher fee is shared by several students, with no ad or free-lecture cost."}>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              [ar ? "سعر الطالب بعد الخصم" : "Price per student after discount", `${money(b2bMath.paid)} ${sar}`, `${money(b2b.list_price)} − ${pct(b2b.avg_discount, 0)}`],
              [ar ? "أجر المعلم لكل طالب" : "Teacher fee per student", `${money(b2bMath.teacher)} ${sar}`, ar ? `${b2b.lessons} محاضرة × ${money(b2b.teacher_cost_per_lesson)} ÷ ${b2bMath.grp} طلاب` : `${b2b.lessons} lectures × ${money(b2b.teacher_cost_per_lesson)} ÷ ${b2bMath.grp} students`],
              [ar ? "ربح الطالب (بعد الضريبة)" : "Profit per student (after VAT)", `${money(b2bMath.after.profit)} ${sar}`, pct(b2bMath.after.margin, 0)],
              [ar ? "مدة السداد" : "Payment terms", ar ? `بعد ${b2b.payment_lag_months === 1 ? "شهر" : b2b.payment_lag_months === 2 ? "شهرين" : `${b2b.payment_lag_months} أشهر`} من الفوترة` : `${b2b.payment_lag_months} months after billing`, ar ? "حسب التعاقد" : "per contract"],
            ].map(([l, v, s]) => (
              <div key={l} className={clsx(CARD, "p-4 print:shadow-none")}>
                <p className="text-[13px] text-ink-600">{l}</p>
                <p className="ltr-content mt-1 text-right text-[20px] font-bold text-ink-900">{v}</p>
                <p className="ltr-content mt-0.5 text-right text-[12.5px] text-ink-500">{s}</p>
              </div>
            ))}
          </div>
        </Block>
      )}

      <ChapterNav id="unit-economics" />
    </div>
  );
}
