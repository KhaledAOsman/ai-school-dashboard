import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, LabelList, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useFM } from "../context";
import { fmApi, type Scenario } from "../api";
import { COLORS, compact, iso, money, monthLabel, pct } from "../i18n";
import { CARD, ChartTooltip, Note, Panel, useMoney } from "../components/ui";
import { Reveal } from "@/components/motion";
import clsx from "clsx";
import { Block, ChapterHeader, ChapterNav } from "../components/chapters";

const SC: Scenario[] = ["conservative", "base", "optimistic"];
const SC_COLOR: Record<Scenario, string> = { conservative: COLORS.slate, base: COLORS.purple, optimistic: COLORS.orange };

export default function ScenariosPage() {
  const { versionId, scenario, t, nm, lang, version, result } = useFM();
  const { big } = useMoney();
  const ar = lang === "ar";
  const q = useQuery({
    queryKey: ["fm", "sens", versionId, scenario, version?.updated_at],
    queryFn: () => fmApi.sensitivity(versionId!, scenario),
    enabled: !!versionId,
    staleTime: 120_000,
  });
  const risks = (ar ? [
    ["الاعتماد على الشراكات المؤسسية", "تبدأ الشراكات في السنة الثانية بعقود على فصول كاملة ومسؤول مبيعات مخصص، ويخفض السيناريو المتحفظ حجمها 40%."],
    ["التحويل من المحاضرة المجانية", "متابعة كل محاضرة تجريبية خلال 24 ساعة بعرض محدد المدة، ومراجعة النسبة شهريًا في «الفعلي مقابل الخطة»."],
    ["التجديد", "منهج متدرج المستويات مع شهادات وتقارير لأولياء الأمور، وهو أكثر العوامل تأثيرًا في تحليل الحساسية."],
    ["تكلفة الإعلانات", "زيادة العملاء القادمين عبر الإحالات والزيارات المباشرة والمؤثرين، وتركيز الإنفاق في المواسم."],
    ["جودة المحاضرات مع التوسع", "فريق جودة يراجع عينات من المحاضرات ويقيّم المعلمين، مع تكلفة تأهيل لكل معلم جديد."],
    ["التنظيم والترخيص", "ترخيص التعليم الإلكتروني والتسجيل الضريبي ضمن بند الرسوم النظامية."],
  ] : [
    ["Dependence on partnerships", "Partnerships start in year 2 with whole-class contracts and a dedicated sales lead; the conservative case cuts volume 40%."],
    ["Free-lecture conversion", "Follow up every trial lecture within 24h with a time-limited offer; reviewed monthly in Actual vs plan."],
    ["Renewals", "Levelled curriculum with certificates and parent reports; the strongest driver in the sensitivity analysis."],
    ["Ad costs", "Grow referrals, direct visits and influencer reach; concentrate spend in peak seasons."],
    ["Lecture quality at scale", "A quality team reviews sample lectures and evaluates teachers, with an onboarding cost per new teacher."],
    ["Regulation & licensing", "E-learning licence and VAT registration are covered by the statutory-fees line."],
  ]);
  const head = (
    <>
      <ChapterHeader id="scenarios" />
      <Block n="8.1" title={ar ? "أهم المخاطر وخطة التعامل معها" : "Key risks and how we manage them"}>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {risks.map(([h, d], i) => (
            <div key={h} className={`${CARD} p-4 print:shadow-none`}>
              <p className="flex items-baseline gap-2 text-[15px] font-bold text-ink-900"><span className="ltr-content text-[12.5px] text-accent-600">{String(i + 1).padStart(2, "0")}</span>{h}</p>
              <p className="mt-1 text-[13.5px] leading-6 text-ink-600">{d}</p>
            </div>
          ))}
        </div>
      </Block>
    </>
  );
  if (q.isLoading || !q.data) return <div className="space-y-5">{head}<p className="py-10 text-center text-ink-600">{t("loading")}</p></div>;
  const s = q.data;
  const years = s.scenarios.base.revenue_by_year.map((_, i) => ({
    name: `${t("y")}${i + 1}`,
    ...Object.fromEntries(SC.map((k) => [`rev_${k}`, Math.round(s.scenarios[k].revenue_by_year[i])])),
    ...Object.fromEntries(SC.map((k) => [`ebitda_${k}`, Math.round(s.scenarios[k].ebitda_by_year[i])])),
  }));
  const base = s.base.ebitda_y5;
  const tornado = s.drivers.map((d) => ({ name: nm(d), low: Math.round(d.low.ebitda_y5 - base), high: Math.round(d.high.ebitda_y5 - base) }));
  const sp = result?.resolved_assumptions?.scenarios;

  return (
    <div className="space-y-5">
      {head}
      <Block n="8.2" title={ar ? "ثلاثة سيناريوهات" : "Three scenarios"}
        lede={ar ? "الخطة نفسها في حال جاءت النتائج أبطأ (متحفظ) أو أسرع (متفائل) من المتوقع، مع التمويل الذي يحتاجه كل سيناريو." : "The same plan if things go slower (conservative) or faster (optimistic) than expected, with the funding each one needs."}>
        <div className="grid gap-4 lg:grid-cols-3">
          {SC.map((k, i) => {
            const x = s.scenarios[k];
            const isBase = k === "base";
            const p = sp?.[k];
            const pctChange = (f: number) => `${f >= 1 ? "+" : "−"}${Math.round(Math.abs(f - 1) * 100)}%`;
            const changes = p ? ([
              ["trials_volume", "المحاضرات المجانية", "Free lectures"], ["conversion", "التحويل", "Conversion"], ["cpl", "تكلفة العميل المحتمل", "Cost per lead"],
              ["renewal", "التجديد", "Renewal"], ["growth_volume", "الشراكات", "Partnerships"], ["price", "السعر", "Price"],
            ] as const).filter(([key]) => Math.abs((p[key] as number) - 1) > 1e-9).map(([key, la, le]) => `${ar ? la : le} ${iso(pctChange(p[key] as number))}`) : [];
            if (p && p.delay_months) changes.push(ar ? `تأخير المنتجات الجديدة ${p.delay_months} أشهر` : `${p.delay_months}-month delay of new products`);
            const totalFunding = x.loan;
            return (
              <Reveal key={k} delay={i * 70} className="h-full">
                <section className={clsx(CARD, "flex h-full flex-col overflow-hidden print:shadow-none", isBase && "ring-2 ring-brand-600")}>
                  <div className="h-1.5" style={{ backgroundColor: SC_COLOR[k] }} />
                  <div className="flex flex-1 flex-col p-5">
                    <div className="flex items-baseline justify-between gap-2">
                      <h4 className="text-[18px] font-bold text-ink-900">{t(`sc_${k}` as "sc_base")}</h4>
                      {isBase && <span className="text-[12px] font-semibold text-brand-600">{ar ? "الخطة المعتمدة" : "The plan"}</span>}
                    </div>
                    <p className="mt-1 min-h-[40px] text-[12.5px] leading-5 text-ink-500">
                      {changes.length ? changes.join(ar ? "، " : ", ") : (ar ? "الافتراضات كما هي في الخطة" : "Assumptions as in the plan")}
                    </p>
                    <p className="mt-4 text-[12.5px] text-ink-500">{t("revenue_y5")}</p>
                    <p className="ltr-content text-right text-[26px] font-bold leading-9 text-ink-900">{big(x.revenue_y5)}</p>
                    <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-ink-100 pt-4 text-[12.5px]">
                      <div><dt className="text-ink-500">{t("ebitda_y5")}</dt><dd className={clsx("ltr-content mt-0.5 text-right text-[16px] font-bold", x.ebitda_y5 >= 0 ? "text-[#136c3a]" : "text-[#a02a24]")}>{big(x.ebitda_y5)}</dd></div>
                      <div><dt className="text-ink-500">{t("breakeven")}</dt><dd className="mt-0.5 text-[16px] font-bold text-ink-900">{x.breakeven ? monthLabel(x.breakeven, lang) : (ar ? "بعد السنة الخامسة" : "After year 5")}</dd></div>
                      <div><dt className="text-ink-500">{ar ? "الاشتراكات في السنة الخامسة" : "Subscriptions, year 5"}</dt><dd className="ltr-content mt-0.5 text-right text-[16px] font-bold text-ink-900">{money(Math.round(x.subs_y5 ?? 0))}</dd></div>
                      <div><dt className="text-ink-500">{ar ? "التمويل المطلوب" : "Funding required"}</dt><dd className="ltr-content mt-0.5 text-right text-[16px] font-bold text-ink-900">{big(totalFunding)}</dd></div>
                    </dl>
                    <p className={clsx("mt-auto pt-4 text-[12.5px] font-semibold leading-5", x.financeable ? "text-[#136c3a]" : "text-[#a02a24]")}>
                      {x.financeable
                        ? (ar ? `قرض ${big(x.loan)} دون فوائد يغطي الخطة` : `A ${big(x.loan)} interest-free loan covers the plan`)
                        : (ar ? `قرض ${big(x.loan)}، ولا يحقق التشغيل ربحًا كافيًا لسداده` : `A ${big(x.loan)} loan, but operations do not earn enough to repay it`)}
                    </p>
                  </div>
                </section>
              </Reveal>
            );
          })}
        </div>
      </Block>
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title={ar ? "الإيرادات في السيناريوهات الثلاثة" : "Revenue in the three scenarios"}>
          <div className="h-[280px]" dir="ltr">
            <ResponsiveContainer>
              <LineChart data={years} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={COLORS.grid} />
                <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickFormatter={(v) => compact(v, "en")} tickLine={false} axisLine={false} fontSize={12} width={56} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {SC.map((k) => <Line key={k} dataKey={`rev_${k}`} name={t(`sc_${k}` as "sc_base")} stroke={SC_COLOR[k]} strokeWidth={2.5} dot={{ r: 3 }} />)}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title={ar ? "EBITDA في السيناريوهات الثلاثة" : "EBITDA in the three scenarios"} delay={80}>
          <div className="h-[280px]" dir="ltr">
            <ResponsiveContainer>
              <LineChart data={years} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={COLORS.grid} />
                <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickFormatter={(v) => compact(v, "en")} tickLine={false} axisLine={false} fontSize={12} width={56} />
                <ReferenceLine y={0} stroke="#c3c8da" />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {SC.map((k) => <Line key={k} dataKey={`ebitda_${k}`} name={t(`sc_${k}` as "sc_base")} stroke={SC_COLOR[k]} strokeWidth={2.5} dot={{ r: 3 }} />)}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>
      <Panel title={ar ? `حساسية EBITDA السنة الخامسة لتغير ±${pct(s.pct, 0)} في كل متغير` : `Year-5 EBITDA sensitivity to ±${pct(s.pct, 0)} in each driver`}
        subtitle={ar ? `مقارنة بـ ${big(base)} في السيناريو ${t(`sc_${scenario}` as "sc_base")} — الأعلى تأثيرًا أولًا` : `Against ${big(base)} in the ${t(`sc_${scenario}` as "sc_base")} case — biggest impact first`}>
        <div className="h-[520px]" dir="ltr">
          <ResponsiveContainer>
            <BarChart data={tornado} layout="vertical" barCategoryGap="22%" barGap={2} margin={{ top: 8, right: 56, left: 56, bottom: 0 }}>
              <CartesianGrid horizontal={false} stroke={COLORS.grid} />
              <XAxis type="number" tickFormatter={(v) => compact(v, "en")} tickLine={false} axisLine={false} fontSize={12} />
              <YAxis type="category" dataKey="name" width={ar ? 190 : 170} tickLine={false} axisLine={false} fontSize={12} />
              <ReferenceLine x={0} stroke="#555b7a" />
              <Tooltip content={<ChartTooltip formatter={(v) => `${v > 0 ? "+" : ""}${money(v, { parens: false })}`} />} cursor={{ fill: "#f4f1ff" }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="low" name={ar ? `خفض المتغير ${s.pct * 100}%` : `Driver −${s.pct * 100}%`} fill={COLORS.purpleSoft} radius={2}>
                <LabelList dataKey="low" position="right" fontSize={10} formatter={(v: number) => compact(v, "en")} />
              </Bar>
              <Bar dataKey="high" name={ar ? `رفع المتغير ${s.pct * 100}%` : `Driver +${s.pct * 100}%`} fill={COLORS.purple} radius={2}>
                <LabelList dataKey="high" position="right" fontSize={10} formatter={(v: number) => compact(v, "en")} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>
      {sp && (
        <Panel title={ar ? "كيف تُبنى السيناريوهات" : "How the scenarios are built"}>
          <div className="thin-scrollbar overflow-x-auto">
            <table className="w-full min-w-[620px] text-[13px]">
              <thead><tr className="border-b border-[#e1e7ef] text-ink-600">
                <th className="px-2 py-2 text-start" />
                {SC.map((k) => <th key={k} className="px-2 py-2 text-start font-semibold">{t(`sc_${k}` as "sc_base")}</th>)}
              </tr></thead>
              <tbody>
                {([["trials_volume", "عدد المحاضرات المجانية", "Free trial lectures"], ["conversion", "التحويل إلى اشتراك", "Conversion"], ["cpl", "تكلفة العميل المحتمل", "Cost per lead"], ["renewal", "التجديد", "Renewal"], ["growth_volume", "حجم الشراكات المؤسسية", "Partnerships volume"], ["price", "السعر", "Price"], ["delay_months", "تأخير المنتجات الجديدة (بالأشهر)", "Delay of new products (months)"]] as const).map(([key, a, e]) => (
                  <tr key={key} className="border-b border-[#f0f2f7]">
                    <td className="px-2 py-1.5 text-ink-700">{ar ? a : e}</td>
                    {SC.map((k) => <td key={k} className="ltr-content px-2 py-1.5 font-semibold">{key === "delay_months" ? sp[k][key] : `×${sp[k][key]}`}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
      <Note>{ar ? "تمثل الأعمدة الأطول في الرسم المتغيرات الأكثر تأثيرًا، ويجب التحقق منها بالأرقام الفعلية قبل التوسع. ويمكن للمحلل المالي تعديل مضاعفات كل سيناريو من صفحة الافتراضات." : "The longest bars are the drivers to prove with actual data before scaling. The analyst can change each scenario's multipliers on the Assumptions page."}</Note>
      <ChapterNav id="scenarios" />
    </div>
  );
}
