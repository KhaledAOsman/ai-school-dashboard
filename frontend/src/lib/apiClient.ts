/**
 * Axios instance with:
 *   - Base URL from Vite env (VITE_API_BASE_URL)
 *   - Bearer token attached automatically
 *   - Automatic refresh-and-retry on a single 401 (avoids infinite loops)
 *
 * This is the ONLY place that constructs an HTTP client for the API -
 * every service module imports `api` from here rather than calling axios
 * directly, so auth/refresh behavior stays consistent everywhere.
 */
import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";
import { getAccessToken, getRefreshToken, setTokens, clearTokens } from "@/auth/tokenStorage";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";

export const api = axios.create({
  baseURL: BASE_URL,
});

api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let isRefreshing = false;
let pendingQueue: Array<() => void> = [];

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;

    if (error.response?.status !== 401 || !originalRequest || originalRequest._retry) {
      return Promise.reject(error);
    }

    if (originalRequest.url?.includes("/auth/login") || originalRequest.url?.includes("/auth/mfa/verify")) {
      // A 401 from the login/MFA endpoints themselves means "wrong
      // credentials" or "invalid code" - NOT an expired session. Just
      // reject so the calling form (LoginPage/MfaVerifyForm) can show its
      // own error message. Do NOT redirect/reload here - that was wiping
      // out the error before the user ever saw it.
      return Promise.reject(error);
    }

    if (originalRequest.url?.includes("/auth/refresh")) {
      // Refresh itself failed - the session is genuinely gone. Force logout.
      clearTokens();
      window.location.href = "/login";
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    if (isRefreshing) {
      return new Promise((resolve) => {
        pendingQueue.push(() => resolve(api(originalRequest)));
      });
    }

    isRefreshing = true;
    try {
      const refreshToken = getRefreshToken();
      if (!refreshToken) throw new Error("No refresh token");

      const { data } = await axios.post(`${BASE_URL}/auth/refresh`, { refresh_token: refreshToken });
      setTokens(data.access_token, data.refresh_token);

      pendingQueue.forEach((cb) => cb());
      pendingQueue = [];

      return api(originalRequest);
    } catch (refreshError) {
      clearTokens();
      window.location.href = "/login";
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);
