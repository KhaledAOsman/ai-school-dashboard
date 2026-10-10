/** Accounting (double-entry) + subscription revenue API layer. */
import { api } from "@/lib/apiClient";

export type AccountType = "asset" | "liability" | "equity" | "revenue" | "expense";

export interface AccountRow {
  code: string;
  name: string;
  type: AccountType;
  type_label: string;
  parent_code: string | null;
  normal_side: "debit" | "credit";
  level: number;
  is_postable: boolean;
  is_active: boolean;
  balance: string;
  has_children: boolean;
}

export interface JournalLineRow {
  account: string;
  account_name: string;
  debit: string;
  credit: string;
  memo: string | null;
  party: string | null;
}

export interface JournalEntryRow {
  no: number;
  ref: string;
  date: string;
  source_type: "expense" | "funding" | "revenue" | "manual";
  source_id: string | null;
  memo: string;
  total: string;
  lines: JournalLineRow[];
}

export interface JournalResponse {
  total: number;
  total_debit: string;
  entries: JournalEntryRow[];
}

export interface JournalParams {
  date_from?: string;
  date_to?: string;
  account?: string;
  source_type?: string;
  q?: string;
  limit?: number;
  offset?: number;
}

export interface LedgerResponse {
  account: { code: string; name: string; type: AccountType; normal_side: "debit" | "credit" };
  opening: string;
  total_debit: string;
  total_credit: string;
  closing: string;
  rows: {
    date: string;
    ref: string;
    no: number;
    memo: string;
    account: string;
    account_name: string;
    party: string | null;
    debit: string;
    credit: string;
    balance: string;
  }[];
  parties: { party: string; balance: string }[];
}

export interface TrialBalanceRow {
  code: string;
  name: string;
  type: AccountType;
  type_label: string;
  level: number;
  is_header: boolean;
  debit: string;
  credit: string;
  balance_debit: string;
  balance_credit: string;
  rollup_balance_debit: string;
  rollup_balance_credit: string;
}

export interface TrialBalance {
  rows: TrialBalanceRow[];
  total_debit: string;
  total_credit: string;
  total_balance_debit: string;
  total_balance_credit: string;
  balanced: boolean;
}

export interface StatementRow {
  code: string;
  name: string;
  level: number;
  is_header: boolean;
  total: string;
  months: Record<string, string>;
}

export interface IncomeStatement {
  months: string[];
  revenue: StatementRow[];
  expenses: StatementRow[];
  total_revenue: string;
  total_expenses: string;
  net_income: string;
  revenue_by_month: Record<string, string>;
  expenses_by_month: Record<string, string>;
  net_by_month: Record<string, string>;
}

export interface BalanceRow {
  code: string;
  name: string;
  level: number;
  is_header: boolean;
  amount: string;
}

export interface BalanceSheet {
  as_of: string | null;
  assets: BalanceRow[];
  total_assets: string;
  liabilities: BalanceRow[];
  total_liabilities: string;
  equity: BalanceRow[];
  total_contributed: string;
  retained_earnings: string;
  total_equity: string;
  total_liabilities_equity: string;
  balanced: boolean;
}

export interface CashFlowRow {
  key: string;
  label: string;
  code: string | null;
  months: Record<string, string>;
  total: string;
}

export interface CashFlow {
  months: string[];
  opening: string;
  closing: string;
  operating_in: CashFlowRow[];
  operating_out: CashFlowRow[];
  financing: CashFlowRow[];
  net_operating: Record<string, string>;
  net_financing: Record<string, string>;
  net_change: Record<string, string>;
  opening_by_month: Record<string, string>;
  closing_by_month: Record<string, string>;
  total_net_change: string;
}

export interface CheckRow {
  name: string;
  ledger: string;
  source: string;
  ok: boolean;
  info?: boolean;
  note?: string | null;
}

export interface ManualJournalLine {
  account_code: string;
  debit: string;
  credit: string;
  memo?: string | null;
  party?: string | null;
}

export interface ManualJournalPayload {
  entry_date: string;
  memo: string;
  reference?: string | null;
  lines: ManualJournalLine[];
}

export interface Revenue {
  id: string;
  revenue_date: string;
  amount: string;
  discount_amount: string;
  gross_amount: string;
  currency: string;
  revenue_type: string;
  customer_name: string | null;
  package_name: string | null;
  invoice_number: string | null;
  invoice_url: string | null;
  payment_method: string | null;
  note: string | null;
  source: string | null;
  created_at: string;
}

export interface RevenuePayload {
  revenue_date: string;
  amount: string;
  discount_amount: string;
  customer_name?: string | null;
  package_name?: string | null;
  invoice_number?: string | null;
  invoice_url?: string | null;
  payment_method?: string | null;
  note?: string | null;
}

const clean = <T extends object>(p: T): T =>
  Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined && v !== "" && v !== null)) as T;

export const accountingApi = {
  accounts: async (): Promise<AccountRow[]> => (await api.get("/finance/accounting/accounts")).data,
  journal: async (params: JournalParams): Promise<JournalResponse> =>
    (await api.get("/finance/accounting/journal", { params: clean(params) })).data,
  ledger: async (code: string, params: { date_from?: string; date_to?: string; party?: string }): Promise<LedgerResponse> =>
    (await api.get(`/finance/accounting/ledger/${code}`, { params: clean(params) })).data,
  trialBalance: async (params: { date_from?: string; date_to?: string }): Promise<TrialBalance> =>
    (await api.get("/finance/accounting/trial-balance", { params: clean(params) })).data,
  incomeStatement: async (params: { date_from?: string; date_to?: string }): Promise<IncomeStatement> =>
    (await api.get("/finance/accounting/income-statement", { params: clean(params) })).data,
  balanceSheet: async (params: { as_of?: string }): Promise<BalanceSheet> =>
    (await api.get("/finance/accounting/balance-sheet", { params: clean(params) })).data,
  cashFlow: async (params: { date_from?: string; date_to?: string }): Promise<CashFlow> =>
    (await api.get("/finance/accounting/cash-flow", { params: clean(params) })).data,
  checks: async (): Promise<CheckRow[]> => (await api.get("/finance/accounting/checks")).data,
  createJournal: async (payload: ManualJournalPayload): Promise<{ id: string; ref: string }> =>
    (await api.post("/finance/accounting/journal", payload)).data,
  voidJournal: async (id: string, reason: string) => {
    await api.delete(`/finance/accounting/journal/${id}`, { data: { reason } });
  },

  listRevenue: async (params: { date_from?: string; date_to?: string; q?: string }): Promise<Revenue[]> =>
    (await api.get("/finance/revenue", { params: { ...clean(params), limit: 2000 } })).data,
  createRevenue: async (payload: RevenuePayload): Promise<Revenue> => (await api.post("/finance/revenue", payload)).data,
  deleteRevenue: async (id: string) => {
    await api.delete(`/finance/revenue/${id}`);
  },
};
