import { useState } from "react";
import { useFM } from "../context";
import { monthLabel } from "../i18n";
import { Note, Panel, Segmented } from "../components/ui";
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
      <div className="flex flex-wrap items-center gap-3">
        <Segmented value={view} onChange={setView} options={[{ value: "annual", label: t("annual") }, { value: "monthly", label: t("monthly") }]} />
        {view === "monthly" && (
          <Segmented value={String(year)} onChange={(v) => setYear(Number(v))}
            options={r.years.map((y) => ({ value: String(y.year), label: `${t("y")}${y.year}` }))} />
        )}
        <span className="text-[12.5px] text-ink-600">{ar ? "المبالغ بالريال السعودي — السالب بين قوسين. السنة المالية للنموذج تبدأ أكتوبر." : "SAR — negatives in brackets. Model years start in October."}</span>
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
      <Note>
        {ar
          ? "الإيراد يُعترف به مع تقديم الحصص (الاشتراك المدفوع مقدمًا يظهر كإيراد مقدم حتى تُقدَّم حصصه). المدارس تدفع بعد شهرين (مستحقات). المعلم يُدفع له عن كل حصة محجوزة حتى لو الطالب غاب."
          : "Revenue is recognised as lessons are delivered (prepaid subscriptions sit in deferred revenue until taught). Schools pay two months after billing (receivables). Teachers are paid for every booked lesson, even if the student misses it."}
      </Note>
    </div>
  );
}
