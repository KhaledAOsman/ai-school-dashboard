import { useState } from "react";
import { Link } from "react-router-dom";
import { Calendar } from "lucide-react";
import { translate } from "@/i18n";
import { useLeadsSearch, useRecordAttendance, useUnbookLead, useUpdateLead, useRescheduleLead } from "@/modules/crm/hooks/useCRM";
import { usePermission } from "@/permissions/usePermission";
import { PERMISSIONS } from "@/permissions/constants";
import { TeacherScheduleModal } from "@/modules/crm/pages/TeacherScheduleModal";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";

/** Attendance status for one booking. The select always shows the current
 * state: بانتظار (not decided yet) / لم يحضر. Choosing «تم الحضور» turns the
 * lead into an interested client and removes it from this table; «بانتظار»
 * undoes a previous choice; تأجيل opens the schedule modal. */
function AttendanceDropdown({ leadId, attended, disabled }: { leadId: string; attended: boolean | null; disabled?: boolean }) {
  const recordAttendance = useRecordAttendance(leadId);
  const reschedule = useRescheduleLead(leadId);
  const unbook = useUnbookLead(leadId);
  const [showSchedule, setShowSchedule] = useState(false);
  const current = attended === false ? "not_attended" : "pending";
  const tone = attended === false ? "border-danger-300 text-danger-700" : "border-ink-200 text-ink-800";

  return (
    <>
      <select
        value={current}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "attended") recordAttendance.mutate({ attended: true });
          else if (v === "not_attended") recordAttendance.mutate({ attended: false });
          else if (v === "pending") recordAttendance.mutate({ attended: null });
          else if (v === "postpone") setShowSchedule(true);
          else if (v === "unbook" && window.confirm("إلغاء الحجز وإرجاع العميل إلى العملاء المحتملين؟")) unbook.mutate(undefined);
        }}
        disabled={disabled || recordAttendance.isPending || unbook.isPending}
        className={`w-full cursor-pointer whitespace-nowrap rounded-lg border bg-white px-2 py-2 text-[14px] font-semibold outline-none transition-colors hover:border-brand-300 focus:border-brand-400 focus:ring-1 focus:ring-brand-400 ${tone}`}
      >
        <option value="pending">بانتظار تغيّر الحالة</option>
        <option value="attended">تم الحضور ← عميل مهتم</option>
        <option value="not_attended">لم يتم الحضور</option>
        <option value="postpone">تأجيل</option>
        <option value="unbook">إلغاء الحجز (عميل محتمل)</option>
      </select>
      {recordAttendance.isError && <p className="mt-1 text-[12px] text-danger-600">تعذر الحفظ، حاول مرة أخرى</p>}
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
        className="w-full rounded-lg border border-brand-300 bg-white px-2.5 py-2 text-[14px] text-ink-800 outline-none ring-1 ring-brand-400" />
    );
  }
  return (
    <button onClick={() => setEditing(true)} className="w-full whitespace-normal break-words rounded-lg px-2.5 py-2 text-start text-[14px] leading-snug text-ink-600 transition-colors hover:bg-ink-100" title="اضغط للتعديل">
      {currentNote || <span className="text-ink-300">إضافة ملاحظة...</span>}
    </button>
  );
}

