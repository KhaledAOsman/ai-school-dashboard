/**
 * Chapter 3 — the growth plan: market size, a dated roadmap built from the
 * assumptions (launches, hires, funding, milestones), revenue by product and
 * the operational scale-up.
 */
import { useMemo } from "react";
import clsx from "clsx";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Banknote, Briefcase, Flag, Globe2, Rocket, Receipt, Server, TrendingUp, ExternalLink } from "lucide-react";
import { Reveal } from "@/components/motion";
import { useFM } from "../context";
import { COLORS, STREAM_COLORS, compact, money, monthLabel, pct } from "../i18n";
import { CARD, ChartTooltip, useMoney } from "../components/ui";
import { Block, ChapterHeader, ChapterNav } from "../components/chapters";
import { MARKET, onlineTutoringMarketSar } from "../components/market";

type Kind = "launch" | "market" | "hire" | "capex" | "funding" | "milestone" | "tax";
const ICON: Record<Kind, typeof Rocket> = { launch: Rocket, market: Globe2, hire: Briefcase, capex: Server, funding: Banknote, milestone: Flag, tax: Receipt };

export default function GrowthPage() {
  const { result: r, t, nm, lang } = useFM();
  const { big } = useMoney();
  const ar = lang === "ar";

  const yearData = useMemo(() => (r ? r.years.map((y) => ({
    name: `${t("y")}${y.year}`, ...Object.fromEntries(Object.entries(y.revenue_by_stream).map(([k, v]) => [k, Math.round(v)])),
  })) : []), [r, t]);
  const monthData = useMemo(() => (r ? r.months.map((m) => ({ name: m.month, students: Math.round(m.active_students), teachers: m.headcount.teachers })) : []), [r]);

  if (!r?.resolved_assumptions) return <p className="py-10 text-center text-ink-600">{t("loading")}</p>;
  const ra = r.resolved_assumptions;
  const k = r.kpis;
  const start = ra.general.start_month;
  const sar = t("sar");

  // ---------------------------------------------------------------- roadmap
  const ev: { month: string; kind: Kind; text: string; sub?: string }[] = [];
  for (const s of ra.streams) {
    if (!s.enabled || s.start_month <= start) continue;
    ev.push({ month: s.start_month, kind: "launch", text: `${ar ? "إطلاق" : "Launch"} ${nm(s)}`, sub: s.suggested ? t("suggested") : undefined });
  }
  for (const m of ra.markets) {
    if (m.start_month > start) ev.push({ month: m.start_month, kind: "market", text: ar ? `دخول سوق ${nm(m)}` : `Enter ${nm(m)}` });
  }
  for (const h of ra.team.hires) {
    ev.push({ month: h.month, kind: "hire", text: `${ar ? "تعيين" : "Hire"} ${h.count > 1 ? `${h.count} × ` : ""}${ar ? h.role_ar : h.role_en}`, sub: `${money(h.salary)} ${sar} / ${ar ? "شهر" : "month"}` });
  }
  for (const c of ra.capex) ev.push({ month: c.month, kind: "capex", text: nm(c), sub: `${money(c.amount)} ${sar}` });
  if (k.loan_amount > 0) ev.push({ month: ra.financing.loan_draw_month, kind: "funding", text: ar ? `صرف القرض ${big(k.loan_amount)}` : `Loan of ${big(k.loan_amount)} drawn` });
  if (k.vat_registration_month) ev.push({ month: k.vat_registration_month, kind: "tax", text: ar ? "التسجيل في ضريبة القيمة المضافة" : "VAT registration" });
  if (k.ebitda_breakeven_month) ev.push({ month: k.ebitda_breakeven_month, kind: "milestone", text: ar ? "نقطة التعادل التشغيلي" : "Operating break-even" });
  if (k.loan_repaid_month) ev.push({ month: k.loan_repaid_month, kind: "milestone", text: ar ? "سداد القرض بالكامل" : "Loan fully repaid" });
  ev.sort((a, b) => a.month.localeCompare(b.month));
  const byYear = r.years.map((y) => ({ y, items: ev.filter((e) => e.month >= y.from && e.month <= y.to) }));

  // ---------------------------------------------------------------- market
  const marketY5 = onlineTutoringMarketSar(5);
  const y1 = r.years[0], y5 = r.years[r.years.length - 1];
  const share = y5.revenue / marketY5;

  const streamRows = r.streams
    .map((s, i) => ({ s, i, y1: y1.revenue_by_stream[s.id] ?? 0, y5: y5.revenue_by_stream[s.id] ?? 0 }))
    .filter((x) => x.y1 || x.y5);

  return (
    <div className="space-y-10">
      <ChapterHeader id="growth" />

      <Block n="3.1" title={ar ? "السوق والفرصة" : "The market opportunity"}
        lede={ar ? "السوق كبير جدًا مقارنة باللي الخطة محتاجاه، فالنمو مش محدود بحجم السوق لكن بقدرتنا على البيع والتشغيل." : "The market is far larger than the plan needs, so growth is limited by our sales and delivery, not by demand."}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            [ar ? "طلاب التعليم العام بالسعودية" : "Saudi K-12 students", `${compact(MARKET.ksaStudents, lang)}+`],
            [ar ? "طلاب الخليج" : "GCC students", compact(MARKET.gccStudents, lang)],
            [ar ? "سوق الدروس الأونلاين بالسعودية (السنة 5)" : "Saudi online tutoring market (year 5)", big(marketY5)],
            [ar ? "الحصة اللي الخطة محتاجاها منه" : "Share the plan needs", pct(share, 1)],
          ].map(([l, v], i) => (
            <Reveal key={l} delay={i * 60} className="h-full">
              <div className={clsx(CARD, "h-full p-4 print:shadow-none")}>
                <p className="text-[13px] text-ink-600">{l}</p>
                <p className="ltr-content mt-1 text-right text-[22px] font-bold text-ink-900">{v}</p>
              </div>
            </Reveal>
          ))}
        </div>
        <p className="mt-3 max-w-[900px] text-[14.5px] leading-7 text-ink-700">
          {ar
            ? `في السنة الخامسة الخطة محتاجة ${money(Math.round(k.students_active_end))} طالب نشط، يعني ${pct(k.students_active_end / MARKET.ksaStudents, 2)} من طلاب السعودية بس.`
            : `By year 5 the plan needs ${money(Math.round(k.students_active_end))} active students — ${pct(k.students_active_end / MARKET.ksaStudents, 2)} of Saudi students.`}
        </p>
        <ul className="mt-2 space-y-1 text-[12.5px] text-ink-500">
          {MARKET.sources.map((s) => (
            <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-brand-600">{ar ? s.ar : s.en} <ExternalLink size={11} /></a></li>
          ))}
        </ul>
      </Block>

      <Block n="3.2" title={ar ? "خارطة الطريق سنة بسنة" : "Roadmap, year by year"}
        lede={ar ? "كل خطوة هنا مرتبطة برقم في الافتراضات؛ لو المحلل غيّر تاريخ إطلاق أو تعيين، الخارطة والأرقام بيتغيروا مع بعض." : "Each step is tied to an assumption; change a launch or hire date and the roadmap and numbers move together."}>
        <ol className="space-y-3">
          {byYear.map(({ y, items }, i) => {
            const end = r.months.find((m) => m.month === y.to);
            return (
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
                  <div>
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
                      {end && (
                        <li className="flex gap-2.5">
                          <TrendingUp size={16} strokeWidth={1.8} className="mt-0.5 shrink-0 text-ink-400" />
                          <div className="min-w-0">
                            <p className="text-[14px] font-semibold leading-5 text-ink-700">
                              {ar ? `${money(Math.round(end.active_students))} طالب نشط و${end.headcount.teachers} معلم` : `${money(Math.round(end.active_students))} active students, ${end.headcount.teachers} teachers`}
                            </p>
                            <p className="mt-0.5 text-[12px] text-ink-500">{ar ? "في آخر السنة" : "at year end"}</p>
                          </div>
                        </li>
                      )}
                    </ul>
                  </div>
                </li>
              </Reveal>
            );
          })}
        </ol>
      </Block>

      <Block n="3.3" title={ar ? "الإيراد من كل منتج" : "Revenue by product"}
        lede={ar ? "الإيراد المعترف به (بعد خصم الضريبة من وقت التسجيل). المدارس بتبدأ تشيل الجزء الأكبر من السنة الثالثة." : "Recognised revenue (net of VAT once registered). Schools carry the largest share from year 3."}>
        <div className="grid gap-4 xl:grid-cols-2">
          <div className={clsx(CARD, "p-4 print:shadow-none")}>
            <div className="h-[320px]" dir="ltr">
              <ResponsiveContainer>
                <BarChart data={yearData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={COLORS.grid} />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} />
                  <YAxis tickFormatter={(v) => compact(v, "en")} tickLine={false} axisLine={false} fontSize={12} width={56} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: "#f4f1ff" }} />
                  {r.streams.map((s, i) => (
                    <Bar key={s.id} dataKey={s.id} name={nm(s)} stackId="a" fill={STREAM_COLORS[i % STREAM_COLORS.length]} radius={i === r.streams.length - 1 ? [4, 4, 0, 0] : 0} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className={clsx(CARD, "overflow-hidden print:shadow-none")}>
            <table className="w-full text-[13.5px]">
              <thead>
                <tr className="border-b border-[#e1e7ef] bg-[#f8f9fc] text-[12.5px] text-ink-600">
                  <th className="px-3 py-2.5 text-start font-semibold">{ar ? "المنتج" : "Product"}</th>
                  <th className="px-3 py-2.5 text-end font-semibold">{t("y")}1</th>
                  <th className="px-3 py-2.5 text-end font-semibold">{t("y")}{y5.year}</th>
                  <th className="px-3 py-2.5 text-end font-semibold">{ar ? "النسبة" : "Share"}</th>
                </tr>
              </thead>
              <tbody>
                {streamRows.map((x) => (
                  <tr key={x.s.id} className="border-b border-[#f0f2f7]">
                    <td className="px-3 py-2"><span className="flex items-center gap-2 text-[13px] leading-5 text-ink-800"><span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: STREAM_COLORS[x.i % STREAM_COLORS.length] }} />{nm(x.s)}</span></td>
                    <td className="ltr-content whitespace-nowrap px-3 py-2 text-end tabular-nums">{compact(x.y1, lang)}</td>
                    <td className="ltr-content whitespace-nowrap px-3 py-2 text-end font-semibold tabular-nums">{compact(x.y5, lang)}</td>
                    <td className="ltr-content px-3 py-2 text-end text-ink-600">{pct(x.y5 / (y5.revenue || 1), 0)}</td>
                  </tr>
                ))}
                <tr className="font-bold">
                  <td className="px-3 py-2.5">{t("total")}</td>
                  <td className="ltr-content whitespace-nowrap px-3 py-2.5 text-end">{compact(y1.revenue, lang)}</td>
                  <td className="ltr-content whitespace-nowrap px-3 py-2.5 text-end">{compact(y5.revenue, lang)}</td>
                  <td className="ltr-content px-3 py-2.5 text-end">100%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </Block>

      <Block n="3.4" title={ar ? "النمو التشغيلي" : "Operational growth"}
        lede={ar ? "عدد الطلاب النشطين والمعلمين المطلوبين كل شهر — المعلمين بيزيدوا مع الحصص مش قبلها." : "Active students and teachers needed each month — teachers are added with lessons, not ahead of them."}>
        <div className={clsx(CARD, "p-4 print:shadow-none")}>
          <div className="h-[300px]" dir="ltr">
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
        </div>
        <p className="mt-2 flex items-center gap-1.5 text-[13px] text-ink-600"><TrendingUp size={15} />
          {ar ? `من ${money(Math.round(r.months[0].active_students))} طالب في ${monthLabel(r.months[0].month, lang)} إلى ${money(Math.round(k.students_active_end))} طالب و${k.teachers_end} معلم في آخر الخطة.`
            : `From ${money(Math.round(r.months[0].active_students))} students in ${monthLabel(r.months[0].month, lang)} to ${money(Math.round(k.students_active_end))} students and ${k.teachers_end} teachers at the end.`}
        </p>
      </Block>

      <ChapterNav id="growth" />
    </div>
  );
}
