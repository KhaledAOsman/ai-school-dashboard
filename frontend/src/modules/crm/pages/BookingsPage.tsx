import { useState } from "react";
import { Link } from "react-router-dom";
import { Calendar } from "lucide-react";
import { translate } from "@/i18n";
import { useBookings, useRecordAttendance, useUnbookBooking, useUpdateLead, useRescheduleBooking } from "@/modules/crm/hooks/useCRM";
import { usePermission } from "@/permissions/usePermission";
import { PERMISSIONS } from "@/permissions/constants";
import { TeacherScheduleModal } from "@/modules/crm/pages/TeacherScheduleModal";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";

/** Attendance status for one booking. Always shows the current state:
 * بانتظار / حضر / لم يحضر. «تم الحضور» turns the customer into an interested
 * client (the booking stays here, marked attended); «بانتظار» undoes a
 * previous choice; تأجيل opens the schedule modal; إلغاء الحجز removes
 * this one booking only. */
export function AttendanceDropdown({ bookingId, attended, disabled }: { bookingId: string; attended: boolean | null; disabled?: boolean }) {
  const recordAttendance = useRecordAttendance();
  const reschedule = useRescheduleBooking();
  const unbook = useUnbookBooking();
  const [showSchedule, setShowSchedule] = useState(false);
  const current = attended === true ? "attended" : attended === false ? "not_attended" : "pending";
  const tone = attended === false ? "border-danger-300 text-danger-700" : attended === true ? "border-success-300 text-success-700" : "border-ink-200 text-ink-800";

  return (
    <>
      <select
        value={current}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "attended") recordAttendance.mutate({ bookingId, attended: true });
          else if (v === "not_attended") recordAttendance.mutate({ bookingId, attended: false });
          else if (v === "pending") recordAttendance.mutate({ bookingId, attended: null });
          else if (v === "postpone") setShowSchedule(true);
          else if (v === "unbook" && window.confirm("إلغاء هذا الحجز فقط؟ (باقي حجوزات العميل لا تتأثر)")) unbook.mutate({ bookingId });
        }}
        disabled={disabled || recordAttendance.isPending || unbook.isPending}
        className={`w-full cursor-pointer whitespace-nowrap rounded-lg border bg-white px-2 py-2 text-[14px] font-semibold outline-none transition-colors hover:border-brand-300 focus:border-brand-400 focus:ring-1 focus:ring-brand-400 ${tone}`}
      >
        <option value="pending">بانتظار تغيّر الحالة</option>
        <option value="attended">تم الحضور (ينتقل إلى عملاء مهتمون)</option>
        <option value="not_attended">لم يتم الحضور</option>
        <option value="postpone">تأجيل</option>
        <option value="unbook">إلغاء هذا الحجز</option>
      </select>
      {recordAttendance.isError && <p className="mt-1 text-[12px] text-danger-600">تعذر الحفظ، حاول مرة أخرى</p>}
      {showSchedule && (
        <TeacherScheduleModal
          onClose={() => setShowSchedule(false)}
          isBooking={reschedule.isPending}
          onConfirm={(slotId) => reschedule.mutateAsync({ bookingId, teacherSlotId: slotId })}
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
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const { data, isLoading } = useBookings({ page, page_size: 100, search: search || undefined, attendance: filter === "all" ? undefined : filter });
  const items = data?.items ?? [];
  const fmt = (n: number) => n.toLocaleString("ar-SA-u-nu-latn");
  const all = data ? data.pending + data.attended + data.not_attended : null;

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
        <p className="mt-1 text-sm text-ink-500">
          {data && all != null
            ? `${fmt(all)} حجز = ${fmt(data.pending)} بانتظار + ${fmt(data.not_attended)} لم يحضروا + ${fmt(data.attended)} حضروا (انتقلوا إلى عملاء مهتمون)`
            : "كل حجز محاضرة سجل مستقل — العميل الواحد قد يكون له أكثر من حجز"}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {([["all", "الكل"], ["pending", "بانتظار تغيّر الحالة"], ["not_attended", "لم يحضروا"]] as const).map(([k, label]) => (
            <button key={k} onClick={() => { setFilter(k); setPage(1); }}
              className={`rounded-lg border px-3 py-1.5 text-[13px] font-semibold transition-colors ${filter === k ? "border-brand-500 bg-white text-brand-700" : "border-ink-200 bg-white text-ink-500 hover:border-brand-300"}`}>
              {label}
            </button>
          ))}
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="بحث بالاسم أو الهاتف"
            className="h-9 w-56 rounded-lg border border-ink-200 bg-white px-3 text-[13px] outline-none focus:border-brand-400" />
        </div>
      </div>

      <Card className="overflow-hidden p-0">
        {isLoading ? (
          <p className="p-6 text-sm text-ink-500">{translate("ar", "common_loading")}</p>
        ) : items.length === 0 ? (
          <EmptyState icon={Calendar} title="لا توجد حجوزات حاليًا" />
        ) : (
          <>
            <div className="grid grid-cols-12 gap-2 border-b border-ink-100 bg-ink-50/70 px-4 py-3 text-center text-[14px] font-semibold text-ink-500">
              <div className="col-span-1">اليوم / التاريخ</div>
              <div className="col-span-2 text-start">الاسم</div>
              <div className="col-span-1">الهاتف</div>
              <div className="col-span-1">المدرّس</div>
              <div className="col-span-3">حالة الحضور</div>
              <div className="col-span-4">ملاحظات</div>
            </div>
            <div className="divide-y divide-ink-100">
              {items.map((b) => (
                <div key={b.id} className="grid grid-cols-12 items-center gap-2 px-4 py-2.5 text-center text-sm transition-colors hover:bg-ink-50/70">
                  <div className="col-span-1 flex flex-col items-center leading-tight">
                    <span className="text-[14px] font-semibold text-ink-800">{formatDayLabel(b.lecture_date)}</span>
                    <span className="ltr-content text-[12px] text-ink-400">{b.lecture_date || ""}</span>
                    <span className="ltr-content text-[13px] text-ink-400">{b.lecture_time?.slice(0, 5) || "—"}</span>
                  </div>
                  <div className="col-span-2 min-w-0 text-start">
                    <Link to={`/crm/leads/${b.lead_id}`} className="block truncate text-[15px] font-medium text-ink-900 hover:text-brand-600">{b.full_name}</Link>
                    {b.note && <span className="block truncate text-[12px] text-ink-400" title={b.note}>{b.note}</span>}
                  </div>
                  <div className="ltr-content col-span-1 text-[13px] leading-tight text-ink-500 break-all" title={b.phone}>{b.phone}</div>
                  <div className="col-span-1 truncate text-[14px] text-ink-600" title={b.teacher_name || ""}>{b.teacher_name || "—"}</div>
                  <div className="col-span-3"><AttendanceDropdown bookingId={b.id} attended={b.attended} disabled={!canManage} /></div>
                  <div className="col-span-4"><InlineNoteEdit leadId={b.lead_id} currentNote={b.lead_notes} /></div>
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
