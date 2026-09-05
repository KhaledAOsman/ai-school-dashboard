import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  budgetApi,
  staffApi,
  staffDepartmentApi,
  type BudgetLineCreatePayload,
  type StaffCreatePayload,
} from "@/modules/finance/services/budgetApi";

export function useBudgetLines(filters: { status?: string; category_id?: string; include_archived?: boolean } = {}) {
  return useQuery({
    queryKey: ["budget-lines", filters],
    queryFn: () => budgetApi.list(filters),
  });
}

export function useBudgetLine(id: string | undefined) {
  return useQuery({
    queryKey: ["budget-line", id],
    queryFn: () => budgetApi.get(id as string),
    enabled: !!id,
  });
}

export function useCreateBudgetLine() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: BudgetLineCreatePayload) => budgetApi.create(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["budget-lines"] }),
  });
}

export function useUpdateBudgetLine(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Partial<BudgetLineCreatePayload>) => budgetApi.update(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budget-line", id] });
      queryClient.invalidateQueries({ queryKey: ["budget-lines"] });
    },
  });
}

function useBudgetAction(id: string, action: (id: string) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => action(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budget-line", id] });
      queryClient.invalidateQueries({ queryKey: ["budget-lines"] });
    },
  });
}

export function useSubmitBudgetLine(id: string) {
  return useBudgetAction(id, budgetApi.submit);
}
export function useApproveBudgetLine(id: string) {
  return useBudgetAction(id, budgetApi.approve);
}
export function useArchiveBudgetLine(id: string) {
  return useBudgetAction(id, budgetApi.archive);
}

export function useRejectBudgetLine(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reason: string) => budgetApi.reject(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budget-line", id] });
      queryClient.invalidateQueries({ queryKey: ["budget-lines"] });
    },
  });
}

export function useStaff(includeInactive = false) {
  return useQuery({
    queryKey: ["staff", includeInactive],
    queryFn: () => staffApi.list(includeInactive),
  });
}

export function useStaffGrouped(includeInactive = false) {
  return useQuery({
    queryKey: ["staff-grouped", includeInactive],
    queryFn: () => staffApi.listGrouped(includeInactive),
  });
}

export function useCreateStaff() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: StaffCreatePayload) => staffApi.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff"] });
      queryClient.invalidateQueries({ queryKey: ["staff-grouped"] });
    },
  });
}

export function useUpdateStaff(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Partial<StaffCreatePayload> & { is_active?: boolean }) => staffApi.update(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff"] });
      queryClient.invalidateQueries({ queryKey: ["staff-grouped"] });
    },
  });
}

export function useStaffDepartments(includeArchived = false) {
  return useQuery({
    queryKey: ["staff-departments", includeArchived],
    queryFn: () => staffDepartmentApi.list(includeArchived),
  });
}

export function useCreateStaffDepartment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => staffDepartmentApi.create(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-departments"] });
      queryClient.invalidateQueries({ queryKey: ["staff-grouped"] });
    },
  });
}
