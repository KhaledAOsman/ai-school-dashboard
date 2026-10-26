/**
 * Chapter 2 — Business model: the two customer segments (individual / B2B),
 * the individual customer's journey, how the service is delivered (teachers
 * paid per lecture, 60-80 lectures a month each) and the market.
 * Every figure comes from the resolved assumptions / model result.
 */
import clsx from "clsx";
import { Building2, CreditCard, ExternalLink, Gift, Megaphone, MonitorPlay, RefreshCw, User } from "lucide-react";
import { Reveal } from "@/components/motion";
import { useFM } from "../context";
import { compact, money, monthLabel, pct } from "../i18n";
import { CARD, useMoney } from "../components/ui";
import { Block, ChapterHeader, ChapterNav } from "../components/chapters";
import { MARKET, onlineTutoringMarketSar } from "../components/market";
import { lectureConversion } from "../components/unitmath";

export default function BusinessModelPage() {
  const { result: r, t, lang } = useFM();
  const { big } = useMoney();
  if (!r?.resolved_assumptions) return <p className="py-10 text-center text-ink-600">{t("loading")}</p>;
  const ar = lang === "ar";
  const ra = r.resolved_assumptions;
  const k = r.kpis;
  const sar = t("sar");
  const core = ra.streams.find((s) => s.id === "core_b2c") ?? ra.streams[0];
  const ksa = ra.markets.find((m) => m.id === (core.market ?? "ksa")) ?? ra.markets[0];
  const conv = lectureConversion(ksa);
  const y5 = r.years[r.years.length - 1];
  const seg = new Map(r.streams.map((s) => [s.id, s.category]));
  const segRevenue = (c: "b2c" | "b2b") => Object.entries(y5.revenue_by_stream).filter(([id]) => seg.get(id) === c).reduce((a, [, v]) => a + v, 0);
  const b2bStreams = ra.streams.filter((s) => s.enabled && s.category === "b2b");
  const b2bStart = b2bStreams.map((s) => s.start_month).sort()[0];
  const partner = b2bStreams.find((s) => s.driver === "partners");
  const b2bMaxDiscount = Math.max(0, ...b2bStreams.map((s) => s.avg_discount));
  const weeks = core.lessons / (core.lessons_per_week || 1);
  const cap = ra.team.teacher_capacity_lessons;

  // ---------------------------------------------------------------- segments
  const segments = [
    {
      icon: User, title: ar ? "الاشتراكات الفردية (B2C)" : "Individual subscriptions (B2C)",
      body: ar
        ? `يشترك ولي الأمر لطفله في باقة محاضرات فردية عبر الإنترنت بعد محاضرة تجريبية مجانية. سعر الباقة ${money(core.list_price)} ${sar} شاملة الضريبة، بخصم أقصاه ${pct(core.avg_discount, 0)}.`
        : `A parent buys a package of one-to-one online lectures for their child after a free trial lecture. The package costs ${sar} ${money(core.list_price)} incl. VAT, with a maximum ${pct(core.avg_discount, 0)} discount.`,
      start: ar ? "قائمة حاليًا" : "Live today",
      share: segRevenue("b2c") / (y5.revenue || 1),
    },
    {
      icon: Building2, title: ar ? "الاشتراكات المؤسسية (B2B)" : "Institutional subscriptions (B2B)",
      body: ar
        ? `باقات للمدارس والجمعيات والشركات، ويُبنى حجمها على عدد الجهات الشريكة وعدد طلاب كل جهة${partner ? ` (${money(partner.partners_by_year[1] ?? 0)} جهات جديدة شهريًا في السنة الثانية × ${money(partner.students_per_partner)} طالبًا)` : ""}. يحصل كل طالب على محاضرات فردية بخصم يصل إلى ${pct(b2bMaxDiscount, 0)}، دون تكلفة تسويق أو محاضرات مجانية.`
        : `Packages for schools, associations and companies, sized by partner institutions and students per institution${partner ? ` (${money(partner.partners_by_year[1] ?? 0)} new institutions a month in year 2 × ${money(partner.students_per_partner)} students)` : ""}. Each student takes one-to-one lectures at up to ${pct(b2bMaxDiscount, 0)} off, with no marketing or free-lecture cost.`,
      start: b2bStart ? (ar ? `تبدأ ${monthLabel(b2bStart, lang)} (السنة الثانية)` : `From ${monthLabel(b2bStart, lang)} (year 2)`) : "—",
      share: segRevenue("b2b") / (y5.revenue || 1),
    },
  ];

  // ---------------------------------------------------------------- journey
  const steps = [
    {
      icon: Megaphone, title: ar ? "الوصول إلى العميل" : "Reaching the customer",
      body: ar ? "نصل إلى أولياء الأمور عبر الإعلانات الممولة والمؤثرين ومحتوى المستخدمين، إضافة إلى الإحالات والزيارات المباشرة." : "We reach parents through paid ads, influencers and user-generated content, plus referrals and direct visits.",
      facts: ar
        ? [`تكلفة العميل المحتمل من الإعلانات ${money(ksa.cpl, { decimals: 2 })} ${sar}`, `${pct(ksa.organic_share, 0)} من العملاء المحتملين يصلون دون إعلان`]
        : [`Cost per ad lead ${sar} ${money(ksa.cpl, { decimals: 2 })}`, `${pct(ksa.organic_share, 0)} of leads arrive without ads`],
    },
    {
      icon: Gift, title: ar ? "محاضرة تجريبية مجانية" : "Free trial lecture",
      body: ar ? "يحجز ولي الأمر محاضرة مجانية لطفله مع أحد المعلمين، دون أي التزام مالي." : "The parent books a free lecture for their child with one of our teachers, with no commitment.",
      facts: ar
        ? [`نسبة حضور المحاضرات المحجوزة ${pct(ksa.show_rate, 0)}`, `يُدفع للمعلم ${money(ksa.trial_cost)} ${sar} عن كل محاضرة محجوزة حتى عند الغياب`]
        : [`${pct(ksa.show_rate, 0)} of booked lectures are attended`, `The teacher is paid ${sar} ${money(ksa.trial_cost)} per booked lecture, even on a no-show`],
    },
    {
      icon: CreditCard, title: ar ? "الاشتراك المدفوع" : "Paid subscription",
      body: ar
        ? `يشترك ولي الأمر في باقة من ${core.lessons} محاضرة بسعر ${money(core.list_price)} ${sar}، ويُسدَّد الاشتراك مقدمًا.`
        : `The parent buys a ${core.lessons}-lecture package for ${sar} ${money(core.list_price)}, paid upfront.`,
      facts: ar
        ? [`يشترك حاليًا ${pct(conv.now, 1)} ممن حضروا المحاضرة المجانية، والمستهدف ${pct(conv.target, 0)}`, `عمولة مبيعات ${money(core.commission_per_enrolment)} ${sar} عن كل اشتراك`]
        : [`${pct(conv.now, 1)} of those who attend the free lecture subscribe today; target ${pct(conv.target, 0)}`, `${sar} ${money(core.commission_per_enrolment)} sales commission per subscription`],
    },
    {
      icon: MonitorPlay, title: ar ? "تقديم المحاضرات" : "Delivering the lectures",
      body: ar
        ? `تُقدَّم المحاضرات فرديًا عبر الإنترنت بواقع ${core.lessons_per_week === 1 ? "محاضرة واحدة" : core.lessons_per_week === 2 ? "محاضرتين" : `${core.lessons_per_week} محاضرات`} أسبوعيًا، فتكتمل الباقة خلال ${Math.round(weeks)} أسابيع تقريبًا.`
        : `Lectures are one-to-one online, ${core.lessons_per_week} a week, so a package completes in about ${Math.round(weeks)} weeks.`,
      facts: ar
        ? [`أجر المعلم ${money(core.teacher_cost_per_lesson)} ${sar} للمحاضرة (${money(core.lessons * core.teacher_cost_per_lesson)} ${sar} للباقة)`, "يراجع فريق الجودة عينات من المحاضرات ويقيّم المعلمين"]
        : [`Teacher fee ${sar} ${money(core.teacher_cost_per_lesson)} per lecture (${sar} ${money(core.lessons * core.teacher_cost_per_lesson)} per package)`, "The quality team reviews sample lectures and evaluates teachers"],
    },
    {
      icon: RefreshCw, title: ar ? "التجديد للمستوى التالي" : "Renewal to the next level",
      body: ar ? "بعد إتمام المستوى ينتقل الطالب إلى المستوى التالي باشتراك جديد، دون تكلفة تسويق أو محاضرة تجريبية." : "After a level the student moves to the next with a new package, with no marketing or trial cost.",
      facts: ar
        ? [`نسبة التجديد الحالية ${pct(core.renewal_rate, 0)}`, `المستهدف ${pct(core.renewal_rate_target, 0)} خلال ${core.renewal_ramp_months} شهرًا عبر منهج متدرج وشهادات`]
        : [`Renewal today ${pct(core.renewal_rate, 0)}`, `Target ${pct(core.renewal_rate_target, 0)} within ${core.renewal_ramp_months} months via levels and certificates`],
    },
  ];

  // ---------------------------------------------------------------- delivery capacity (September of each year)
  const yearEnd = r.years.map((y) => {
    const m = r.months.find((x) => x.month === y.to)!;
    return { y: y.year, lectures: Math.round(m.teacher_lessons), teachers: m.headcount.teachers };
  });

  const marketY5 = onlineTutoringMarketSar(5);

  return (
    <div className="space-y-10">
      <ChapterHeader id="business-model" />

      <Block n="2.1" title={ar ? "قطاعا العملاء" : "Two customer segments"}
        lede={ar ? "تقدّم المنصة الخدمة نفسها، بالمعلمين والمنصة والمحتوى نفسها، لقطاعين من العملاء." : "The same service, teachers, platform and content serve two customer segments."}>
        <div className="grid gap-4 md:grid-cols-2">
          {segments.map((s, i) => (
            <Reveal key={s.title} delay={i * 70} className="h-full">
              <div className={clsx(CARD, "flex h-full flex-col p-5 print:shadow-none")}>
                <div className="flex items-center gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-brand-200 text-brand-600"><s.icon size={20} strokeWidth={1.8} /></span>
                  <h4 className="text-[17px] font-bold text-ink-900">{s.title}</h4>
                </div>
                <p className="mt-3 text-[14.5px] leading-7 text-ink-700">{s.body}</p>
                <dl className="mt-auto grid grid-cols-2 gap-3 border-t border-ink-100 pt-3 text-[13px]">
                  <div><dt className="text-ink-500">{ar ? "البداية" : "Start"}</dt><dd className="mt-0.5 font-semibold text-ink-900">{s.start}</dd></div>
                  <div><dt className="text-ink-500">{ar ? "الحصة من إيراد السنة الخامسة" : "Share of year-5 revenue"}</dt><dd className="ltr-content mt-0.5 text-right text-[16px] font-bold text-brand-700">{pct(s.share, 0)}</dd></div>
                </dl>
              </div>
            </Reveal>
          ))}
        </div>
      </Block>

      <Block n="2.2" title={ar ? "رحلة العميل الفردي" : "The individual customer's journey"}
        lede={ar ? "المراحل التي يمر بها كل عميل، مع مؤشرات التشغيل التي بُنيت عليها الخطة." : "The stages every customer goes through, with the operating figures the plan is built on."}>
        <ol className="grid gap-3 lg:grid-cols-5">
          {steps.map((s, i) => (
            <Reveal key={s.title} delay={i * 70} className="h-full">
              <li className={clsx(CARD, "flex h-full flex-col p-4 print:shadow-none")}>
                <div className="flex items-center justify-between">
                  <span className="grid h-10 w-10 place-items-center rounded-full border border-brand-200 text-brand-600"><s.icon size={19} strokeWidth={1.8} /></span>
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

      <Block n="2.3" title={ar ? "تقديم الخدمة والطاقة التشغيلية" : "Service delivery and capacity"}
        lede={ar
          ? `يعمل المعلمون عن بُعد ويتقاضون أجرًا عن كل محاضرة دون رواتب ثابتة. يقدّم المعلم الواحد ${cap} محاضرة شهريًا في المتوسط (بين 60 و80 محاضرة)، ويُحسب عدد المعلمين المطلوبين بقسمة محاضرات الشهر، المدفوعة والمجانية، على هذه الطاقة.`
          : `Teachers work remotely and are paid per lecture, with no fixed salary. One teacher gives ${cap} lectures a month on average (60–80); teachers needed = the month's lectures, paid and free, divided by that capacity.`}>
        <div className={clsx(CARD, "overflow-hidden print:shadow-none")}>
          <div className="thin-scrollbar overflow-x-auto">
            <table className="w-full min-w-[620px] text-[14px]">
              <thead>
                <tr className="border-b border-[#e1e7ef] bg-[#f8f9fc] text-[12.5px] text-ink-600">
                  <th className="px-4 py-2.5 text-start font-semibold">{ar ? "في الشهر الأخير من كل سنة" : "In the last month of each year"}</th>
                  {yearEnd.map((y) => <th key={y.y} className="px-4 py-2.5 text-end font-semibold">{t("y")}{y.y}</th>)}
                </tr>
              </thead>
              <tbody>
                {([
                  [ar ? "المحاضرات المقدَّمة (المدفوعة والمجانية)" : "Lectures given (paid and free)", "lectures"],
                  [ar ? `المعلمون المطلوبون (المحاضرات ÷ ${cap})` : `Teachers needed (lectures ÷ ${cap})`, "teachers"],
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
      </Block>

      <Block n="2.4" title={ar ? "حجم السوق" : "Market size"}
        lede={ar ? "السوق المستهدف أكبر بكثير مما تحتاجه الخطة، فالنمو محكوم بقدرتنا على البيع والتشغيل لا بحجم الطلب." : "The market is far larger than the plan needs; growth is limited by our sales and delivery, not by demand."}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            [ar ? "طلاب التعليم العام في المملكة" : "Saudi K-12 students", `${compact(MARKET.ksaStudents, lang)}+`],
            [ar ? "طلاب دول الخليج" : "GCC students", compact(MARKET.gccStudents, lang)],
            [ar ? "سوق الدروس الإلكترونية في المملكة (السنة الخامسة)" : "Saudi online tutoring market (year 5)", big(marketY5)],
            [ar ? "الحصة السوقية التي تحتاجها الخطة" : "Market share the plan needs", pct(y5.revenue / marketY5, 1)],
          ].map(([l, v], i) => (
            <Reveal key={l} delay={i * 60} className="h-full">
              <div className={clsx(CARD, "h-full p-4 print:shadow-none")}>
                <p className="text-[13px] text-ink-600">{l}</p>
                <p className="ltr-content mt-1 text-right text-[22px] font-bold text-ink-900">{v}</p>
              </div>
            </Reveal>
          ))}
        </div>
        <ul className="mt-3 space-y-1 text-[12.5px] text-ink-500">
          {MARKET.sources.map((s) => (
            <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-brand-600">{ar ? s.ar : s.en} <ExternalLink size={11} /></a></li>
          ))}
        </ul>
        {k.vat_registration_month && (
          <p className="mt-3 text-[13.5px] leading-6 text-ink-600">
            {ar
              ? `ملاحظة: الشركة غير مسجلة حاليًا في ضريبة القيمة المضافة، ويُتوقع تسجيلها في ${monthLabel(k.vat_registration_month, lang)} عند تجاوز المبيعات ${money(ra.tax.vat_threshold)} ${sar} خلال 12 شهرًا، مع بقاء الأسعار دون تغيير.`
              : `Note: the company is not yet VAT-registered; registration is expected in ${monthLabel(k.vat_registration_month, lang)} when sales pass ${sar} ${money(ra.tax.vat_threshold)} in 12 months, with prices unchanged.`}
          </p>
        )}
      </Block>

      <ChapterNav id="business-model" />
    </div>
  );
}
