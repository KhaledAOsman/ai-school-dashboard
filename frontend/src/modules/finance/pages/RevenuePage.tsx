import { useState, type FormEvent } from "react";
import { ExternalLink, HandCoins, Plus, Search, Trash2 } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FormField, Input, Select } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { usePermission } from "@/permissions/usePermission";
import { PERMISSIONS } from "@/permissions/constants";
import { useCreateRevenue, useDeleteRevenue, useRevenue } from "@/modules/finance/hooks/useAccounting";
import { DateRange, Money, downloadCsv, fmt, td, th } from "@/modules/finance/accounting/shared";
import { fromCents, toCents } from "@/modules/finance/utils";

const METHODS = ["تحويل بنكي", "بطاقة", "نقدي", "مدى", "Apple Pay", "رابط دفع"];

/** Student subscriptions: the school's revenue. Every entry posts to 4100 (and 4900 for discounts). */
export function RevenuePage() {
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const { data, isLoading } = useRevenue({ q: q.trim() || undefined, date_from: from || undefined, date_to: to || undefined });
  const create = useCreateRevenue();
  const remove = useDeleteRevenue();
  const canCreate = usePermission(PERMISSIONS.FINANCE_EXPENSE_CREATE);
  const canDelete = usePermission(PERMISSIONS.FINANCE_EXPENSE_DELETE);

  const [showForm, setShowForm] = useState(false);
  const [f, setF] = useState({ date: new Date().toISOString().slice(0, 10), customer: "", pkg: "", amount: "", discount: "", invNo: "", invUrl: "", method: "", note: "" });
  const set = (patch: Partial<typeof f>) => setF((p) => ({ ...p, ...patch }));

  const rows = data ?? [];
  const net = rows.reduce((s, r) => s + toCents(r.amount), 0);
  const disc = rows.reduce((s, r) => s + toCents(r.discount_amount), 0);

  async function submit(e: FormEvent) {
    e.preventDefault();
    await create.mutateAsync({
      revenue_date: f.date,
      amount: f.amount,
      discount_amount: f.discount || "0",
      customer_name: f.customer.trim() || null,
      package_name: f.pkg.trim() || null,
      invoice_number: f.invNo.trim() || null,
      invoice_url: f.invUrl.trim() || null,
      payment_method: f.method || null,
      note: f.note.trim() || null,
    });
    set({ customer: "", pkg: "", amount: "", discount: "", invNo: "", invUrl: "", note: "" });
    setShowForm(false);
  }

  function exportCsv() {
    downloadCsv(
      "revenue.csv",
      ["التاريخ", "العميل", "الباقة", "رقم الفاتورة", "طريقة الدفع", "السعر قبل الخصم", "الخصم", "المحصّل", "رابط الفاتورة", "ملاحظة"],
      rows.map((r) => [r.revenue_date, r.customer_name, r.package_name, r.invoice_number, r.payment_method, r.gross_amount, r.discount_amount, r.amount, r.invoice_url, r.note])
    );
  }

  const gross = f.amount ? toCents(f.amount) + toCents(f.discount || 0) : 0;

  return (
    <div className="max-w-6xl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight text-ink-900">الإيرادات (الاشتراكات)</h1>
          <p className="mt-1 text-sm text-ink-500">اشتراكات الطلاب — كل اشتراك بيتسجّل في الدفاتر كإيراد على حساب 4100</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="lg" onClick={exportCsv}>
            تصدير Excel
          </Button>
          {canCreate && !showForm && (
            <Button variant="primary" size="lg" onClick={() => setShowForm(true)}>
              <Plus size={17} />
              اشتراك جديد
            </Button>
          )}
        </div>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <p className="text-[14px] font-medium text-ink-500">إجمالي المحصّل</p>
          <p className="mt-2 text-[26px] font-bold tracking-tight"><Money v={fromCents(net)} bold className="!text-[26px]" /><span className="mr-1.5 text-sm font-medium text-ink-400">ر.س</span></p>
        </Card>
        <Card className="p-5">
          <p className="text-[14px] font-medium text-ink-500">إجمالي الخصومات</p>
          <p className="mt-2 text-[26px] font-bold tracking-tight"><Money v={fromCents(disc)} bold className="!text-[26px]" /><span className="mr-1.5 text-sm font-medium text-ink-400">ر.س</span></p>
        </Card>
        <Card className="p-5">
          <p className="text-[14px] font-medium text-ink-500">عدد الاشتراكات</p>
          <p className="ltr-content mt-2 text-[26px] font-bold tracking-tight text-ink-900">{rows.length}</p>
        </Card>
      </div>

      {showForm && (
        <Card className="mb-5 animate-scale-in">
          <CardHeader>
            <CardTitle>اشتراك جديد</CardTitle>
          </CardHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <FormField label="تاريخ التحصيل">
                <Input type="date" required value={f.date} onChange={(e) => set({ date: e.target.value })} className="ltr-content" />
              </FormField>
              <FormField label="اسم الطالب / العميل">
                <Input value={f.customer} onChange={(e) => set({ customer: e.target.value })} />
              </FormField>
              <FormField label="الباقة">
                <Input value={f.pkg} onChange={(e) => set({ pkg: e.target.value })} placeholder="مثال: باقة 3 شهور" />
              </FormField>
              <FormField label="المبلغ المحصّل (ر.س)">
                <Input type="number" step="0.01" min="0.01" required value={f.amount} onChange={(e) => set({ amount: e.target.value })} className="ltr-content" />
              </FormField>
              <FormField label="الخصم (ر.س)" hint={gross ? `السعر قبل الخصم = ${fmt(gross / 100)}` : "لو في خصم على السعر الأصلي"}>
                <Input type="number" step="0.01" min="0" value={f.discount} onChange={(e) => set({ discount: e.target.value })} className="ltr-content" />
              </FormField>
              <FormField label="طريقة الدفع">
                <Select value={f.method} onChange={(e) => set({ method: e.target.value })}>
                  <option value="">—</option>
                  {METHODS.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </Select>
              </FormField>
              <FormField label="رقم الفاتورة">
                <Input value={f.invNo} onChange={(e) => set({ invNo: e.target.value })} className="ltr-content" />
              </FormField>
              <div className="sm:col-span-2">
                <FormField label="رابط الفاتورة / إيصال الدفع">
                  <Input type="url" value={f.invUrl} onChange={(e) => set({ invUrl: e.target.value })} placeholder="https://" className="ltr-content" />
                </FormField>
              </div>
            </div>
            <FormField label="ملاحظة (اختياري)">
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

      <div className="mb-3 flex flex-wrap items-end gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search size={16} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث بالعميل أو الباقة أو رقم الفاتورة" className="!py-2.5 !pr-10" />
        </div>
      </div>
      <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />

      <Card className="overflow-hidden p-0">
        {isLoading ? (
          <p className="p-6 text-sm text-ink-500">جارٍ التحميل…</p>
        ) : rows.length === 0 ? (
          <EmptyState icon={HandCoins} title="لا توجد اشتراكات مسجّلة" description="سجّل أول اشتراك عشان يظهر كإيراد في القوائم المالية" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-ink-50/70">
                <tr>
                  <th className={th}>التاريخ</th>
                  <th className={th}>العميل</th>
                  <th className={th}>الباقة</th>
                  <th className={th}>الفاتورة</th>
                  <th className={`${th} !text-left`}>قبل الخصم</th>
                  <th className={`${th} !text-left`}>الخصم</th>
                  <th className={`${th} !text-left`}>المحصّل</th>
                  <th className={th}></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-ink-50/60">
                    <td className={`${td} ltr-content whitespace-nowrap text-ink-600`}>{r.revenue_date}</td>
                    <td className={`${td} font-medium text-ink-900`}>{r.customer_name ?? "—"}</td>
                    <td className={`${td} text-ink-700`}>
                      {r.package_name ?? "—"}
                      {r.note && <p className="text-xs text-ink-500">{r.note}</p>}
                    </td>
                    <td className={`${td} text-ink-600`}>
                      <span className="ltr-content">{r.invoice_number ?? "—"}</span>
                      {r.invoice_url && (
                        <a href={r.invoice_url} target="_blank" rel="noreferrer" className="mr-1.5 inline-block align-middle text-brand-600" title="فتح الفاتورة">
                          <ExternalLink size={14} />
                        </a>
                      )}
                    </td>
                    <td className={`${td} text-left`}><Money v={r.gross_amount} /></td>
                    <td className={`${td} text-left`}><Money v={r.discount_amount} dash /></td>
                    <td className={`${td} text-left`}><Money v={r.amount} bold /></td>
                    <td className={`${td} text-left`}>
                      {canDelete && (
                        <button
                          onClick={() => {
                            if (window.confirm("حذف هذا الاشتراك؟ هيتشال من الإيرادات والدفاتر.")) remove.mutate(r.id);
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
                  <td className={`${td} font-semibold text-ink-700`} colSpan={4}>
                    الإجمالي ({rows.length})
                  </td>
                  <td className={`${td} text-left`}><Money v={fromCents(net + disc)} bold /></td>
                  <td className={`${td} text-left`}><Money v={fromCents(disc)} bold /></td>
                  <td className={`${td} text-left`}><Money v={fromCents(net)} bold /></td>
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
