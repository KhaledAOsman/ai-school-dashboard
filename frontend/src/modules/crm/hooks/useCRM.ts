import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { crmLeadApi, crmTeacherApi, crmDashboardApi, type LeadSearchParams, type CallOutcome, type LeadImportRow } from "@/modules/crm/services/crmApi";

export function useCRMDashboardStats() {
  return useQuery({
    queryKey: ["crm-dashboard-stats"],
    queryFn: () => crmDashboardApi.stats(),
  });
}

export function useCRMTeachers(includeInactive = false) {
  return useQuery({
    queryKey: ["crm-teachers", includeInactive],
    queryFn: () => crmTeacherApi.list(includeInactive),
  });
}

export function useCreateCRMTeacher() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ fullName, zoomLink }: { fullName: string; zoomLink?: string | null }) => crmTeacherApi.create(fullName, zoomLink),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-teachers"] }),
  });
}

export function useUpdateCRMTeacher(teacherId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { full_name?: string; zoom_link?: string | null }) => crmTeacherApi.update(teacherId, payload),
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

export function useDeleteTeacherSlot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (slotId: string) => crmTeacherApi.deleteSlot(slotId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-teachers"] }),
  });
}

export function useLeads(params: { stage?: string; mine_only?: boolean } = {}) {
  return useQuery({
    queryKey: ["crm-leads", params],
    queryFn: () => crmLeadApi.list(params),
  });
}

/** Paginated, searchable, filterable leads listing - used by the main
 * leads table so it stays fast and usable at 1000+ rows. `placeholderData`
 * avoids a loading flash when just paging/filtering. */
export function useLeadsSearch(params: LeadSearchParams) {
  return useQuery({
    queryKey: ["crm-leads-search", params],
    queryFn: () => crmLeadApi.search(params),
    placeholderData: (prev) => prev,
  });
}

export function useLeadSources() {
  return useQuery({
    queryKey: ["crm-lead-sources"],
    queryFn: () => crmLeadApi.listSources(),
  });
}

export function useSchedule(mineOnly = false) {
  return useQuery({
    queryKey: ["crm-schedule", mineOnly],
    queryFn: () => crmLeadApi.schedule(mineOnly),
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
    qc.invalidateQueries({ queryKey: ["crm-leads-search"] });
    qc.invalidateQueries({ queryKey: ["crm-teachers"] }); // slot availability may have changed
  };
}

export function useUpdateLead(id: string) {
  const invalidate = useInvalidateLead(id);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { full_name?: string; phone?: string; source?: string | null; notes?: string | null }) =>
      crmLeadApi.update(id, payload),
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["crm-lead-sources"] });
    },
  });
}

export function useRescheduleLead(id: string) {
  const invalidate = useInvalidateLead(id);
  return useMutation({
    mutationFn: ({ teacherSlotId, note }: { teacherSlotId: string; note?: string }) => crmLeadApi.reschedule(id, teacherSlotId, note),
    onSuccess: invalidate,
  });
}

export function useCreateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { full_name: string; phone: string; source?: string | null; notes?: string | null; assigned_to?: string | null }) =>
      crmLeadApi.create(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-leads"] });
      qc.invalidateQueries({ queryKey: ["crm-leads-search"] });
    },
  });
}

export function useBulkImportLeads() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ rows, assignedTo }: { rows: LeadImportRow[]; assignedTo?: string | null }) =>
      crmLeadApi.bulkImport(rows, assignedTo),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-leads"] });
      qc.invalidateQueries({ queryKey: ["crm-leads-search"] });
      qc.invalidateQueries({ queryKey: ["crm-lead-sources"] });
    },
  });
}

export function useBulkAssignLeads() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ leadIds, assignedTo }: { leadIds: string[]; assignedTo: string }) =>
      crmLeadApi.bulkAssign(leadIds, assignedTo),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-leads"] });
      qc.invalidateQueries({ queryKey: ["crm-leads-search"] });
    },
  });
}

export function useLogCallAttempt(id: string) {
  const invalidate = useInvalidateLead(id);
  return useMutation({
    mutationFn: ({ outcome, note }: { outcome: CallOutcome; note?: string }) => crmLeadApi.logCallAttempt(id, outcome, note),
    onSuccess: invalidate,
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
