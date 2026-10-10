import { useMemo, useState, type FormEvent } from "react";
import { Ban, Plus, Search, X } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FormField, Input, Select } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { BookOpen } from "lucide-react";
import { usePermission } from "@/permissions/usePermission";
import { PERMISSIONS } from "@/permissions/constants";
import { useAccountingAccounts, useCreateJournal, useJournal, useVoidJournal } from "@/modules/finance/hooks/useAccounting";
import { DateRange, Money, ReportHeader, SOURCE_LABEL, downloadCsv, fmt } from "@/modules/finance/accounting/shared";
import { toCents } from "@/modules/finance/utils";

interface DraftLine {
  account_code: string;
  debit: string;
  credit: string;
  party: string;
}
const emptyLine = (): DraftLine => ({ account_code: "", debit: "", credit: "", party: "" });

function ManualEntryForm({ onClose }: { onClose: () => void }) {
  const { data: accounts } = useAccountingAccounts();
  const create = useCreateJournal();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [memo, setMemo] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([emptyLine(), emptyLine()]);
  const [error, setError] = useState<string | null>(null);

  const postable = (accounts ?? []).filter((a) => a.is_postable && !a.has_children && a.is_active);
  const debit = lines.reduce((s, l) => s + toCents(l.debit || 0), 0);
  const credit = lines.reduce((s, l) => s + toCents(l.credit || 0), 0);
  const balanced = debit === credit && debit > 0;

  function setLine(i: number, patch: Partial<DraftLine>) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await create.mutateAsync({
        entry_date: date,
        memo: memo.trim(),
        lines: lines
          .filter((l) => l.account_code && (toCents(l.debit || 0) > 0 || toCents(l.credit || 0) > 0))
          .map((l) => ({
            account_code: l.account_code,
            debit: l.debit || "0",
            credit: l.credit || "0",
            party: l.party.trim() || null,
          })),
      });
      onClose();
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setError(msg ?? "تعذّر حفظ القيد");
    }
  }

  return (
    <Card className="mb-5 animate-scale-in">
      <CardHeader>
        <CardTitle>قيد يدوي (تسوية / تصحيح)</CardTitle>
      </CardHeader>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[180px_1fr]">
          <FormField label="التاريخ">
            <Input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className="ltr-content" />
          </FormField>
          <FormField label="البيان">
            <Input required value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="مثال: استحقاق رواتب سبتمبر" />
          </FormField>
        </div>
        <div className="space-y-2">
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-2 gap-2 rounded-xl border border-ink-100 p-3 sm:grid-cols-[1fr_130px_130px_160px_32px] sm:border-0 sm:p-0">
              <div className="col-span-2 sm:col-span-1">
                <Select value={l.account_code} onChange={(e) => setLine(i, { account_code: e.target.value })} aria-label="الحساب" className="!py-2.5">
                  <option value="">اختر الحساب…</option>
                  {postable.map((a) => (
                    <option key={a.code} value={a.code}>
                      {a.code} · {a.name}
                    </option>
                  ))}
                </Select>
              </div>
              <Input type="number" step="0.01" min="0" placeholder="مدين" value={l.debit} onChange={(e) => setLine(i, { debit: e.target.value, credit: e.target.value ? "" : l.credit })} className="ltr-content !py-2.5" />
              <Input type="number" step="0.01" min="0" placeholder="دائن" value={l.credit} onChange={(e) => setLine(i, { credit: e.target.value, debit: e.target.value ? "" : l.debit })} className="ltr-content !py-2.5" />
              <div className="col-span-2 sm:col-span-1">
                <Input placeholder="الطرف (اختياري)" value={l.party} onChange={(e) => setLine(i, { party: e.target.value })} className="!py-2.5" />
              </div>
              <button type="button" onClick={() => setLines((ls) => (ls.length > 2 ? ls.filter((_, idx) => idx !== i) : ls))} className="col-span-2 flex items-center justify-center text-ink-400 hover:text-danger-600 sm:col-span-1" aria-label="حذف السطر">
                <X size={16} />
              </button>
            </div>
          ))}
          <button type="button" onClick={() => setLines((ls) => [...ls, emptyLine()])} className="text-sm font-medium text-brand-600 hover:underline">
            + سطر
          </button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-ink-50 px-4 py-3 text-sm">
          <span className="text-ink-600">
            مدين <Money v={debit / 100} bold /> · دائن <Money v={credit / 100} bold />
          </span>
          <span className={balanced ? "font-semibold text-brand-700" : "font-semibold text-danger-600"}>
            {balanced ? "القيد متوازن" : `الفرق ${fmt(Math.abs(debit - credit) / 100)}`}
          </span>
        </div>
        {error && <p className="text-sm font-medium text-danger-600">{error}</p>}
        <div className="flex gap-3">
          <Button type="submit" variant="primary" isLoading={create.isPending} disabled={!balanced || !memo.trim()}>
            حفظ القيد
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function JournalPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [source, setSource] = useState("");
  const [account, setAccount] = useState("");
  const [q, setQ] = useState("");
  const [showForm, setShowForm] = useState(false);
  const canPost = usePermission(PERMISSIONS.FINANCE_EXPENSE_APPROVE);
  const { data: accounts } = useAccountingAccounts();
  const voidEntry = useVoidJournal();

  const params = useMemo(
    () => ({ date_from: from || undefined, date_to: to || undefined, source_type: source || undefined, account: account || undefined, q: q.trim() || undefined, limit: 1000 }),
    [from, to, source, account, q]
  );
  const { data, isLoading } = useJournal(params);
  const entries = data?.entries ?? [];

  function exportCsv() {
    const rows = entries.flatMap((e) =>
      e.lines.map((l) => [e.date, e.ref, SOURCE_LABEL[e.source_type] ?? e.source_type, e.memo, l.account, l.account_name, l.party, l.debit, l.credit])
    );
    downloadCsv("journal.csv", ["التاريخ", "رقم القيد", "المصدر", "البيان", "كود الحساب", "اسم الحساب", "الطرف", "مدين", "دائن"], rows);
  }

  return (
    <div>
      <ReportHeader title="دفتر اليومية" subtitle={`${data?.total ?? 0} قيد — إجمالي المدين ${fmt(data?.total_debit)} = إجمالي الدائن`} onExport={exportCsv}>
        {canPost && !showForm && (
          <Button variant="primary" size="md" onClick={() => setShowForm(true)}>
            <Plus size={16} />
            قيد يدوي
          </Button>
        )}
      </ReportHeader>

      {showForm && <ManualEntryForm onClose={() => setShowForm(false)} />}

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 print:hidden">
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث بالبيان أو الطرف أو رقم القيد" className="!py-2.5 !pr-10" />
        </div>
        <Select value={source} onChange={(e) => setSource(e.target.value)} className="!py-2.5">
          <option value="">كل المصادر</option>
          {Object.entries(SOURCE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
        <Select value={account} onChange={(e) => setAccount(e.target.value)} className="!py-2.5 lg:col-span-2">
          <option value="">كل الحسابات</option>
          {(accounts ?? []).map((a) => (
            <option key={a.code} value={a.code}>
              {"  ".repeat(a.level)}
              {a.code} · {a.name}
            </option>
          ))}
        </Select>
      </div>
      <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />

      {isLoading ? (
        <p className="py-8 text-sm text-ink-500">جارٍ التحميل…</p>
      ) : entries.length === 0 ? (
        <Card>
          <EmptyState icon={BookOpen} title="لا توجد قيود" description="غيّر الفلاتر أو سجّل مصروفًا أو إيرادًا" />
        </Card>
      ) : (
        <div className="space-y-3">
          {entries.map((e) => (
            <Card key={e.ref} className="overflow-hidden p-0">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 bg-ink-50/70 px-4 py-2.5">
                <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <span className="ltr-content font-semibold text-ink-900">{e.date}</span>
                  <span className="ltr-content text-xs font-semibold text-ink-500">{e.ref}</span>
                  <span className="rounded-md bg-white px-2 py-0.5 text-xs font-medium text-ink-600 ring-1 ring-inset ring-ink-150">{SOURCE_LABEL[e.source_type]}</span>
                  <span className="truncate text-ink-700">{e.memo}</span>
                </div>
                {e.source_type === "manual" && canPost && e.source_id && (
                  <button
                    onClick={() => {
                      const reason = window.prompt("سبب إلغاء القيد؟");
                      if (reason && reason.trim()) voidEntry.mutate({ id: e.source_id!, reason: reason.trim() });
                    }}
                    className="flex items-center gap-1 text-xs font-medium text-ink-500 hover:text-danger-600 print:hidden"
                  >
                    <Ban size={14} />
                    إلغاء القيد
                  </button>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-sm">
                  <thead>
                    <tr className="text-[11.5px] font-semibold text-ink-400">
                      <th className="px-4 pt-2 text-right font-semibold">الحساب</th>
                      <th className="w-32 px-4 pt-2 text-left font-semibold">مدين</th>
                      <th className="w-32 px-4 pt-2 text-left font-semibold">دائن</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {e.lines.map((l, i) => (
                      <tr key={i}>
                        <td className={`px-4 py-2 ${Number(l.credit) > 0 ? "pr-10" : ""}`}>
                          <span className="ltr-content ml-2 text-xs font-semibold text-ink-400">{l.account}</span>
                          <span className="text-ink-900">{l.account_name}</span>
                          {l.party && <span className="mr-2 text-xs text-ink-500">· {l.party}</span>}
                        </td>
                        <td className="w-32 px-4 py-2 text-left"><Money v={l.debit} dash /></td>
                        <td className="w-32 px-4 py-2 text-left"><Money v={l.credit} dash /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
