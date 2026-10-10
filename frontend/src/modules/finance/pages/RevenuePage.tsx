import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, HandCoins, Plus, Trash2 } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FormField, Input, Select } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { usePermission } from "@/permissions/usePermission";
import { PERMISSIONS } from "@/permissions/constants";
import { useCreateRevenue, useDeleteRevenue, useRevenue, useRevenueSummary } from "@/modules/finance/hooks/useAccounting";
import { Money, downloadCsv, fmt, td, th } from "@/modules/finance/accounting/shared";
import { fromCents, periodLabel, toCents } from "@/modules/finance/utils";

const CHANNELS = ["بوابة الدفع (بطاقات / مدى)", "تابي", "تمارا", "Apple Pay", "رابط دفع", "تحويل بنكي مباشر"];

function Kpi({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <Card className="p-5">
      <p className="text-[14px] font-medium text-ink-500">{label}</p>
      <p className="mt-2 text-[24px] font-bold tracking-tight">
        <Money v={value} bold className="!text-[24px]" />
        <span className="mr-1.5 text-sm font-medium text-ink-400">ر.س</span>
      </p>
      {hint && <p className="mt-1 text-[12.5px] text-ink-400">{hint}</p>}
    </Card>
  );
}

/**
 * Revenue = paid subscriptions (recorded in the subscriptions section).
 * Collections = what the payment gateway actually deposited into the bank,
 * after its commission. The difference is still held by the gateway.
 */