export function BookingsPage() {
  const canManage = usePermission(PERMISSIONS.CRM_LEAD_MANAGE);

  const [filter, setFilter] = useState<"all" | "pending" | "not_attended">("all");
  const [page, setPage] = useState(1);
  const { data, isLoading } = useLeadsSearch({ page, page_size: 200, group: "bookings", attendance: filter === "all" ? undefined : filter });
  // totals for the summary line (cheap count-only queries, always unfiltered)
  const total = useLeadsSearch({ page: 1, page_size: 1, group: "bookings" }).data?.total;
  const nPending = useLeadsSearch({ page: 1, page_size: 1, group: "bookings", attendance: "pending" }).data?.total;
  const nNot = useLeadsSearch({ page: 1, page_size: 1, group: "bookings", attendance: "not_attended" }).data?.total;
  const all = data?.items ?? [];

  // Always sorted soonest-first regardless of what the API returns, so
  // the nearest upcoming lecture is always at the top of the list.
  const sorted = all.slice().sort((a, b) => {
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
    return date.toLocaleDateString("ar-SA-u-nu-latn", { weekday: "long" });
  }

  return (
    <div className="max-w-none">
      <div className="mb-6">
        <h1 className="text-[26px] font-bold tracking-tight text-ink-900">الحجوزات</h1>
        <p className="mt-1 text-sm text-ink-500">{total != null && nPending != null && nNot != null ? `${total.toLocaleString("ar-SA-u-nu-latn")} حجز = ${nPending.toLocaleString("ar-SA-u-nu-latn")} بانتظار + ${nNot.toLocaleString("ar-SA-u-nu-latn")} لم يحضروا` : "المحاضرات المحجوزة بانتظار تأكيد الحضور"}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {([["all", "الكل"], ["pending", "بانتظار تغيّر الحالة"], ["not_attended", "لم يحضروا"]] as const).map(([k, label]) => (
            <button key={k} onClick={() => { setFilter(k); setPage(1); }}
              className={`rounded-lg border px-3 py-1.5 text-[13px] font-semibold transition-colors ${filter === k ? "border-brand-500 bg-white text-brand-700" : "border-ink-200 bg-white text-ink-500 hover:border-brand-300"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <Card className="overflow-hidden p-0">
        {isLoading ? (
          <p className="p-6 text-sm text-ink-500">{translate("ar", "common_loading")}</p>
        ) : sorted.length === 0 ? (
          <EmptyState icon={Calendar} title="لا توجد حجوزات حاليًا" />
        ) : (
          <>
            <div className="grid grid-cols-12 gap-2 border-b border-ink-100 bg-ink-50/70 px-4 py-3 text-center text-[14px] font-semibold text-ink-500">
              <div className="col-span-1">الموعد</div>
              <div className="col-span-2 text-start">الاسم</div>
              <div className="col-span-1">الهاتف</div>
              <div className="col-span-1">المدرّس</div>
              <div className="col-span-3">حالة الحضور</div>
              <div className="col-span-4">ملاحظات</div>
            </div>
            <div className="divide-y divide-ink-100">
              {sorted.map((lead) => (
                <div key={lead.id} className="grid grid-cols-12 items-center gap-2 px-4 py-2.5 text-center text-sm transition-colors hover:bg-ink-50/70">
                  <div className="col-span-1 flex flex-col items-center leading-tight">
                    <span className="text-[14px] font-semibold text-ink-800">{formatDayLabel(lead.lecture_date)}</span>
                    <span className="ltr-content text-[13px] text-ink-400">{lead.lecture_time?.slice(0, 5) || "—"}</span>
                  </div>
                  <Link to={`/crm/leads/${lead.id}`} className="col-span-2 truncate text-start text-[15px] font-medium text-ink-900 hover:text-brand-600">{lead.full_name}</Link>
                  <div className="ltr-content col-span-1 text-[13px] leading-tight text-ink-500 break-all" title={lead.phone}>{lead.phone}</div>
                  <div className="col-span-1 truncate text-[14px] text-ink-600" title={lead.teacher_name || ""}>{lead.teacher_name || "—"}</div>
                  <div className="col-span-3"><AttendanceDropdown leadId={lead.id} attended={lead.attended} disabled={!canManage} /></div>
                  <div className="col-span-4"><InlineNoteEdit leadId={lead.id} currentNote={lead.notes} /></div>
                </div>
              ))}
            </div>
            {data && data.total_pages > 1 && (
              <div className="flex items-center justify-between border-t border-ink-100 px-6 py-3">
                <p className="text-xs text-ink-500">صفحة {data.page} من {data.total_pages}</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>السابق</Button>
                  <Button size="sm" variant="outline" disabled={page >= data.total_pages} onClick={() => setPage((p) => p + 1)}>التالي</Button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
