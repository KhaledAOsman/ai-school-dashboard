import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { translate } from "@/i18n";
import { useCreateLead } from "@/modules/crm/hooks/useCRM";
import { adminApi } from "@/modules/finance/services/adminApi";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FormField, Input, Select, Textarea } from "@/components/ui/Field";

export function CreateLeadForm({ onDone }: { onDone: () => void }) {
  const createLead = useCreateLead();
  const { data: users } = useQuery({ queryKey: ["admin-users"], queryFn: adminApi.listUsers });
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [source, setSource] = useState("");
  const [notes, setNotes] = useState("");
  const [assignedTo, setAssignedTo] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await createLead.mutateAsync({
      full_name: fullName,
      phone,
      source: source || null,
      notes: notes || null,
      assigned_to: assignedTo || null,
    });
    onDone();
  }

  return (
    <Card className="mb-5 animate-scale-in">
      <CardHeader>
        <CardTitle>عميل محتمل جديد</CardTitle>
      </CardHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <FormField label="اسم العميل">
            <Input required value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </FormField>
          <FormField label="رقم الهاتف">
            <Input required value={phone} onChange={(e) => setPhone(e.target.value)} className="ltr-content text-left" />
          </FormField>
        </div>
        <FormField label="إسناد إلى (موظف خدمة العملاء)" hint="اختر الموظف المسؤول عن متابعة هذا العميل">
          <Select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
            <option value="">بدون إسناد الآن</option>
            {(users ?? []).map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name || u.email}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="مصدر التواصل (اختياري)">
          <Input value={source} onChange={(e) => setSource(e.target.value)} placeholder="مثال: إعلان فيسبوك، إحالة" />
        </FormField>
        <FormField label="ملاحظات (اختياري)">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </FormField>
        <div className="flex gap-3">
          <Button type="submit" variant="primary" isLoading={createLead.isPending}>
            {translate("ar", "common_save")}
          </Button>
          <Button type="button" variant="ghost" onClick={onDone}>
            {translate("ar", "common_cancel")}
          </Button>
        </div>
      </form>
    </Card>
  );
}
