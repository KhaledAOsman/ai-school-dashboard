import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { useIncomeStatement } from "@/modules/finance/hooks/useAccounting";
import { DateRange, Money, ReportHeader, downloadCsv, monthHeader, td, th } from "@/modules/finance/accounting/shared";
import type { IncomeStatement, StatementRow } from "@/modules/finance/services/accountingApi";

function Section({ title, rows, months }: { title: string; rows: StatementRow[]; months: string[] }) {
  return (
    <>
      <tr className="bg-ink-50">
        <td className={`${td} font-bold text-ink-900`} colSpan={months.length + 3}>
          {title}
        </td>
      </tr>
      {rows.map((r) => (
        <tr key={r.code} className={r.level === 0 ? "bg-ink-50/40" : "hover:bg-ink-50/60"}>
          <td className={`${td} ltr-content text-xs font-semibold text-ink-500`}>{r.code}</td>
          <td className={`${td} ${r.is_header ? "font-semibold text-ink-900" : "text-ink-800"}`} style={{ paddingRight: `${16 + r.level * 18}px` }}>
            {r.name}
          </td>
          {months.map((m) => (
            <td key={m} className={`${td} text-left`}>
              <Money v={r.months[m]} dash bold={r.level === 0} />
            </td>
          ))}
          <td className={`${td} text-left`}>
            <Money v={r.total} bold={r.level === 0} />
          </td>
        </tr>
      ))}
    </>
  );
}

function TotalRow({ label, byMonth, total, months }: { label: string; byMonth: Record<string, string>; total: string; months: string[] }) {
  return (
    <tr className="border-t-2 border-ink-200 bg-ink-50">
      <td className={`${td} font-semibold text-ink-700`} colSpan={2}>
        {label}
      </td>
      {months.map((m) => (
        <td key={m} className={`${td} text-left`}>
          <Money v={byMonth[m]} bold />
        </td>
      ))}
      <td className={`${td} text-left`}>
        <Money v={total} bold />
      </td>
    </tr>
  );
}

export function IncomeStatementPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const { data, isLoading } = useIncomeStatement({ date_from: from || undefined, date_to: to || undefined });

  function exportCsv(d: IncomeStatement) {
    const head = ["الكود", "البند", ...d.months.map(monthHeader), "الإجمالي"];
    const line = (r: StatementRow) => [r.code, r.name, ...d.months.map((m) => r.months[m]), r.total];
    downloadCsv("income-statement.csv", head, [
      ["", "الإيرادات", ...d.months.map(() => ""), ""],
      ...d.revenue.map(line),
      ["", "إجمالي الإيرادات", ...d.months.map((m) => d.revenue_by_month[m]), d.total_revenue],
      ["", "المصروفات", ...d.months.map(() => ""), ""],
      ...d.expenses.map(line),
      ["", "إجمالي المصروفات", ...d.months.map((m) => d.expenses_by_month[m]), d.total_expenses],
      ["", "صافي الربح (الخسارة)", ...d.months.map((m) => d.net_by_month[m]), d.net_income],
    ]);
  }

  return (
    <div>
      <ReportHeader title="قائمة الدخل" subtitle="الإيرادات والمصروفات بالشهر اللي تخصه (أساس الاستحقاق)" onExport={data ? () => exportCsv(data) : undefined} />
      <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />
      <Card className="overflow-hidden p-0">
        {isLoading || !data ? (
          <p className="p-6 text-sm text-ink-500">جارٍ التحميل…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: 360 + data.months.length * 110 }}>
              <thead className="bg-ink-50/70">
                <tr>
                  <th className={th}>الكود</th>
                  <th className={th}>البند</th>
                  {data.months.map((m) => (
                    <th key={m} className={`${th} !text-left`}>
                      {monthHeader(m)}
                    </th>
                  ))}
                  <th className={`${th} !text-left`}>الإجمالي</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                <Section title="الإيرادات" rows={data.revenue} months={data.months} />
                <TotalRow label="إجمالي الإيرادات" byMonth={data.revenue_by_month} total={data.total_revenue} months={data.months} />
                <Section title="المصروفات" rows={data.expenses} months={data.months} />
                <TotalRow label="إجمالي المصروفات" byMonth={data.expenses_by_month} total={data.total_expenses} months={data.months} />
                <TotalRow label="صافي الربح (الخسارة)" byMonth={data.net_by_month} total={data.net_income} months={data.months} />
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="mt-3 text-xs text-ink-500">الأرقام بين أقواس = سالب. الراتب بيظهر في الشهر اللي يخصه مش شهر التحويل.</p>
    </div>
  );
}