export function RevenuePage() {
  const { data: summary } = useRevenueSummary();
  const { data, isLoading } = useRevenue({});
  const create = useCreateRevenue();
  const remove = useDeleteRevenue();
  const canCreate = usePermission(PERMISSIONS.FINANCE_EXPENSE_CREATE);
  const canDelete = usePermission(PERMISSIONS.FINANCE_EXPENSE_DELETE);

  const [showForm, setShowForm] = useState(false);
  const [f, setF] = useState({ date: new Date().toISOString().slice(0, 10), channel: "", amount: "", fees: "", ref: "", url: "", note: "" });
  const set = (patch: Partial<typeof f>) => setF((p) => ({ ...p, ...patch }));
  const rows = data ?? [];

  async function submit(e: FormEvent) {
    e.preventDefault();
    await create.mutateAsync({
      revenue_date: f.date,
      amount: f.amount,
      fees_amount: f.fees || "0",
      package_name: "تحصيل اشتراكات",
      payment_method: f.channel || null,
      invoice_number: f.ref.trim() || null,
      invoice_url: f.url.trim() || null,
      note: f.note.trim() || null,
    });
    set({ amount: "", fees: "", ref: "", url: "", note: "" });
    setShowForm(false);
  }

  function exportCsv() {
    downloadCsv(
      "collections.csv",
      ["تاريخ الإيداع", "القناة", "المرجع", "المودَع في البنك", "عمولة البوابة", "إجمالي المسوّى", "الرابط", "ملاحظة"],
      rows.map((r) => [r.revenue_date, r.payment_method, r.invoice_number, r.amount, r.fees_amount, r.gross_amount, r.invoice_url, r.note])
    );
  }

  const settled = f.amount ? toCents(f.amount) + toCents(f.fees || 0) : 0;
  const months = summary?.months ?? [];

  return (
    <div className="max-w-6xl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight text-ink-900">الإيرادات والتحصيل</h1>
          <p className="mt-1 text-sm text-ink-500">
            الإيراد = الاشتراكات المدفوعة من{" "}
            <Link to="/marketing/subscriptions" className="link-underline font-medium text-brand-600">
              قسم الاشتراكات
            </Link>
            . التحصيل = اللي وصل الحساب البنكي بعد عمولة البوابة.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="lg" onClick={exportCsv}>
            تصدير Excel
          </Button>
          {canCreate && !showForm && (
            <Button variant="primary" size="lg" onClick={() => setShowForm(true)}>
              <Plus size={17} />
              تسجيل إيداع
            </Button>
          )}
        </div>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="الاشتراكات المدفوعة" value={summary?.subscriptions_paid ?? 0} hint={`${summary?.subscriptions_count ?? 0} اشتراك — بعد خصومات ${fmt(summary?.discounts ?? 0)}`} />
        <Kpi label="وصل الحساب البنكي" value={summary?.collected ?? 0} />
        <Kpi label="عمولات البوابات والرسوم" value={summary?.fees ?? 0} />
        <Kpi label="لسه عند البوابة" value={summary?.outstanding ?? 0} hint="مدفوع من الطلاب ولسه متحوّلش" />
      </div>

      {showForm && (
        <Card className="mb-5 animate-scale-in">
          <CardHeader>
            <CardTitle>إيداع من بوابة الدفع</CardTitle>
          </CardHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <FormField label="تاريخ الإيداع في البنك">
                <Input type="date" required value={f.date} onChange={(e) => set({ date: e.target.value })} className="ltr-content" />
              </FormField>
              <FormField label="القناة">
                <Select value={f.channel} onChange={(e) => set({ channel: e.target.value })}>
                  <option value="">—</option>
                  {CHANNELS.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </Select>
              </FormField>
              <FormField label="المرجع / رقم التسوية">
                <Input value={f.ref} onChange={(e) => set({ ref: e.target.value })} className="ltr-content" />
              </FormField>
              <FormField label="المبلغ اللي وصل البنك (ر.س)">
                <Input type="number" step="0.01" min="0.01" required value={f.amount} onChange={(e) => set({ amount: e.target.value })} className="ltr-content" />
              </FormField>
              <FormField label="عمولة البوابة / رسوم (ر.س)" hint={settled ? `إجمالي المسوّى من الاشتراكات = ${fmt(settled / 100)}` : undefined}>
                <Input type="number" step="0.01" min="0" value={f.fees} onChange={(e) => set({ fees: e.target.value })} className="ltr-content" />
              </FormField>
              <FormField label="رابط كشف الحساب / التسوية">
                <Input type="url" value={f.url} onChange={(e) => set({ url: e.target.value })} placeholder="https://" className="ltr-content" />
              </FormField>
            </div>
            <FormField label="ملاحظة">
              <Input value={f.note} onChange={(e) => set({ note: e.target.value })} />
            </FormField>
            <div className="flex gap-3">
              <Button type="submit" variant="primary" isLoading={create.isPending}>
                حفظ
              </Button>
              <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
                إلغاء
              </Button>
            </div>
          </form>
        </Card>
      )}

      <Card className="mb-5 overflow-hidden p-0">
        <div className="px-5 pb-2 pt-5">
          <h2 className="text-[16px] font-bold text-ink-900">شهر بشهر</h2>
        </div>
        {months.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-ink-500">لا توجد اشتراكات أو تحصيلات بعد</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-ink-50/70">
                <tr>
                  <th className={th}>الشهر</th>
                  <th className={`${th} !text-left`}>عدد الاشتراكات</th>
                  <th className={`${th} !text-left`}>الاشتراكات المدفوعة</th>
                  <th className={`${th} !text-left`}>وصل البنك</th>
                  <th className={`${th} !text-left`}>العمولات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {months.map((m) => (
                  <tr key={m.month}>
                    <td className={`${td} text-ink-700`}>{periodLabel(m.month)}</td>
                    <td className={`${td} ltr-content text-left text-ink-700`}>{m.subscriptions_count}</td>
                    <td className={`${td} text-left`}><Money v={m.subscriptions_paid} dash /></td>
                    <td className={`${td} text-left`}><Money v={m.collected} dash /></td>
                    <td className={`${td} text-left`}><Money v={m.fees} dash /></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-ink-200 bg-ink-50">
                  <td className={`${td} font-semibold text-ink-700`}>الإجمالي</td>
                  <td className={`${td} ltr-content text-left font-semibold`}>{summary?.subscriptions_count ?? 0}</td>
                  <td className={`${td} text-left`}><Money v={summary?.subscriptions_paid} bold /></td>
                  <td className={`${td} text-left`}><Money v={summary?.collected} bold /></td>
                  <td className={`${td} text-left`}><Money v={summary?.fees} bold /></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="px-5 pb-2 pt-5">
          <h2 className="text-[16px] font-bold text-ink-900">الإيداعات في الحساب البنكي</h2>
        </div>
        {isLoading ? (
          <p className="p-6 text-sm text-ink-500">جارٍ التحميل…</p>
        ) : rows.length === 0 ? (
          <EmptyState icon={HandCoins} title="لا توجد إيداعات" description="سجّل كل مبلغ بتحوّله البوابة للحساب البنكي مع عمولتها" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-ink-50/70">
                <tr>
                  <th className={th}>التاريخ</th>
                  <th className={th}>القناة</th>
                  <th className={th}>المرجع</th>
                  <th className={`${th} !text-left`}>وصل البنك</th>
                  <th className={`${th} !text-left`}>العمولة</th>
                  <th className={`${th} !text-left`}>إجمالي المسوّى</th>
                  <th className={th}></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-ink-50/60">
                    <td className={`${td} ltr-content whitespace-nowrap text-ink-600`}>{r.revenue_date}</td>
                    <td className={`${td} text-ink-800`}>
                      {r.payment_method ?? r.package_name ?? "—"}
                      {r.note && <p className="text-xs text-ink-500">{r.note}</p>}
                    </td>
                    <td className={`${td} text-ink-600`}>
                      <span className="ltr-content">{r.invoice_number ?? "—"}</span>
                      {r.invoice_url && (
                        <a href={r.invoice_url} target="_blank" rel="noreferrer" className="mr-1.5 inline-block align-middle text-brand-600" title="فتح">
                          <ExternalLink size={14} />
                        </a>
                      )}
                    </td>
                    <td className={`${td} text-left`}><Money v={r.amount} bold /></td>
                    <td className={`${td} text-left`}><Money v={r.fees_amount} dash /></td>
                    <td className={`${td} text-left`}><Money v={r.gross_amount} /></td>
                    <td className={`${td} text-left`}>
                      {canDelete && (
                        <button
                          onClick={() => {
                            if (window.confirm("حذف هذا الإيداع؟")) remove.mutate(r.id);
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
              <tfoot>
                <tr className="border-t-2 border-ink-200 bg-ink-50">
                  <td className={`${td} font-semibold text-ink-700`} colSpan={3}>
                    الإجمالي ({rows.length})
                  </td>
                  <td className={`${td} text-left`}><Money v={fromCents(rows.reduce((s, r) => s + toCents(r.amount), 0))} bold /></td>
                  <td className={`${td} text-left`}><Money v={fromCents(rows.reduce((s, r) => s + toCents(r.fees_amount), 0))} bold /></td>
                  <td className={`${td} text-left`}><Money v={fromCents(rows.reduce((s, r) => s + toCents(r.gross_amount), 0))} bold /></td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
