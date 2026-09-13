/**
 * CRM overview dashboard - the counters requested: total leads, attended
 * vs did-not-attend, not-answered calls, headcount of active customer-
 * service reps, and count of registered teachers/available slots.
 */
import { Users, CheckCircle2, XCircle, PhoneMissed, UserPlus, GraduationCap, CalendarClock } from "lucide-react";
import { translate } from "@/i18n";
import { useCRMDashboardStats } from "@/modules/crm/hooks/useCRM";
import { Card } from "@/components/ui/Card";

function StatCard({
  icon: Icon,
  label,
  value,
  tone = "brand",
}: {
  icon: typeof Users;
  label: string;
  value: number;
  tone?: "brand" | "success" | "danger" | "warning" | "neutral";
}) {
  const toneClasses: Record<string, string> = {
    brand: "bg-brand-50 text-brand-600",
    success: "bg-success-50 text-success-600",
    danger: "bg-danger-50 text-danger-600",
    warning: "bg-warning-50 text-warning-600",
    neutral: "bg-ink-100 text-ink-600",
  };

  return (
    <Card className="p-5">
      <div className="flex items-center gap-3.5">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${toneClasses[tone]}`}>
          <Icon size={20} />
        </span>
        <div>
          <p className="text-2xl font-bold tracking-tight text-ink-900">{value.toLocaleString("ar-SA")}</p>
          <p className="text-xs text-ink-500">{label}</p>
        </div>
      </div>
    </Card>
  );
}

export function CRMDashboardPage() {
  const { data: stats, isLoading } = useCRMDashboardStats();

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-[26px] font-bold tracking-tight text-ink-900">لوحة تحكم خدمة العملاء</h1>
        <p className="mt-1 text-sm text-ink-500">نظرة عامة على أداء فريق المبيعات وحالة العملاء المحتملين</p>
      </div>

      {isLoading || !stats ? (
        <p className="text-sm text-ink-500">{translate("ar", "common_loading")}</p>
      ) : (
        <div className="space-y-6">
          <div>
            <h2 className="mb-3 text-sm font-semibold text-ink-700">العملاء المحتملون</h2>
            <div className="grid grid-cols-4 gap-4">
              <StatCard icon={Users} label="إجمالي العملاء" value={stats.total_leads} tone="brand" />
              <StatCard icon={CheckCircle2} label="حضروا المحاضرة" value={stats.attended} tone="success" />
              <StatCard icon={XCircle} label="لم يحضروا المحاضرة" value={stats.not_attended} tone="danger" />
              <StatCard icon={PhoneMissed} label="لم يتم الرد" value={stats.not_answered} tone="warning" />
            </div>
          </div>

          <div>
            <h2 className="mb-3 text-sm font-semibold text-ink-700">الفريق والموارد</h2>
            <div className="grid grid-cols-3 gap-4">
              <StatCard icon={UserPlus} label="أفراد خدمة العملاء" value={stats.sales_reps_count} tone="brand" />
              <StatCard icon={GraduationCap} label="المعلمين المسجّلين" value={stats.active_teachers} tone="brand" />
              <StatCard icon={CalendarClock} label="مواعيد متاحة حاليًا" value={stats.available_slots} tone="neutral" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
