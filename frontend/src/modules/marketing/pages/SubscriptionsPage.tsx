import { useState, type FormEvent } from "react";
import { BadgeCheck, Pencil, Plus, Trash2 } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { FormField, Input, Select, Textarea } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { usePermission } from "@/permissions/usePermission";
import { PERMISSIONS } from "@/permissions/constants";
import {
  useCreateSubscription,
  useDeleteSubscription,
  useSubscriptions,
  useUpdateSubscription,
} from "@/modules/marketing/hooks/useMarketing";
import type { Source, Subscription } from "@/modules/marketing/services/marketingApi";
import { apiErrorMessage, formatNumber, formatSAR, SOURCE_LABELS } from "@/modules/marketing/lib";

interface FormState {
  full_name: string;
  phone: string;
  amount_paid: string;
  discount_amount: string;
  subscribed_at: string;
  source: Source | "";
  notes: string;
}

const today = () => new Date().toISOString().slice(0, 10);
const EMPTY: FormState = { full_name: "", phone: "", amount_paid: "", discount_amount: "0", subscribed_at: today(), source: "", notes: "" };

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-5">
      <p className="text-[13px] font-medium text-ink-500">{label}</p>
      <p className="ltr-content mt-2 text-[24px] font-bold tracking-tight text-ink-900">{value}</p>
    </Card>
  );
}

