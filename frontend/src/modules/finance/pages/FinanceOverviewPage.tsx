import { useMemo, useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Link } from "react-router-dom";
import { ArrowUpRight, CalendarDays, FolderTree } from "lucide-react";
import { useFinanceOverview } from "@/modules/finance/hooks/useFinance";
import { StatusBadge } from "@/modules/finance/components/StatusBadge";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Select } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatSAR, periodLabel, sharesTo100 } from "@/modules/finance/utils";

const PIE_COLORS = ["#6d3af2", "#9f70ff", "#bea3ff", "#d9ccff", "#ff8a3d", "#ffcfa1", "#5a26d6", "#ebe4ff"];
const ALL = "all";

function Kpi({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "neg" }) {
  return (
    <Card className="p-5 transition-shadow duration-300 hover:shadow-md">
      <p className="text-[14px] font-medium text-ink-500">{label}</p>
      <p className={`mt-2 whitespace-nowrap text-[24px] font-bold tracking-tight ${tone === "neg" ? "text-danger-600" : "text-ink-900"}`}>
        <span className="ltr-content">{value.replace(" ر.س", "")}</span>
        <span className="mr-1.5 text-sm font-medium text-ink-400">ر.س</span>
      </p>
      {hint && <p className="mt-1 text-[12.5px] text-ink-400">{hint}</p>}
    </Card>
  );
}

/**
 * Finance overview for one month (default: the current month) or the whole
 * period. Costs count in the month they belong to and only once approved -
 * the same basis as the income statement, so the numbers tie to the books.
 */
