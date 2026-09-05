/**
 * usePermission: frontend permission checks for UI purposes ONLY
 * (hiding/showing nav items, buttons, etc). This is NEVER a security
 * boundary - the backend independently enforces every permission on every
 * endpoint (see backend app/core/permissions/dependencies.py). Removing or
 * bypassing a frontend check never grants actual access to anything.
 */
import { useAuth } from "@/auth/AuthContext";

export function usePermission(permission: string): boolean {
  const { user } = useAuth();
  return user?.permissions.includes(permission) ?? false;
}

export function useAnyPermission(permissions: string[]): boolean {
  const { user } = useAuth();
  if (!user) return false;
  return permissions.some((p) => user.permissions.includes(p));
}

export function useAllPermissions(permissions: string[]): boolean {
  const { user } = useAuth();
  if (!user) return false;
  return permissions.every((p) => user.permissions.includes(p));
}
