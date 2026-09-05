import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Link } from "react-router-dom";
import { ArrowUpRight, TrendingUp, FolderTree } from "lucide-react";
import { translate } from "@/i18n";
import {
  useFinanceSummary,
  useCategoryBreakdown,
  useRecentExpenses,
} from "@/modules/finance/hooks/useFinance";
import { StatusBadge } from "@/modules/finance/components/StatusBadge";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";

const PIE_COLORS = ["#6d3af2", "#9f70ff", "#bea3ff", "#d9ccff", "#ff8a3d", "#ffcfa1", "#5a26d6", "#e7e0ff"];

function SummaryCard({ label, value, trend }: { label: string; value: string; trend?: string }) {
  return (
    <Card className="relative overflow-hidden p-5">
      <div className="pointer-events-none absolute -left-6 -top-6 h-24 w-24 rounded-full bg-brand-50/70 blur-2xl" />
      <p className="relative text-[13px] font-medium text-ink-500">{label}</p>
      <p className="ltr-content relative mt-2 text-[28px] font-bold tracking-tight text-ink-900">{value}</p>
      {trend && (
        <div className="relative mt-2 flex items-center gap-1 text-xs font-medium text-success-600">
          <TrendingUp size={13} />
          {trend}
        </div>
      )}
    </Card>
  );
}

function formatSAR(value: number | string | undefined): string {
  const num = Number(value ?? 0);
  return `${num.toLocaleString("ar-SA", { maximumFractionDigits: 2 })} ر.س`;
}

export function DashboardPage() {
  const { data: summary, isLoading: summaryLoading } = useFinanceSummary();
  const { data: breakdown } = useCategoryBreakdown();
  const { data: recent } = useRecentExpenses(8);

  const rows = (breakdown ?? []) as { category_id: string; category_name: string; total: number }[];
  const grandTotal = rows.reduce((sum, r) => sum + Number(r.total), 0);
  const hasBreakdown = rows.length > 0;

  return (
    <div>
      <div className="mb-7">
        <h1 className="text-[26px] font-bold tracking-tight text-ink-900">{translate("ar", "nav_dashboard")}</h1>
        <p className="mt-1 text-sm text-ink-500">نظرة عامة على الأداء المالي الحالي</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryCard label={translate("ar", "dashboard_total_month")} value={summaryLoading ? "…" : formatSAR(summary?.total_expenses_month)} />
        <SummaryCard label={translate("ar", "dashboard_total_quarter")} value={summaryLoading ? "…" : formatSAR(summary?.total_expenses_quarter)} />
        <SummaryCard label={translate("ar", "dashboard_total_year")} value={summaryLoading ? "…" : formatSAR(summary?.total_expenses_year)} />
      </div>

      {/* Category breakdown - improved: donut chart + detailed ranked list
          with percentage share, side by side, and a link into the full
          chart of accounts drill-down. */}
      <Card className="mt-5">
        <CardHeader>
          <div>
            <CardTitle>{translate("ar", "dashboard_category_breakdown")}</CardTitle>
            <CardSubtitle>حسب إجمالي المصروفات المعتمدة والمعلّقة</CardSubtitle>
          </div>
          <Link to="/finance/chart-of-accounts" className="link-underline flex items-center gap-1 text-[13px] font-medium text-brand-600">
            <FolderTree size={14} />
            شجرة الحسابات
            <ArrowUpRight size={14} />
          </Link>
        </CardHeader>

        {hasBreakdown ? (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
            <div className="flex items-center justify-center lg:col-span-2">
              <ResponsiveContainer width="100%" height={230}>
                <PieChart>
                  <Pie data={rows} dataKey="total" nameKey="category_name" innerRadius={62} outerRadius={92} paddingAngle={3} stroke="none">
                    {rows.map((_, index) => (
                      <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatSAR(value)} contentStyle={{ borderRadius: 10, border: "1px solid #eef0f6", fontSize: 13 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="lg:col-span-3">
              <div className="divide-y divide-ink-100">
                {rows
                  .slice()
                  .sort((a, b) => Number(b.total) - Number(a.total))
                  .map((row, i) => {
                    const pct = grandTotal > 0 ? (Number(row.total) / grandTotal) * 100 : 0;
                    return (
                      <Link
                        key={row.category_id}
                        to={`/finance/chart-of-accounts?category=${row.category_id}`}
                        className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-ink-50"
                      >
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                        <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-ink-800">{row.category_name}</span>
                        <div className="flex w-32 items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-100">
                            <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                          </div>
                          <span className="ltr-content w-9 shrink-0 text-xs text-ink-500">{pct.toFixed(0)}%</span>
                        </div>
                        <span className="ltr-content w-24 shrink-0 text-left text-[13.5px] font-semibold text-ink-900">{formatSAR(row.total)}</span>
                      </Link>
                    );
                  })}
              </div>
              <div className="mt-2 flex items-center justify-between border-t border-ink-100 px-2 pt-3">
                <span className="text-xs font-medium text-ink-500">الإجمالي</span>
                <span className="ltr-content text-sm font-bold text-ink-900">{formatSAR(grandTotal)}</span>
              </div>
            </div>
          </div>
        ) : (
          <EmptyState title="لا توجد بيانات كافية بعد" description="سيظهر التوزيع هنا بعد إضافة مصروفات" />
        )}
      </Card>

      <Card className="mt-5">
        <CardHeader>
          <CardTitle>{translate("ar", "dashboard_recent_expenses")}</CardTitle>
          <Link to="/finance/expenses" className="link-underline flex items-center gap-1 text-[13px] font-medium text-brand-600">
            عرض الكل
            <ArrowUpRight size={14} />
          </Link>
        </CardHeader>
        <div className="divide-y divide-ink-100">
          {(recent ?? []).map((expense) => (
            <Link
              key={expense.id}
              to={`/finance/expenses/${expense.id}`}
              className="-mx-2 flex items-center justify-between rounded-lg px-2 py-3 transition-colors hover:bg-ink-50"
            >
              <div>
                <p className="text-[13.5px] font-medium text-ink-900">{expense.vendor ?? expense.description ?? "—"}</p>
                <p className="ltr-content text-xs text-ink-500">{expense.expense_date}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="ltr-content text-sm font-semibold text-ink-800">{formatSAR(expense.amount)}</span>
                <StatusBadge status={expense.status} />
              </div>
            </Link>
          ))}
          {(recent ?? []).length === 0 && (
            <EmptyState title="لا توجد مصروفات بعد" description="ابدأ بإنشاء أول مصروف من صفحة المصروفات" />
          )}
        </div>
      </Card>
    </div>
  );
}
