/**
 * Token storage (D36): the access token lives only in memory; the refresh token is persisted
 * so low-digital-literacy users are not asked to log in every time. On Android (Capacitor)
 * the WebView's localStorage is app-private; the Preferences plugin can be swapped in here.
 */
const REFRESH_KEY = 'ssl.refresh';

let accessToken: string | null = null;
/** On Android the refresh token lives in Capacitor Preferences (D36); mirrored here in memory. */
let nativeRefresh: string | null = null;
let native = false;
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
    if (native) return nativeRefresh;
    try {
      return localStorage.getItem(REFRESH_KEY);
    } catch {
      return null;
    }
  },
  setRefresh(token: string | null) {
    if (native) {
      nativeRefresh = token;
      void import('@capacitor/preferences').then(({ Preferences }) =>
        token ? Preferences.set({ key: REFRESH_KEY, value: token }) : Preferences.remove({ key: REFRESH_KEY }),
      );
      return;
    }
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

/** Must run before the first render on native builds so `session.refresh` is available synchronously. */
export async function initNativeSession(): Promise<void> {
  const { Capacitor } = await import('@capacitor/core');
  if (!Capacitor.isNativePlatform()) return;
  native = true;
  const { Preferences } = await import('@capacitor/preferences');
  nativeRefresh = (await Preferences.get({ key: REFRESH_KEY })).value;
}
