import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, LabelList, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useFM } from "../context";
import { fmApi, type Scenario } from "../api";
import { COLORS, compact, iso, money, monthLabel, pct } from "../i18n";
import { CARD, ChartTooltip, Note, Panel, useMoney } from "../components/ui";
import { Reveal } from "@/components/motion";
import clsx from "clsx";
import { Block, ChapterHeader, ChapterNav } from "../components/chapters";

const SC_ALL: Scenario[] = ["conservative", "base", "optimistic"];
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
  const SC = SC_ALL.filter((k) => k in s.scenarios);
  const years = s.scenarios.base.revenue_by_year.map((_, i) => ({
    name: `${t("y")}${i + 1}`,
    ...Object.fromEntries(SC.map((k) => [`rev_${k}`, Math.round(s.scenarios[k].revenue_by_year[i])])),
    ...Object.fromEntries(SC.map((k) => [`ebitda_${k}`, Math.round(s.scenarios[k].ebitda_by_year[i])])),
  }));
  const base = s.base.ebitda_y5;
  const fv = (v: number, u?: string) => (u === "pct" ? pct(v, 1) : u === "sar" ? (ar ? `${money(v)} ر.س` : `SAR ${money(v)}`) : money(v));
  const perTxt = (p?: string | null) => (p === "per_month" ? (ar ? " شهريًا" : "/mo") : p === "per_year" ? (ar ? " سنويًا" : "/yr") : "");
  const tornado = s.drivers.map((d) => {
    const lowE = Math.round(d.low.ebitda_y5), highE = Math.round(d.high.ebitda_y5);
    const v = d.value;
    const valTxt = v === undefined ? "" : `${fv(v, d.unit)}${perTxt(d.per)}`;
    const lowV = v === undefined ? "" : fv(v * (1 - s.pct), d.unit), highV = v === undefined ? "" : fv(v * (1 + s.pct), d.unit);
    return { name: nm(d), valTxt, lowV, highV, lowE, highE, low: [Math.round(base), lowE] as [number, number], high: [Math.round(base), highE] as [number, number],
      dLow: lowE - Math.round(base), dHigh: highE - Math.round(base) };
  });
  type TRow = (typeof tornado)[number];
  const minX = Math.min(...tornado.map((x) => Math.min(x.lowE, x.highE)), base), maxX = Math.max(...tornado.map((x) => Math.max(x.lowE, x.highE)), base);
  const pad = (maxX - minX) * 0.12;
  const DriverTick = ({ x, y, payload }: { x: number; y: number; payload: { value: string; index: number } }) => {
    const row = tornado[payload.index];
    return (
      <g transform={`translate(${x},${y})`}>
        <text x={-8} y={-3} textAnchor="end" fontSize={12} fontWeight={600} fill="#1d2035" direction={ar ? "rtl" : "ltr"}>{row.name}</text>
        {row.valTxt && <text x={-8} y={13} textAnchor="end" fontSize={11} fill="#6b7290" direction={ar ? "rtl" : "ltr"}>{ar ? `في الخطة: ${iso(row.valTxt)}` : `Plan: ${row.valTxt}`}</text>}
      </g>
    );
  };
  const TornadoTip = ({ active, payload }: { active?: boolean; payload?: { payload: TRow }[] }) => {
    if (!active || !payload?.length) return null;
    const r = payload[0].payload;
    const sign = (v: number) => `${v > 0 ? "+" : ""}${money(v, { parens: false })}`;
    return (
      <div dir={ar ? "rtl" : "ltr"} className="rounded-lg border border-[#e1e7ef] bg-white px-3 py-2 text-[12.5px] shadow-md">
        <p className="font-bold text-ink-900">{r.name}</p>
        {r.valTxt && <p className="text-ink-600">{ar ? "القيمة في الخطة" : "Plan value"}: <span className="ltr-content">{r.valTxt}</span></p>}
        <p className="mt-1 text-ink-700">{ar ? `خفض ${s.pct * 100}%` : `−${s.pct * 100}%`}{r.lowV && <span className="ltr-content"> ({r.lowV})</span>} ← EBITDA <span className="ltr-content font-semibold">{money(r.lowE)}</span> <span className="ltr-content text-ink-500">({sign(r.dLow)})</span></p>
        <p className="text-ink-700">{ar ? `رفع ${s.pct * 100}%` : `+${s.pct * 100}%`}{r.highV && <span className="ltr-content"> ({r.highV})</span>} ← EBITDA <span className="ltr-content font-semibold">{money(r.highE)}</span> <span className="ltr-content text-ink-500">({sign(r.dHigh)})</span></p>
      </div>
    );
  };
  const sp = result?.resolved_assumptions?.scenarios;

  return (
    <div className="space-y-5">
      {head}
      <Block n="8.2" title={SC.length === 3 ? (ar ? "ثلاثة سيناريوهات" : "Three scenarios") : (ar ? "السيناريوهات" : "Scenarios")}
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
        <Panel title={ar ? "الإيرادات حسب السيناريو" : "Revenue by scenario"}>
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
        <Panel title={ar ? "EBITDA حسب السيناريو" : "EBITDA by scenario"} delay={80}>
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
        <div className="h-[600px]" dir="ltr">
          <ResponsiveContainer>
            <BarChart data={tornado} layout="vertical" barCategoryGap="20%" barGap={2} margin={{ top: 22, right: 64, left: 8, bottom: 0 }}>
              <CartesianGrid horizontal={false} stroke={COLORS.grid} />
              <XAxis type="number" domain={[Math.floor(minX - pad), Math.ceil(maxX + pad)]} tickFormatter={(v) => compact(v, "en")} tickLine={false} axisLine={false} fontSize={12} />
              <YAxis type="category" dataKey="name" width={ar ? 230 : 210} tickLine={false} axisLine={false} tick={DriverTick as never} interval={0} />
              <ReferenceLine x={Math.round(base)} stroke="#1d2035" strokeWidth={1.5}
                label={{ value: ar ? `EBITDA الخطة ${iso(compact(base, "en"))}` : `Plan EBITDA ${compact(base, "en")}`, position: "top", fontSize: 11.5, fontWeight: 700, fill: "#1d2035" }} />
              <Tooltip content={<TornadoTip />} cursor={{ fill: "#f4f1ff" }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="low" name={ar ? `خفض المتغير ${s.pct * 100}%` : `Driver −${s.pct * 100}%`} fill={COLORS.purpleSoft} radius={2}>
                <LabelList dataKey="lowE" position="right" fontSize={10.5} formatter={(v: number) => compact(v, "en")} />
              </Bar>
              <Bar dataKey="high" name={ar ? `رفع المتغير ${s.pct * 100}%` : `Driver +${s.pct * 100}%`} fill={COLORS.purple} radius={2}>
                <LabelList dataKey="highE" position="right" fontSize={10.5} formatter={(v: number) => compact(v, "en")} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-2 text-[12.5px] leading-6 text-ink-600">{ar
          ? `كل عمود يبدأ من EBITDA الخطة (${big(base)}) وينتهي عند الرقم الناتج بعد تغيير المتغير ${s.pct * 100}% مع ثبات باقي الافتراضات. القيمة تحت اسم كل متغير هي قيمته الحالية في الخطة (للبنود السنوية: السنة الخامسة).`
          : `Each bar starts at plan EBITDA (${big(base)}) and ends at the result after moving the driver ${s.pct * 100}% with everything else unchanged. The value under each driver is its current plan value (year 5 where it changes by year).`}</p>
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
