/**
 * «تحويل لمشترك»: the subscription form opened straight from the CRM.
 * Name, phone and source come from the customer; staff enter what was
 * actually paid. Saving adds the row to الاشتراكات (and the KPIs), closes
 * the customer as مشترك, and reports the purchase to the ad platform the
 * customer came from.
 */
import { useState, type FormEvent } from "react";
import { BadgeCheck, X } from "lucide-react";
import { useSubscribeLead } from "@/modules/crm/hooks/useCRM";
import { SOURCE_ICON } from "@/modules/crm/pages/LeadsListPage";
import type { LeadSource } from "@/modules/crm/services/crmApi";
import { Button } from "@/components/ui/Button";
import { FormField, Input, Textarea } from "@/components/ui/Field";
import { apiErrorMessage, formatSAR } from "@/modules/marketing/lib";

const today = () => new Date().toISOString().slice(0, 10);

export function SubscribeLeadModal({ lead, onClose }: {
  lead: { id: string; full_name: string; phone: string; source: string | null };
  onClose: () => void;
}) {
  const subscribe = useSubscribeLead(lead.id);
  const [fullName, setFullName] = useState(lead.full_name);
  const [phone, setPhone] = useState(lead.phone);
  const [amount, setAmount] = useState("");
  const [discount, setDiscount] = useState("0");
  const [date, setDate] = useState(today());
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const source = lead.source as LeadSource | null;
  const listPrice = Number(amount || 0) + Number(discount || 0);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await subscribe.mutateAsync({
        amount_paid: amount || "0",
        discount_amount: discount || "0",
        subscribed_at: date,
        full_name: fullName.trim() || undefined,
        phone: phone.trim() || undefined,
        notes: notes.trim() || null,
      });
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="w-full max-w-lg rounded-xl bg-white p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <BadgeCheck size={20} className="text-success-600" />
            <h3 className="text-lg font-bold text-ink-900">تحويل لمشترك</h3>
          </div>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="rounded-full p-1.5 text-ink-500 hover:bg-ink-100">
            <X size={18} />
          </button>
        </div>
        <p className="mb-4 text-[13px] text-ink-500">
          يتسجل الاشتراك في قائمة الاشتراكات ومؤشرات الأداء، والعميل يتحول لحالة «مشترك».
          {source && SOURCE_ICON[source] ? ` المصدر: ${SOURCE_ICON[source].label}.` : ""}
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="الاسم الكامل">
            <Input required value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </FormField>
          <FormField label="رقم الجوال">
            <Input required dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </FormField>
          <FormField label="المبلغ المدفوع (ر.س)">
            <Input required autoFocus type="number" min="0" step="0.01" dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </FormField>
          <FormField label="قيمة الخصم (ر.س)" hint={`السعر الأصلي = ${formatSAR(listPrice)}`}>
            <Input type="number" min="0" step="0.01" dir="ltr" value={discount} onChange={(e) => setDiscount(e.target.value)} />
          </FormField>
          <FormField label="تاريخ الاشتراك">
            <Input required type="date" dir="ltr" value={date} onChange={(e) => setDate(e.target.value)} />
          </FormField>
        </div>
        <div className="mt-4">
          <FormField label="ملاحظات (اختياري)">
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </FormField>
        </div>
        {error && <p className="mt-3 rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger-700">{error}</p>}
        <div className="mt-4 flex gap-2">
          <Button type="submit" variant="primary" isLoading={subscribe.isPending} disabled={!amount}>حفظ الاشتراك</Button>
          <Button type="button" variant="ghost" onClick={onClose}>إلغاء</Button>
        </div>
      </form>
    </div>
  );
}
