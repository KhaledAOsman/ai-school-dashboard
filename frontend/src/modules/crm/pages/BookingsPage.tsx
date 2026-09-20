import { useState } from "react";
import { Link } from "react-router-dom";
import { Send, Calendar } from "lucide-react";
import { translate } from "@/i18n";
import { useLeadsSearch, useRecordAttendance, useSendReport, useUpdateLead, useRescheduleLead } from "@/modules/crm/hooks/useCRM";
import { usePermission } from "@/permissions/usePermission";
import { PERMISSIONS } from "@/permissions/constants";
import { STAGE_LABEL, STAGE_TONE } from "@/modules/crm/pages/LeadsListPage";
import { TeacherScheduleModal } from "@/modules/crm/pages/TeacherScheduleModal";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";

/** Attendance dropdown: حضر / لم يحضر / تأجيل - تأجيل opens the schedule
 * modal instead of writing an attended value. */
function AttendanceDropdown({ leadId }: { leadId: string }) {
  const recordAttendance = useRecordAttendance(leadId);
  const reschedule = useRescheduleLead(leadId);
  const [showSchedule, setShowSchedule] = useState(false);

  return (
    <>
      <select
        value=""
        onChange={(e) => {
          if (e.target.value === "attended") recordAttendance.mutate({ attended: true });
          else if (e.target.value === "not_attended") recordAttendance.mutate({ attended: false });
          else if (e.target.value === "postpone") setShowSchedule(true);
        }}
        disabled={recordAttendance.isPending}
        className="w-full cursor-pointer whitespace-nowrap rounded-lg border border-ink-200 bg-white px-2 py-2 text-[13px] font-medium text-ink-800 outline-none transition-colors hover:border-brand-300 focus:border-brand-400 focus:ring-1 focus:ring-brand-400"
      >
        <option value="">تحديد الحضور...</option>
        <option value="attended">تم الحضور</option>
        <option value="not_attended">لم يتم الحضور</option>
        <option value="postpone">تأجيل</option>
      </select>
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

function ReportButton({ leadId, stage, attended }: { leadId: string; stage: string; attended: boolean | null }) {
  const sendReport = useSendReport(leadId);
  if (stage !== "attendance_recorded" || attended !== true) return <span className="text-xs text-ink-300">—</span>;
  return (
    <Button size="sm" variant="primary" isLoading={sendReport.isPending} onClick={() => sendReport.mutate(undefined)} className="w-full whitespace-nowrap !px-2 !text-[12px]">
      <Send size={12} />إرسال التقرير
    </Button>
  );
}

function InlineNoteEdit({ leadId, currentNote }: { leadId: string; currentNote: string | null }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(currentNote ?? "");
  const updateLead = useUpdateLead(leadId);

  async function save() {
    setEditing(false);
    if (value === (currentNote ?? "")) return;
    await updateLead.mutateAsync({ notes: value || null });
  }

  if (editing) {
    return (
      <input autoFocus value={value} onChange={(e) => setValue(e.target.value)} onBlur={save}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") { setValue(currentNote ?? ""); setEditing(false); } }}
        className="w-full rounded-lg border border-brand-300 bg-white px-2.5 py-2 text-[13px] text-ink-800 outline-none ring-1 ring-brand-400" />
    );
  }
  return (
    <button onClick={() => setEditing(true)} className="w-full whitespace-normal break-words rounded-lg px-2.5 py-2 text-start text-[13px] leading-snug text-ink-600 transition-colors hover:bg-ink-100" title="اضغط للتعديل">
      {currentNote || <span className="text-ink-300">إضافة ملاحظة...</span>}
    </button>
  );
}

export function BookingsPage() {
  const canManage = usePermission(PERMISSIONS.CRM_LEAD_MANAGE);

  const { data, isLoading } = useLeadsSearch({ page: 1, page_size: 200, group: "bookings" });

  // Always sorted soonest-first regardless of what the API returns, so
  // the nearest upcoming lecture is always at the top of the list.
  const sorted = (data?.items ?? []).slice().sort((a, b) => {
    const d = (a.lecture_date ?? "9999-99-99").localeCompare(b.lecture_date ?? "9999-99-99");
    return d !== 0 ? d : (a.lecture_time ?? "").localeCompare(b.lecture_time ?? "");
  });

  function formatDayLabel(dateStr: string | null): string {
    if (!dateStr) return "—";
    const date = new Date(dateStr);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const isSameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
    if (isSameDay(date, today)) return "اليوم";
    if (isSameDay(date, tomorrow)) return "غدًا";
    return date.toLocaleDateString("ar-SA", { weekday: "long" });
  }

  return (
    <div className="max-w-none">
      <div className="mb-6">
        <h1 className="text-[26px] font-bold tracking-tight text-ink-900">الحجوزات</h1>
        <p className="mt-1 text-sm text-ink-500">{data ? `${data.total.toLocaleString("ar-SA")} محاضرة محجوزة` : "المحاضرات المحجوزة بانتظار الحضور والتقرير، مرتبة من الأقرب للأبعد"}</p>
      </div>

      <Card className="overflow-hidden p-0">
        {isLoading ? (
          <p className="p-6 text-sm text-ink-500">{translate("ar", "common_loading")}</p>
        ) : sorted.length === 0 ? (
          <EmptyState icon={Calendar} title="لا توجد حجوزات حاليًا" />
        ) : (
          <>
            <div className="grid grid-cols-12 gap-2 border-b border-ink-100 bg-ink-50/70 px-4 py-3 text-center text-[13px] font-semibold text-ink-500">
              <div className="col-span-1">الموعد</div>
              <div className="col-span-2 text-start">الاسم</div>
              <div className="col-span-1">الهاتف</div>
              <div className="col-span-1">المدرّس</div>
              <div className="col-span-3">الحضور</div>
              <div className="col-span-2">ملاحظات</div>
              <div className="col-span-2">التقرير</div>
            </div>
            <div className="divide-y divide-ink-100">
              {sorted.map((lead) => (
                <div key={lead.id} className="grid grid-cols-12 items-center gap-2 px-4 py-2.5 text-center text-sm transition-colors hover:bg-ink-50/70">
                  <div className="col-span-1 flex flex-col items-center leading-tight">
                    <span className="text-[12.5px] font-semibold text-ink-800">{formatDayLabel(lead.lecture_date)}</span>
                    <span className="ltr-content text-[11px] text-ink-400">{lead.lecture_time?.slice(0, 5) || "—"}</span>
                  </div>
                  <Link to={`/crm/leads/${lead.id}`} className="col-span-2 truncate text-start text-[14px] font-medium text-ink-900 hover:text-brand-600">{lead.full_name}</Link>
                  <div className="ltr-content col-span-1 text-[11.5px] leading-tight text-ink-500 break-all" title={lead.phone}>{lead.phone}</div>
                  <div className="col-span-1 truncate text-[13px] text-ink-600" title={lead.teacher_name || ""}>{lead.teacher_name || "—"}</div>
                  <div className="col-span-3">{canManage ? <AttendanceDropdown leadId={lead.id} /> : <Badge tone={STAGE_TONE[lead.stage]} dot={false}>{STAGE_LABEL[lead.stage]}</Badge>}</div>
                  <div className="col-span-2"><InlineNoteEdit leadId={lead.id} currentNote={lead.notes} /></div>
                  <div className="col-span-2">{canManage ? <ReportButton leadId={lead.id} stage={lead.stage} attended={lead.attended} /> : null}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
