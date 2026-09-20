/**
 * Message templates page - create/edit reusable WhatsApp message bodies
 * with placeholders ({full_name}, {teacher_name}, {lecture_date},
 * {lecture_time}, {zoom_link}).
 *
 * Trigger system: every template has a "trigger" - manual (only sent
 * manually from the lead detail page) or one of several pipeline events
 * (booking, confirmation, report sent, converted, lost, not interested).
 * This is a fully customizable, admin-driven mapping - staff choose BOTH
 * the template AND which trigger/button fires it from this page. Nothing
 * is hardcoded in the app: whichever template is active for a given
 * trigger is the one that fires when that action happens (see
 * MessageTemplateRepository.get_active_for_trigger on the backend). Only
 * one active template per trigger actually sends - activating a new one
 * for the same trigger effectively replaces the old one.
 *
 * This page also has a "test send" tool: send a template (rendered
 * against sample placeholder values) or a raw message to any phone
 * number, to verify the WhatsApp connection/wording before relying on
 * a template in a real trigger.
 */
import { useState, type FormEvent } from "react";
import { Plus, MessageSquare, Zap, Send, CheckCircle2, XCircle } from "lucide-react";
import { translate } from "@/i18n";
import { useMessageTemplates, useCreateTemplate, useUpdateTemplate, useTestSendWhatsApp } from "@/modules/whatsapp/hooks/useWhatsApp";
import type { MessageTemplate, TemplateTrigger, WhatsAppMessageLog } from "@/modules/whatsapp/services/whatsappApi";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { FormField, Input, Select, Textarea } from "@/components/ui/Field";

const PLACEHOLDER_HINTS = ["{full_name}", "{teacher_name}", "{lecture_date}", "{lecture_time}", "{zoom_link}"];

// Every trigger the pipeline can fire on, with its Arabic label. Staff
// pick which template (if any) is active for each of these from this
// page - the trigger only marks WHERE in the pipeline a notification
// could fire, never WHICH template fires (that's this page's job).
const TRIGGER_LABELS: Record<TemplateTrigger, string> = {
  manual: "يدوي فقط (يُرسل من صفحة العميل)",
  lecture_booked: "تلقائي عند تأكيد الحجز",
  confirmed_whatsapp: "تلقائي عند تأكيد الحجز (واتساب)",
  confirmed_call: "تلقائي عند تأكيد الحجز (اتصال هاتفي)",
  report_sent: "تلقائي عند إرسال التقرير",
  converted: "تلقائي عند التحويل لعميل فعلي",
  lost: "تلقائي عند إغلاق الحجز كمفقود",
  not_interested: "تلقائي عند تحديد غير مهتم",
};

const TRIGGER_BADGE_LABELS: Record<TemplateTrigger, string> = {
  manual: "",
  lecture_booked: "تلقائي: تأكيد الحجز",
  confirmed_whatsapp: "تلقائي: تأكيد واتساب",
  confirmed_call: "تلقائي: تأكيد اتصال",
  report_sent: "تلقائي: إرسال التقرير",
  converted: "تلقائي: التحويل لعميل",
  lost: "تلقائي: إغلاق كمفقود",
  not_interested: "تلقائي: غير مهتم",
};

function TriggerSelect({ value, onChange }: { value: string; onChange: (v: TemplateTrigger) => void }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value as TemplateTrigger)}>
      {(Object.keys(TRIGGER_LABELS) as TemplateTrigger[]).map((key) => (
        <option key={key} value={key}>{TRIGGER_LABELS[key]}</option>
      ))}
    </Select>
  );
}

function TemplateCard({ template }: { template: MessageTemplate }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(template.name);
  const [body, setBody] = useState(template.body);
  const [trigger, setTrigger] = useState<TemplateTrigger>(template.trigger);
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
          <TriggerSelect value={trigger} onChange={setTrigger} />
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
          {template.trigger !== "manual" && (
            <Badge tone="brand" dot={false}><Zap size={11} className="ml-1 inline" />{TRIGGER_BADGE_LABELS[template.trigger]}</Badge>
          )}
          {!template.is_active && <Badge tone="neutral" dot={false}>معطّل</Badge>}
        </div>
      </div>
      <p className="whitespace-pre-wrap rounded-lg bg-ink-50 p-3 text-sm text-ink-700">{template.body}</p>
      <button onClick={() => setEditing(true)} className="mt-2 text-xs font-medium text-brand-600 hover:text-brand-700">تعديل</button>
    </Card>
  );
}

