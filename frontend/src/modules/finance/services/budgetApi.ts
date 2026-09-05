/**
 * Budget line API service layer. A budget line is a manager-approved
 * allocation (e.g. "Instructor Salaries - September") that expenses can be
 * posted against once approved - see docs/architecture for the full
 * approval-gate rationale.
 */
import { api } from "@/lib/apiClient";

export type BudgetLineStatus = "draft" | "pending_approval" | "approved" | "rejected" | "archived";
export type BudgetLineKind = "fixed" | "variable";
export type BudgetPeriod = "one_time" | "monthly" | "quarterly" | "yearly";

export interface CategoryRef {
  id: string;
  name: string;
}

export interface BudgetLine {
  id: string;
  name: string;
  description: string | null;
  kind: BudgetLineKind;
  period: BudgetPeriod;
  budgeted_amount: string;
  currency: string;
  period_start: string | null;
  period_end: string | null;
  status: BudgetLineStatus;
  created_by: string;
  created_at: string;
  approved_by: string | null;
  approved_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  is_archived: boolean;
  categories: CategoryRef[];
}

export interface BudgetLineWithSpend extends BudgetLine {
  spent_amount: number;
  remaining_amount: number;
  spent_pct: number;
}

export interface BudgetLineCreatePayload {
  name: string;
  description?: string | null;
  kind: BudgetLineKind;
  period: BudgetPeriod;
  budgeted_amount: string;
  currency?: string;
  period_start?: string | null;
  period_end?: string | null;
  category_ids: string[];
}

export const budgetApi = {
  list: async (params: { status?: string; category_id?: string; include_archived?: boolean } = {}): Promise<BudgetLineWithSpend[]> => {
    const { data } = await api.get("/finance/budget-lines", { params });
    return data;
  },
  get: async (id: string): Promise<BudgetLineWithSpend> => {
    const { data } = await api.get(`/finance/budget-lines/${id}`);
    return data;
  },
  create: async (payload: BudgetLineCreatePayload): Promise<BudgetLine> => {
    const { data } = await api.post("/finance/budget-lines", payload);
    return data;
  },
  update: async (id: string, payload: Partial<BudgetLineCreatePayload>): Promise<BudgetLine> => {
    const { data } = await api.patch(`/finance/budget-lines/${id}`, payload);
    return data;
  },
  submit: async (id: string): Promise<BudgetLine> => {
    const { data } = await api.post(`/finance/budget-lines/${id}/submit`);
    return data;
  },
  approve: async (id: string): Promise<BudgetLine> => {
    const { data } = await api.post(`/finance/budget-lines/${id}/approve`);
    return data;
  },
  reject: async (id: string, reason: string): Promise<BudgetLine> => {
    const { data } = await api.post(`/finance/budget-lines/${id}/reject`, { reason });
    return data;
  },
  archive: async (id: string): Promise<BudgetLine> => {
    const { data } = await api.post(`/finance/budget-lines/${id}/archive`);
    return data;
  },
};

export interface StaffDepartment {
  id: string;
  name: string;
  display_order: number;
  is_archived: boolean;
  created_at: string;
}

export interface StaffMember {
  id: string;
  full_name: string;
  department_id: string;
  department_name: string;
  email: string | null;
  phone: string | null;
  base_salary: string | null;
  currency: string;
  is_active: boolean;
  created_at: string;
}

export interface StaffDepartmentGroup {
  department_id: string;
  department_name: string;
  member_count: number;
  total_salary: string;
  members: StaffMember[];
}

export interface StaffCreatePayload {
  full_name: string;
  department_id: string;
  email?: string | null;
  phone?: string | null;
  base_salary?: string | null;
  currency?: string;
}

export const staffApi = {
  list: async (includeInactive = false): Promise<StaffMember[]> => {
    const { data } = await api.get("/finance/staff", { params: { include_inactive: includeInactive } });
    return data;
  },
  listGrouped: async (includeInactive = false): Promise<StaffDepartmentGroup[]> => {
    const { data } = await api.get("/finance/staff/grouped", { params: { include_inactive: includeInactive } });
    return data;
  },
  create: async (payload: StaffCreatePayload): Promise<StaffMember> => {
    const { data } = await api.post("/finance/staff", payload);
    return data;
  },
  update: async (id: string, payload: Partial<StaffCreatePayload> & { is_active?: boolean }): Promise<StaffMember> => {
    const { data } = await api.patch(`/finance/staff/${id}`, payload);
    return data;
  },
};

export const staffDepartmentApi = {
  list: async (includeArchived = false): Promise<StaffDepartment[]> => {
    const { data } = await api.get("/finance/staff/departments", { params: { include_archived: includeArchived } });
    return data;
  },
  create: async (name: string): Promise<StaffDepartment> => {
    const { data } = await api.post("/finance/staff/departments", { name });
    return data;
  },
};
