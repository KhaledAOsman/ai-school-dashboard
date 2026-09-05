import { useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { ChevronDown, ChevronLeft, FolderTree, Receipt, Layers } from "lucide-react";
import { translate } from "@/i18n";
import { useCategories, useExpenses } from "@/modules/finance/hooks/useFinance";
import { StatusBadge } from "@/modules/finance/components/StatusBadge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import type { Category, Expense } from "@/modules/finance/services/financeApi";

function formatSAR(value: string | number): string {
  return `${Number(value).toLocaleString("ar-SA", { maximumFractionDigits: 2 })} ر.س`;
}

/** Leaf row: a single expense line under its owning category. */
function ExpenseLeafRow({ expense }: { expense: Expense }) {
  return (
    <Link
      to={`/finance/expenses/${expense.id}`}
      className="-mx-2 flex items-center justify-between rounded-lg px-2 py-2 pr-3 text-[13px] transition-colors hover:bg-ink-50"
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <Receipt size={13} className="shrink-0 text-ink-300" />
        <span className="truncate text-ink-700">{expense.vendor ?? expense.description ?? "بدون وصف"}</span>
        <span className="ltr-content shrink-0 text-xs text-ink-400">{expense.expense_date}</span>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className="ltr-content font-semibold text-ink-800">{formatSAR(expense.amount)}</span>
        <StatusBadge status={expense.status} dot={false} />
      </div>
    </Link>
  );
}

/**
 * One node in the chart of accounts: a category (e.g. "التسويق"), its
 * running total, an expand/collapse toggle, its child categories
 * (subcategories, indented further), and - when expanded - the actual
 * expense line items posted directly against it.
 */
function CategoryNode({ category, depth, highlightId }: { category: Category; depth: number; highlightId?: string }) {
  const [isOpen, setIsOpen] = useState(depth === 0 || category.id === highlightId);
  const { data: expenses, isLoading } = useExpenses({ category_id: category.id, limit: 100 });

  const total = (expenses ?? []).reduce((sum, e) => (e.status === "cancelled" ? sum : sum + Number(e.amount)), 0);
  const count = (expenses ?? []).length;

  return (
    <div className={depth > 0 ? "mr-5 border-r border-ink-100 pr-4" : ""}>
      <button
        onClick={() => setIsOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-lg px-2 py-2.5 text-start transition-colors hover:bg-ink-50"
      >
        <div className="flex items-center gap-2.5">
          {isOpen ? <ChevronDown size={15} className="text-ink-400" /> : <ChevronLeft size={15} className="text-ink-400" />}
          <span className={depth === 0 ? "flex h-7 w-7 items-center justify-center rounded-lg bg-brand-50 text-brand-600" : "flex h-6 w-6 items-center justify-center rounded-md bg-ink-100 text-ink-500"}>
            {depth === 0 ? <FolderTree size={14} /> : <Layers size={12} />}
          </span>
          <span className={depth === 0 ? "text-[14.5px] font-semibold text-ink-900" : "text-sm font-medium text-ink-800"}>
            {category.name}
          </span>
          {count > 0 && <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-medium text-ink-500">{count}</span>}
        </div>
        <span className="ltr-content text-sm font-semibold text-ink-800">{formatSAR(total)}</span>
      </button>

      {isOpen && (
        <div className="mr-5 mt-1 space-y-0.5 border-r border-ink-100 pr-4 pb-2">
          {isLoading && <p className="py-2 text-xs text-ink-400">جارٍ التحميل...</p>}
          {!isLoading && count === 0 && category.children.length === 0 && (
            <p className="py-2 text-xs text-ink-400">لا توجد مصروفات مباشرة في هذا التصنيف</p>
          )}
          {(expenses ?? []).map((expense) => (
            <ExpenseLeafRow key={expense.id} expense={expense} />
          ))}
          {category.children.map((child) => (
            <CategoryNode key={child.id} category={child} depth={depth + 1} highlightId={highlightId} />
          ))}
        </div>
      )}
    </div>
  );
}

export function ChartOfAccountsPage() {
  const [searchParams] = useSearchParams();
  const highlightId = searchParams.get("category") ?? undefined;
  const { data: categories, isLoading } = useCategories();

  return (
    <div className="max-w-3xl">
      <h1 className="mb-1 text-[26px] font-bold tracking-tight text-ink-900">شجرة الحسابات</h1>
      <p className="mb-6 text-sm text-ink-500">
        عرض هرمي لكل تصنيف وتصنيفاته الفرعية، مع تفاصيل كل عملية صرف مسجَّلة تحته
      </p>

      <Card className="p-5">
        {isLoading ? (
          <p className="p-6 text-sm text-ink-500">{translate("ar", "common_loading")}</p>
        ) : (categories ?? []).length === 0 ? (
          <EmptyState icon={FolderTree} title="لا توجد تصنيفات بعد" description="أنشئ تصنيفات من صفحة التصنيفات أولًا" />
        ) : (
          <div className="space-y-1">
            {(categories ?? []).map((c) => (
              <CategoryNode key={c.id} category={c} depth={0} highlightId={highlightId} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
