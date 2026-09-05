import { api } from "@/lib/apiClient";

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  user_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  ip_address: string | null;
  previous_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  notes: string | null;
}

export interface SecurityLogEntry {
  id: string;
  timestamp: string;
  event_type: string;
  user_id: string | null;
  email_attempted: string | null;
  ip_address: string | null;
}

export const logsApi = {
  listAuditLogs: async (limit = 100): Promise<AuditLogEntry[]> => {
    const { data } = await api.get("/audit-logs", { params: { limit } });
    return data;
  },
  listSecurityLogs: async (limit = 100): Promise<SecurityLogEntry[]> => {
    const { data } = await api.get("/security-logs", { params: { limit } });
    return data;
  },
};
