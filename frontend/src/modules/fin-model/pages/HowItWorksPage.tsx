/**
 * Chapter 2 — how the business makes money, explained for a reader with no
 * finance background: the student's journey, where one subscription's money
 * goes, what it costs to win a student, and how teaching capacity scales.
 * Every figure comes from the resolved assumptions / model result, so the
 * page always matches the statements.
 */
import clsx from "clsx";
import { CreditCard, Gift, Megaphone, MonitorPlay, RefreshCw, Users } from "lucide-react";
import { Reveal } from "@/components/motion";
import { useFM } from "../context";
import { COLORS, money, monthLabel, pct } from "../i18n";
import { CARD, Note } from "../components/ui";
import { Block, ChapterHeader, ChapterNav } from "../components/chapters";
import type { Market, ModelResult, Stream } from "../api";

const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;

/** One subscription of a stream, before and after VAT registration. Matches engine._unit_economics. */
export function subscriptionMath(s: Stream, r: ModelResult) {
  const ra = r.resolved_assumptions!;
  const vatRate = ra.tax.vat_rate;
  const paid = s.list_price * (1 - s.avg_discount);
  const grp = Math.max(s.group_size || 1, 1);
  const teacher = (s.lessons / grp) * s.teacher_cost_per_lesson;
  const gateway = s.uses_gateway ? paid * ra.payments.gateway_fee_pct + ra.payments.gateway_fee_fixed : 0;
  const commission = s.commission_per_enrolment;
  const col = (registered: boolean) => {
    const vat = registered ? paid - paid / (1 + vatRate) : 0;
    const net = paid - vat;
    const contribution = net - teacher - commission - gateway;
    return { vat, net, contribution, margin: net ? contribution / net : 0 };
  };
  return { list: s.list_price, discount: s.list_price - paid, paid, teacher, commission, gateway, grp, before: col(false), after: col(true) };
}

/**
 * Cost of winning one paying student through ads + free trials, per 100 leads.
 * Every step is rounded the way it is displayed and the next step is computed
 * from the rounded value, so the table adds up exactly as printed.
 */
export function acquisition(mk: Market, target: boolean) {
  const organic = target ? mk.organic_share_target : mk.organic_share;
  const l2t = target ? mk.lead_to_trial_target : mk.lead_to_trial;
  const show = target ? mk.show_rate_target : mk.show_rate;
  const t2p = target ? mk.trial_to_paid_target : mk.trial_to_paid;
  const cpl = r2(mk.cpl);
  const leads = 100;
  const paidLeads = r1(leads * (1 - organic));
  const adCost = Math.round(paidLeads * cpl);
  const trials = r1(leads * l2t);
  const trialCost = Math.round(trials * mk.trial_cost);
  const attended = r1(trials * show);
  const subs = r2(attended * t2p);
  const total = adCost + trialCost;
  return { cpl, leads, paidLeads, adCost, trials, trialCost, attended, subs, total, perSub: subs ? total / subs : null, leadsPerSub: subs ? leads / subs : null };
}

const STREAM_INFO: Record<string, [string, string]> = {
  core_b2c: ["حصص برمجة وذكاء اصطناعي فردية للأطفال، يحجزها ولي الأمر أونلاين.", "One-to-one coding & AI lessons for children, booked online by parents."],
  curriculum: ["كورسات تشرح مادة الحاسب في المنهج السعودي لمجموعات صغيرة.", "Courses on the Saudi computer-science curriculum for small groups."],
  schools: ["باقات للمدارس والشركات والشراكات بخصم 50%، والفصل كله في حصة جماعية.", "Packages for schools, companies and partners at 50% off; a whole class in one group lesson."],
  nsma: ["برنامج تجهيز الطلاب لأولمبياد البرمجة (NSMA) في السعودية.", "Preparation programme for the Saudi programming olympiad (NSMA)."],
  gcc_b2c: ["نفس الاشتراك الأساسي لأسر دول الخليج.", "The core plan for families across the GCC."],
  summer_camp: ["معسكرات صيفية مكثفة من يونيو لأغسطس.", "Intensive summer camps from June to August."],
  platform_license: ["ترخيص المنصة والمحتوى لجهات تعليمية.", "Licensing the platform and content to education providers."],
};

