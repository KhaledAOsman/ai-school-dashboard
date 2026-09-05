/**
 * Token storage.
 *
 * Security note: this is a browser SPA, so tokens necessarily live in JS-
 * accessible storage; there is no way to fully eliminate XSS-based token
 * theft without server-side session cookies (a larger architecture change).
 * As a mitigation:
 *   - Access tokens are short-lived (15 min default) and kept in memory only.
 *   - Refresh tokens are kept in sessionStorage (cleared when the tab
 *     closes), not localStorage, to reduce the window of exposure and
 *     avoid silently persisting a session across browser restarts.
 * If this app's threat model requires stronger protection, migrate to an
 * httpOnly-cookie-based refresh flow, which requires backend changes
 * (setting/reading the refresh token as a cookie rather than a JSON field).
 */
let accessToken: string | null = null;

const REFRESH_TOKEN_KEY = "ai_school_refresh_token";

export function getAccessToken(): string | null {
  return accessToken;
}

export function getRefreshToken(): string | null {
  return sessionStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setTokens(newAccessToken: string, newRefreshToken: string): void {
  accessToken = newAccessToken;
  sessionStorage.setItem(REFRESH_TOKEN_KEY, newRefreshToken);
}

export function clearTokens(): void {
  accessToken = null;
  sessionStorage.removeItem(REFRESH_TOKEN_KEY);
}
