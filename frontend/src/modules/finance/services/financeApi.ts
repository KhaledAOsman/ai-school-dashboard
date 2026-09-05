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
  parent_id: string | null;
  display_order: number;
  is_archived: boolean;
  created_at: string;
  children: Category[];
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
}

export interface ExpenseFilters {
  status?: string;
  category_id?: string;
  subcategory_id?: string;
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
  createCategory: async (payload: { name: string; name_ar?: string; parent_id?: string | null }) => {
    const { data } = await api.post("/finance/categories", payload);
    return data;
  },
  updateCategory: async (id: string, payload: { name?: string; name_ar?: string }) => {
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
  getRecentExpenses: async (limit = 10): Promise<Expense[]> => {
    const { data } = await api.get("/finance/reports/recent-expenses", { params: { limit } });
    return data;
  },
};
