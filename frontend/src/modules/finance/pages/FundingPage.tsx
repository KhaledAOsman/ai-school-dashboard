import { useState, type FormEvent } from "react";
import { Landmark, Plus, Trash2 } from "lucide-react";
import { translate } from "@/i18n";
import { useCreateFunding, useDeleteFunding, useFunding } from "@/modules/finance/hooks/useFinance";
import { usePermission } from "@/permissions/usePermission";
import { PERMISSIONS } from "@/permissions/constants";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FormField, Input } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatSAR, fromCents, toCents } from "@/modules/finance/utils";

/** Money transferred INTO the project by partners - what funds the spending. */
export function FundingPage() {
  const { data: funding, isLoading } = useFunding();
  const createFunding = useCreateFunding();
  const deleteFunding = useDeleteFunding();
  const canCreate = usePermission(PERMISSIONS.FINANCE_EXPENSE_CREATE);
  const canDelete = usePermission(PERMISSIONS.FINANCE_EXPENSE_DELETE);

  const [showForm, setShowForm] = useState(false);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("");
  const [source, setSource] = useState("");
  const [note, setNote] = useState("");

  const rows = funding ?? [];
  const total = rows.reduce((sum, f) => sum + toCents(f.amount), 0);
  const sources = Array.from(new Set(rows.map((f) => f.source_name)));
  const bySource = sources.map((s) => ({
    name: s,
    cents: rows.filter((f) => f.source_name === s).reduce((sum, f) => sum + toCents(f.amount), 0),
  }));

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await createFunding.mutateAsync({ funding_date: date, amount, source_name: source.trim(), note: note.trim() || null });
    setAmount("");
    setNote("");
    setShowForm(false);
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight text-ink-900">التمويل</h1>
          <p className="mt-1 text-sm text-ink-500">التحويلات اللي دخلت المشروع من الشركاء لتغطية المصروفات</p>
        </div>
        {canCreate && !showForm && (
          <Button variant="primary" size="lg" onClick={() => setShowForm(true)}>
            <Plus size={17} />
            تحويل جديد
          </Button>
        )}
      </div>

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card className="p-5">
          <p className="text-[14px] font-medium text-ink-500">إجمالي التحويلات الواردة</p>
          <p className="ltr-content mt-2 text-[28px] font-bold tracking-tight text-ink-900">{formatSAR(fromCents(total))}</p>
          <p className="mt-1 text-xs text-ink-500">{rows.length} تحويل</p>
        </Card>
        <Card className="p-5">
          <p className="text-[14px] font-medium text-ink-500">حسب المصدر</p>
          <div className="mt-2 space-y-1.5">
            {bySource.length === 0 && <p className="text-sm text-ink-400">—</p>}
            {bySource.map((s) => (
              <div key={s.name} className="flex items-center justify-between text-sm">
                <span className="text-ink-700">{s.name}</span>
                <span className="ltr-content font-semibold text-ink-900">{formatSAR(fromCents(s.cents))}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {showForm && (
        <Card className="mb-5 animate-scale-in">
          <CardHeader>
            <CardTitle>تحويل جديد</CardTitle>
          </CardHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <FormField label="التاريخ">
                <Input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className="ltr-content" />
              </FormField>
              <FormField label="المبلغ (ر.س)">
                <Input type="number" step="0.01" min="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} className="ltr-content" />
              </FormField>
              <FormField label="المصدر">
                <Input required value={source} onChange={(e) => setSource(e.target.value)} list="funding-sources" placeholder="اسم الشريك" />
                <datalist id="funding-sources">
                  {sources.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </FormField>
            </div>
            <FormField label="ملاحظة (اختياري)">
              <Input value={note} onChange={(e) => setNote(e.target.value)} />
            </FormField>
            <div className="flex gap-3">
              <Button type="submit" variant="primary" isLoading={createFunding.isPending}>
                {translate("ar", "common_save")}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
                {translate("ar", "common_cancel")}
              </Button>
            </div>
          </form>
        </Card>
      )}

      <Card className="overflow-hidden p-0">
        {isLoading ? (
          <p className="p-6 text-sm text-ink-500">{translate("ar", "common_loading")}</p>
        ) : rows.length === 0 ? (
          <EmptyState icon={Landmark} title="لا توجد تحويلات بعد" description="سجّل أول تحويل وارد من الشركاء" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="bg-ink-50/70">
                <tr>
                  {["التاريخ", "المصدر", "ملاحظة", "المبلغ", ""].map((h, i) => (
                    <th key={i} className="px-5 py-3 text-right text-xs font-semibold text-ink-500">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {rows.map((f) => (
                  <tr key={f.id} className="hover:bg-ink-50/70">
                    <td className="ltr-content whitespace-nowrap px-5 py-3.5 text-ink-600">{f.funding_date}</td>
                    <td className="px-5 py-3.5 font-medium text-ink-900">{f.source_name}</td>
                    <td className="px-5 py-3.5 text-ink-500">{f.note ?? "—"}</td>
                    <td className="ltr-content whitespace-nowrap px-5 py-3.5 font-semibold text-ink-800">{formatSAR(f.amount)}</td>
                    <td className="px-5 py-3.5 text-left">
                      {canDelete && (
                        <button
                          onClick={() => {
                            if (window.confirm("حذف هذا التحويل؟")) deleteFunding.mutate(f.id);
                          }}
                          className="text-ink-400 transition-colors hover:text-danger-600"
                          title="حذف"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
