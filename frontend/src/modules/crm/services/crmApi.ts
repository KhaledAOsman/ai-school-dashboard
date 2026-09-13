import { api } from "@/lib/apiClient";

export type LeadStage =
  | "new"
  | "contacted"
  | "not_answered"
  | "booked"
  | "confirmed_whatsapp"
  | "confirmed_call"
  | "zoom_sent"
  | "attendance_recorded"
  | "report_sent"
  | "follow_up"
  | "converted"
  | "lost"
  | "not_interested";

export type LeadGroup = "leads" | "bookings" | "interested";

export type CallOutcome = "contacted" | "not_answered";

export type LeadSource = "instagram" | "tiktok" | "snapchat" | "organic";

export interface TeacherSlot {
  id: string;
  teacher_id: string;
  slot_date: string;
  slot_time: string;
  is_booked: boolean;
  booked_lead_id: string | null;
  created_at: string;
}

export interface ScheduleSlot extends TeacherSlot {
  booked_lead_name: string | null;
}

export interface TeacherSchedule {
  teacher_id: string;
  teacher_full_name: string;
  slots: ScheduleSlot[];
}

export interface CRMTeacherWithSlots {
  id: string;
  full_name: string;
  zoom_link: string | null;
  is_active: boolean;
  created_at: string;
  available_slots: TeacherSlot[];
}

export interface LeadStageEvent {
  id: string;
  stage: LeadStage;
  performed_by: string;
  performed_by_name: string;
  note: string | null;
  created_at: string;
}

export interface LeadCallAttempt {
  id: string;
  outcome: CallOutcome;
  note: string | null;
  performed_by: string;
  performed_by_name: string;
  created_at: string;
}

