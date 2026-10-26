import { useState } from "react";
import { useFM } from "../context";
import { monthLabel } from "../i18n";
import { Note, Panel, Segmented } from "../components/ui";
import { Block, ChapterHeader, ChapterNav } from "../components/chapters";
import { Reconciliation } from "../components/Reconciliation";
import { StatementTable } from "../components/StatementTable";
import { balanceLines, cashLines, incomeLines } from "../components/statements";

export default function StatementsPage() {
  const { result: r, t, lang } = useFM();
  const [view, setView] = useState<"annual" | "monthly">("annual");
  const [year, setYear] = useState(1);
  if (!r) return <p className="py-10 text-center text-ink-600">{t("loading")}</p>;
  const ar = lang === "ar";
  const cols = view === "annual" ? r.years : r.months.filter((m) => m.year === year);
  const labels = view === "annual"
    ? r.years.map((y) => `${t("y")}${y.year} (${monthLabel(y.from, lang, true)} – ${monthLabel(y.to, lang, true)})`)
    : cols.map((m) => monthLabel((m as { month: string }).month, lang, true));
  // flows are summed across the selected months; balance-sheet items are period-end values
  const flowTotal = view === "monthly";
  return (
    <div className="space-y-5">
      <ChapterHeader id="statements" />
      <ul className="grid gap-3 md:grid-cols-3">
        {(ar ? [
          ["قائمة الدخل", "توضح الربح أو الخسارة: الإيرادات مطروحًا منها جميع التكاليف."],
          ["التدفقات النقدية", "توضح توقيت دخول النقد وخروجه؛ إذ تُسدَّد الاشتراكات الفردية مقدمًا، والمؤسسية بعد شهرين من الفوترة."],
          ["المركز المالي", "يوضح الأصول والالتزامات وحقوق الملكية في نهاية كل فترة، ويتساوى طرفاه دائمًا."],
        ] : [
          ["Income statement", "Did we make or lose money? Revenue minus all costs."],
          ["Cash flow", "When cash comes in and goes out; individual plans are prepaid, institutional ones are paid two months after billing."],
          ["Balance sheet", "What we own and owe at each period end — both sides must match."],
        ]).map(([h, d]) => (
          <li key={h} className="rounded-xl border border-[#e1e7ef] bg-white p-4"><p className="text-[14.5px] font-bold text-ink-900">{h}</p><p className="mt-1 text-[13.5px] leading-6 text-ink-600">{d}</p></li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-3">
        <Segmented value={view} onChange={setView} options={[{ value: "annual", label: t("annual") }, { value: "monthly", label: t("monthly") }]} />
        {view === "monthly" && (
          <Segmented value={String(year)} onChange={(v) => setYear(Number(v))}
            options={r.years.map((y) => ({ value: String(y.year), label: `${t("y")}${y.year}` }))} />
        )}
        <span className="text-[12.5px] text-ink-600">{ar ? "المبالغ بالريال السعودي، والقيم السالبة بين قوسين. تبدأ سنة النموذج في أكتوبر." : "SAR — negatives in brackets. Model years start in October."}</span>
      </div>
      <Panel title={t("income_statement")}>
        <StatementTable lines={incomeLines(r)} cols={cols} labels={labels} totalCol={flowTotal} />
      </Panel>
      <Panel title={t("cash_flow")}>
        <StatementTable lines={cashLines} cols={cols} labels={labels} totalCol={flowTotal} />
      </Panel>
      <Panel title={t("balance_sheet")} subtitle={ar ? "في نهاية كل فترة" : "At the end of each period"}>
        <StatementTable lines={balanceLines} cols={cols} labels={labels} />
      </Panel>
      <Block n="6.1" title={ar ? "مطابقة قائمة الدخل مع التدفقات النقدية" : "Reconciling the income statement with cash flow"}
        lede={ar
          ? "لا يُشترط أن يتساوى الإيراد مع المتحصلات، ولا الربح مع النقد؛ لأن الإيراد يُسجَّل دون ضريبة القيمة المضافة بينما يُحصَّل النقد شاملًا لها، ولأن الجهات المؤسسية تُسدِّد بعد شهرين من الفوترة. يوضح الجدولان الفروقات بندًا بندًا، ويتطابق ناتجهما مع قائمة التدفقات النقدية بالريال."
          : "Revenue need not equal cash collected, nor profit equal cash: revenue excludes VAT while cash includes it, and institutions pay two months after billing. The two tables bridge the difference line by line and land exactly on the cash-flow statement."}>
        <Reconciliation />
      </Block>
      <Note>
        {ar
          ? "يُحتسب الإيراد على أساس الاشتراكات المدفوعة في الفترة، وتُحمَّل أجور محاضراتها في الفترة نفسها. تُسدِّد الجهات المؤسسية بعد شهرين من الفوترة فتظهر كذمم مدينة، ويُدفع للمعلم عن كل محاضرة محجوزة حتى عند غياب الطالب."
          : "Revenue is the subscriptions paid in the period, with the cost of their lectures charged in the same period. Institutions pay two months after billing (receivables); teachers are paid for every booked lecture, even if the student is absent."}
      </Note>
      <ChapterNav id="statements" />
    </div>
  );
}
