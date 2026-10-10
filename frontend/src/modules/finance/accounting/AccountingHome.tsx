import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { useBalanceSheet, useIncomeStatement } from "@/modules/finance/hooks/useAccounting";
import { Money, td, th } from "@/modules/finance/accounting/shared";
import { periodLabel, sharesTo100 } from "@/modules/finance/utils";

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="p-5">
      <p className="text-[14px] font-medium text-ink-500">{label}</p>
      <p className="mt-2 text-[22px] font-bold tracking-tight">
        <Money v={value} bold className="!text-[22px]" />
      </p>
      {hint && <p className="mt-1 text-xs text-ink-500">{hint}</p>}
    </Card>
  );
}

/** Management summary: position today, results month by month, and where the money went. */
export function AccountingHome() {
  const { data: bs } = useBalanceSheet({});
  const { data: is } = useIncomeStatement({});

  const findAsset = (code: string) => {
    const walk = (rows: { code: string; amount: string }[]) => rows.find((a) => a.code === code)?.amount;
    return walk(bs?.assets ?? []) ?? "0";
  };
  const months = is?.months ?? [];
  const groups = (is?.expenses ?? []).filter((r) => r.level === 0);
  const shares = sharesTo100(groups.map((g) => Number(g.total)));

  return (
    <div className="space-y-6">
      <p className="-mt-2 text-xs text-ink-400">المبالغ بالريال السعودي</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi label="النقدية في البنك" value={findAsset("1110")} />
        <Kpi label="عند بوابات الدفع" value={findAsset("1200")} hint="اشتراكات مدفوعة لسه متحوّلتش" />
        <Kpi label="الإيرادات" value={is?.total_revenue ?? "0"} />
        <Kpi label="المصروفات" value={is?.total_expenses ?? "0"} />
        <Kpi label="صافي النتيجة" value={is?.net_income ?? "0"} />
      </div>

      <Card className="overflow-hidden p-0">
        <div className="px-5 pb-2 pt-5">
          <CardTitle>النتيجة شهر بشهر</CardTitle>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-ink-50/70">
              <tr>
                <th className={th}>الشهر</th>
                <th className={`${th} !text-left`}>الإيرادات</th>
                <th className={`${th} !text-left`}>المصروفات</th>
                <th className={`${th} !text-left`}>صافي النتيجة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {months.map((m) => (
                <tr key={m}>
                  <td className={`${td} text-ink-700`}>{periodLabel(m)}</td>
                  <td className={`${td} text-left`}><Money v={is?.revenue_by_month[m]} dash /></td>
                  <td className={`${td} text-left`}><Money v={is?.expenses_by_month[m]} dash /></td>
                  <td className={`${td} text-left`}><Money v={is?.net_by_month[m]} bold /></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-ink-200 bg-ink-50">
                <td className={`${td} font-semibold text-ink-700`}>الإجمالي</td>
                <td className={`${td} text-left`}><Money v={is?.total_revenue} bold /></td>
                <td className={`${td} text-left`}><Money v={is?.total_expenses} bold /></td>
                <td className={`${td} text-left`}><Money v={is?.net_income} bold /></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>المصروفات حسب الحساب</CardTitle>
        </CardHeader>
        <div className="divide-y divide-ink-100">
          {groups.map((g, i) => {
            const pct = shares[i];
            return (
              <div key={g.code} className="flex items-center gap-4 py-3">
                <span className="ltr-content w-12 shrink-0 text-[13px] text-ink-400">{g.code}</span>
                <span className="min-w-0 flex-1 text-[14.5px] text-ink-800">{g.name}</span>
                <div className="hidden h-1.5 w-40 overflow-hidden rounded-full bg-ink-100 sm:block">
                  <div className="h-full rounded-full bg-brand-600" style={{ width: `${pct}%` }} />
                </div>
                <span className="ltr-content w-14 shrink-0 text-left text-[13px] text-ink-500">{pct.toFixed(1)}%</span>
                <span className="w-28 shrink-0 text-left">
                  <Money v={g.total} bold />
                </span>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
