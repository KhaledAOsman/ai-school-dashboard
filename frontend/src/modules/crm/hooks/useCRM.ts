import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { crmLeadApi, crmTeacherApi } from "@/modules/crm/services/crmApi";

export function useCRMTeachers(includeInactive = false) {
  return useQuery({
    queryKey: ["crm-teachers", includeInactive],
    queryFn: () => crmTeacherApi.list(includeInactive),
  });
}

export function useCreateCRMTeacher() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (full_name: string) => crmTeacherApi.create(full_name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-teachers"] }),
  });
}

export function useAddTeacherSlot(teacherId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ date, time }: { date: string; time: string }) => crmTeacherApi.addSlot(teacherId, date, time),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-teachers"] }),
  });
}

export function useLeads(params: { stage?: string; mine_only?: boolean } = {}) {
  return useQuery({
    queryKey: ["crm-leads", params],
    queryFn: () => crmLeadApi.list(params),
  });
}

export function useLead(id: string | undefined) {
  return useQuery({
    queryKey: ["crm-lead", id],
    queryFn: () => crmLeadApi.get(id as string),
    enabled: !!id,
  });
}

function useInvalidateLead(id: string) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["crm-lead", id] });
    qc.invalidateQueries({ queryKey: ["crm-leads"] });
    qc.invalidateQueries({ queryKey: ["crm-teachers"] }); // slot availability may have changed
  };
}

export function useCreateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { full_name: string; phone: string; source?: string | null; notes?: string | null; assigned_to?: string | null }) =>
      crmLeadApi.create(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-leads"] }),
  });
}

export function useBookSlot(id: string) {
  const invalidate = useInvalidateLead(id);
  return useMutation({
    mutationFn: (teacherSlotId: string) => crmLeadApi.book(id, teacherSlotId),
    onSuccess: invalidate,
  });
}

export function useConfirmWhatsapp(id: string) {
  const invalidate = useInvalidateLead(id);
  return useMutation({ mutationFn: (note?: string) => crmLeadApi.confirmWhatsapp(id, note), onSuccess: invalidate });
}

export function useConfirmCall(id: string) {
  const invalidate = useInvalidateLead(id);
  return useMutation({ mutationFn: (note?: string) => crmLeadApi.confirmCall(id, note), onSuccess: invalidate });
}

export function useSendZoom(id: string) {
  const invalidate = useInvalidateLead(id);
  return useMutation({
    mutationFn: ({ link, note }: { link: string; note?: string }) => crmLeadApi.sendZoom(id, link, note),
    onSuccess: invalidate,
  });
}

export function useRecordAttendance(id: string) {
  const invalidate = useInvalidateLead(id);
  return useMutation({
    mutationFn: ({ attended, note }: { attended: boolean; note?: string }) => crmLeadApi.recordAttendance(id, attended, note),
    onSuccess: invalidate,
  });
}

export function useSendReport(id: string) {
  const invalidate = useInvalidateLead(id);
  return useMutation({ mutationFn: (note?: string) => crmLeadApi.sendReport(id, note), onSuccess: invalidate });
}

export function useLogFollowUp(id: string) {
  const invalidate = useInvalidateLead(id);
  return useMutation({ mutationFn: (note?: string) => crmLeadApi.logFollowUp(id, note), onSuccess: invalidate });
}

export function useConvertLead(id: string) {
  const invalidate = useInvalidateLead(id);
  return useMutation({ mutationFn: (note?: string) => crmLeadApi.convert(id, note), onSuccess: invalidate });
}

export function useLoseLead(id: string) {
  const invalidate = useInvalidateLead(id);
  return useMutation({ mutationFn: (reason: string) => crmLeadApi.lose(id, reason), onSuccess: invalidate });
}

export function useReassignLead(id: string) {
  const invalidate = useInvalidateLead(id);
  return useMutation({ mutationFn: (assignedTo: string) => crmLeadApi.reassign(id, assignedTo), onSuccess: invalidate });
}
