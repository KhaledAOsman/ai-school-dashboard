import { useState } from "react";
import { CheckCircle2, AlertCircle } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { useTrialBalance } from "@/modules/finance/hooks/useAccounting";
import { DateRange, Money, ReportHeader, downloadCsv, td, th } from "@/modules/finance/accounting/shared";

export function TrialBalancePage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const { data, isLoading } = useTrialBalance({ date_from: from || undefined, date_to: to || undefined });

  function exportCsv() {
    if (!data) return;
    downloadCsv(
      "trial-balance.csv",
      ["الكود", "الحساب", "النوع", "حركة مدينة", "حركة دائنة", "رصيد مدين", "رصيد دائن"],
      [
        ...data.rows.map((r) => [r.code, r.name, r.type_label, r.debit, r.credit, r.balance_debit, r.balance_credit]),
        ["", "الإجمالي", "", data.total_debit, data.total_credit, data.total_balance_debit, data.total_balance_credit],
      ]
    );
  }

  return (
    <div>
      <ReportHeader title="ميزان المراجعة" subtitle="حركة وأرصدة كل الحسابات — لازم إجمالي المدين يساوي إجمالي الدائن" onExport={exportCsv} />
      <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />
      <Card className="overflow-hidden p-0">
        {isLoading || !data ? (
          <p className="p-6 text-sm text-ink-500">جارٍ التحميل…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-ink-50/70">
                <tr>
                  <th className={th}>الكود</th>
                  <th className={th}>الحساب</th>
                  <th className={`${th} !text-left`}>حركة مدينة</th>
                  <th className={`${th} !text-left`}>حركة دائنة</th>
                  <th className={`${th} !text-left`}>رصيد مدين</th>
                  <th className={`${th} !text-left`}>رصيد دائن</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {data.rows.map((r) => (
                  <tr key={r.code} className={r.is_header ? "bg-ink-50/50" : "hover:bg-ink-50/60"}>
                    <td className={`${td} ltr-content text-xs font-semibold text-ink-500`}>{r.code}</td>
                    <td className={`${td} ${r.is_header ? "font-semibold text-ink-900" : "text-ink-800"}`} style={{ paddingRight: `${16 + r.level * 18}px` }}>
                      {r.name}
                    </td>
                    <td className={`${td} text-left`}><Money v={r.debit} dash /></td>
                    <td className={`${td} text-left`}><Money v={r.credit} dash /></td>
                    <td className={`${td} text-left`}>
                      <Money v={r.is_header ? r.rollup_balance_debit : r.balance_debit} dash bold={r.is_header} />
                    </td>
                    <td className={`${td} text-left`}>
                      <Money v={r.is_header ? r.rollup_balance_credit : r.balance_credit} dash bold={r.is_header} />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-ink-200 bg-ink-50">
                  <td className={`${td} font-semibold text-ink-700`} colSpan={2}>
                    الإجمالي
                  </td>
                  <td className={`${td} text-left`}><Money v={data.total_debit} bold /></td>
                  <td className={`${td} text-left`}><Money v={data.total_credit} bold /></td>
                  <td className={`${td} text-left`}><Money v={data.total_balance_debit} bold /></td>
                  <td className={`${td} text-left`}><Money v={data.total_balance_credit} bold /></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>
      {data && (
        <p className={`mt-3 flex items-center gap-2 text-sm font-medium ${data.balanced ? "text-brand-700" : "text-danger-600"}`}>
          {data.balanced ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          {data.balanced ? "الميزان متوازن" : "الميزان غير متوازن — راجع القيود"}
        </p>
      )}
      <p className="mt-1 text-xs text-ink-500">الحسابات التجميعية (بخط عريض) بتعرض مجموع الحسابات اللي تحتها؛ الإجمالي السفلي محسوب من الحسابات الفرعية فقط عشان ما يتكررش.</p>
    </div>
  );
}
