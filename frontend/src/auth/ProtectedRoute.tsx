import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-500">...</div>;
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}
