import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { accountingApi, type JournalParams, type ManualJournalPayload, type RevenuePayload } from "@/modules/finance/services/accountingApi";

// Books are derived from live registers, so never serve a stale copy.
const fresh = { staleTime: 0, refetchOnMount: "always" as const };

export const useAccountingAccounts = () => useQuery({ queryKey: ["accounting", "accounts"], queryFn: accountingApi.accounts, ...fresh });
export const useJournal = (params: JournalParams) =>
  useQuery({ queryKey: ["accounting", "journal", params], queryFn: () => accountingApi.journal(params), ...fresh });
export const useLedger = (code: string, params: { date_from?: string; date_to?: string; party?: string }) =>
  useQuery({ queryKey: ["accounting", "ledger", code, params], queryFn: () => accountingApi.ledger(code, params), enabled: !!code, ...fresh });
export const useTrialBalance = (params: { date_from?: string; date_to?: string }) =>
  useQuery({ queryKey: ["accounting", "tb", params], queryFn: () => accountingApi.trialBalance(params), ...fresh });
export const useIncomeStatement = (params: { date_from?: string; date_to?: string }) =>
  useQuery({ queryKey: ["accounting", "is", params], queryFn: () => accountingApi.incomeStatement(params), ...fresh });
export const useBalanceSheet = (params: { as_of?: string }) =>
  useQuery({ queryKey: ["accounting", "bs", params], queryFn: () => accountingApi.balanceSheet(params), ...fresh });
export const useCashFlow = (params: { date_from?: string; date_to?: string }) =>
  useQuery({ queryKey: ["accounting", "cf", params], queryFn: () => accountingApi.cashFlow(params), ...fresh });
export const useAccountingChecks = () => useQuery({ queryKey: ["accounting", "checks"], queryFn: accountingApi.checks, ...fresh });

export function useCreateJournal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: ManualJournalPayload) => accountingApi.createJournal(p),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["accounting"] }),
  });
}
export function useVoidJournal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => accountingApi.voidJournal(id, reason),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["accounting"] }),
  });
}

export const useRevenue = (params: { date_from?: string; date_to?: string; q?: string }) =>
  useQuery({ queryKey: ["revenue", params], queryFn: () => accountingApi.listRevenue(params), ...fresh });
export function useCreateRevenue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: RevenuePayload) => accountingApi.createRevenue(p),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["revenue"] });
      qc.invalidateQueries({ queryKey: ["accounting"] });
    },
  });
}
export function useDeleteRevenue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => accountingApi.deleteRevenue(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["revenue"] });
      qc.invalidateQueries({ queryKey: ["accounting"] });
    },
  });
}
