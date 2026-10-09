import { api } from "@/lib/apiClient";
import type { Platform, PlatformTotals } from "@/modules/marketing/services/marketingApi";

export interface FunnelCounts {
  leads: number;
  /** bookings = attended + not_attended + pending_attendance */
  booked: number;
  /** sessions with a recorded outcome (attended + not_attended) */
  decided: number;
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

export interface SeriesPoint {
  month: string;
  label: string;
  leads: number;
  booked: number;
  attended: number;
  subscribers: number;
  revenue: number;
}

export interface SourceRow {
  source: string;
  leads: number;
  booked: number;
  attended: number;
  not_attended: number;
  pending: number;
}

export interface PeriodMetrics {
  period: string;
  label: string;
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
    reconciliation: Reconciliation;
  };
  series?: SeriesPoint[];
  sources?: SourceRow[];
}

export interface ReconciliationRow {
  platform: Platform;
  spend: string;
  reported: number;
  form_leads: number;
  website_leads: number;
  messaging_conversations: number;
  recorded: number;
  capture_rate: number | null;
  gap: number;
  real_cpl: string | null;
}

export interface Reconciliation {
  platforms: ReconciliationRow[];
  other_channels: { website: number; organic: number };
  total_recorded: number;
}

export interface PeriodOption {
  key: string;
  label: string;
  group: "quarter" | "range";
}

export interface Targets {
  subscribers: number;
  max_cac: number;
  min_conversion: number;
  min_attendance: number;
}

export interface KpiSettings {
  phase_start: string;
  phase_end_inclusive: string;
  targets: Targets;
}

export interface PhaseGoals {
  start: string;
  end_inclusive: string;
  includes_cumulative: boolean;
  targets: Targets;
  metrics: {
    subscribers: number;
    cac: string | null;
    total_spend: string;
    conversion: number | null;
    attendance_rate: number | null;
    attended: number;
    decided: number;
    booked: number;
  };
}

export interface KpiSummary {
  current: PeriodMetrics;
  previous: PeriodMetrics | null;
  periods: PeriodOption[];
  selected: string;
  settings: KpiSettings;
  phase_goals: PhaseGoals;
}

export interface KpiSettingsUpdate {
  phase_start?: string | null;
  phase_end_inclusive?: string | null;
  subscribers?: number | null;
  max_cac?: number | null;
  min_conversion?: number | null;
  min_attendance?: number | null;
}

export const kpiApi = {
  summary: async (period?: string): Promise<KpiSummary> =>
    (await api.get("/kpi-dashboard/summary", { params: period ? { period } : {} })).data,
  updateSettings: async (payload: KpiSettingsUpdate): Promise<KpiSettings> =>
    (await api.patch("/kpi-dashboard/settings", payload)).data,
};