export interface Lead {
  id: string;
  full_name: string;
  phone: string;
  source: string | null;
  stage: LeadStage;
  teacher_slot_id: string | null;
  teacher_name: string | null;
  lecture_date: string | null;
  lecture_time: string | null;
  zoom_link: string | null;
  attended: boolean | null;
  is_converted: boolean;
  is_lost: boolean;
  lost_reason: string | null;
  notes: string | null;
  follow_up_count: number;
  assigned_to: string | null;
  assigned_to_name: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface LeadDetail extends Lead {
  stage_events: LeadStageEvent[];
  call_attempts: LeadCallAttempt[];
}

export interface PaginatedLeads {
  items: Lead[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface LeadSearchParams {
  page?: number;
  page_size?: number;
  search?: string;
  group?: LeadGroup;
  stage?: string;
  source?: string;
  assigned_to?: string;
  date_from?: string;
  date_to?: string;
  sort_by?: "created_at" | "full_name" | "stage";
  sort_dir?: "asc" | "desc";
  mine_only?: boolean;
}

export interface LeadImportRow {
  full_name: string;
  phone: string;
  source?: string | null;
  notes?: string | null;
}

export interface LeadBulkImportResult {
  total_submitted: number;
  created_count: number;
  skipped_duplicate_count: number;
  error_count: number;
  errors: { row_index: number; full_name: string; error: string }[];
}

export interface ScheduledLecture {
  lead_id: string;
  lead_full_name: string;
  lead_phone: string;
  stage: LeadStage;
  teacher_name: string | null;
  lecture_date: string | null;
  lecture_time: string | null;
  zoom_link: string | null;
  assigned_to_name: string | null;
}

export interface CRMDashboardStats {
  total_leads: number;
  attended: number;
  not_attended: number;
  not_answered: number;
  active_teachers: number;
  available_slots: number;
  sales_reps_count: number;
}

export const crmDashboardApi = {
  stats: async (): Promise<CRMDashboardStats> => {
    const { data } = await api.get("/crm/dashboard/stats");
    return data;
  },
};

export const crmTeacherApi = {
  list: async (includeInactive = false): Promise<CRMTeacherWithSlots[]> => {
    const { data } = await api.get("/crm/teachers", { params: { include_inactive: includeInactive } });
    return data;
  },
  schedule: async (): Promise<TeacherSchedule[]> => {
    const { data } = await api.get("/crm/teachers/schedule");
    return data;
  },
  create: async (full_name: string, zoom_link?: string | null): Promise<CRMTeacherWithSlots> => {
    const { data } = await api.post("/crm/teachers", { full_name, zoom_link });
    return data;
  },
  update: async (teacherId: string, payload: { full_name?: string; zoom_link?: string | null }): Promise<CRMTeacherWithSlots> => {
    const { data } = await api.patch(`/crm/teachers/${teacherId}`, payload);
    return data;
  },
  addSlot: async (teacherId: string, slot_date: string, slot_time: string): Promise<TeacherSlot> => {
    const { data } = await api.post(`/crm/teachers/${teacherId}/slots`, { slot_date, slot_time });
    return data;
  },
  deleteSlot: async (slotId: string): Promise<void> => {
    await api.delete(`/crm/teachers/slots/${slotId}`);
  },
  deactivate: async (teacherId: string): Promise<void> => {
    await api.post(`/crm/teachers/${teacherId}/deactivate`);
  },
};

export const crmLeadApi = {
  list: async (params: { stage?: string; mine_only?: boolean } = {}): Promise<Lead[]> => {
    const { data } = await api.get("/crm/leads", { params });
    return data;
  },
  search: async (params: LeadSearchParams = {}): Promise<PaginatedLeads> => {
    const { data } = await api.get("/crm/leads/search/paginated", { params });
    return data;
  },
  listSources: async (): Promise<string[]> => {
    const { data } = await api.get("/crm/leads/meta/sources");
    return data;
  },
  schedule: async (mineOnly = false): Promise<ScheduledLecture[]> => {
    const { data } = await api.get("/crm/leads/meta/schedule", { params: { mine_only: mineOnly } });
    return data;
  },
  get: async (id: string): Promise<LeadDetail> => {
    const { data } = await api.get(`/crm/leads/${id}`);
    return data;
  },
  update: async (id: string, payload: { full_name?: string; phone?: string; source?: string | null; notes?: string | null }): Promise<Lead> => {
    const { data } = await api.patch(`/crm/leads/${id}`, payload);
    return data;
  },
  create: async (payload: { full_name: string; phone: string; source?: string | null; notes?: string | null; assigned_to?: string | null }): Promise<Lead> => {
    const { data } = await api.post("/crm/leads", payload);
    return data;
  },
  bulkImport: async (rows: LeadImportRow[], assigned_to?: string | null): Promise<LeadBulkImportResult> => {
    const { data } = await api.post("/crm/leads/bulk-import", { rows, assigned_to });
    return data;
  },
  bulkAssign: async (lead_ids: string[], assigned_to: string): Promise<{ updated_count: number }> => {
    const { data } = await api.post("/crm/leads/bulk-assign", { lead_ids, assigned_to });
    return data;
  },
  logCallAttempt: async (id: string, outcome: CallOutcome, note?: string): Promise<Lead> => {
    const { data } = await api.post(`/crm/leads/${id}/call-attempt`, { outcome, note });
    return data;
  },
  book: async (id: string, teacher_slot_id: string): Promise<Lead> => {
    const { data } = await api.post(`/crm/leads/${id}/book`, { teacher_slot_id });
    return data;
  },
  reschedule: async (id: string, teacher_slot_id: string, note?: string): Promise<Lead> => {
    const { data } = await api.post(`/crm/leads/${id}/reschedule`, { teacher_slot_id, note });
    return data;
  },
  confirmWhatsapp: async (id: string, note?: string): Promise<Lead> => {
    const { data } = await api.post(`/crm/leads/${id}/confirm-whatsapp`, { note });
    return data;
  },
  confirmCall: async (id: string, note?: string): Promise<Lead> => {
    const { data } = await api.post(`/crm/leads/${id}/confirm-call`, { note });
    return data;
  },
  sendZoom: async (id: string, zoom_link: string, note?: string): Promise<Lead> => {
    const { data } = await api.post(`/crm/leads/${id}/send-zoom`, { zoom_link, note });
    return data;
  },
  recordAttendance: async (id: string, attended: boolean, note?: string): Promise<Lead> => {
    const { data } = await api.post(`/crm/leads/${id}/attendance`, { attended, note });
    return data;
  },
  sendReport: async (id: string, note?: string): Promise<Lead> => {
    const { data } = await api.post(`/crm/leads/${id}/send-report`, { note });
    return data;
  },
  logFollowUp: async (id: string, note?: string): Promise<Lead> => {
    const { data } = await api.post(`/crm/leads/${id}/follow-up`, { note });
    return data;
  },
  convert: async (id: string, note?: string): Promise<Lead> => {
    const { data } = await api.post(`/crm/leads/${id}/convert`, { note });
    return data;
  },
  lose: async (id: string, reason: string): Promise<Lead> => {
    const { data } = await api.post(`/crm/leads/${id}/lose`, { reason });
    return data;
  },
  notInterested: async (id: string, reason?: string): Promise<Lead> => {
    const { data } = await api.post(`/crm/leads/${id}/not-interested`, { reason });
    return data;
  },
  reassign: async (id: string, assigned_to: string): Promise<Lead> => {
    const { data } = await api.post(`/crm/leads/${id}/reassign`, { assigned_to });
    return data;
  },
};
