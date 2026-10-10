import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Card } from "@/components/ui/Card";
import { Select } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { BookText } from "lucide-react";
import { useAccountingAccounts, useLedger } from "@/modules/finance/hooks/useAccounting";
import { DateRange, Money, ReportHeader, downloadCsv, td, th } from "@/modules/finance/accounting/shared";

export function LedgerPage() {
  const [sp, setSp] = useSearchParams();
  const [code, setCode] = useState(sp.get("account") ?? "1110");
  const [party, setParty] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const { data: accounts } = useAccountingAccounts();
  const { data, isLoading } = useLedger(code, { date_from: from || undefined, date_to: to || undefined, party: party || undefined });

  useEffect(() => {
    setParty("");
  }, [code]);

  function exportCsv() {
    if (!data) return;
    downloadCsv(
      `ledger-${code}.csv`,
      ["التاريخ", "رقم القيد", "الحساب", "البيان", "الطرف", "مدين", "دائن", "الرصيد"],
      [
        ["", "", "", "رصيد افتتاحي", "", "", "", data.opening],
        ...data.rows.map((r) => [r.date, r.ref, `${r.account} ${r.account_name}`, r.memo, r.party, r.debit, r.credit, r.balance]),
        ["", "", "", "الإجمالي / الرصيد الختامي", "", data.total_debit, data.total_credit, data.closing],
      ]
    );
  }

  const showAccountCol = data ? data.rows.some((r) => r.account !== data.account.code) : false;

  return (
    <div>
      <ReportHeader title="دفتر الأستاذ" subtitle={data ? `${data.account.code} · ${data.account.name}` : undefined} onExport={exportCsv} />
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 print:hidden">
        <Select
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setSp({ account: e.target.value });
          }}
          className="!py-2.5"
        >
          {(accounts ?? []).map((a) => (
            <option key={a.code} value={a.code}>
              {"  ".repeat(a.level)}
              {a.code} · {a.name}
            </option>
          ))}
        </Select>
        <Select value={party} onChange={(e) => setParty(e.target.value)} className="!py-2.5" disabled={!data || data.parties.length === 0}>
          <option value="">{data && data.parties.length ? "كل الأطراف (رصيد كل طرف)" : "لا توجد أرصدة أطراف"}</option>
          {(data?.parties ?? []).map((p) => (
            <option key={p.party} value={p.party}>
              {p.party} — {Number(p.balance).toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </option>
          ))}
        </Select>
      </div>
      <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />

      <Card className="overflow-hidden p-0">
        {isLoading || !data ? (
          <p className="p-6 text-sm text-ink-500">جارٍ التحميل…</p>
        ) : data.rows.length === 0 && Number(data.opening) === 0 ? (
          <EmptyState icon={BookText} title="لا توجد حركات على هذا الحساب" description="غيّر الحساب أو الفترة" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-ink-50/70">
                <tr>
                  <th className={th}>التاريخ</th>
                  <th className={th}>رقم القيد</th>
                  {showAccountCol && <th className={th}>الحساب</th>}
                  <th className={th}>البيان</th>
                  <th className={th}>الطرف</th>
                  <th className={`${th} !text-left`}>مدين</th>
                  <th className={`${th} !text-left`}>دائن</th>
                  <th className={`${th} !text-left`}>الرصيد</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                <tr className="bg-ink-50/40">
                  <td className={`${td} font-semibold text-ink-700`} colSpan={showAccountCol ? 7 : 6}>
                    رصيد افتتاحي
                  </td>
                  <td className={`${td} text-left`}>
                    <Money v={data.opening} bold />
                  </td>
                </tr>
                {data.rows.map((r, i) => (
                  <tr key={i} className="hover:bg-ink-50/60">
                    <td className={`${td} ltr-content whitespace-nowrap text-ink-600`}>{r.date}</td>
                    <td className={`${td} ltr-content whitespace-nowrap text-xs font-semibold text-ink-500`}>{r.ref}</td>
                    {showAccountCol && (
                      <td className={`${td} whitespace-nowrap text-ink-700`}>
                        <span className="ltr-content ml-1.5 text-xs text-ink-400">{r.account}</span>
                        {r.account_name}
                      </td>
                    )}
                    <td className={`${td} text-ink-900`}>{r.memo}</td>
                    <td className={`${td} text-ink-600`}>{r.party ?? "—"}</td>
                    <td className={`${td} text-left`}><Money v={r.debit} dash /></td>
                    <td className={`${td} text-left`}><Money v={r.credit} dash /></td>
                    <td className={`${td} text-left`}><Money v={r.balance} /></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-ink-200 bg-ink-50">
                  <td className={`${td} font-semibold text-ink-700`} colSpan={showAccountCol ? 5 : 4}>
                    الإجمالي والرصيد الختامي
                  </td>
                  <td className={`${td} text-left`}><Money v={data.total_debit} bold /></td>
                  <td className={`${td} text-left`}><Money v={data.total_credit} bold /></td>
                  <td className={`${td} text-left`}><Money v={data.closing} bold /></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>
      <p className="mt-3 text-xs text-ink-500">الرصيد بيتحسب في اتجاه الحساب الطبيعي ({data?.account.normal_side === "credit" ? "دائن" : "مدين"}).</p>
    </div>
  );
}
