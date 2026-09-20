import { api } from "@/lib/apiClient";

export interface WhatsAppStatus {
  status: "initializing" | "qr_pending" | "connected" | "disconnected";
  phone_number: string | null;
  last_error: string | null;
}

export type TemplateTrigger =
  | "manual"
  | "lecture_booked"
  | "confirmed_whatsapp"
  | "confirmed_call"
  | "report_sent"
  | "converted"
  | "lost"
  | "not_interested";

export interface MessageTemplate {
  id: string;
  name: string;
  body: string;
  trigger: TemplateTrigger;
  is_active: boolean;
  created_at: string;
}

export interface WhatsAppMessageLog {
  id: string;
  lead_id: string | null;
  phone: string;
  rendered_body: string;
  success: boolean;
  error: string | null;
  created_at: string;
}

export const whatsappApi = {
  status: async (): Promise<WhatsAppStatus> => {
    const { data } = await api.get("/whatsapp/status");
    return data;
  },
  qr: async (): Promise<{ qr_data_url: string }> => {
    const { data } = await api.get("/whatsapp/qr");
    return data;
  },
  logout: async (): Promise<void> => {
    await api.post("/whatsapp/logout");
  },
  listTemplates: async (includeInactive = false): Promise<MessageTemplate[]> => {
    const { data } = await api.get("/whatsapp/templates", { params: { include_inactive: includeInactive } });
    return data;
  },
  createTemplate: async (payload: { name: string; body: string; trigger: string }): Promise<MessageTemplate> => {
    const { data } = await api.post("/whatsapp/templates", payload);
    return data;
  },
  updateTemplate: async (id: string, payload: { name?: string; body?: string; trigger?: string; is_active?: boolean }): Promise<MessageTemplate> => {
    const { data } = await api.patch(`/whatsapp/templates/${id}`, payload);
    return data;
  },
  sendToLead: async (leadId: string, payload: { template_id?: string; raw_message?: string }): Promise<WhatsAppMessageLog> => {
    const { data } = await api.post(`/whatsapp/leads/${leadId}/send`, payload);
    return data;
  },
  testSend: async (payload: { phone: string; template_id?: string; raw_message?: string }): Promise<WhatsAppMessageLog> => {
    const { data } = await api.post("/whatsapp/test-send", payload);
    return data;
  },
};
