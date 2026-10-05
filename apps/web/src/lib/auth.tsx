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
import { ApiError, api, refreshSession, setSessionExpiredHandler } from './api';
import { flushBeats } from './offline-queue';
import { unregisterPush } from './native';
import { session } from './session';
import { lastKnown } from './lastKnown';

import type { AuthResult, Me, Role } from './types';

interface AuthState {
  user: Me | null;
  status: 'loading' | 'authenticated' | 'anonymous';
  /** Marketers: phone number only. Rejects with code NOT_FOUND when the number isn't registered. */
  login(phone: string): Promise<Me>;
  /** Marketers: sign up with name + phone + residence and be signed in straight away. */
  register(input: { name: string; phone: string; province: string; city: string }): Promise<Me>;
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
  const [user, setUser] = useState<Me | null>(null);
  const [status, setStatus] = useState<AuthState['status']>(
    session.refresh ? 'loading' : 'anonymous',
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
      const ok = await refreshSession();
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
        const me = await api.get<Me>('/me');
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
      login: async (phone) => accept(await api.post<AuthResult>('/auth/phone-login', { phone })),
      register: async (input) => accept(await api.post<AuthResult>('/auth/phone-register', input)),
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
