/**
 * Professional teacher-schedule picker: a grid of every teacher's slots
 * (booked and available) so customer service sees the whole picture
 * before booking, instead of a plain per-teacher dropdown. Clicking an
 * available slot asks for confirmation before actually booking it.
 */
import { useState } from "react";
import { X, CheckCircle2, User } from "lucide-react";
import { useTeacherSchedule } from "@/modules/crm/hooks/useCRM";
import { Button } from "@/components/ui/Button";

interface PendingSelection {
  slotId: string;
  teacherName: string;
  date: string;
  time: string;
}

export function TeacherScheduleModal({
  onClose,
  onConfirm,
  isBooking,
}: {
  onClose: () => void;
  onConfirm: (slotId: string) => Promise<unknown>;
  isBooking: boolean;
}) {
  const { data: schedule, isLoading } = useTeacherSchedule();
  const [pending, setPending] = useState<PendingSelection | null>(null);

  const teachers = (schedule ?? []).slice().sort((a, b) => a.teacher_full_name.localeCompare(b.teacher_full_name));

  async function handleConfirm() {
    if (!pending) return;
    await onConfirm(pending.slotId);
    setPending(null);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
          <h2 className="text-lg font-bold text-ink-900">جدول مواعيد المعلمين</h2>
          <button onClick={onClose} className="rounded-md p-1.5 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {isLoading ? (
            <p className="text-sm text-ink-500">جارٍ التحميل...</p>
          ) : teachers.length === 0 ? (
            <p className="text-sm text-ink-500">لا يوجد معلّمون بعد</p>
          ) : (
            <div className="space-y-5">
              {teachers.map((teacher) => {
                // Only show available (not-yet-booked) slots - a booked
                // slot has nothing left to do here, so it's dropped
                // entirely rather than shown greyed-out.
                const sorted = teacher.slots
                  .filter((s) => !s.is_booked)
                  .slice()
                  .sort((a, b) => (a.slot_date + a.slot_time).localeCompare(b.slot_date + b.slot_time));
                return (
                  <div key={teacher.teacher_id}>
                    <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink-800">
                      <User size={14} className="text-brand-600" />
                      {teacher.teacher_full_name}
                    </h3>
                    {sorted.length === 0 ? (
                      <p className="text-xs text-ink-400">لا توجد مواعيد متاحة حاليًا</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {sorted.map((slot) => (
                          <button
                            key={slot.id}
                            onClick={() =>
                              setPending({
                                slotId: slot.id,
                                teacherName: teacher.teacher_full_name,
                                date: slot.slot_date,
                                time: slot.slot_time,
                              })
                            }
                            className="rounded-lg bg-success-50 px-3 py-2 text-right text-xs font-medium text-success-700 ring-1 ring-inset ring-success-200 transition-colors hover:bg-success-600 hover:text-white"
                            title="اضغط للحجز"
                          >
                            <div className="ltr-content">{slot.slot_date} — {slot.slot_time.slice(0, 5)}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {pending && (
          <div className="border-t border-ink-100 bg-ink-50 px-5 py-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2.5 text-sm text-ink-800">
                <CheckCircle2 size={18} className="shrink-0 text-brand-600" />
                <span>
                  تأكيد حجز موعد مع <strong>{pending.teacherName}</strong> بتاريخ{" "}
                  <span className="ltr-content">{pending.date} — {pending.time.slice(0, 5)}</span>؟
                </span>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button variant="primary" size="sm" isLoading={isBooking} onClick={handleConfirm}>
                  تأكيد الحجز
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setPending(null)}>
                  إلغاء
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