export function SubscriptionsPage() {
  const { data, isLoading } = useSubscriptions();
  const create = useCreateSubscription();
  const update = useUpdateSubscription();
  const remove = useDeleteSubscription();
  const canManage = usePermission(PERMISSIONS.SUBSCRIPTIONS_MANAGE);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY);
    setError(null);
    setShowForm(true);
  }

  function openEdit(s: Subscription) {
    setEditingId(s.id);
    setForm({
      full_name: s.full_name,
      phone: s.phone,
      amount_paid: s.amount_paid,
      discount_amount: s.discount_amount,
      subscribed_at: s.subscribed_at,
      source: s.source ?? "",
      notes: s.notes ?? "",
    });
    setError(null);
    setShowForm(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const payload = {
      full_name: form.full_name.trim(),
      phone: form.phone.trim(),
      amount_paid: form.amount_paid || "0",
      discount_amount: form.discount_amount || "0",
      subscribed_at: form.subscribed_at,
      source: form.source || null,
      notes: form.notes.trim() || null,
    };
    try {
      if (editingId) await update.mutateAsync({ id: editingId, payload });
      else await create.mutateAsync(payload);
      setShowForm(false);
      setEditingId(null);
      setForm(EMPTY);
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  async function handleDelete(s: Subscription) {
    if (!window.confirm(`حذف اشتراك ${s.full_name}؟`)) return;
    await remove.mutateAsync(s.id);
  }

  const totals = data?.totals;
  const listPrice = Number(form.amount_paid || 0) + Number(form.discount_amount || 0);

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight text-ink-900">الاشتراكات</h1>
          <p className="mt-1 text-sm text-ink-500">الاشتراكات المدفوعة — كل مشترك بسعره الفعلي، وتُسجَّل يدويًا</p>
        </div>
        {canManage && !showForm && (
          <Button variant="primary" size="lg" onClick={openCreate}>
            <Plus size={17} />
            إضافة اشتراك
          </Button>
        )}
      </div>

      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <SummaryTile label="عدد المشتركين" value={isLoading ? "…" : formatNumber(totals?.count ?? 0)} />
        <SummaryTile label="إجمالي المدفوع" value={isLoading ? "…" : formatSAR(totals?.total_paid ?? 0)} />
        <SummaryTile label="إجمالي الخصومات" value={isLoading ? "…" : formatSAR(totals?.total_discount ?? 0)} />
        <SummaryTile label="السعر الأصلي (قبل الخصم)" value={isLoading ? "…" : formatSAR(totals?.total_list_price ?? 0)} />
      </div>

      {showForm && canManage && (
        <Card className="mb-5 animate-scale-in">
          <CardHeader>
            <CardTitle>{editingId ? "تعديل اشتراك" : "اشتراك جديد"}</CardTitle>
          </CardHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="الاسم الكامل">
                <Input required value={form.full_name} onChange={(e) => set("full_name", e.target.value)} />
              </FormField>
              <FormField label="رقم الجوال" hint="يُحفظ بصيغة 966XXXXXXXXX تلقائيًا">
                <Input required dir="ltr" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="05XXXXXXXX" />
              </FormField>
              <FormField label="المبلغ المدفوع (ر.س)">
                <Input required type="number" min="0" step="0.01" dir="ltr" value={form.amount_paid} onChange={(e) => set("amount_paid", e.target.value)} />
              </FormField>
              <FormField label="قيمة الخصم (ر.س)" hint={`السعر الأصلي = ${formatSAR(listPrice)}`}>
                <Input type="number" min="0" step="0.01" dir="ltr" value={form.discount_amount} onChange={(e) => set("discount_amount", e.target.value)} />
              </FormField>
              <FormField label="تاريخ الاشتراك">
                <Input required type="date" dir="ltr" value={form.subscribed_at} onChange={(e) => set("subscribed_at", e.target.value)} />
              </FormField>
              <FormField label="مصدر العميل (اختياري)">
                <Select value={form.source} onChange={(e) => set("source", e.target.value as Source | "")}>
                  <option value="">غير محدد</option>
                  {Object.entries(SOURCE_LABELS).map(([k, label]) => (
                    <option key={k} value={k}>{label}</option>
                  ))}
                </Select>
              </FormField>
            </div>
            <FormField label="ملاحظات">
              <Textarea rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
            </FormField>
            {error && <p className="rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger-700">{error}</p>}
            <div className="flex gap-2">
              <Button type="submit" variant="primary" isLoading={create.isPending || update.isPending}>
                {editingId ? "حفظ التعديل" : "حفظ الاشتراك"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
                إلغاء
              </Button>
            </div>
          </form>
        </Card>
      )}

      <Card className="p-0">
        {(data?.items ?? []).length === 0 && !isLoading ? (
          <EmptyState icon={BadgeCheck} title="لا توجد اشتراكات بعد" description="أضف أول اشتراك مدفوع ليظهر هنا وفي لوحة المؤشرات" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-100 text-start text-xs text-ink-500">
                  <th className="px-5 py-3 text-start font-medium">المشترك</th>
                  <th className="px-3 py-3 text-start font-medium">الجوال</th>
                  <th className="px-3 py-3 text-start font-medium">المدفوع</th>
                  <th className="px-3 py-3 text-start font-medium">الخصم</th>
                  <th className="px-3 py-3 text-start font-medium">الأصلي</th>
                  <th className="px-3 py-3 text-start font-medium">التاريخ</th>
                  <th className="px-3 py-3 text-start font-medium">المصدر</th>
                  {canManage && <th className="px-3 py-3" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {(data?.items ?? []).map((s) => (
                  <tr key={s.id} className="hover:bg-ink-50">
                    <td className="px-5 py-3 font-medium text-ink-900">{s.full_name}</td>
                    <td className="ltr-content px-3 py-3 text-ink-600">{s.phone}</td>
                    <td className="ltr-content px-3 py-3 font-semibold text-ink-900">{formatSAR(s.amount_paid)}</td>
                    <td className="ltr-content px-3 py-3 text-ink-600">{formatSAR(s.discount_amount)}</td>
                    <td className="ltr-content px-3 py-3 text-ink-600">{formatSAR(s.list_price)}</td>
                    <td className="ltr-content px-3 py-3 text-ink-600">{s.subscribed_at}</td>
                    <td className="px-3 py-3">
                      {s.source ? <Badge tone="brand">{SOURCE_LABELS[s.source] ?? s.source}</Badge> : <span className="text-ink-300">—</span>}
                    </td>
                    {canManage && (
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openEdit(s)} className="rounded-md p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700" aria-label="تعديل">
                            <Pencil size={15} />
                          </button>
                          <button onClick={() => handleDelete(s)} className="rounded-md p-1.5 text-ink-400 hover:bg-danger-50 hover:text-danger-600" aria-label="حذف">
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    )}
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
