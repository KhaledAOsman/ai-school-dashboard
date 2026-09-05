/**
 * React Query hooks wrapping financeApi. Pages use these instead of calling
 * financeApi directly, so caching/invalidation stays consistent everywhere.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { financeApi, type ExpenseCreatePayload, type ExpenseFilters } from "@/modules/finance/services/financeApi";

export function useCategories(includeArchived = false) {
  return useQuery({
    queryKey: ["categories", includeArchived],
    queryFn: () => financeApi.listCategories(includeArchived),
  });
}

export function useCreateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: financeApi.createCategory,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["categories"] }),
  });
}

export function useArchiveCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: financeApi.archiveCategory,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["categories"] }),
  });
}

export function useExpenses(filters: ExpenseFilters = {}) {
  return useQuery({
    queryKey: ["expenses", filters],
    queryFn: () => financeApi.listExpenses(filters),
  });
}

export function useExpense(id: string | undefined) {
  return useQuery({
    queryKey: ["expense", id],
    queryFn: () => financeApi.getExpense(id as string),
    enabled: !!id,
  });
}

export function useCreateExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ExpenseCreatePayload) => financeApi.createExpense(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["expenses"] }),
  });
}

export function useUpdateExpense(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Partial<ExpenseCreatePayload> & { change_reason?: string }) =>
      financeApi.updateExpense(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expense", id] });
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
    },
  });
}

function useExpenseAction(id: string, action: (id: string) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => action(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expense", id] });
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
    },
  });
}

export function useSubmitExpense(id: string) {
  return useExpenseAction(id, financeApi.submitExpense);
}
export function useApproveExpense(id: string) {
  return useExpenseAction(id, financeApi.approveExpense);
}
export function useCancelExpense(id: string) {
  return useExpenseAction(id, financeApi.cancelExpense);
}
export function useResubmitExpense(id: string) {
  return useExpenseAction(id, financeApi.resubmitExpense);
}

export function useRejectExpense(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reason: string) => financeApi.rejectExpense(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expense", id] });
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
    },
  });
}

export function useRestoreExpenseVersion(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ versionNumber, reason }: { versionNumber: number; reason?: string }) =>
      financeApi.restoreExpenseVersion(id, versionNumber, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expense", id] });
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
    },
  });
}

export function useAttachments(expenseId: string) {
  return useQuery({
    queryKey: ["attachments", expenseId],
    queryFn: () => financeApi.listAttachments(expenseId),
    enabled: !!expenseId,
  });
}

export function useUploadAttachment(expenseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => financeApi.uploadAttachment(expenseId, file),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["attachments", expenseId] }),
  });
}

export function useDeleteAttachment(expenseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (attachmentId: string) => financeApi.deleteAttachment(expenseId, attachmentId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["attachments", expenseId] }),
  });
}

export function useFinanceSummary() {
  return useQuery({ queryKey: ["finance-summary"], queryFn: financeApi.getSummary });
}

export function useCategoryBreakdown(dateFrom?: string, dateTo?: string) {
  return useQuery({
    queryKey: ["category-breakdown", dateFrom, dateTo],
    queryFn: () => financeApi.getCategoryBreakdown(dateFrom, dateTo),
  });
}

export function useMonthlyTrend(monthsBack = 12) {
  return useQuery({
    queryKey: ["monthly-trend", monthsBack],
    queryFn: () => financeApi.getMonthlyTrend(monthsBack),
  });
}

export function useRecentExpenses(limit = 10) {
  return useQuery({
    queryKey: ["recent-expenses", limit],
    queryFn: () => financeApi.getRecentExpenses(limit),
  });
}
