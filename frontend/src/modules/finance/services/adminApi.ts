/**
 * Admin API service layer: users, roles, permissions, audit log, security log.
 */
import { api } from "@/lib/apiClient";

export interface AdminUser {
  id: string;
  email: string;
  full_name: string;
  status: string;
  mfa_enabled: boolean;
  locale: string;
  roles: string[];
  created_at: string;
  last_login_at: string | null;
}

export interface AdminRole {
  id: string;
  name: string;
  description: string | null;
  is_system_role: boolean;
  permission_codes: string[];
}

export interface AdminPermission {
  id: string;
  code: string;
  description: string | null;
  category: string;
}

export const adminApi = {
  listUsers: async (): Promise<AdminUser[]> => {
    const { data } = await api.get("/users");
    return data;
  },
  createUser: async (payload: {
    email: string;
    full_name: string;
    temporary_password: string;
    role_ids: string[];
  }): Promise<AdminUser> => {
    const { data } = await api.post("/users", payload);
    return data;
  },
  updateUser: async (id: string, payload: { full_name?: string; role_ids?: string[] }): Promise<AdminUser> => {
    const { data } = await api.patch(`/users/${id}`, payload);
    return data;
  },
  disableUser: async (id: string) => {
    await api.post(`/users/${id}/disable`);
  },

  listRoles: async (): Promise<AdminRole[]> => {
    const { data } = await api.get("/roles");
    return data;
  },
  createRole: async (payload: { name: string; description?: string; permission_codes: string[] }): Promise<AdminRole> => {
    const { data } = await api.post("/roles", payload);
    return data;
  },
  updateRole: async (id: string, payload: { description?: string; permission_codes?: string[] }): Promise<AdminRole> => {
    const { data } = await api.patch(`/roles/${id}`, payload);
    return data;
  },
  deleteRole: async (id: string) => {
    await api.delete(`/roles/${id}`);
  },

  listPermissions: async (): Promise<AdminPermission[]> => {
    const { data } = await api.get("/permissions");
    return data;
  },
};
