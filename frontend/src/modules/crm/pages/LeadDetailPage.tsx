import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowRight, Phone, PhoneMissed, Calendar, CalendarClock, CheckCircle2, XCircle, Send, User, MessageCircle } from "lucide-react";
import { translate } from "@/i18n";
import {
  useLead,
  useBookSlot,
  useConfirmWhatsapp,
  useConfirmCall,
  useRecordAttendance,
  useSendReport,
  useLogFollowUp,
  useConvertLead,
  useLoseLead,
  useLogCallAttempt,
  useRescheduleLead,
} from "@/modules/crm/hooks/useCRM";
import { useMessageTemplates, useSendWhatsAppToLead } from "@/modules/whatsapp/hooks/useWhatsApp";
import type { CallOutcome } from "@/modules/crm/services/crmApi";
import { STAGE_LABEL, STAGE_TONE } from "@/modules/crm/pages/LeadsListPage";
import { TeacherScheduleModal } from "@/modules/crm/pages/TeacherScheduleModal";
import { usePermission } from "@/permissions/usePermission";
import { PERMISSIONS } from "@/permissions/constants";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input, Select, Textarea } from "@/components/ui/Field";

const CALL_OUTCOME_LABEL: Record<CallOutcome, string> = {
  contacted: "تم الاتصال",
  not_answered: "لم يتم الرد",
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("ar-SA", { dateStyle: "medium", timeStyle: "short" });
}

function CallAttemptPanel({ leadId }: { leadId: string }) {
  const logCallAttempt = useLogCallAttempt(leadId);
  const [note, setNote] = useState("");

  async function log(outcome: CallOutcome) {
    await logCallAttempt.mutateAsync({ outcome, note: note || undefined });
    setNote("");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>محاولة الاتصال بالعميل</CardTitle>
      </CardHeader>
      <div className="space-y-3">
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="ملاحظة (اختياري)" />
        <div className="flex flex-wrap gap-2">
          <Button variant="success" isLoading={logCallAttempt.isPending} onClick={() => log("contacted")}>
            <Phone size={15} />
            تم الاتصال
          </Button>
          <Button variant="outline" isLoading={logCallAttempt.isPending} onClick={() => log("not_answered")}>
            <PhoneMissed size={15} />
            لم يتم الرد
          </Button>
        </div>
      </div>
    </Card>
  );
}

function BookingPanel({ leadId }: { leadId: string }) {
  const bookSlot = useBookSlot(leadId);
  const [showSchedule, setShowSchedule] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle>حجز موعد المحاضرة</CardTitle>
      </CardHeader>
      <Button variant="primary" onClick={() => setShowSchedule(true)}>
        <Calendar size={15} />
        فتح جدول المواعيد
      </Button>
      {showSchedule && (
        <TeacherScheduleModal
          onClose={() => setShowSchedule(false)}
          isBooking={bookSlot.isPending}
          onConfirm={(slotId) => bookSlot.mutateAsync(slotId)}
        />
      )}
    </Card>
  );
}

function ReschedulePanel({ leadId }: { leadId: string }) {
  const reschedule = useRescheduleLead(leadId);
  const [showSchedule, setShowSchedule] = useState(false);

  return (
    <>
      <Button variant="outline" onClick={() => setShowSchedule(true)}>
        <CalendarClock size={15} />
        تأجيل الموعد
      </Button>
      {showSchedule && (
        <TeacherScheduleModal
          onClose={() => setShowSchedule(false)}
          isBooking={reschedule.isPending}
          onConfirm={(slotId) => reschedule.mutateAsync({ teacherSlotId: slotId })}
        />
      )}
    </>
  );
}

function SendWhatsAppPanel({ leadId }: { leadId: string }) {
  const { data: templates } = useMessageTemplates();
  const sendMessage = useSendWhatsAppToLead(leadId);
  const [expanded, setExpanded] = useState(false);
  const [templateId, setTemplateId] = useState("");
  const [rawMessage, setRawMessage] = useState("");
  const [result, setResult] = useState<{ success: boolean; error: string | null } | null>(null);

  const manualTemplates = (templates ?? []).filter((t) => t.trigger === "manual");

  async function handleSend() {
    const payload = templateId ? { template_id: templateId } : { raw_message: rawMessage };
    const log = await sendMessage.mutateAsync(payload);
    setResult({ success: log.success, error: log.error });
  }

  if (!expanded) {
    return (
      <Button variant="outline" onClick={() => setExpanded(true)}>
        <MessageCircle size={15} />
        إرسال رسالة واتساب
      </Button>
    );
  }

  return (
    <Card className="animate-scale-in">
      <CardHeader>
        <CardTitle>إرسال رسالة واتساب</CardTitle>
      </CardHeader>
      <div className="space-y-3">
        <Select value={templateId} onChange={(e) => { setTemplateId(e.target.value); setRawMessage(""); }}>
          <option value="">رسالة حرة (بدون قالب)...</option>
          {manualTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </Select>
        {!templateId && (
          <Textarea value={rawMessage} onChange={(e) => setRawMessage(e.target.value)} rows={3} placeholder="نص الرسالة" />
        )}
        {result && (
          <p className={`text-xs ${result.success ? "text-success-600" : "text-danger-600"}`}>
            {result.success ? "تم الإرسال بنجاح" : `فشل الإرسال: ${result.error}`}
          </p>
        )}
        <div className="flex gap-2">
          <Button
            variant="primary"
            size="sm"
            disabled={!templateId && !rawMessage.trim()}
            isLoading={sendMessage.isPending}
            onClick={handleSend}
          >
            <Send size={14} />
            إرسال
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setExpanded(false)}>إغلاق</Button>
        </div>
      </div>
    </Card>
  );
}

