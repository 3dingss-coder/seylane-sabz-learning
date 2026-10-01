/**
 * Last-known-state cache (spec F9 error state: «نمایش آخرین وضعیت از کش محلی»).
 *
 * Keeps the signed-in profile and the Home payload in localStorage so a cold start without
 * network (or a failing API) still shows the marketer's last state instead of a blank error or the
 * login page. Display-only: every action still goes through the server, which re-authorizes it.
 * Entries are bound to the user id and wiped on logout / session expiry (shared devices).
 */
const PREFIX = 'ssl.lk.';
const ME_KEY = `${PREFIX}me`;

interface Entry<T> {
  uid: string;
  savedAt: number;
  data: T;
}

function read<T>(key: string): Entry<T> | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Entry<T>) : null;
  } catch {
    return null;
  }
}

function write<T>(key: string, uid: string, data: T) {
  try {
    localStorage.setItem(
      key,
      JSON.stringify({ uid, savedAt: Date.now(), data } satisfies Entry<T>),
    );
  } catch {
    /* quota / private mode — the cache is best-effort */
  }
}

export const lastKnown = {
  saveMe<T extends { id: string }>(me: T) {
    write(ME_KEY, me.id, me);
  },
  me<T>(): T | null {
    return read<T>(ME_KEY)?.data ?? null;
  },
  save<T>(name: string, uid: string, data: T) {
    write(PREFIX + name, uid, data);
  },
  /** Returns the cached value only if it belongs to `uid`. */
  get<T>(name: string, uid: string | undefined): { data: T; savedAt: number } | null {
    if (!uid) return null;
    const e = read<T>(PREFIX + name);
    return e && e.uid === uid ? { data: e.data, savedAt: e.savedAt } : null;
  },
  clear() {
    try {
      for (const k of Object.keys(localStorage))
        if (k.startsWith(PREFIX)) localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  },
};
