import { api } from "@/lib/apiClient";

export interface KpiDashboardStats {
  // CRM
  total_leads: number;
  leads_without_bookings: number;
  currently_booked: number;
  attended: number;
  not_attended: number;
  not_answered: number;
  not_interested: number;
  active_teachers: number;
  available_slots: number;
  // Finance
  total_expenses_month: number;
  total_expenses_quarter: number;
  total_expenses_year: number;
  pending_approval_count: number;
  pending_approval_amount: number;
}

export const kpiDashboardApi = {
  stats: async (): Promise<KpiDashboardStats> => {
    const { data } = await api.get("/kpi-dashboard/stats");
    return data;
  },
};
