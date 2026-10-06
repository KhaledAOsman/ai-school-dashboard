import { api } from "@/lib/apiClient";
import type { PlatformTotals } from "@/modules/marketing/services/marketingApi";

export interface FunnelCounts {
  leads: number;
  booked: number;
  attended: number;
  not_attended: number;
  pending_attendance: number;
  subscribers: number;
}

export interface FunnelRates {
  lead_to_booked: number | null;
  booked_to_attended: number | null;
  booked_to_not_attended: number | null;
  attended_to_subscriber: number | null;
  overall: number | null;
}

export interface PeriodMetrics {
  year: number;
  half: 1 | 2;
  period: string;
  start: string;
  end_inclusive: string;
  funnel: FunnelCounts;
  funnel_rates: FunnelRates;
  revenue: {
    subscribers: number;
    total_paid: string;
    total_discount: string;
    total_list_price: string;
    avg_paid: string | null;
  };
  marketing: {
    total_spend: string;
    reported_leads: number;
    cac: string | null;
    cost_per_lead: string | null;
    roas: number | null;
    includes_cumulative: boolean;
    platforms: PlatformTotals[];
  };
}

export interface Phases {
  project_start_date: string | null;
  test_end_date: string | null;
  full_launch_date: string | null;
  current_phase: "not_started" | "test" | "full_launch" | null;
  configured: boolean;
}

export interface TestPhase {
  configured: boolean;
  start: string;
  end_inclusive: string;
  includes_cumulative: boolean;
  targets: { subscribers: number; max_cac: number; min_conversion: number; min_attendance: number };
  metrics: {
    subscribers: number;
    cac: string | null;
    total_spend: string;
    conversion: number | null;
    attendance_rate: number | null;
    attended: number;
    booked: number;
  };
}

export interface KpiSummary {
  current: PeriodMetrics;
  previous: PeriodMetrics;
  phases: Phases;
  test_phase: TestPhase;
}

export const kpiApi = {
  summary: async (period?: string): Promise<KpiSummary> =>
    (await api.get("/kpi-dashboard/summary", { params: period ? { period } : {} })).data,
  updateSettings: async (payload: { project_start_date: string | null; full_launch_date: string | null }): Promise<Phases> =>
    (await api.patch("/kpi-dashboard/settings", payload)).data,
};
