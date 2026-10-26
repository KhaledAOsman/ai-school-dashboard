import { api } from "@/lib/apiClient";

export type Scenario = "conservative" | "base" | "optimistic";
export type ExpenseCategory = "teachers" | "content" | "marketing_team" | "ads" | "marketing_extra" | "cs" | "quality" | "tools" | "commissions" | "payment_fees" | "admin" | "launch";

export interface VersionMeta {
  id: string;
  name: string;
  description: string | null;
  status: "draft" | "published" | "archived";
  created_at: string | null;
  updated_at: string | null;
  published_at: string | null;
  calibration_as_of: string | null;
  /** published versions: the scenarios viewers can switch between and the one that opens first */
  presentation?: Presentation;
  assumptions?: Assumptions;
}
export interface Presentation { scenarios: Scenario[]; default_scenario: Scenario; allow_report?: boolean }

export interface Market {
  id: string; name_ar: string; name_en: string; start_month: string;
  trials_by_year: number[]; seasonality: Record<string, number>;
  cpl: number; organic_share: number; organic_share_target: number; cpl_growth_yoy: number;
  lead_to_trial: number; lead_to_trial_target: number; show_rate: number; show_rate_target: number;
  trial_to_paid: number; trial_to_paid_target: number; ramp_months: number; trial_cost: number;
}

export interface Stream {
  id: string; name_ar: string; name_en: string; enabled: boolean; suggested: boolean; category: Segment;
  driver: "funnel" | "growth" | "partners"; market?: string; funnel_share: number; start_month: string;
  partners_by_year: number[]; students_per_partner: number;
  initial_monthly: number; monthly_growth: number; max_monthly: number; active_months: number[];
  list_price: number; avg_discount: number; lessons: number; lessons_per_week: number; service_months?: number;
  group_size: number; teacher_cost_per_lesson: number; commission_per_enrolment: number;
  renewal_rate: number; renewal_rate_target: number; renewal_ramp_months: number;
  payment_lag_months: number; uses_gateway: boolean; launch_cost: number;
}

export type Segment = "b2c" | "b2b";
export type HireCategory = "marketing" | "cs" | "content" | "quality" | "admin";
export interface Hire { role_ar: string; role_en: string; month: string; salary: number; count: number; category: HireCategory }
export interface OpexLine { id: string; category: ExpenseCategory; name_ar: string; name_en: string; monthly: number; start_month: string; end_month: string | null; growth_yoy: number }
export interface CapexItem { name_ar: string; name_en: string; month: string; amount: number; life_months: number }
export interface ScenarioParams { trials_volume: number; conversion: number; cpl: number; renewal: number; growth_volume: number; price: number; delay_months: number }

export interface Assumptions {
  general: { start_month: string; horizon_months: number; weeks_per_month: number; revenue_basis: "billing" | "delivery" };
  markets: Market[];
  streams: Stream[];
  tax: { vat_rate: number; vat_mode: "auto" | "month" | "never"; vat_threshold: number; vat_from_month: string; zakat_rate: number; zakat_pay_lag_months: number };
  payments: { gateway_fee_pct: number; gateway_fee_fixed: number };
  team: {
    admin_payroll: number; base_headcount: number; annual_raise: number; raise_month: number; employer_oncost: number;
    intl_transfer_fee_pct: number; teacher_capacity_lessons: number; teacher_onboarding_cost: number;
    marketing_team_monthly_by_year: number[]; cs_monthly_by_year: number[]; quality_monthly_by_year: number[];
    hires: Hire[];
  };
  opex: OpexLine[];
  capex: CapexItem[];
  financing: {
    opening_cash: number; owner_invested_to_date: number; loan_mode: "auto" | "manual"; loan_amount: number; loan_rounding: number;
    cash_buffer_months: number; loan_draw_month: string; loan_rate: number; loan_tenor_months: number; loan_grace_months: number;
    loan_upfront_fee: number; equity_injections: { month: string; amount: number }[];
  };
  valuation: { discount_rate: number; terminal_method: "multiple" | "gordon"; exit_revenue_multiple: number; terminal_growth: number };
  scenarios: Record<Scenario, ScenarioParams>;
  auto_fields: string[];
}

export interface MonthRow {
  i: number; month: string; year: number; vat_registered: boolean;
  revenue: number; revenue_by_stream: Record<string, number>; billed_gross: number; collections: number;
  new_customers: number; renewals: number; enrolments_by_stream: Record<string, number>; new_by_stream: Record<string, number>;
  active_students: number; leads: number; trials: number; attended: number;
  teacher_cost: number; trial_cost: number; commissions: number; gateway_fees: number; cogs: number; gross_profit: number;
  marketing: number; payroll: number; teacher_onboarding: number; launch_costs: number; other_opex: number;
  opex_by_line: Record<string, number>; opex: number; ebitda: number; depreciation: number; ebit: number;
  interest: number; loan_fees: number; ebt: number; zakat: number; net_income: number;
  cfo: number; capex: number; loan_draw: number; loan_principal: number; equity_injection: number; vat_paid: number; zakat_paid: number;
  net_cash_flow: number; cash: number; receivables: number; deferred_revenue: number; vat_payable: number; zakat_payable: number;
  fixed_assets: number; loan_balance: number; equity: number; teacher_lessons: number;
  headcount: { fixed: number; teachers: number };
  subscriptions: number; expense_by_category: Record<ExpenseCategory, number>;
}

export interface YearRow extends Omit<MonthRow, "i" | "month" | "vat_registered" | "active_students" | "headcount" | "new_by_stream" | "teacher_lessons"> {
  from: string; to: string; active_students_avg: number; active_students_end: number; teachers_end: number; fixed_headcount_end: number;
  gross_margin: number | null; ebitda_margin: number | null; net_margin: number | null; dscr: number | null;
}

