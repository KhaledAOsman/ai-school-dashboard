import type { Paged } from "@/components/ui/Pager";
/**
 * Finance API service layer. All finance HTTP calls go through here -
 * pages/components never call `api` directly, so response shapes and
 * endpoint paths are defined in exactly one place.
 */
import { api } from "@/lib/apiClient";

export interface Category {
  id: string;
  name: string;
  name_ar: string | null;
  code: string | null;
  parent_id: string | null;
  display_order: number;
  is_archived: boolean;
  created_at: string;
  children: Category[];
}

/** One line of an invoice/transfer (e.g. "راتب شهر 8" = 700, "بونص" = 50, "رسوم التحويل" = 17.25).
 *  Each line may be charged to its own account; without one it uses the invoice's account. */
export interface BreakdownLine {
  label: string;
  amount: string;
  account_id?: string | null;
  staff_id?: string | null;
  url?: string | null;
}

export interface Expense {
  id: string;
  amount: string;
  currency: string;
  expense_date: string;
  category_id: string;
  subcategory_id: string | null;
  budget_line_id: string | null;
  staff_id: string | null;
  description: string | null;
  vendor: string | null;
  invoice_number: string | null;
  payment_method: string | null;
  notes: string | null;
  invoice_date: string | null;
  invoice_url: string | null;
  paid_by: string | null;
  period_month: string | null;
  breakdown: BreakdownLine[] | null;
  source: string | null;
  status: "draft" | "pending_approval" | "approved" | "rejected" | "cancelled";
  current_version: number;
  created_by: string;
  created_at: string;
  updated_by: string | null;
  updated_at: string;
  approved_by: string | null;
  approved_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  is_archived: boolean;
}

export interface ExpenseVersion {
  id: string;
  version_number: number;
  snapshot: Record<string, unknown>;
  change_reason: string | null;
  restored_from_version: number | null;
  created_by: string;
  created_at: string;
}

export interface ExpenseApprovalEvent {
  id: string;
  action: string;
  from_status: string;
  to_status: string;
  reason: string | null;
  performed_by: string;
  created_at: string;
}

export interface ExpenseDetail extends Expense {
  versions: ExpenseVersion[];
  approval_events: ExpenseApprovalEvent[];
}

export interface Attachment {
  id: string;
  expense_id: string;
  original_filename: string;
  content_type: string;
  size_bytes: number;
  uploaded_by: string;
  uploaded_at: string;
}

export interface ExpenseCreatePayload {
  amount: string;
  currency?: string;
  expense_date: string;
  category_id: string;
  subcategory_id?: string | null;
  budget_line_id?: string | null;
  staff_id?: string | null;
  description?: string | null;
  vendor?: string | null;
  invoice_number?: string | null;
  payment_method?: string | null;
  notes?: string | null;
  invoice_date?: string | null;
  invoice_url?: string | null;
  paid_by?: string | null;
  period_month?: string | null;
  breakdown?: BreakdownLine[] | null;
  /** create only: save and approve in one step (needs the approve permission) */
  approve_now?: boolean;
  /** create only: save and send for approval */
  submit_now?: boolean;
}

export interface FinanceOverview {
  month: string | null;
  months: string[];
  expenses: string;
  invoices: number;
  pending_amount: string;
  pending_count: number;
  revenue: string;
  subscriptions: number;
  net: string;
  by_account: { category_id: string; code: string | null; name: string; total: string; budget_line: string | null }[];
  budget: { id: string; name: string; budget: string; spent: string; remaining: string }[];
  recent: Expense[];
}

export interface AccountTotal {
  category_id: string;
  subcategory_id: string | null;
  total: number | string;
  count: number;
}

export interface PeriodTotal {
  period: string;
  total: number | string;
  count: number;
}

export interface Funding {
  id: string;
  funding_date: string;
  amount: string;
  currency: string;
  source_name: string;
  note: string | null;
  created_at: string;
}

export interface FundingPayload {
  funding_date: string;
  amount: string;
  source_name: string;
  note?: string | null;
}

export interface ExpensePage extends Paged<Expense> {
  active_count: number;
  active_amount: string;
}

export interface ExpenseFilters {
  status?: string;
  category_id?: string;
  subcategory_id?: string;
  staff_id?: string;
  period_month?: string;
  paid_by?: string;
  q?: string;
  date_from?: string;
  date_to?: string;
  amount_min?: number;
  amount_max?: number;
  limit?: number;
  offset?: number;
}

