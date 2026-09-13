/**
 * "الحجوزات" (bookings) - every lead that has a booked slot but hasn't
 * had its report sent yet (stage in BOOKINGS_GROUP_STAGES: booked,
 * confirmed_whatsapp, confirmed_call, zoom_sent, attendance_recorded).
 * Sorted by lecture date/time so it reads like an agenda. Attendance
 * (حضر/لم يحضر) and تأجيل are available inline; sending the report moves
 * the lead into "عملاء مهتمون" and off this list.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, XCircle, CalendarClock, Send, Video, Calendar } from "lucide-react";
import { translate } from "@/i18n";
import {
  useLeadsSearch,
  useRecordAttendance,
  useSendReport,
  useRescheduleLead,
  useCRMTeachers,
} from "@/modules/crm/hooks/useCRM";
import { usePermission } from "@/permissions/usePermission";
import { PERMISSIONS } from "@/permissions/constants";
import { STAGE_LABEL, STAGE_TONE } from "@/modules/crm/pages/LeadsListPage";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";

function InlineReschedule({ leadId }: { leadId: string }) {
  const { data: teachers } = useCRMTeachers();
  const reschedule = useRescheduleLead(leadId);
  const [open, setOpen] = useState(false);
  const [teacherId, setTeacherId] = useState("");

  const selectedTeacher = teachers?.find((t) => t.id === teacherId);

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} title="تأجيل الموعد" className="rounded-md p-1.5 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700">
        <CalendarClock size={14} />
      </button>
    );
  }

  return (
    <div className="absolute z-10 mt-1 w-64 rounded-lg bg-white p-3 shadow-lg ring-1 ring-ink-200">
      <p className="mb-2 text-xs font-medium text-ink-600">اختر الموعد الجديد</p>
      <select value={teacherId} onChange={(e) => setTeacherId(e.target.value)} className="mb-2 w-full rounded-md border border-ink-200 px-2 py-1.5 text-xs">
        <option value="">اختر المدرّس</option>
        {(teachers ?? []).map((t) => <option key={t.id} value={t.id}>{t.full_name} ({t.available_slots.length})</option>)}
      </select>
      {selectedTeacher && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {selectedTeacher.available_slots.map((slot) => (
            <button
              key={slot.id}
              onClick={async () => { await reschedule.mutateAsync({ teacherSlotId: slot.id }); setOpen(false); }}
              className="rounded-full bg-ink-100 px-2.5 py-1 text-[11px] font-medium text-ink-700 hover:bg-brand-600 hover:text-white"
            >
              {slot.slot_date} {slot.slot_time.slice(0, 5)}
            </button>
          ))}
        </div>
      )}
      <button onClick={() => setOpen(false)} className="text-xs text-ink-400 hover:text-ink-700">إلغاء</button>
    </div>
  );
}

function BookingRow({ leadId, fullName, phone, stage, teacherName, lectureTime, zoomLink, attended, canManage }: {
  leadId: string; fullName: string; phone: string; stage: string; teacherName: string | null;
  lectureTime: string | null; zoomLink: string | null; attended: boolean | null; canManage: boolean;
}) {
  const recordAttendance = useRecordAttendance(leadId);
  const sendReport = useSendReport(leadId);

  return (
    <div className="relative grid grid-cols-12 items-center gap-3 px-5 py-3 text-sm transition-colors hover:bg-ink-50/70">
      <div className="ltr-content col-span-1 text-left text-xs font-semibold text-ink-700">{lectureTime?.slice(0, 5) || "—"}</div>
      <Link to={`/crm/leads/${leadId}`} className="col-span-2 truncate font-medium text-ink-900 hover:text-brand-600">{fullName}</Link>
      <div className="ltr-content col-span-1 truncate text-left text-xs text-ink-500">{phone}</div>
      <div className="col-span-2 truncate text-xs text-ink-600">{teacherName || "—"}</div>
      <div className="col-span-2"><Badge tone={STAGE_TONE[stage as keyof typeof STAGE_TONE]} dot={false}>{STAGE_LABEL[stage as keyof typeof STAGE_LABEL]}</Badge></div>
      <div className="col-span-1">
        {zoomLink && (
          <a href={zoomLink} target="_blank" rel="noreferrer" className="inline-flex rounded-full bg-brand-50 p-1.5 text-brand-600 hover:bg-brand-100" title="فتح رابط الزوم">
            <Video size={13} />
          </a>
        )}
      </div>
      <div className="col-span-3 flex items-center gap-1.5">
        {canManage && stage === "zoom_sent" && (
          <>
            <Button size="sm" variant="success" isLoading={recordAttendance.isPending} onClick={() => recordAttendance.mutate({ attended: true })}>
              <CheckCircle2 size={13} />حضر
            </Button>
            <Button size="sm" variant="danger" isLoading={recordAttendance.isPending} onClick={() => recordAttendance.mutate({ attended: false })}>
              <XCircle size={13} />لم يحضر
            </Button>
            <InlineReschedule leadId={leadId} />
          </>
        )}
        {canManage && stage === "attendance_recorded" && attended && (
          <Button size="sm" variant="primary" isLoading={sendReport.isPending} onClick={() => sendReport.mutate(undefined)}>
            <Send size={13} />تم إرسال التقرير
          </Button>
        )}
        {canManage && stage === "attendance_recorded" && !attended && <InlineReschedule leadId={leadId} />}
        {canManage && stage !== "zoom_sent" && stage !== "attendance_recorded" && <InlineReschedule leadId={leadId} />}
      </div>
    </div>
  );
}

export function BookingsPage() {
  const canManage = usePermission(PERMISSIONS.CRM_LEAD_MANAGE);
  const canViewAll = usePermission(PERMISSIONS.CRM_LEAD_VIEW_ALL);
  const [mineOnly, setMineOnly] = useState(false);

  const { data, isLoading } = useLeadsSearch({
    page: 1,
    page_size: 200,
    group: "bookings",
    sort_by: "created_at",
    sort_dir: "asc",
    mine_only: canViewAll ? mineOnly : undefined,
  });

  const sorted = (data?.items ?? []).slice().sort((a, b) => {
    const dateCompare = (a.lecture_date ?? "").localeCompare(b.lecture_date ?? "");
    if (dateCompare !== 0) return dateCompare;
    return (a.lecture_time ?? "").localeCompare(b.lecture_time ?? "");
  });

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight text-ink-900">الحجوزات</h1>
          <p className="mt-1 text-sm text-ink-500">{data ? `${data.total.toLocaleString("ar-SA")} محاضرة محجوزة` : "المحاضرات المحجوزة بانتظار الحضور والتقرير"}</p>
        </div>
        {canViewAll && (
          <label className="flex items-center gap-2 text-sm text-ink-600">
            <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} className="rounded" />
            حجوزاتي فقط
          </label>
        )}
      </div>

      <Card className="overflow-hidden p-0">
        {isLoading ? (
          <p className="p-6 text-sm text-ink-500">{translate("ar", "common_loading")}</p>
        ) : sorted.length === 0 ? (
          <EmptyState icon={Calendar} title="لا توجد حجوزات حاليًا" />
        ) : (
          <>
            <div className="grid grid-cols-12 gap-3 border-b border-ink-100 bg-ink-50/70 px-5 py-2.5 text-xs font-semibold text-ink-500">
              <div className="col-span-1">الوقت</div>
              <div className="col-span-2">الاسم</div>
              <div className="col-span-1">الهاتف</div>
              <div className="col-span-2">المدرّس</div>
              <div className="col-span-2">الحالة</div>
              <div className="col-span-1">زوم</div>
              <div className="col-span-3">إجراء</div>
            </div>
            <div className="divide-y divide-ink-100">
              {sorted.map((lead) => (
                <BookingRow
                  key={lead.id}
                  leadId={lead.id}
                  fullName={lead.full_name}
                  phone={lead.phone}
                  stage={lead.stage}
                  teacherName={lead.teacher_name}
                  lectureTime={lead.lecture_time}
                  zoomLink={lead.zoom_link}
                  attended={lead.attended}
                  canManage={canManage}
                />
              ))}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
