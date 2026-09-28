/**
 * Token storage (D36): the access token lives only in memory; the refresh token is persisted
 * so low-digital-literacy users are not asked to log in every time. On Android (Capacitor)
 * the WebView's localStorage is app-private; the Preferences plugin can be swapped in here.
 */
const REFRESH_KEY = 'ssl.refresh';

let accessToken: string | null = null;
let accessExpiresAt = 0;

export const session = {
  get access() {
    return accessToken && Date.now() < accessExpiresAt - 30_000 ? accessToken : null;
  },
  setAccess(token: string, expiresInSec: number) {
    accessToken = token;
    accessExpiresAt = Date.now() + expiresInSec * 1000;
  },
  get refresh(): string | null {
    try {
      return localStorage.getItem(REFRESH_KEY);
    } catch {
      return null;
    }
  },
  setRefresh(token: string | null) {
    try {
      if (token) localStorage.setItem(REFRESH_KEY, token);
      else localStorage.removeItem(REFRESH_KEY);
    } catch {
      /* storage unavailable (private mode) — session stays in memory */
    }
  },
  clear() {
    accessToken = null;
    accessExpiresAt = 0;
    this.setRefresh(null);
  },
};
