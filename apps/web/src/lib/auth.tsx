/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError, api, refreshSession, request, setSessionExpiredHandler } from './api';
import { flushBeats } from './offline-queue';
import { unregisterPush } from './native';
import { session } from './session';
import { lastKnown } from './lastKnown';

import type { AuthResult, Me, Role } from './types';

type LoginIdentifier = { kind: 'phone' | 'nationalCode'; value: string };
type MarketerRegistration = {
  name: string;
  province: string;
  city: string;
} & ({ phone: string; nationalCode?: never } | { nationalCode: string; phone?: never });

interface AuthState {
  user: Me | null;
  status: 'loading' | 'authenticated' | 'anonymous';
  /** Marketers sign in with the phone or national code used at registration. */
  login(identifier: LoginIdentifier): Promise<Me>;
  /** Marketers register with the identity type required by their selected province. */
  register(input: MarketerRegistration): Promise<Me>;
  /** Admin / manager panels: username + password. */
  staffLogin(input: {
    panel: 'admin' | 'manager';
    username: string;
    password: string;
  }): Promise<Me>;
  logout(): Promise<void>;
  refreshMe(): Promise<void>;
  setUser(u: Me): void;
}

const AuthContext = createContext<AuthState | null>(null);

export function homePathFor(role: Role): string {
  if (role === 'manager') return '/manager';
  if (role === 'admin' || role === 'superadmin') return '/admin';
  return '/';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  // Returning visitor: start from the last-known profile instead of a blank spinner. The page
  // (and its API calls, which wait for the single in-flight token refresh) can start immediately;
  // `/me` below then replaces the cached profile. A rejected session clears this (expiry handler).
  const [cachedMe] = useState<Me | null>(() => (session.refresh ? lastKnown.me<Me>() : null));
  const [user, setUser] = useState<Me | null>(cachedMe);
  const [status, setStatus] = useState<AuthState['status']>(
    session.refresh ? (cachedMe ? 'authenticated' : 'loading') : 'anonymous',
  );

  const accept = useCallback((r: AuthResult) => {
    session.setAccess(r.idToken, r.expiresIn);
    session.setRefresh(r.refreshToken);
    setUser(r.user);
    setStatus('authenticated');
    return r.user;
  }, []);

  // Keep the last-known profile for offline cold starts (F9).
  useEffect(() => {
    if (user) lastKnown.saveMe(user);
  }, [user]);

  useEffect(() => {
    setSessionExpiredHandler(() => {
      setUser(null);
      setStatus('anonymous');
      qc.clear();
      lastKnown.clear();
    });
    if (!session.refresh) return;
    let cancelled = false;
    (async () => {
      // A still-valid stored access token needs no refresh round trip first (it is renewed lazily
      // on the first 401); otherwise refresh before asking for /me.
      const ok = session.access ? true : await refreshSession();
      if (!ok) {
        // Offline start with a stored session: stay signed in with the last-known profile;
        // pages render their last-known data (F9). No cached profile → back to login.
        if (cancelled) return;
        const cached = session.refresh ? lastKnown.me<Me>() : null;
        setUser(cached);
        setStatus(cached ? 'authenticated' : 'anonymous');
        return;
      }
      try {
        const me = await request<Me>('/me', { timeoutMs: 15_000 });
        if (!cancelled) {
          setUser(me);
          setStatus('authenticated');
        }
      } catch (e) {
        if (cancelled) return;
        const cached = e instanceof ApiError && e.status === 401 ? null : lastKnown.me<Me>();
        setUser(cached);
        setStatus(cached ? 'authenticated' : 'anonymous');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [qc]);

  const value = useMemo<AuthState>(
    () => ({
      user,
      status,
      login: async (identifier) => {
        const result =
          identifier.kind === 'nationalCode'
            ? await api.post<AuthResult>('/auth/national-code-login', {
                nationalCode: identifier.value,
              })
            : await api.post<AuthResult>('/auth/phone-login', { phone: identifier.value });
        return accept(result);
      },
      register: async (input) => {
        const result =
          'nationalCode' in input
            ? await api.post<AuthResult>('/auth/national-code-register', input)
            : await api.post<AuthResult>('/auth/phone-register', input);
        return accept(result);
      },
      staffLogin: async (input) => accept(await api.post<AuthResult>('/auth/staff-login', input)),
      logout: async () => {
        try {
          await flushBeats(); // send offline progress before the token is revoked
          await unregisterPush();
          await api.post('/auth/logout');
        } catch {
          /* offline logout still clears the device */
        }
        session.clear();
        setUser(null);
        setStatus('anonymous');
        qc.clear();
        lastKnown.clear();
        try {
          localStorage.removeItem('ssl.beats');
          if ('caches' in window) await caches.delete('api-me');
        } catch {
          /* ignore */
        }
      },
      refreshMe: async () => setUser(await api.get<Me>('/me')),
      setUser,
    }),
    [user, status, accept, qc],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
