/**
 * KPI dashboard - a read-only combined view of CRM + finance summary
 * cards, gated by a single dashboards.kpi.view permission. Meant for
 * managers who need visibility into both areas without full CRM/finance
 * module access (create/edit/approve capabilities they don't need).
 */
import { useQuery } from "@tanstack/react-query";
import { Users, UserX, CalendarCheck, CheckCircle2, XCircle, PhoneMissed, Ban, GraduationCap, CalendarClock, Wallet, Clock } from "lucide-react";
import { translate } from "@/i18n";
import { kpiDashboardApi } from "@/modules/kpi/services/kpiApi";
import { Card } from "@/components/ui/Card";

function formatCurrency(value: number): string {
  return `${value.toLocaleString("ar-SA", { maximumFractionDigits: 0 })} ر.س`;
}

function StatCard({ icon: Icon, label, value, tone = "brand" }: {
  icon: typeof Users; label: string; value: string | number; tone?: "brand" | "success" | "danger" | "warning" | "neutral";
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
          <p className="text-2xl font-bold tracking-tight text-ink-900">{typeof value === "number" ? value.toLocaleString("ar-SA") : value}</p>
          <p className="text-xs text-ink-500">{label}</p>
        </div>
      </div>
    </Card>
  );
}

export function KpiDashboardPage() {
  const { data: stats, isLoading } = useQuery({ queryKey: ["kpi-dashboard-stats"], queryFn: () => kpiDashboardApi.stats() });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-[26px] font-bold tracking-tight text-ink-900">لوحة تحكم KPI</h1>
        <p className="mt-1 text-sm text-ink-500">نظرة عامة سريعة على أداء خدمة العملاء والوضع المالي</p>
      </div>

      {isLoading || !stats ? (
        <p className="text-sm text-ink-500">{translate("ar", "common_loading")}</p>
      ) : (
        <div className="space-y-6">
          <div>
            <h2 className="mb-3 text-sm font-semibold text-ink-700">خدمة العملاء</h2>
            <div className="grid grid-cols-4 gap-4">
              <StatCard icon={Users} label="إجمالي العملاء" value={stats.total_leads} tone="brand" />
              <StatCard icon={UserX} label="عملاء بدون حجوزات" value={stats.leads_without_bookings} tone="neutral" />
              <StatCard icon={PhoneMissed} label="لم يتم الرد" value={stats.not_answered} tone="warning" />
              <StatCard icon={Ban} label="غير مهتم" value={stats.not_interested} tone="danger" />
            </div>
          </div>

          <div>
            <h2 className="mb-3 text-sm font-semibold text-ink-700">الحجوزات والمحاضرات</h2>
            <div className="grid grid-cols-3 gap-4">
              <StatCard icon={CalendarCheck} label="عملاء تم الحجز لهم" value={stats.currently_booked} tone="brand" />
              <StatCard icon={CheckCircle2} label="حضروا المحاضرة" value={stats.attended} tone="success" />
              <StatCard icon={XCircle} label="لم يحضروا المحاضرة" value={stats.not_attended} tone="danger" />
            </div>
          </div>

          <div>
            <h2 className="mb-3 text-sm font-semibold text-ink-700">الموارد</h2>
            <div className="grid grid-cols-2 gap-4">
              <StatCard icon={GraduationCap} label="المعلمين المسجّلين" value={stats.active_teachers} tone="brand" />
              <StatCard icon={CalendarClock} label="مواعيد متاحة حاليًا" value={stats.available_slots} tone="neutral" />
            </div>
          </div>

          <div>
            <h2 className="mb-3 text-sm font-semibold text-ink-700">الماليات</h2>
            <div className="grid grid-cols-3 gap-4">
              <StatCard icon={Wallet} label="مصروفات هذا الشهر" value={formatCurrency(stats.total_expenses_month)} tone="brand" />
              <StatCard icon={Wallet} label="مصروفات هذا الربع" value={formatCurrency(stats.total_expenses_quarter)} tone="brand" />
              <StatCard icon={Wallet} label="مصروفات هذه السنة" value={formatCurrency(stats.total_expenses_year)} tone="brand" />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4">
              <StatCard icon={Clock} label="بانتظار الموافقة (عدد)" value={stats.pending_approval_count} tone="warning" />
              <StatCard icon={Clock} label="بانتظار الموافقة (مبلغ)" value={formatCurrency(stats.pending_approval_amount)} tone="warning" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
