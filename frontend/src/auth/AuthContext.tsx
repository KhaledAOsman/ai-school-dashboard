/**
 * AuthContext: holds the current user + permissions, and exposes
 * login/logout/mfa actions. This is the single source of truth the rest
 * of the app reads from for "who is logged in" and "what can they do" -
 * see permissions/usePermission.ts for the consuming hook.
 */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/apiClient";
import { clearTokens, getRefreshToken, setTokens } from "@/auth/tokenStorage";

export interface CurrentUser {
  id: string;
  email: string;
  full_name: string;
  locale: "ar" | "en";
  permissions: string[];
  roles: string[];
}

interface LoginResult {
  mfaRequired: boolean;
  mfaChallengeToken?: string;
}

interface AuthContextValue {
  user: CurrentUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  verifyMfa: (challengeToken: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
  refetchUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchCurrentUser = useCallback(async () => {
    try {
      const { data } = await api.get<CurrentUser>("/auth/me");
      setUser(data);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    // On mount, if a refresh token exists (from a previous session in this
    // tab), attempt to establish a session silently.
    (async () => {
      if (getRefreshToken()) {
        try {
          const { data } = await api.post("/auth/refresh", { refresh_token: getRefreshToken() });
          setTokens(data.access_token, data.refresh_token);
          await fetchCurrentUser();
        } catch {
          clearTokens();
        }
      }
      setIsLoading(false);
    })();
  }, [fetchCurrentUser]);

  const login = useCallback(async (email: string, password: string): Promise<LoginResult> => {
    const { data } = await api.post("/auth/login", { email, password });
    if (data.mfa_required) {
      return { mfaRequired: true, mfaChallengeToken: data.mfa_challenge_token };
    }
    setTokens(data.access_token, data.refresh_token);
    await fetchCurrentUser();
    return { mfaRequired: false };
  }, [fetchCurrentUser]);

  const verifyMfa = useCallback(async (challengeToken: string, code: string) => {
    const { data } = await api.post("/auth/mfa/verify", {
      mfa_challenge_token: challengeToken,
      code,
    });
    setTokens(data.access_token, data.refresh_token);
    await fetchCurrentUser();
  }, [fetchCurrentUser]);

  const logout = useCallback(async () => {
    const refreshToken = getRefreshToken();
    try {
      if (refreshToken) {
        await api.post("/auth/logout", { refresh_token: refreshToken });
      }
    } finally {
      clearTokens();
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, verifyMfa, logout, refetchUser: fetchCurrentUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
