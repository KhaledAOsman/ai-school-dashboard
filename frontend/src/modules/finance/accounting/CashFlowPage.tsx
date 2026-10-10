import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { useCashFlow } from "@/modules/finance/hooks/useAccounting";
import { DateRange, Money, ReportHeader, downloadCsv, monthHeader, td, th } from "@/modules/finance/accounting/shared";
import type { CashFlow, CashFlowRow } from "@/modules/finance/services/accountingApi";

export function CashFlowPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const { data, isLoading } = useCashFlow({ date_from: from || undefined, date_to: to || undefined });

  function exportCsv(d: CashFlow) {
    const row = (label: string, byMonth: Record<string, string>, total: string) => [label, ...d.months.map((m) => byMonth[m]), total];
    const r = (x: CashFlowRow) => row(x.label, x.months, x.total);
    downloadCsv("cash-flow.csv", ["البند", ...d.months.map(monthHeader), "الإجمالي"], [
      row("رصيد أول المدة", d.opening_by_month, d.opening),
      ["التدفقات التشغيلية", ...d.months.map(() => ""), ""],
      ...d.operating_in.map(r),
      ...d.operating_out.map(r),
      row("صافي التشغيل", d.net_operating, String(Object.values(d.net_operating).reduce((s, v) => s + Number(v), 0).toFixed(2))),
      ["التدفقات التمويلية", ...d.months.map(() => ""), ""],
      ...d.financing.map(r),
      row("صافي التغير في النقدية", d.net_change, d.total_net_change),
      row("رصيد آخر المدة", d.closing_by_month, d.closing),
    ]);
  }

  const sum = (rec: Record<string, string>) => Object.values(rec).reduce((s, v) => s + Number(v), 0);

  return (
    <div>
      <ReportHeader title="التدفقات النقدية" subtitle="حركة حساب التشغيل 1110 بالشهر — بتاريخ الدفع الفعلي" onExport={data ? () => exportCsv(data) : undefined} />
      <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />
      <Card className="overflow-hidden p-0">
        {isLoading || !data ? (
          <p className="p-6 text-sm text-ink-500">جارٍ التحميل…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: 300 + data.months.length * 110 }}>
              <thead className="bg-ink-50/70">
                <tr>
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
                <Tr label="رصيد أول المدة" byMonth={data.opening_by_month} total={data.opening} months={data.months} strong />
                <Head text="التدفقات التشغيلية" span={data.months.length + 2} />
                {data.operating_in.map((x) => (
                  <Tr key={x.key} label={x.label} byMonth={x.months} total={x.total} months={data.months} />
                ))}
                {data.operating_out.map((x) => (
                  <Tr key={x.key} label={x.label} byMonth={x.months} total={x.total} months={data.months} />
                ))}
                <Tr label="صافي التشغيل" byMonth={data.net_operating} total={String(sum(data.net_operating))} months={data.months} strong />
                <Head text="التدفقات التمويلية" span={data.months.length + 2} />
                {data.financing.map((x) => (
                  <Tr key={x.key} label={x.label} byMonth={x.months} total={x.total} months={data.months} />
                ))}
                <Tr label="صافي التغير في النقدية" byMonth={data.net_change} total={data.total_net_change} months={data.months} strong />
                <Tr label="رصيد آخر المدة" byMonth={data.closing_by_month} total={data.closing} months={data.months} strong total2 />
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function Head({ text, span }: { text: string; span: number }) {
  return (
    <tr className="bg-ink-50">
      <td className={`${td} font-bold text-ink-900`} colSpan={span}>
        {text}
      </td>
    </tr>
  );
}

function Tr({ label, byMonth, total, months, strong, total2 }: { label: string; byMonth: Record<string, string>; total: string; months: string[]; strong?: boolean; total2?: boolean }) {
  return (
    <tr className={strong ? `bg-ink-50/50 ${total2 ? "border-t-2 border-ink-200" : ""}` : "hover:bg-ink-50/60"}>
      <td className={`${td} ${strong ? "font-semibold text-ink-900" : "pr-8 text-ink-800"}`}>{label}</td>
      {months.map((m) => (
        <td key={m} className={`${td} text-left`}>
          <Money v={byMonth[m]} dash bold={strong} />
        </td>
      ))}
      <td className={`${td} text-left`}>
        <Money v={total} bold={strong} />
      </td>
    </tr>
  );
}
