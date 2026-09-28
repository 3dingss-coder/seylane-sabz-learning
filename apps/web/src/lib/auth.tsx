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
import { api, refreshSession, setSessionExpiredHandler } from './api';
import { flushBeats } from './offline-queue';
import { unregisterPush } from './native';
import { session } from './session';
import type { AuthResult, Me, Role } from './types';

interface AuthState {
  user: Me | null;
  status: 'loading' | 'authenticated' | 'anonymous';
  login(identifier: string, password: string): Promise<Me>;
  register(input: { name: string; identifier: string; password: string }): Promise<Me>;
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

  useEffect(() => {
    setSessionExpiredHandler(() => {
      setUser(null);
      setStatus('anonymous');
      qc.clear();
    });
    if (!session.refresh) return;
    let cancelled = false;
    (async () => {
      const ok = await refreshSession();
      if (!ok) {
        if (!cancelled) setStatus(session.refresh ? 'authenticated' : 'anonymous');
        // Offline start with a stored session: stay "authenticated"; data comes from cache.
        return;
      }
      try {
        const me = await api.get<Me>('/me');
        if (!cancelled) {
          setUser(me);
          setStatus('authenticated');
        }
      } catch {
        if (!cancelled) setStatus('anonymous');
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
      login: async (identifier, password) =>
        accept(await api.post<AuthResult>('/auth/login', { identifier, password })),
      register: async (input) => accept(await api.post<AuthResult>('/auth/register', input)),
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
