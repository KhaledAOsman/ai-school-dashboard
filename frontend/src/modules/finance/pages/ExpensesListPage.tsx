import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Download, ExternalLink, Filter, Plus, Receipt, Search } from "lucide-react";
import { translate } from "@/i18n";
import { useCategories, useExpenses } from "@/modules/finance/hooks/useFinance";
import { StatusBadge } from "@/modules/finance/components/StatusBadge";
import { usePermission } from "@/permissions/usePermission";
import { PERMISSIONS } from "@/permissions/constants";
import type { ExpenseFilters } from "@/modules/finance/services/financeApi";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Field";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { accountLabel, flattenCategories, formatSAR, periodLabel, toCents, fromCents } from "@/modules/finance/utils";

const LIMIT = 500;

function monthRange(month: string): { date_from: string; date_to: string } {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return { date_from: `${month}-01`, date_to: `${month}-${String(last).padStart(2, "0")}` };
}

function csvCell(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? "" : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

export function ExpensesListPage() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState("");
  const [categoryId, setCategoryId] = useState(searchParams.get("category") ?? "");
  const [subId] = useState(searchParams.get("sub") ?? "");
  const [month, setMonth] = useState("");
  const [query, setQuery] = useState("");
  const canCreate = usePermission(PERMISSIONS.FINANCE_EXPENSE_CREATE);

  const { data: categories } = useCategories();
  const catMap = useMemo(() => flattenCategories(categories), [categories]);

  const filters: ExpenseFilters = {
    limit: LIMIT,
    status: status || undefined,
    category_id: categoryId || undefined,
    subcategory_id: subId || undefined,
    q: query.trim() || undefined,
    ...(month ? monthRange(month) : {}),
  };
  const { data: expenses, isLoading } = useExpenses(filters);
  const rows = expenses ?? [];

  const totalCents = rows.reduce((sum, e) => (e.status === "cancelled" ? sum : sum + toCents(e.amount)), 0);

  function exportCsv() {
    const header = ["تاريخ الدفع", "تاريخ الفاتورة", "رقم الفاتورة", "المستفيد / المورّد", "الوصف", "الحساب", "الحساب الفرعي", "الشهر", "الدافع", "المبلغ", "الحالة", "رابط الفاتورة"];
    const lines = rows.map((e) =>
      [
        e.expense_date,
        e.invoice_date,
        e.invoice_number,
        e.vendor,
        e.description,
        accountLabel(catMap.get(e.category_id)),
        e.subcategory_id ? accountLabel(catMap.get(e.subcategory_id)) : "",
        e.period_month,
        e.paid_by,
        e.amount,
        translate("ar", `expense_status_${e.status}` as never),
        e.invoice_url,
      ]
        .map(csvCell)
        .join(",")
    );
    const blob = new Blob(["﻿" + [header.map(csvCell).join(","), ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `expenses${month ? "-" + month : ""}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight text-ink-900">الفواتير والمصروفات</h1>
          <p className="mt-1 text-sm text-ink-500">سجل كل دفعة بتاريخها ورقم فاتورتها والمستفيد والحساب</p>
        </div>
        <div className="flex gap-2.5">
          <Button variant="outline" size="lg" onClick={exportCsv} disabled={rows.length === 0}>
            <Download size={16} />
            تصدير Excel
          </Button>
          {canCreate && (
            <Link to="/finance/expenses/new">
              <Button variant="primary" size="lg">
                <Plus size={17} />
                {translate("ar", "expense_new")}
              </Button>
            </Link>
          )}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-ink-400">
          <Filter size={15} />
          <span className="text-xs font-medium">تصفية</span>
        </div>
        <div className="relative w-full sm:w-64">
          <Search size={15} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="بحث بالاسم أو الوصف أو رقم الفاتورة" className="pr-10" />
        </div>
        <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="w-full sm:w-56">
          <option value="">كل الحسابات</option>
          {(categories ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {accountLabel(c)}
            </option>
          ))}
        </Select>
        <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="ltr-content w-full sm:w-44" />
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full sm:w-44">
          <option value="">كل الحالات</option>
          <option value="draft">{translate("ar", "expense_status_draft")}</option>
          <option value="pending_approval">{translate("ar", "expense_status_pending_approval")}</option>
          <option value="approved">{translate("ar", "expense_status_approved")}</option>
          <option value="rejected">{translate("ar", "expense_status_rejected")}</option>
          <option value="cancelled">{translate("ar", "expense_status_cancelled")}</option>
        </Select>
        {subId && catMap.get(subId) && (
          <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700 ring-1 ring-inset ring-brand-200/70">
            {accountLabel(catMap.get(subId))}
          </span>
        )}
      </div>

      <Card className="overflow-hidden p-0">
        {isLoading ? (
          <p className="p-6 text-sm text-ink-500">{translate("ar", "common_loading")}</p>
        ) : rows.length === 0 ? (
          <EmptyState icon={Receipt} title="لا توجد مصروفات مطابقة" description="جرّب تغيير عوامل التصفية أو سجّل فاتورة جديدة" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-ink-50/70">
                <tr>
                  {["التاريخ", "المستفيد / الوصف", "الحساب", "الفاتورة", "الدافع", "المبلغ", "الحالة"].map((h) => (
                    <th key={h} className="px-4 py-3 text-right text-xs font-semibold text-ink-500">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {rows.map((e) => {
                  const cat = catMap.get(e.category_id);
                  const sub = e.subcategory_id ? catMap.get(e.subcategory_id) : undefined;
                  return (
                    <tr key={e.id} className="transition-colors hover:bg-ink-50/70">
                      <td className="px-4 py-3.5">
                        <Link to={`/finance/expenses/${e.id}`} className="ltr-content block whitespace-nowrap text-ink-600">
                          {e.expense_date}
                        </Link>
                        {e.period_month && <span className="text-[12px] text-ink-400">عن {periodLabel(e.period_month)}</span>}
                      </td>
                      <td className="px-4 py-3.5">
                        <Link to={`/finance/expenses/${e.id}`} className="block font-medium text-ink-900">
                          {e.vendor ?? e.description ?? "—"}
                        </Link>
                        {e.vendor && e.description && <span className="line-clamp-1 text-[12.5px] text-ink-500">{e.description}</span>}
                      </td>
                      <td className="px-4 py-3.5 text-ink-700">
                        <span className="block">{cat?.name ?? "—"}</span>
                        {sub && <span className="text-[12.5px] text-ink-500">{sub.name}</span>}
                      </td>
                      <td className="px-4 py-3.5 text-ink-600">
                        {e.invoice_number || e.invoice_date || e.invoice_url ? (
                          <div className="flex flex-col gap-0.5">
                            {e.invoice_number && <span className="ltr-content text-[13px]">{e.invoice_number}</span>}
                            {e.invoice_date && <span className="ltr-content text-[12px] text-ink-400">{e.invoice_date}</span>}
                            {e.invoice_url && (
                              <a href={e.invoice_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12px] font-medium text-brand-600">
                                <ExternalLink size={12} />
                                فتح
                              </a>
                            )}
                          </div>
                        ) : (
                          <span className="text-ink-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-ink-600">{e.paid_by ?? <span className="text-ink-300">—</span>}</td>
                      <td className="ltr-content whitespace-nowrap px-4 py-3.5 font-semibold text-ink-800">{formatSAR(e.amount)}</td>
                      <td className="px-4 py-3.5">
                        <StatusBadge status={e.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-ink-50/70">
                <tr>
                  <td colSpan={5} className="px-4 py-3 text-sm font-semibold text-ink-700">
                    الإجمالي ({rows.filter((e) => e.status !== "cancelled").length} دفعة{rows.length >= LIMIT ? " — أول " + LIMIT + " فقط، ضيّق التصفية" : ""})
                  </td>
                  <td colSpan={2} className="ltr-content px-4 py-3 text-right text-[15px] font-bold text-ink-900">
                    {formatSAR(fromCents(totalCents))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
