import { useState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { useBalanceSheet } from "@/modules/finance/hooks/useAccounting";
import { DateRange, Money, ReportHeader, downloadCsv, td } from "@/modules/finance/accounting/shared";
import type { BalanceRow, BalanceSheet } from "@/modules/finance/services/accountingApi";

function Block({ title, rows, total, totalLabel, extra }: { title: string; rows: BalanceRow[]; total: string; totalLabel: string; extra?: { label: string; amount: string } }) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-ink-100 bg-ink-50/70 px-4 py-3 text-[15px] font-bold text-ink-900">{title}</div>
      <table className="w-full text-sm">
        <tbody className="divide-y divide-ink-100">
          {rows.map((r) => (
            <tr key={r.code} className={r.is_header ? "bg-ink-50/40" : ""}>
              <td className={`${td} ${r.is_header ? "font-semibold text-ink-900" : "text-ink-800"}`} style={{ paddingRight: `${16 + r.level * 16}px` }}>
                <span className="ltr-content ml-2 text-xs font-semibold text-ink-400">{r.code}</span>
                {r.name}
              </td>
              <td className={`${td} text-left`}>
                <Money v={r.amount} bold={r.is_header} />
              </td>
            </tr>
          ))}
          {extra && (
            <tr>
              <td className={`${td} text-ink-800`} style={{ paddingRight: 16 }}>
                {extra.label}
              </td>
              <td className={`${td} text-left`}>
                <Money v={extra.amount} />
              </td>
            </tr>
          )}
          {rows.length === 0 && !extra && (
            <tr>
              <td className={`${td} text-ink-400`} colSpan={2}>
                لا يوجد
              </td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-ink-200 bg-ink-50">
            <td className={`${td} font-semibold text-ink-700`}>{totalLabel}</td>
            <td className={`${td} text-left`}>
              <Money v={total} bold />
            </td>
          </tr>
        </tfoot>
      </table>
    </Card>
  );
}

export function BalanceSheetPage() {
  const [asOf, setAsOf] = useState("");
  const { data, isLoading } = useBalanceSheet({ as_of: asOf || undefined });

  function exportCsv(d: BalanceSheet) {
    downloadCsv("balance-sheet.csv", ["الكود", "البند", "المبلغ"], [
      ["", "الأصول", ""],
      ...d.assets.map((r) => [r.code, r.name, r.amount]),
      ["", "إجمالي الأصول", d.total_assets],
      ["", "الخصوم", ""],
      ...d.liabilities.map((r) => [r.code, r.name, r.amount]),
      ["", "إجمالي الخصوم", d.total_liabilities],
      ["", "حقوق الملكية", ""],
      ...d.equity.map((r) => [r.code, r.name, r.amount]),
      ["", "صافي الربح (الخسارة) المتراكم", d.retained_earnings],
      ["", "إجمالي حقوق الملكية", d.total_equity],
      ["", "إجمالي الخصوم وحقوق الملكية", d.total_liabilities_equity],
    ]);
  }

  return (
    <div>
      <ReportHeader title="المركز المالي (الميزانية)" subtitle="الأصول = الخصوم + حقوق الملكية" onExport={data ? () => exportCsv(data) : undefined} />
      <DateRange single from="" to={asOf} onFrom={() => {}} onTo={setAsOf} />
      {isLoading || !data ? (
        <p className="py-8 text-sm text-ink-500">جارٍ التحميل…</p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Block title="الأصول" rows={data.assets} total={data.total_assets} totalLabel="إجمالي الأصول" />
            <div className="space-y-4">
              <Block title="الخصوم" rows={data.liabilities} total={data.total_liabilities} totalLabel="إجمالي الخصوم" />
              <Block
                title="حقوق الملكية"
                rows={data.equity}
                total={data.total_equity}
                totalLabel="إجمالي حقوق الملكية"
                extra={{ label: "صافي الربح (الخسارة) المتراكم", amount: data.retained_earnings }}
              />
              <div className="flex items-center justify-between rounded-xl bg-ink-50 px-4 py-3 text-sm">
                <span className="font-semibold text-ink-700">إجمالي الخصوم وحقوق الملكية</span>
                <Money v={data.total_liabilities_equity} bold />
              </div>
            </div>
          </div>
          <p className={`mt-4 flex items-center gap-2 text-sm font-medium ${data.balanced ? "text-brand-700" : "text-danger-600"}`}>
            {data.balanced ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            {data.balanced ? "الميزانية متوازنة" : "الميزانية غير متوازنة — راجع القيود"}
          </p>
        </>
      )}
    </div>
  );
}