export function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: lead, isLoading } = useLead(id);

  const confirmWhatsapp = useConfirmWhatsapp(id!);
  const confirmCall = useConfirmCall(id!);
  const recordAttendance = useRecordAttendance(id!);
  const sendReport = useSendReport(id!);
  const logFollowUp = useLogFollowUp(id!);
  const convertLead = useConvertLead(id!);
  const loseLead = useLoseLead(id!);

  const canManage = usePermission(PERMISSIONS.CRM_LEAD_MANAGE);

  const [followUpNote, setFollowUpNote] = useState("");
  const [lossReason, setLossReason] = useState("");
  const [showLoseForm, setShowLoseForm] = useState(false);

  if (isLoading || !lead) {
    return <p className="text-sm text-ink-500">{translate("ar", "common_loading")}</p>;
  }

  const isTerminal = lead.is_converted || lead.is_lost;

  return (
    <div className="max-w-2xl">
      <button
        onClick={() => navigate(-1)}
        className="mb-4 flex items-center gap-1.5 text-sm font-medium text-ink-500 transition-colors hover:text-ink-800"
      >
        <ArrowRight size={15} />
        رجوع
      </button>

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-[26px] font-bold tracking-tight text-ink-900">{lead.full_name}</h1>
            <Badge tone={STAGE_TONE[lead.stage]}>{STAGE_LABEL[lead.stage]}</Badge>
          </div>
          <p className="ltr-content mt-1 text-sm text-ink-500">{lead.phone}</p>
        </div>
        {canManage && <SendWhatsAppPanel leadId={lead.id} />}
      </div>

      {isTerminal ? (
        <Card className="mb-5">
          <div className="flex items-center gap-2.5">
            {lead.is_converted ? (
              <CheckCircle2 className="text-success-600" size={20} />
            ) : (
              <XCircle className="text-danger-600" size={20} />
            )}
            <p className="font-medium text-ink-800">
              {lead.is_converted ? "تم تحويل هذا العميل بنجاح إلى عميل فعلي" : `تم إغلاق هذا العميل: ${lead.lost_reason}`}
            </p>
          </div>
        </Card>
      ) : (
        <div className="mb-5 space-y-4">
          {(lead.stage === "new" || lead.stage === "contacted" || lead.stage === "not_answered") && canManage && (
            <CallAttemptPanel leadId={lead.id} />
          )}

          {(lead.stage === "new" || lead.stage === "contacted" || lead.stage === "not_answered") && canManage && (
            <BookingPanel leadId={lead.id} />
          )}

          {lead.teacher_name && (
            <Card>
              <div className="flex items-center gap-2 text-sm text-ink-700">
                <Calendar size={16} className="text-brand-600" />
                محاضرة مع <span className="font-semibold">{lead.teacher_name}</span> بتاريخ {lead.lecture_date} الساعة {lead.lecture_time}
              </div>
            </Card>
          )}

          {lead.stage === "booked" && canManage && (
            <Card>
              <p className="mb-3 text-sm text-ink-600">تأكيد الموعد عبر الواتساب</p>
              <Button variant="primary" isLoading={confirmWhatsapp.isPending} onClick={() => confirmWhatsapp.mutate(undefined)}>
                <Phone size={15} />
                تم التأكيد بالواتساب
              </Button>
            </Card>
          )}

          {lead.stage === "confirmed_whatsapp" && canManage && (
            <Card>
              <p className="mb-3 text-sm text-ink-600">تأكيد الموعد بمكالمة هاتفية قبل المحاضرة</p>
              <Button variant="primary" isLoading={confirmCall.isPending} onClick={() => confirmCall.mutate(undefined)}>
                <Phone size={15} />
                تم التأكيد هاتفيًا
              </Button>
            </Card>
          )}

          {lead.stage === "zoom_sent" && canManage && (
            <Card>
              <p className="mb-3 text-sm text-ink-600">هل حضر العميل المحاضرة؟</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="success" isLoading={recordAttendance.isPending} onClick={() => recordAttendance.mutate({ attended: true })}>
                  <CheckCircle2 size={15} />
                  حضر
                </Button>
                <Button variant="danger" isLoading={recordAttendance.isPending} onClick={() => recordAttendance.mutate({ attended: false })}>
                  <XCircle size={15} />
                  لم يحضر
                </Button>
                <ReschedulePanel leadId={lead.id} />
              </div>
            </Card>
          )}

          {lead.attended !== null && (
            <Card>
              <Badge tone={lead.attended ? "success" : "danger"}>{lead.attended ? "حضر المحاضرة" : "لم يحضر المحاضرة"}</Badge>
            </Card>
          )}

          {lead.stage === "attendance_recorded" && lead.attended && canManage && (
            <Card>
              <p className="mb-3 text-sm text-ink-600">إرسال تقرير المحاضرة للعميل</p>
              <Button variant="primary" isLoading={sendReport.isPending} onClick={() => sendReport.mutate(undefined)}>
                <Send size={15} />
                تم إرسال التقرير
              </Button>
            </Card>
          )}

          {lead.stage === "attendance_recorded" && !lead.attended && canManage && (
            <Card>
              <p className="mb-3 text-sm text-ink-600">لم يحضر العميل — يمكن تأجيل الموعد</p>
              <ReschedulePanel leadId={lead.id} />
            </Card>
          )}

          {(lead.stage === "report_sent" || lead.stage === "follow_up") && canManage && (
            <Card>
              <p className="mb-3 text-sm text-ink-600">تسجيل محاولة متابعة لتحويل العميل (يمكن تكرارها أكثر من مرة)</p>
              <div className="mb-3 flex gap-2">
                <Textarea value={followUpNote} onChange={(e) => setFollowUpNote(e.target.value)} rows={2} placeholder="ملاحظة عن المحاولة (اختياري)" />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  isLoading={logFollowUp.isPending}
                  onClick={async () => {
                    await logFollowUp.mutateAsync(followUpNote || undefined);
                    setFollowUpNote("");
                  }}
                >
                  تسجيل محاولة متابعة
                </Button>
                <Button variant="success" isLoading={convertLead.isPending} onClick={() => convertLead.mutate(undefined)}>
                  <CheckCircle2 size={15} />
                  تحويل إلى عميل فعلي
                </Button>
                {!showLoseForm ? (
                  <Button variant="danger" onClick={() => setShowLoseForm(true)}>
                    إغلاق كعميل مفقود
                  </Button>
                ) : null}
              </div>
              {showLoseForm && (
                <div className="mt-3 animate-scale-in space-y-2">
                  <Textarea value={lossReason} onChange={(e) => setLossReason(e.target.value)} rows={2} placeholder="سبب فقدان العميل" />
                  <div className="flex gap-2">
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={!lossReason.trim()}
                      isLoading={loseLead.isPending}
                      onClick={() => loseLead.mutate(lossReason)}
                    >
                      تأكيد الإغلاق
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setShowLoseForm(false)}>
                      إلغاء
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          )}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>سجل المراحل</CardTitle>
        </CardHeader>
        <div className="space-y-3">
          {[
            ...lead.stage_events.map((e) => ({ kind: "stage" as const, ...e })),
            ...lead.call_attempts.map((a) => ({ kind: "call" as const, ...a })),
          ]
            .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
            .map((item) => (
              <div key={`${item.kind}-${item.id}`} className="flex items-start gap-3 border-b border-ink-100 pb-3 last:border-0 last:pb-0">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                  {item.kind === "call" ? <Phone size={13} /> : <User size={13} />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {item.kind === "stage" ? (
                      <Badge tone={STAGE_TONE[item.stage]} dot={false}>
                        {STAGE_LABEL[item.stage]}
                      </Badge>
                    ) : (
                      <Badge tone={item.outcome === "contacted" ? "success" : "neutral"} dot={false}>
                        {CALL_OUTCOME_LABEL[item.outcome]}
                      </Badge>
                    )}
                    <span className="text-xs text-ink-400">{formatDateTime(item.created_at)}</span>
                  </div>
                  <p className="mt-1 text-sm text-ink-700">
                    بواسطة <span className="font-medium">{item.performed_by_name}</span>
                    {item.note && <span className="text-ink-500"> — {item.note}</span>}
                  </p>
                </div>
              </div>
            ))}
        </div>
      </Card>
    </div>
  );
}