export default function HowItWorksPage() {
  const { result: r, t, nm, lang } = useFM();
  if (!r?.resolved_assumptions) return <p className="py-10 text-center text-ink-600">{t("loading")}</p>;
  const ar = lang === "ar";
  const ra = r.resolved_assumptions;
  const core = ra.streams.find((s) => s.id === "core_b2c") ?? ra.streams[0];
  const ksa = ra.markets.find((m) => m.id === (core.market ?? "ksa")) ?? ra.markets[0];
  const sub = subscriptionMath(core, r);
  const now = acquisition(ksa, false);
  const tgt = acquisition(ksa, true);
  const k = r.kpis;
  const weeks = core.lessons / (core.lessons_per_week || 1);
  const vatMonth = k.vat_registration_month;
  const sar = t("sar");

  // ---------------------------------------------------------------- journey
  const steps = [
    {
      icon: Megaphone, title: ar ? "إعلان ← عميل محتمل" : "Ad → lead",
      body: ar ? "بنعلن على سناب شات وتيك توك وميتا، وولي الأمر يسيب بياناته علشان نكلمه." : "We advertise on Snapchat, TikTok and Meta; a parent leaves their details for a call.",
      facts: ar
        ? [`تكلفة العميل المحتمل ${money(ksa.cpl, { decimals: 2 })} ${sar}`, `${pct(ksa.organic_share, 0)} بييجوا من غير إعلان (معارف وزيارات مباشرة)`]
        : [`Cost per lead ${sar} ${money(ksa.cpl, { decimals: 2 })}`, `${pct(ksa.organic_share, 0)} arrive without ads (referrals, direct visits)`],
    },
    {
      icon: Gift, title: ar ? "حصة تجريبية مجانية" : "Free trial lesson",
      body: ar ? "ولي الأمر ما بيدفعش حاجة. الطفل بياخد حصة فردية مع معلم علشان يجرّب قبل ما يشترك." : "The parent pays nothing. The child takes a one-to-one lesson to try us before subscribing.",
      facts: ar
        ? [`${pct(ksa.lead_to_trial, 0)} من العملاء يحجزوا، و${pct(ksa.show_rate, 0)} منهم يحضروا`, `بندفع للمعلم ${money(ksa.trial_cost)} ${sar} عن كل حصة محجوزة، حتى لو الطفل غاب`]
        : [`${pct(ksa.lead_to_trial, 0)} of leads book, ${pct(ksa.show_rate, 0)} of them attend`, `We pay the teacher ${sar} ${money(ksa.trial_cost)} per booked trial, even on a no-show`],
    },
    {
      icon: CreditCard, title: ar ? `اشتراك ${core.lessons} حصة` : `${core.lessons}-lesson subscription`,
      body: ar
        ? `السعر ${money(core.list_price)} ${sar} شامل الضريبة، ومتوسط الخصم ${pct(core.avg_discount, 0)}، فولي الأمر بيدفع في المتوسط ${money(sub.paid)} ${sar} مقدمًا.`
        : `Price ${sar} ${money(core.list_price)} incl. VAT; with a ${pct(core.avg_discount, 0)} average discount the parent pays ${sar} ${money(sub.paid)} upfront.`,
      facts: ar
        ? [`${pct(ksa.trial_to_paid, 1)} من اللي حضروا بيشتركوا اليوم، والمستهدف ${pct(ksa.trial_to_paid_target, 0)}`, `عمولة مبيعات ${money(core.commission_per_enrolment)} ${sar} على كل اشتراك`]
        : [`${pct(ksa.trial_to_paid, 1)} of attendees subscribe today; target ${pct(ksa.trial_to_paid_target, 0)}`, `${sar} ${money(core.commission_per_enrolment)} sales commission per subscription`],
    },
    {
      icon: MonitorPlay, title: ar ? "الحصص أونلاين" : "Lessons online",
      body: ar
        ? `المعلم بيقدّم ${core.lessons_per_week} حصة في الأسبوع، فالاشتراك بيخلص في حوالي ${Math.round(weeks)} أسابيع (شهر لشهرين).`
        : `The teacher gives ${core.lessons_per_week} lessons a week, so a plan runs about ${Math.round(weeks)} weeks (1–2 months).`,
      facts: ar
        ? [`أجر المعلم ${money(core.teacher_cost_per_lesson)} ${sar} للحصة = ${money(sub.teacher)} ${sar} للاشتراك`, "الإيراد بيتسجل مع كل حصة بتتقدم، مش يوم الدفع"]
        : [`Teacher pay ${sar} ${money(core.teacher_cost_per_lesson)} per lesson = ${sar} ${money(sub.teacher)} per plan`, "Revenue is booked as each lesson is taught, not on payment day"],
    },
    {
      icon: RefreshCw, title: ar ? "التجديد للمستوى التالي" : "Renewal to the next level",
      body: ar ? "لما الطفل يخلص المستوى، بيكمّل المستوى اللي بعده باشتراك جديد من غير إعلان ولا حصة تجريبية." : "When a level ends the child continues to the next one with a new plan, with no ad or trial cost.",
      facts: ar
        ? [`التجديد اليوم ${pct(core.renewal_rate, 0)}`, `المستهدف ${pct(core.renewal_rate_target, 0)} خلال ${core.renewal_ramp_months} شهر بمنهج متدرج وشهادات`]
        : [`Renewal today ${pct(core.renewal_rate, 0)}`, `Target ${pct(core.renewal_rate_target, 0)} within ${core.renewal_ramp_months} months via levels and certificates`],
    },
  ];

  // ---------------------------------------------------------------- where the money goes
  const rows: { label: string; b: number; a: number; kind?: "sub" | "total" | "neg" }[] = [
    { label: ar ? "سعر الاشتراك (شامل الضريبة)" : "Plan price (VAT-inclusive)", b: sub.list, a: sub.list },
    { label: ar ? `متوسط الخصم (${pct(core.avg_discount, 0)})` : `Average discount (${pct(core.avg_discount, 0)})`, b: -sub.discount, a: -sub.discount, kind: "neg" },
    { label: ar ? "اللي بيدفعه ولي الأمر" : "What the parent pays", b: sub.paid, a: sub.paid, kind: "sub" },
    { label: ar ? `ضريبة القيمة المضافة ${pct(ra.tax.vat_rate, 0)} (للدولة)` : `VAT ${pct(ra.tax.vat_rate, 0)} (to the state)`, b: -sub.before.vat, a: -sub.after.vat, kind: "neg" },
    { label: ar ? "إيرادنا من الاشتراك" : "Our revenue", b: sub.before.net, a: sub.after.net, kind: "sub" },
    { label: ar ? `أجر المعلم (${core.lessons} حصة × ${money(core.teacher_cost_per_lesson)})` : `Teacher (${core.lessons} lessons × ${money(core.teacher_cost_per_lesson)})`, b: -sub.teacher, a: -sub.teacher, kind: "neg" },
    { label: ar ? "عمولة المبيعات" : "Sales commission", b: -sub.commission, a: -sub.commission, kind: "neg" },
    { label: ar ? `رسوم بوابة الدفع (${pct(ra.payments.gateway_fee_pct, 1)} + ${money(ra.payments.gateway_fee_fixed)})` : `Payment gateway (${pct(ra.payments.gateway_fee_pct, 1)} + ${money(ra.payments.gateway_fee_fixed)})`, b: -sub.gateway, a: -sub.gateway, kind: "neg" },
    { label: ar ? "اللي بيفضل لنا من الاشتراك" : "What we keep per plan", b: sub.before.contribution, a: sub.after.contribution, kind: "total" },
  ];
  const bar = [
    { k: "teacher", v: sub.teacher, c: COLORS.orange, l: ar ? "المعلم" : "Teacher" },
    { k: "comm", v: sub.commission, c: COLORS.orangeSoft, l: ar ? "العمولة" : "Commission" },
    { k: "gw", v: sub.gateway, c: COLORS.slate, l: ar ? "بوابة الدفع" : "Gateway" },
    { k: "vat", v: sub.after.vat, c: "#c9cee0", l: ar ? "الضريبة" : "VAT" },
    { k: "ours", v: sub.after.contribution, c: COLORS.purple, l: ar ? "لنا" : "Ours" },
  ];

  // ---------------------------------------------------------------- acquisition
  const n1 = (v: number) => money(v, { decimals: Number.isInteger(v) ? 0 : 1 });
  const acqRows: { label: string; n: (x: ReturnType<typeof acquisition>) => string; kind?: "cost" | "total" | "strong" }[] = [
    { label: ar ? "عملاء محتملين" : "Leads", n: (x) => money(x.leads) },
    { label: ar ? "منهم جايين من إعلانات مدفوعة" : "of which from paid ads", n: (x) => n1(x.paidLeads) },
    { label: ar ? `تكلفة الإعلانات (× ${money(ksa.cpl, { decimals: 2 })} ${sar} للعميل)` : `Ad cost (× ${sar} ${money(ksa.cpl, { decimals: 2 })} per lead)`, n: (x) => money(x.adCost), kind: "cost" },
    { label: ar ? "حجزوا حصة مجانية" : "Booked a free trial", n: (x) => n1(x.trials) },
    { label: ar ? `تكلفة الحصص المجانية (× ${money(ksa.trial_cost)} ${sar} للمعلم)` : `Free-trial cost (× ${sar} ${money(ksa.trial_cost)} teacher pay)`, n: (x) => money(x.trialCost), kind: "cost" },
    { label: ar ? "حضروا الحصة" : "Attended", n: (x) => n1(x.attended) },
    { label: ar ? "اشتركوا" : "Subscribed", n: (x) => money(x.subs, { decimals: 2 }) },
    { label: ar ? "إجمالي التكلفة" : "Total cost", n: (x) => money(x.total), kind: "total" },
    { label: ar ? "تكلفة جلب مشترك واحد (الإجمالي ÷ المشتركين)" : "Cost to win one subscriber (total ÷ subscribers)", n: (x) => money(x.perSub), kind: "strong" },
  ];

  // ---------------------------------------------------------------- capacity
  const cap = k.teacher_capacity_lessons;
  const lessonNet = sub.after.net / core.lessons;
  const perTeacherRev = cap * lessonNet;
  const perTeacherPay = cap * core.teacher_cost_per_lesson;
  const yearEnd = r.years.map((y) => {
    const m = r.months.find((x) => x.month === y.to)!;
    return { y: y.year, students: Math.round(y.active_students_end), lessons: Math.round(m.teacher_lessons), teachers: m.headcount.teachers, sup: m.headcount.supervisors, cs: m.headcount.cs_agents };
  });

  const streams = ra.streams.filter((s) => s.enabled);

  return (
    <div className="space-y-10">
      <ChapterHeader id="how-it-works" />

      <Block n="2.1" title={ar ? "رحلة الطالب في 5 خطوات" : "The student's journey in 5 steps"}
        lede={ar ? "ده المسار اللي كل عميل بيمشي فيه، والأرقام اللي جنب كل خطوة هي أرقام التشغيل الفعلية اللي الخطة مبنية عليها." : "Every customer follows this path; the figures beside each step are the actual operating numbers the plan is built on."}>
        <ol className="grid gap-3 lg:grid-cols-5">
          {steps.map((s, i) => (
            <Reveal key={s.title} delay={i * 70} className="h-full">
              <li className={clsx(CARD, "relative flex h-full flex-col p-4 print:shadow-none")}>
                <div className="flex items-center justify-between">
                  <span className="grid h-10 w-10 place-items-center rounded-full border border-brand-200 bg-white text-brand-600"><s.icon size={19} strokeWidth={1.8} /></span>
                  <span className="ltr-content text-[22px] font-bold text-ink-200">{String(i + 1).padStart(2, "0")}</span>
                </div>
                <h4 className="mt-3 text-[16px] font-bold leading-6 text-ink-900">{s.title}</h4>
                <p className="mt-1.5 text-[14px] leading-6 text-ink-700">{s.body}</p>
                <ul className="mt-auto space-y-1.5 border-t border-ink-100 pt-3 text-[13px] leading-5 text-ink-600">
                  {s.facts.map((f) => <li key={f} className="flex gap-1.5"><span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-accent-500" />{f}</li>)}
                </ul>
              </li>
            </Reveal>
          ))}
        </ol>
      </Block>

      <Block n="2.2" title={ar ? `إيه اللي بيحصل في الـ${money(core.list_price)} ريال؟` : `Where the ${sar} ${money(core.list_price)} goes`}
        lede={ar
          ? `اشتراك واحد من الباقة الأساسية. الشركة لسه مش مسجلة في ضريبة القيمة المضافة، والتسجيل إجباري لما المبيعات تعدّي ${money(ra.tax.vat_threshold)} ${sar} في 12 شهر${vatMonth ? ` (متوقع ${monthLabel(vatMonth, lang)})` : ""}. السعر هيفضل زي ما هو، فالضريبة بتطلع من نصيبنا.`
          : `One core-plan subscription. The company is not VAT-registered yet; registration is required once sales pass ${sar} ${money(ra.tax.vat_threshold)} in 12 months${vatMonth ? ` (expected ${monthLabel(vatMonth, lang)})` : ""}. The price stays the same, so VAT comes out of our share.`}>
        <div className="grid gap-4 xl:grid-cols-5">
          <div className={clsx(CARD, "overflow-hidden xl:col-span-3 print:shadow-none")}>
            <div className="thin-scrollbar overflow-x-auto">
              <table className="w-full text-[13px] sm:text-[14px] [&_td]:px-2.5 [&_th]:px-2.5 sm:[&_td]:px-4 sm:[&_th]:px-4">
                <thead>
                  <tr className="border-b border-[#e1e7ef] bg-[#f8f9fc] text-[12.5px] text-ink-600">
                    <th className="px-4 py-2.5 text-start font-semibold" />
                    <th className="px-4 py-2.5 text-end font-semibold">{ar ? "اليوم (قبل التسجيل الضريبي)" : "Today (before VAT)"}</th>
                    <th className="px-4 py-2.5 text-end font-semibold">{ar ? "بعد التسجيل الضريبي" : "After VAT registration"}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((x) => (
                    <tr key={x.label} className={clsx("border-b border-[#f0f2f7] last:border-0", x.kind === "total" && "bg-brand-50/60")}>
                      <td className={clsx("px-4 py-2.5", x.kind === "neg" ? "ps-7 text-ink-600" : "font-semibold text-ink-900", x.kind === "total" && "font-bold")}>{x.label}</td>
                      {[x.b, x.a].map((v, j) => (
                        <td key={j} className={clsx("ltr-content px-4 py-2.5 text-end tabular-nums", v < 0 ? "text-[#a02a24]" : "text-ink-900", (x.kind === "sub" || x.kind === "total") && "font-bold", x.kind === "total" && "text-brand-700")}>
                          {money(v)}
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr className="text-[12.5px] text-ink-600">
                    <td className="px-4 py-2">{ar ? "نسبة اللي بيفضل من إيرادنا" : "Share of our revenue kept"}</td>
                    <td className="ltr-content px-4 py-2 text-end">{pct(sub.before.margin, 0)}</td>
                    <td className="ltr-content px-4 py-2 text-end">{pct(sub.after.margin, 0)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <div className={clsx(CARD, "flex flex-col p-4 xl:col-span-2 print:shadow-none")}>
            <p className="text-[14px] font-bold text-ink-900">{ar ? `توزيع الـ${money(sub.paid)} ريال اللي ولي الأمر دفعها` : `How the ${sar} ${money(sub.paid)} paid is split`}</p>
            <p className="text-[12.5px] text-ink-600">{ar ? "بعد التسجيل الضريبي" : "After VAT registration"}</p>
            <div className="mt-4 flex h-9 overflow-hidden rounded-lg" dir="ltr">
              {bar.map((b) => <div key={b.k} title={`${b.l}: ${money(b.v)}`} style={{ width: `${(b.v / sub.paid) * 100}%`, backgroundColor: b.c }} />)}
            </div>
            <ul className="mt-4 space-y-2 text-[13.5px]">
              {bar.slice().reverse().map((b) => (
                <li key={b.k} className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: b.c }} />
                  <span className="text-ink-700">{b.l}</span>
                  <span className="ltr-content ms-auto font-semibold tabular-nums text-ink-900">{money(b.v)}</span>
                  <span className="ltr-content w-11 text-end text-[12.5px] text-ink-500">{pct(b.v / sub.paid, 0)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-auto pt-4 text-[13px] leading-6 text-ink-600">
              {ar ? "من الجزء اللي بيفضل لنا بنصرف على الإعلانات والحصص المجانية (2.3) ورواتب الفريق والمصاريف الثابتة." : "Our share pays for ads and free trials (2.3), the team and fixed costs."}
            </p>
          </div>
        </div>
      </Block>

      <Block n="2.3" title={ar ? "بنصرف كام علشان نجيب مشترك جديد؟" : "What it costs to win a new subscriber"}
        lede={ar ? "مثال على كل 100 عميل محتمل في السعودية: اليوم مقابل المستهدف بعد تحسين البيع والمتابعة." : "Per 100 leads in Saudi Arabia: today versus the target once sales follow-up improves."}>
        <div className="grid gap-4 xl:grid-cols-5">
          <div className={clsx(CARD, "overflow-hidden xl:col-span-3 print:shadow-none")}>
            <div className="thin-scrollbar overflow-x-auto">
              <table className="w-full text-[13px] sm:text-[14px] [&_td]:px-2.5 [&_th]:px-2.5 sm:[&_td]:px-4 sm:[&_th]:px-4">
                <thead>
                  <tr className="border-b border-[#e1e7ef] bg-[#f8f9fc] text-[12.5px] text-ink-600">
                    <th className="px-4 py-2.5 text-start font-semibold">{ar ? "لكل 100 عميل محتمل (المبالغ بالريال)" : "Per 100 leads (SAR)"}</th>
                    <th className="px-4 py-2.5 text-end font-semibold">{ar ? "اليوم" : "Today"}</th>
                    <th className="px-4 py-2.5 text-end font-semibold">{ar ? `المستهدف بعد ${ksa.ramp_months} شهر` : `Target after ${ksa.ramp_months} months`}</th>
                  </tr>
                </thead>
                <tbody>
                  {acqRows.map((x) => (
                    <tr key={x.label} className={clsx("border-b border-[#f0f2f7] last:border-0", x.kind === "strong" && "bg-brand-50/60")}>
                      <td className={clsx("px-4 py-2.5", x.kind === "cost" ? "ps-7 text-ink-600" : x.kind ? "font-bold text-ink-900" : "text-ink-800")}>{x.label}</td>
                      <td className={clsx("ltr-content px-4 py-2.5 text-end tabular-nums", x.kind === "cost" ? "text-[#a02a24]" : x.kind ? "font-bold text-ink-900" : "text-ink-800")}>{x.n(now)}</td>
                      <td className={clsx("ltr-content px-4 py-2.5 text-end tabular-nums", x.kind === "cost" ? "text-[#a02a24]" : x.kind === "strong" ? "font-bold text-brand-700" : x.kind ? "font-bold text-ink-900" : "text-ink-800")}>{x.n(tgt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="space-y-3 xl:col-span-2">
            <Note tone="warn">
              {ar
                ? `اليوم بنحتاج ${money(now.leadsPerSub)} عميل محتمل علشان مشترك واحد، وده بيكلّف ${money(now.perSub)} ${sar} — أكتر من اللي بيفضل لنا من الاشتراك الأول (${money(sub.before.contribution)} ${sar}). علشان كده الخطة معتمدة على 3 حاجات: رفع التحويل من الحصة المجانية، والتجديد، والمدارس اللي مالهاش تكلفة إعلانات.`
                : `Today we need ${money(now.leadsPerSub)} leads per subscriber at ${sar} ${money(now.perSub)} — more than we keep from a first plan (${sar} ${money(sub.before.contribution)}). So the plan rests on three levers: better trial conversion, renewals, and schools, which carry no ad cost.`}
            </Note>
            <Note>
              {ar
                ? `في المستهدف تكلفة المشترك بتنزل لـ${money(tgt.perSub)} ${sar}، والطالب اللي بيجدد ${pct(core.renewal_rate_target, 0)} من المرات بيشتري في المتوسط ${r1(1 / (1 - core.renewal_rate_target))} اشتراك، فبيرجّع حوالي ${money(sub.after.contribution / (1 - core.renewal_rate_target))} ${sar}.`
                : `At target the cost falls to ${sar} ${money(tgt.perSub)}; a student who renews ${pct(core.renewal_rate_target, 0)} of the time buys ${r1(1 / (1 - core.renewal_rate_target))} plans on average, returning about ${sar} ${money(sub.after.contribution / (1 - core.renewal_rate_target))}.`}
            </Note>
          </div>
        </div>
      </Block>

      <Block n="2.4" title={ar ? "المعلمين والطاقة التشغيلية" : "Teachers and capacity"}
        lede={ar
          ? "الطاقة بتتحسب بالحصة. المعلم بيشتغل عن بُعد وبياخد أجره عن كل حصة بس، فمفيش راتب ثابت، والتوسع معناه تعيين معلمين زيادة."
          : "Capacity is counted in lessons. Teachers work remotely and are paid per lesson only — no fixed salary — so growth simply means hiring more teachers."}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            [ar ? "طلاب لكل معلم في الشهر" : "Students per teacher / month", money(ra.team.teacher_max_students), ar ? "حصص فردية" : "one-to-one"],
            [ar ? "حصص الطالب في الشهر" : "Lessons per student / month", String(ra.team.teacher_lessons_per_student_month), ar ? `${core.lessons} حصة في شهر لشهرين` : `${core.lessons} lessons over 1–2 months`],
            [ar ? "طاقة المعلم في الشهر" : "Teacher capacity / month", `${money(cap)} ${ar ? "حصة" : "lessons"}`, `${money(ra.team.teacher_max_students)} × ${ra.team.teacher_lessons_per_student_month}`],
            [ar ? "معلم بطاقة كاملة (الباقة الأساسية)" : "A full teacher (core plan)", `${money(perTeacherRev - perTeacherPay)} ${sar}`,
              ar ? `إيراد ${money(perTeacherRev)} − أجر ${money(perTeacherPay)} شهريًا` : `revenue ${money(perTeacherRev)} − pay ${money(perTeacherPay)} a month`],
          ].map(([l, v, s], i) => (
            <Reveal key={l} delay={i * 60} className="h-full">
              <div className={clsx(CARD, "h-full p-4 print:shadow-none")}>
                <p className="text-[13px] text-ink-600">{l}</p>
                <p className="ltr-content mt-1 text-right text-[22px] font-bold text-ink-900">{v}</p>
                <p className="ltr-content mt-0.5 text-right text-[12.5px] text-ink-500">{s}</p>
              </div>
            </Reveal>
          ))}
        </div>
        <div className={clsx(CARD, "mt-4 overflow-hidden print:shadow-none")}>
          <div className="thin-scrollbar overflow-x-auto">
            <table className="w-full min-w-[620px] text-[14px]">
              <thead>
                <tr className="border-b border-[#e1e7ef] bg-[#f8f9fc] text-[12.5px] text-ink-600">
                  <th className="px-4 py-2.5 text-start font-semibold">{ar ? "في آخر كل سنة" : "At each year end"}</th>
                  {yearEnd.map((y) => <th key={y.y} className="px-4 py-2.5 text-end font-semibold">{t("y")}{y.y}</th>)}
                </tr>
              </thead>
              <tbody>
                {([
                  [ar ? "الطلاب النشطون" : "Active students", "students"],
                  [ar ? "حصص المعلمين في الشهر (شامل الحصص المجانية)" : "Teacher lessons / month (incl. free trials)", "lessons"],
                  [ar ? "المعلمون المطلوبون" : "Teachers needed", "teachers"],
                  [ar ? "مشرفين أكاديميين" : "Academic supervisors", "sup"],
                  [ar ? "خدمة العملاء" : "Customer support", "cs"],
                ] as const).map(([l, key]) => (
                  <tr key={key} className="border-b border-[#f0f2f7] last:border-0">
                    <td className={clsx("px-4 py-2.5", key === "teachers" ? "font-bold text-ink-900" : "text-ink-700")}>{l}</td>
                    {yearEnd.map((y) => <td key={y.y} className={clsx("ltr-content px-4 py-2.5 text-end tabular-nums", key === "teachers" ? "font-bold text-brand-700" : "text-ink-800")}>{money(y[key])}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <p className="mt-2 flex items-start gap-1.5 text-[13px] leading-6 text-ink-600">
          <Users size={15} className="mt-1 shrink-0" />
          {ar
            ? "المدارس والمجموعات بيشيلوا أكتر من طالب في نفس الحصة، فعدد الطلاب لكل معلم بيطلع أعلى من 65 في السنين اللي فيها مدارس."
            : "Schools and groups put several students in one lesson, so students per teacher exceed 65 in the years with schools."}
        </p>
      </Block>

      <Block n="2.5" title={ar ? "منتجاتنا ومصادر الدخل" : "Our products and revenue streams"}
        lede={ar ? "نفس المعلمين والمنصة بيخدموا أكتر من منتج، وكل منتج ليه سعره وتوقيت إطلاقه." : "The same teachers and platform serve several products, each with its own price and launch date."}>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {streams.map((s, i) => {
            const m = subscriptionMath(s, r);
            const info = STREAM_INFO[s.id];
            return (
              <Reveal key={s.id} delay={i * 50} className="h-full">
                <div className={clsx(CARD, "flex h-full flex-col p-4 print:shadow-none")}>
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="text-[15.5px] font-bold leading-6 text-ink-900">{nm(s)}</h4>
                    {s.suggested && <span className="shrink-0 rounded-full border border-accent-300 px-2 py-0.5 text-[11.5px] font-semibold text-accent-700">{t("suggested")}</span>}
                  </div>
                  {info && <p className="mt-1 text-[13.5px] leading-6 text-ink-600">{info[ar ? 0 : 1]}</p>}
                  <dl className="mt-auto grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-ink-100 pt-3 text-[13px]">
                    <dt className="text-ink-500">{ar ? "السعر" : "Price"}</dt>
                    <dd className="ltr-content text-end font-semibold text-ink-900">{money(s.list_price)}{s.avg_discount ? ` − ${pct(s.avg_discount, 0)}` : ""}</dd>
                    <dt className="text-ink-500">{ar ? "الحصص" : "Lessons"}</dt>
                    <dd className="text-end font-semibold text-ink-900">{s.lessons ? `${s.lessons} · ${m.grp > 1 ? (ar ? `مجموعة ${m.grp}` : `group of ${m.grp}`) : (ar ? "فردي" : "1-to-1")}` : "—"}</dd>
                    <dt className="text-ink-500">{ar ? "يبدأ" : "Starts"}</dt>
                    <dd className="text-end font-semibold text-ink-900">{monthLabel(s.start_month, lang)}</dd>
                    <dt className="text-ink-500">{ar ? "يفضل لنا" : "We keep"}</dt>
                    <dd className="ltr-content text-end font-semibold text-brand-700">{money(m.after.contribution)}</dd>
                  </dl>
                </div>
              </Reveal>
            );
          })}
        </div>
      </Block>

      <ChapterNav id="how-it-works" />
    </div>
  );
}