function TestSendCard({ templates }: { templates: MessageTemplate[] }) {
  const [phone, setPhone] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [rawMessage, setRawMessage] = useState("");
  const [result, setResult] = useState<WhatsAppMessageLog | null>(null);
  const testSend = useTestSendWhatsApp();

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    setResult(null);
    const log = await testSend.mutateAsync({
      phone,
      template_id: templateId || undefined,
      raw_message: templateId ? undefined : rawMessage || undefined,
    });
    setResult(log);
  }

  return (
    <Card className="mb-6">
      <CardHeader><CardTitle><Send size={16} className="ml-1 inline" />تجربة الإرسال</CardTitle></CardHeader>
      <p className="mb-3 text-xs text-ink-500">أرسل قالبًا (بقيم افتراضية تجريبية) أو رسالة حرة لرقم معيّن، للتأكد من الاتصال بواتساب قبل الاعتماد على القالب في نظام التفعيل التلقائي.</p>
      <form onSubmit={handleSend} className="space-y-3">
        <FormField label="رقم الهاتف">
          <Input required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="201000000000" dir="ltr" />
        </FormField>
        <FormField label="القالب (اختياري - اتركه فارغًا لإرسال رسالة حرة)">
          <Select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            <option value="">— بدون قالب (رسالة حرة) —</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </FormField>
        {!templateId && (
          <FormField label="نص الرسالة">
            <Textarea value={rawMessage} onChange={(e) => setRawMessage(e.target.value)} rows={3} placeholder="اكتب رسالة تجريبية..." />
          </FormField>
        )}
        <Button type="submit" variant="primary" isLoading={testSend.isPending}>
          <Send size={15} />إرسال تجريبي
        </Button>
      </form>
      {result && (
        <div className={`mt-4 rounded-lg p-3 text-sm ${result.success ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
          <div className="mb-1 flex items-center gap-1.5 font-medium">
            {result.success ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
            {result.success ? "تم الإرسال بنجاح" : `فشل الإرسال${result.error ? `: ${result.error}` : ""}`}
          </div>
          <p className="whitespace-pre-wrap text-xs opacity-80">{result.rendered_body}</p>
        </div>
      )}
    </Card>
  );
}

export function TemplatesPage() {
  const { data: templates, isLoading } = useMessageTemplates(true);
  const createTemplate = useCreateTemplate();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [trigger, setTrigger] = useState<TemplateTrigger>("manual");

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
          <p className="mt-1 text-sm text-ink-500">خصّص القوالب المستخدمة عند التواصل مع العملاء، واختر أي زر/مرحلة يشغّل كل قالب تلقائيًا</p>
        </div>
        <Button variant="primary" size="lg" onClick={() => setShowForm((v) => !v)}><Plus size={17} />قالب جديد</Button>
      </div>

      <TestSendCard templates={templates ?? []} />

      {showForm && (
        <Card className="mb-5 animate-scale-in">
          <CardHeader><CardTitle>قالب جديد</CardTitle></CardHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <FormField label="اسم القالب"><Input required value={name} onChange={(e) => setName(e.target.value)} /></FormField>
            <FormField label="نص الرسالة" hint={`المتغيرات المتاحة: ${PLACEHOLDER_HINTS.join(" ، ")}`}>
              <Textarea required value={body} onChange={(e) => setBody(e.target.value)} rows={5} placeholder="مرحبًا {full_name}، تم حجز موعد محاضرتك مع {teacher_name} بتاريخ {lecture_date} الساعة {lecture_time}." />
            </FormField>
            <FormField label="نوع الإرسال (اختر الزر/المرحلة التي يعمل معها هذا القالب)">
              <TriggerSelect value={trigger} onChange={setTrigger} />
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
