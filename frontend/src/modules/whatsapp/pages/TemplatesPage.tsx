/**
 * Message templates page - create/edit reusable WhatsApp message bodies
 * with placeholders ({full_name}, {teacher_name}, {lecture_date},
 * {lecture_time}, {zoom_link}). A template with trigger=lecture_booked
 * (only one should be active at a time) is sent automatically right
 * after a lead books a lecture slot; "manual" templates are only sent
 * from the lead detail page's "send message" action.
 */
import { useState, type FormEvent } from "react";
import { Plus, MessageSquare, Zap } from "lucide-react";
import { translate } from "@/i18n";
import { useMessageTemplates, useCreateTemplate, useUpdateTemplate } from "@/modules/whatsapp/hooks/useWhatsApp";
import type { MessageTemplate } from "@/modules/whatsapp/services/whatsappApi";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { FormField, Input, Select, Textarea } from "@/components/ui/Field";

const PLACEHOLDER_HINTS = ["{full_name}", "{teacher_name}", "{lecture_date}", "{lecture_time}", "{zoom_link}"];

function TemplateCard({ template }: { template: MessageTemplate }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(template.name);
  const [body, setBody] = useState(template.body);
  const [trigger, setTrigger] = useState(template.trigger);
  const updateTemplate = useUpdateTemplate(template.id);

  async function save() {
    await updateTemplate.mutateAsync({ name, body, trigger });
    setEditing(false);
  }

  if (editing) {
    return (
      <Card className="animate-scale-in">
        <div className="space-y-3">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="اسم القالب" />
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} />
          <Select value={trigger} onChange={(e) => setTrigger(e.target.value as MessageTemplate["trigger"])}>
            <option value="manual">يدوي فقط</option>
            <option value="lecture_booked">تلقائي عند حجز موعد</option>
          </Select>
          <div className="flex gap-2">
            <Button size="sm" variant="primary" isLoading={updateTemplate.isPending} onClick={save}>{translate("ar", "common_save")}</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>{translate("ar", "common_cancel")}</Button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-semibold text-ink-900">{template.name}</h3>
        <div className="flex items-center gap-2">
          {template.trigger === "lecture_booked" && (
            <Badge tone="brand" dot={false}><Zap size={11} className="ml-1 inline" />تلقائي عند الحجز</Badge>
          )}
          {!template.is_active && <Badge tone="neutral" dot={false}>معطّل</Badge>}
        </div>
      </div>
      <p className="whitespace-pre-wrap rounded-lg bg-ink-50 p-3 text-sm text-ink-700">{template.body}</p>
      <button onClick={() => setEditing(true)} className="mt-2 text-xs font-medium text-brand-600 hover:text-brand-700">تعديل</button>
    </Card>
  );
}

export function TemplatesPage() {
  const { data: templates, isLoading } = useMessageTemplates(true);
  const createTemplate = useCreateTemplate();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [trigger, setTrigger] = useState("manual");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await createTemplate.mutateAsync({ name, body, trigger });
    setName(""); setBody(""); setTrigger("manual"); setShowForm(false);
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight text-ink-900">قوالب رسائل واتساب</h1>
          <p className="mt-1 text-sm text-ink-500">خصّص القوالب المستخدمة عند التواصل مع العملاء</p>
        </div>
        <Button variant="primary" size="lg" onClick={() => setShowForm((v) => !v)}><Plus size={17} />قالب جديد</Button>
      </div>

      {showForm && (
        <Card className="mb-5 animate-scale-in">
          <CardHeader><CardTitle>قالب جديد</CardTitle></CardHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <FormField label="اسم القالب"><Input required value={name} onChange={(e) => setName(e.target.value)} /></FormField>
            <FormField label="نص الرسالة" hint={`المتغيرات المتاحة: ${PLACEHOLDER_HINTS.join(" ، ")}`}>
              <Textarea required value={body} onChange={(e) => setBody(e.target.value)} rows={5} placeholder="مرحبًا {full_name}، تم حجز موعد محاضرتك مع {teacher_name} بتاريخ {lecture_date} الساعة {lecture_time}." />
            </FormField>
            <FormField label="نوع الإرسال">
              <Select value={trigger} onChange={(e) => setTrigger(e.target.value)}>
                <option value="manual">يدوي فقط (يُرسل من صفحة العميل)</option>
                <option value="lecture_booked">تلقائي عند حجز موعد محاضرة</option>
              </Select>
            </FormField>
            <div className="flex gap-3">
              <Button type="submit" variant="primary" isLoading={createTemplate.isPending}>{translate("ar", "common_save")}</Button>
              <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>{translate("ar", "common_cancel")}</Button>
            </div>
          </form>
        </Card>
      )}

      {isLoading ? (
        <p className="text-sm text-ink-500">{translate("ar", "common_loading")}</p>
      ) : (templates ?? []).length === 0 ? (
        <Card><p className="py-8 text-center text-sm text-ink-400"><MessageSquare className="mx-auto mb-2 text-ink-300" size={28} />لا توجد قوالب بعد</p></Card>
      ) : (
        <div className="space-y-4">
          {(templates ?? []).map((t) => <TemplateCard key={t.id} template={t} />)}
        </div>
      )}
    </div>
  );
}
