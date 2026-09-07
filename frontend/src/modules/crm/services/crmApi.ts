import { api } from "@/lib/apiClient";

export type LeadStage =
  | "contacted"
  | "booked"
  | "confirmed_whatsapp"
  | "confirmed_call"
  | "zoom_sent"
  | "attendance_recorded"
  | "report_sent"
  | "follow_up"
  | "converted"
  | "lost";

export interface TeacherSlot {
  id: string;
  teacher_id: string;
  slot_date: string;
  slot_time: string;
  is_booked: boolean;
  booked_lead_id: string | null;
  created_at: string;
}

export interface CRMTeacherWithSlots {
  id: string;
  full_name: string;
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
  assigned_to: string | null;
  assigned_to_name: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface LeadDetail extends Lead {
  stage_events: LeadStageEvent[];
}

export const crmTeacherApi = {
  list: async (includeInactive = false): Promise<CRMTeacherWithSlots[]> => {
    const { data } = await api.get("/crm/teachers", { params: { include_inactive: includeInactive } });
    return data;
  },
  create: async (full_name: string): Promise<CRMTeacherWithSlots> => {
    const { data } = await api.post("/crm/teachers", { full_name });
    return data;
  },
  addSlot: async (teacherId: string, slot_date: string, slot_time: string): Promise<TeacherSlot> => {
    const { data } = await api.post(`/crm/teachers/${teacherId}/slots`, { slot_date, slot_time });
    return data;
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
  get: async (id: string): Promise<LeadDetail> => {
    const { data } = await api.get(`/crm/leads/${id}`);
    return data;
  },
  create: async (payload: { full_name: string; phone: string; source?: string | null; notes?: string | null; assigned_to?: string | null }): Promise<Lead> => {
    const { data } = await api.post("/crm/leads", payload);
    return data;
  },
  book: async (id: string, teacher_slot_id: string): Promise<Lead> => {
    const { data } = await api.post(`/crm/leads/${id}/book`, { teacher_slot_id });
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
  reassign: async (id: string, assigned_to: string): Promise<Lead> => {
    const { data } = await api.post(`/crm/leads/${id}/reassign`, { assigned_to });
    return data;
  },
};