export function FinanceOverviewPage() {
  const current = new Date().toISOString().slice(0, 7);
  const [month, setMonth] = useState<string>(current);
  const { data, isLoading } = useFinanceOverview(month === ALL ? null : month);

  const months = useMemo(() => {
    const list = data?.months ?? [];
    return list.includes(current) ? list : [current, ...list];
  }, [data?.months, current]);

  const accounts = data?.by_account ?? [];
  const pcts = sharesTo100(accounts.map((a) => Number(a.total)));
  const net = Number(data?.net ?? 0);
  const periodName = month === ALL ? "كل الفترة" : periodLabel(month);

  return (
    <div>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight text-ink-900">نظرة عامة مالية</h1>
          <p className="mt-1 text-sm text-ink-500">المصروفات المعتمدة على الشهر اللي تخصه، مقابل الإيرادات والموازنة</p>
        </div>
        <div className="flex items-center gap-2">
          <CalendarDays size={16} className="text-ink-400" />
          <div className="w-48">
            <Select value={month} onChange={(e) => setMonth(e.target.value)} aria-label="الفترة">
              {months.map((m) => (
                <option key={m} value={m}>
                  {periodLabel(m)}
                  {m === current ? " (الحالي)" : ""}
                </option>
              ))}
              <option value={ALL}>كل الفترة</option>
            </Select>
          </div>
        </div>
      </div>

      <div className={`grid grid-cols-1 gap-4 transition-opacity duration-300 sm:grid-cols-2 xl:grid-cols-4 ${isLoading ? "opacity-60" : ""}`}>
        <Kpi label="المصروفات المعتمدة" value={formatSAR(data?.expenses)} hint={`${data?.invoices ?? 0} فاتورة — ${periodName}`} />
        <Kpi label="الإيرادات (الاشتراكات)" value={formatSAR(data?.revenue)} hint={`${data?.subscriptions ?? 0} اشتراك مدفوع`} />
        <Kpi label="صافي النتيجة" value={formatSAR(Math.abs(net))} hint={net < 0 ? "عجز (المصروفات أكبر)" : "فائض"} tone={net < 0 ? "neg" : undefined} />
        <Kpi label="بانتظار الاعتماد" value={formatSAR(data?.pending_amount)} hint={`${data?.pending_count ?? 0} فاتورة مش داخلة في الأرقام لحد ما تتعمد`} />
      </div>

      <Card className="mt-5">
        <CardHeader>
          <div>
            <CardTitle>الموازنة مقابل الفعلي</CardTitle>
            <CardSubtitle>{periodName}</CardSubtitle>
          </div>
          <Link to="/finance/budget-lines" className="link-underline flex items-center gap-1 text-[14px] font-medium text-brand-600">
            بنود الميزانية
            <ArrowUpRight size={14} />
          </Link>
        </CardHeader>
        <div className="space-y-4">
          {(data?.budget ?? []).map((b) => {
            const budget = Number(b.budget);
            const spent = Number(b.spent);
            const pct = budget > 0 ? (spent / budget) * 100 : 0;
            const over = spent > budget && budget > 0;
            return (
              <div key={b.id}>
                <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <span className="font-medium text-ink-800">{b.name}</span>
                  <span className="text-ink-500">
                    <span className="ltr-content font-semibold text-ink-900">{formatSAR(spent)}</span> من{" "}
                    <span className="ltr-content">{formatSAR(budget)}</span>
                    <span className={`mr-2 ${over ? "font-semibold text-danger-600" : ""}`}>
                      {over ? `تجاوز ${formatSAR(spent - budget)}` : `متبقي ${formatSAR(Number(b.remaining))}`}
                    </span>
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-ink-100">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ease-out ${over ? "bg-danger-500" : "bg-brand-600"}`}
                    style={{ width: `${Math.min(100, pct)}%` }}
                  />
                </div>
              </div>
            );
          })}
          {(data?.budget ?? []).length === 0 && <p className="text-sm text-ink-500">لا توجد بنود ميزانية معتمدة</p>}
        </div>
      </Card>

      <Card className="mt-5">
        <CardHeader>
          <div>
            <CardTitle>المصروفات حسب الحساب</CardTitle>
            <CardSubtitle>{periodName} — المعتمدة فقط</CardSubtitle>
          </div>
          <Link to="/finance/chart-of-accounts" className="link-underline flex items-center gap-1 text-[14px] font-medium text-brand-600">
            <FolderTree size={14} />
            شجرة الحسابات
            <ArrowUpRight size={14} />
          </Link>
        </CardHeader>
        {accounts.length > 0 ? (
          <div className="grid grid-cols-1 items-center gap-6 lg:grid-cols-5">
            <div className="h-56 lg:col-span-2">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={accounts.map((a) => ({ ...a, total: Number(a.total) }))} dataKey="total" nameKey="name" innerRadius={62} outerRadius={92} paddingAngle={3} stroke="none">
                    {accounts.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatSAR(value)} contentStyle={{ borderRadius: 10, border: "1px solid #eef0f6", fontSize: 13 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="lg:col-span-3">
              <div className="divide-y divide-ink-100">
                {accounts.map((a, i) => (
                  <Link
                    key={a.category_id}
                    to={`/finance/expenses?category=${a.category_id}`}
                    className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-ink-50"
                  >
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14.5px] font-medium text-ink-800">
                        <span className="ltr-content ml-1.5 text-[12px] text-ink-400">{a.code}</span>
                        {a.name}
                      </span>
                      <span className="block text-[12px] text-ink-400">{a.budget_line ? `ضمن «${a.budget_line}»` : "خارج بنود الميزانية"}</span>
                    </span>
                    <span className="ltr-content w-12 shrink-0 text-xs text-ink-500">{pcts[i].toFixed(1)}%</span>
                    <span className="ltr-content w-28 shrink-0 text-left text-[15px] font-semibold text-ink-900">{formatSAR(a.total)}</span>
                  </Link>
                ))}
              </div>
              <div className="mt-2 flex items-center justify-between border-t border-ink-100 px-2 pt-3">
                <span className="text-xs font-medium text-ink-500">الإجمالي</span>
                <span className="ltr-content text-sm font-bold text-ink-900">{formatSAR(data?.expenses)}</span>
              </div>
            </div>
          </div>
        ) : (
          <EmptyState title={`لا توجد مصروفات معتمدة في ${periodName}`} description="اختار شهر تاني أو «كل الفترة» من فوق" />
        )}
      </Card>

      <Card className="mt-5">
        <CardHeader>
          <CardTitle>أحدث الفواتير — {periodName}</CardTitle>
          <Link to="/finance/expenses" className="link-underline flex items-center gap-1 text-[14px] font-medium text-brand-600">
            عرض الكل
            <ArrowUpRight size={14} />
          </Link>
        </CardHeader>
        <div className="divide-y divide-ink-100">
          {(data?.recent ?? []).map((expense) => (
            <Link
              key={expense.id}
              to={`/finance/expenses/${expense.id}`}
              className="-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-ink-50"
            >
              <div className="min-w-0">
                <p className="truncate text-[15px] font-medium text-ink-900">{expense.vendor ?? expense.description ?? "—"}</p>
                <p className="text-xs text-ink-500">
                  <span className="ltr-content">{expense.expense_date}</span>
                  {expense.period_month && <> · عن {periodLabel(expense.period_month)}</>}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="ltr-content text-sm font-semibold text-ink-800">{formatSAR(expense.amount)}</span>
                <StatusBadge status={expense.status} />
              </div>
            </Link>
          ))}
          {(data?.recent ?? []).length === 0 && <EmptyState title="لا توجد فواتير في الفترة دي" />}
        </div>
      </Card>
    </div>
  );
}