export const financeApi = {
  // ---- Categories ----
  listCategories: async (includeArchived = false): Promise<Category[]> => {
    const { data } = await api.get("/finance/categories", { params: { include_archived: includeArchived } });
    return data;
  },
  createCategory: async (payload: { name: string; name_ar?: string; code?: string | null; parent_id?: string | null }) => {
    const { data } = await api.post("/finance/categories", payload);
    return data;
  },
  updateCategory: async (id: string, payload: { name?: string; name_ar?: string; code?: string | null }) => {
    const { data } = await api.patch(`/finance/categories/${id}`, payload);
    return data;
  },
  archiveCategory: async (id: string) => {
    await api.post(`/finance/categories/${id}/archive`);
  },

  // ---- Expenses ----
  listExpenses: async (filters: ExpenseFilters = {}): Promise<Expense[]> => {
    const { data } = await api.get("/finance/expenses", { params: filters });
    return data;
  },
  listPayers: async (): Promise<string[]> => (await api.get("/finance/expenses/payers")).data,
  /** One page + totals of the whole filtered set (expenses screen). */
  pageExpenses: async (filters: ExpenseFilters & { page: number; page_size: number }): Promise<ExpensePage> => {
    const { data } = await api.get("/finance/expenses/page", { params: filters });
    return data;
  },
  getExpense: async (id: string): Promise<ExpenseDetail> => {
    const { data } = await api.get(`/finance/expenses/${id}`);
    return data;
  },
  createExpense: async (payload: ExpenseCreatePayload): Promise<Expense> => {
    const { data } = await api.post("/finance/expenses", payload);
    return data;
  },
  updateExpense: async (id: string, payload: Partial<ExpenseCreatePayload> & { change_reason?: string }): Promise<Expense> => {
    const { data } = await api.patch(`/finance/expenses/${id}`, payload);
    return data;
  },
  submitExpense: async (id: string): Promise<Expense> => {
    const { data } = await api.post(`/finance/expenses/${id}/submit`);
    return data;
  },
  approveExpense: async (id: string): Promise<Expense> => {
    const { data } = await api.post(`/finance/expenses/${id}/approve`);
    return data;
  },
  rejectExpense: async (id: string, reason: string): Promise<Expense> => {
    const { data } = await api.post(`/finance/expenses/${id}/reject`, { reason });
    return data;
  },
  cancelExpense: async (id: string): Promise<Expense> => {
    const { data } = await api.post(`/finance/expenses/${id}/cancel`);
    return data;
  },
  resubmitExpense: async (id: string): Promise<Expense> => {
    const { data } = await api.post(`/finance/expenses/${id}/resubmit`);
    return data;
  },
  restoreExpenseVersion: async (id: string, versionNumber: number, reason?: string): Promise<Expense> => {
    const { data } = await api.post(`/finance/expenses/${id}/restore`, {
      version_number: versionNumber,
      reason,
    });
    return data;
  },
  archiveExpense: async (id: string) => {
    await api.post(`/finance/expenses/${id}/archive`);
  },

  // ---- Attachments ----
  listAttachments: async (expenseId: string): Promise<Attachment[]> => {
    const { data } = await api.get(`/finance/expenses/${expenseId}/attachments`);
    return data;
  },
  uploadAttachment: async (expenseId: string, file: File): Promise<Attachment> => {
    const formData = new FormData();
    formData.append("file", file);
    const { data } = await api.post(`/finance/expenses/${expenseId}/attachments`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return data;
  },
  downloadAttachment: async (expenseId: string, attachmentId: string): Promise<Blob> => {
    const { data } = await api.get(`/finance/expenses/${expenseId}/attachments/${attachmentId}`, {
      responseType: "blob",
    });
    return data;
  },
  deleteAttachment: async (expenseId: string, attachmentId: string) => {
    await api.delete(`/finance/expenses/${expenseId}/attachments/${attachmentId}`);
  },

  // ---- Reports ----
  getSummary: async () => {
    const { data } = await api.get("/finance/reports/summary");
    return data;
  },
  getCategoryBreakdown: async (dateFrom?: string, dateTo?: string) => {
    const { data } = await api.get("/finance/reports/category-breakdown", {
      params: { date_from: dateFrom, date_to: dateTo },
    });
    return data;
  },
  getMonthlyTrend: async (monthsBack = 12) => {
    const { data } = await api.get("/finance/reports/monthly-trend", { params: { months_back: monthsBack } });
    return data;
  },
  getOverview: async (month: string | null): Promise<FinanceOverview> => {
    const { data } = await api.get("/finance/reports/overview", { params: month ? { month } : {} });
    return data;
  },
  getRecentExpenses: async (limit = 10): Promise<Expense[]> => {
    const { data } = await api.get("/finance/reports/recent-expenses", { params: { limit } });
    return data;
  },
  getAccountTotals: async (): Promise<AccountTotal[]> => {
    const { data } = await api.get("/finance/reports/account-totals");
    return data;
  },
  getByPeriod: async (): Promise<PeriodTotal[]> => {
    const { data } = await api.get("/finance/reports/by-period");
    return data;
  },

  // ---- Partner funding (money transferred into the project) ----
  listFunding: async (): Promise<Funding[]> => {
    const { data } = await api.get("/finance/funding");
    return data;
  },
  createFunding: async (payload: FundingPayload): Promise<Funding> => {
    const { data } = await api.post("/finance/funding", payload);
    return data;
  },
  updateFunding: async (id: string, payload: Partial<FundingPayload>): Promise<Funding> => {
    const { data } = await api.patch(`/finance/funding/${id}`, payload);
    return data;
  },
  deleteFunding: async (id: string) => {
    await api.delete(`/finance/funding/${id}`);
  },
};
