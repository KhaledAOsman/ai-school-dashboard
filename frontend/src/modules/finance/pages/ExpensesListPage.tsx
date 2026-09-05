import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Receipt, Filter } from "lucide-react";
import { translate } from "@/i18n";
import { useExpenses } from "@/modules/finance/hooks/useFinance";
import { StatusBadge } from "@/modules/finance/components/StatusBadge";
import { usePermission } from "@/permissions/usePermission";
import { PERMISSIONS } from "@/permissions/constants";
import type { ExpenseFilters } from "@/modules/finance/services/financeApi";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Field";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";

function formatSAR(value: string | number): string {
  return `${Number(value).toLocaleString("ar-SA", { maximumFractionDigits: 2 })} ر.س`;
}

export function ExpensesListPage() {
  const [filters, setFilters] = useState<ExpenseFilters>({});
  const { data: expenses, isLoading } = useExpenses(filters);
  const canCreate = usePermission(PERMISSIONS.FINANCE_EXPENSE_CREATE);

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight text-ink-900">{translate("ar", "nav_expenses")}</h1>
          <p className="mt-1 text-sm text-ink-500">إدارة ومتابعة كل المصروفات وحالات الموافقة</p>
        </div>
        {canCreate && (
          <Link to="/finance/expenses/new">
            <Button variant="primary" size="lg">
              <Plus size={17} />
              {translate("ar", "expense_new")}
            </Button>
          </Link>
        )}
      </div>

      <div className="mb-4 flex items-center gap-3">
        <div className="flex items-center gap-2 text-ink-400">
          <Filter size={15} />
          <span className="text-xs font-medium">تصفية</span>
        </div>
        <Select
          value={filters.status ?? ""}
          onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value || undefined }))}
          className="w-56"
        >
          <option value="">كل الحالات</option>
          <option value="draft">{translate("ar", "expense_status_draft")}</option>
          <option value="pending_approval">{translate("ar", "expense_status_pending_approval")}</option>
          <option value="approved">{translate("ar", "expense_status_approved")}</option>
          <option value="rejected">{translate("ar", "expense_status_rejected")}</option>
          <option value="cancelled">{translate("ar", "expense_status_cancelled")}</option>
        </Select>
      </div>

      <Card className="overflow-hidden p-0">
        {isLoading ? (
          <p className="p-6 text-sm text-ink-500">{translate("ar", "common_loading")}</p>
        ) : (expenses ?? []).length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="لا توجد مصروفات مطابقة"
            description="جرّب تغيير عوامل التصفية أو أنشئ مصروفًا جديدًا"
          />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-ink-50/70">
              <tr>
                <th className="px-5 py-3 text-right text-xs font-semibold text-ink-500">{translate("ar", "expense_date")}</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-ink-500">{translate("ar", "expense_vendor")}</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-ink-500">{translate("ar", "expense_amount")}</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-ink-500">{translate("ar", "expense_status")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {(expenses ?? []).map((expense) => (
                <tr key={expense.id} className="transition-colors hover:bg-ink-50/70">
                  <td className="px-5 py-3.5">
                    <Link to={`/finance/expenses/${expense.id}`} className="ltr-content block text-ink-600">
                      {expense.expense_date}
                    </Link>
                  </td>
                  <td className="px-5 py-3.5">
                    <Link to={`/finance/expenses/${expense.id}`} className="block font-medium text-ink-900">
                      {expense.vendor ?? expense.description ?? "—"}
                    </Link>
                  </td>
                  <td className="ltr-content px-5 py-3.5 font-semibold text-ink-800">{formatSAR(expense.amount)}</td>
                  <td className="px-5 py-3.5">
                    <StatusBadge status={expense.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