export interface UnitEconomics {
  stream: string; name_ar: string; name_en: string; price_list: number; discount: number; price_paid: number; price_net: number;
  vat_registered: boolean; teacher_cost: number; gateway_fee: number; commission: number; contribution: number;
  contribution_margin: number | null; renewal_rate_target: number; expected_purchases: number | null; ltv: number | null;
  cac: number | null; ltv_cac: number | null; payback_months: number | null; cycle_months: number;
  lesson_net_revenue: number | null; teacher_cost_per_lesson: number;
}

export interface Kpis {
  revenue_y1: number; revenue_y5: number; revenue_cagr: number | null; ebitda_y1: number; ebitda_y5: number;
  ebitda_margin_y5: number | null; net_income_y5: number; teacher_capacity_lessons: number; ebitda_breakeven_month: string | null;
  net_income_breakeven_month: string | null; cash_flow_breakeven_month: string | null; min_cash: number; min_cash_month: string;
  funding_need_without_loan: number; cash_buffer: number; loan_amount: number; suggested_loan: number; financeable: boolean;
  owner_bridge: number; funding_gap: number; funding_gap_month: string | null; suggested_grace_months: number | null; loan_repaid_month: string | null; loan_monthly_payment: number;
  min_dscr: number | null; cash_end: number; students_active_end: number; teachers_end: number; headcount_end: number;
  vat_registration_month: string | null; owner_invested: number; owner_irr: number | null; owner_moic: number | null;
  enterprise_value: number; equity_value_today: number; exit_equity_value: number;
}

export interface Valuation {
  discount_rate: number; method: string; fcf: number[]; pv_fcf: number; terminal_value: number; pv_terminal: number;
  enterprise_value: number; equity_value_today: number; exit_enterprise_value: number; exit_equity_value: number;
}

export interface ModelResult {
  scenario: Scenario; start_month: string; months: MonthRow[]; years: YearRow[]; kpis: Kpis;
  unit_economics: UnitEconomics[]; valuation: Valuation;
  streams: { id: string; name_ar: string; name_en: string; suggested: boolean; driver: string; start_month: string; category: Segment }[];
  opex_lines: { id: string; name_ar: string; name_en: string }[];
  checks: Record<string, boolean | number>;
  calibration?: { as_of: string; values: Record<string, number>; basis: Record<string, string> };
  resolved_assumptions?: Assumptions;
}

export interface Sensitivity {
  pct: number;
  base: SensPoint;
  drivers: { driver: string; name_ar: string; name_en: string; low: SensPoint; high: SensPoint; value?: number; unit?: "sar" | "pct" | "count"; per?: "per_month" | "per_year" | "per_package" | null }[];
  scenarios: Record<Scenario, SensPoint & { revenue_by_year: number[]; ebitda_by_year: number[]; cash_by_year: number[]; breakeven: string | null; loan: number; funding_gap: number; financeable: boolean; subs_y5: number }>;
}
export interface SensPoint { ebitda_y5: number; revenue_y5: number; min_cash: number; enterprise_value: number; funding_need: number }

export interface ActualMonth {
  month: string; leads: number; leads_organic: number; trials: number; attended: number; decided: number;
  new_subs: number; renewals: number; sales_paid: number; sales_discount: number; spend: Record<string, number>;
  spend_total: number; commissions: number; funding: number; collections: number; gateway_fees: number;
}
export interface Actuals {
  as_of: string; values: Record<string, number>; basis: Record<string, string>; window: string[];
  funding_history: { month: string; amount: number }[];
  totals: { invested: number; sales_paid: number; sales_discount: number; subscriptions: number; customers: number; renewals: number; spent: number };
  months: ActualMonth[];
}

export const fmApi = {
  versions: async (): Promise<{ versions: VersionMeta[]; can_edit: boolean; can_publish: boolean }> => (await api.get("/fin-model/versions")).data,
  version: async (id: string): Promise<VersionMeta> => (await api.get(`/fin-model/versions/${id}`)).data,
  create: async (name: string, copy_from?: string | null): Promise<VersionMeta> => (await api.post("/fin-model/versions", { name, copy_from: copy_from ?? null })).data,
  update: async (id: string, body: { name?: string; description?: string; assumptions?: Assumptions }): Promise<VersionMeta> =>
    (await api.put(`/fin-model/versions/${id}`, body)).data,
  publish: async (id: string, presentation?: Presentation): Promise<VersionMeta> => (await api.post(`/fin-model/versions/${id}/publish`, presentation ?? null)).data,
  setPresentation: async (id: string, presentation: Presentation): Promise<VersionMeta> => (await api.put(`/fin-model/versions/${id}/presentation`, presentation)).data,
  archive: async (id: string) => { await api.post(`/fin-model/versions/${id}/archive`); },
  history: async (id: string): Promise<{ at: string; action: string; by: string | null; details: Record<string, unknown> | null }[]> =>
    (await api.get(`/fin-model/versions/${id}/history`)).data,
  result: async (id: string, scenario: Scenario): Promise<ModelResult> => (await api.get(`/fin-model/versions/${id}/result`, { params: { scenario } })).data,
  sensitivity: async (id: string, scenario: Scenario): Promise<Sensitivity> => (await api.get(`/fin-model/versions/${id}/sensitivity`, { params: { scenario } })).data,
  preview: async (assumptions: Assumptions, scenario: Scenario): Promise<ModelResult> => (await api.post("/fin-model/preview", { assumptions, scenario })).data,
  actuals: async (): Promise<Actuals> => (await api.get("/fin-model/actuals")).data,
};
