/**
 * Upcoming lectures schedule - a calendar-style view of every lead that
 * has reached the "booked" stage or beyond, grouped by date.
 */
import { Link } from "react-router-dom";
import { Calendar, Video } from "lucide-react";
import { translate } from "@/i18n";
import { useSchedule } from "@/modules/crm/hooks/useCRM";
import { STAGE_LABEL, STAGE_TONE } from "@/modules/crm/pages/LeadsListPage";
import { usePermission } from "@/permissions/usePermission";
import { PERMISSIONS } from "@/permissions/constants";
import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";

function formatDayHeading(dateStr: string): string {
  const date = new Date(dateStr);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const isSameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

  if (isSameDay(date, today)) return "اليوم";
  if (isSameDay(date, tomorrow)) return "غدًا";
  return date.toLocaleDateString("ar-SA", { weekday: "long", day: "numeric", month: "long" });
}

export function SchedulePage() {
  const canViewAll = usePermission(PERMISSIONS.CRM_LEAD_VIEW_ALL);
  const [mineOnly, setMineOnly] = useState(true);
  const { data: schedule, isLoading } = useSchedule(canViewAll ? mineOnly : true);

  const groupedByDate = (schedule ?? []).reduce<Record<string, typeof schedule>>((acc, item) => {
    const key = item.lecture_date ?? "بدون تاريخ";
    if (!acc[key]) acc[key] = [];
    acc[key]!.push(item);
    return acc;
  }, {});

  const sortedDates = Object.keys(groupedByDate).sort();

  return (
    <div className="max-w-3xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight text-ink-900">جدول المواعيد</h1>
          <p className="mt-1 text-sm text-ink-500">كل المحاضرات المحجوزة، مرتبة حسب التاريخ</p>
        </div>
        {canViewAll && (
          <label className="flex items-center gap-2 text-sm text-ink-600">
            <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} className="rounded" />
            مواعيدي فقط
          </label>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-ink-500">{translate("ar", "common_loading")}</p>
      ) : sortedDates.length === 0 ? (
        <Card>
          <EmptyState icon={Calendar} title="لا توجد مواعيد محجوزة بعد" />
        </Card>
      ) : (
        <div className="space-y-6">
          {sortedDates.map((dateKey) => (
            <div key={dateKey}>
              <h2 className="mb-2.5 flex items-center gap-2 text-sm font-semibold text-ink-700">
                <Calendar size={15} className="text-brand-600" />
                {dateKey === "بدون تاريخ" ? dateKey : formatDayHeading(dateKey)}
                <span className="ltr-content font-normal text-ink-400">{dateKey !== "بدون تاريخ" ? `— ${dateKey}` : ""}</span>
              </h2>
              <Card className="overflow-hidden p-0">
                <div className="divide-y divide-ink-100">
                  {groupedByDate[dateKey]!
                    .slice()
                    .sort((a, b) => (a.lecture_time ?? "").localeCompare(b.lecture_time ?? ""))
                    .map((item) => (
                      <Link
                        key={item.lead_id}
                        to={`/crm/leads/${item.lead_id}`}
                        className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-ink-50/70"
                      >
                        <div className="ltr-content w-16 shrink-0 text-sm font-semibold text-ink-800">
                          {item.lecture_time?.slice(0, 5) || "—"}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-ink-900">{item.lead_full_name}</p>
                          <p className="ltr-content text-xs text-ink-500">{item.lead_phone}</p>
                        </div>
                        <div className="w-32 shrink-0 truncate text-sm text-ink-600">{item.teacher_name || "—"}</div>
                        <div className="w-36 shrink-0">
                          <Badge tone={STAGE_TONE[item.stage]}>{STAGE_LABEL[item.stage]}</Badge>
                        </div>
                        <div className="w-24 shrink-0 truncate text-xs text-ink-400">{item.assigned_to_name || "—"}</div>
                        {item.zoom_link && (
                          <a
                            href={item.zoom_link}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="shrink-0 rounded-full bg-brand-50 p-2 text-brand-600 transition-colors hover:bg-brand-100"
                            title="فتح رابط الزوم"
                          >
                            <Video size={14} />
                          </a>
                        )}
                      </Link>
                    ))}
                </div>
              </Card>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
