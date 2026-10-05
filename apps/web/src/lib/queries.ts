import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { lastKnown } from './lastKnown';
import type {
  AdminGamification,
  BehaviorBrief,
  CoinWallet,
  Gamification,
  HomeData,
  MessageItem,
  NotificationItem,
  PackageDetail,
  PackageSummary,
} from './types';

/** Query keys shared across pages so mutations can invalidate precisely. */
export const qk = {
  home: ['me', 'home'] as const,
  packages: (status?: string) => ['me', 'packages', status ?? 'all'] as const,
  pkg: (id: string) => ['me', 'package', id] as const,
  section: (id: string) => ['me', 'section', id] as const,
  quiz: (id: string) => ['me', 'quiz', id] as const,
  notifications: ['me', 'notifications'] as const,
  messages: ['me', 'messages'] as const,
  points: ['me', 'points'] as const,
  badges: ['me', 'badges'] as const,
  nudges: ['me', 'nudges'] as const,
  chat: (pkg: string | null) => ['me', 'chat', pkg ?? 'all'] as const,
  behavior: ['me', 'behavior'] as const,
  gamification: ['me', 'gamification'] as const,
  coins: ['me', 'coins'] as const,
  adminGamification: ['admin', 'gamification'] as const,
};

/**
 * PHASE-3 — the whole motivation panel in one call: streak (counted by completed stations, G-02),
 * today's quests, the review queue, spendable coins and mastery.
 */
export const useGamification = () =>
  useQuery({
    queryKey: qk.gamification,
    queryFn: ({ signal }) => api.get<Gamification>('/me/gamification', signal),
    staleTime: 30_000,
  });

/** سکهٔ توانمندی — spendable balance plus the real-goods catalogue (G-04). */
export const useCoins = () =>
  useQuery({
    queryKey: qk.coins,
    queryFn: ({ signal }) => api.get<CoinWallet>('/me/coins', signal),
    staleTime: 30_000,
  });

/** Admin: «درصد مرورِ به‌موقع» و «نرخ استادی» — never any streak data (G-03). */
export const useAdminGamification = () =>
  useQuery({
    queryKey: qk.adminGamification,
    queryFn: ({ signal }) => api.get<AdminGamification>('/admin/metrics/gamification', signal),
    staleTime: 60_000,
  });

/** Home («کار بعدی») with a per-user last-known copy so errors/offline still show state (F9). */
export const useHome = (uid: string | undefined) => {
  const cached = lastKnown.get<HomeData>('home', uid);
  return useQuery({
    queryKey: qk.home,
    queryFn: async ({ signal }) => {
      const data = await api.get<HomeData>('/me/home', signal);
      if (uid) lastKnown.save('home', uid, data);
      return data;
    },
    initialData: cached?.data,
    // Treat the local copy as stale so it is refetched immediately on mount.
    initialDataUpdatedAt: cached ? 0 : undefined,
  });
};
/**
 * Learning behaviour brief (streak, mastery, pressure) — real endpoint, used by the
 * v3 status chips (PHASE-3) instead of invented gamification numbers.
 */
export const useBehavior = () =>
  useQuery({
    queryKey: qk.behavior,
    queryFn: ({ signal }) => api.get<BehaviorBrief>('/me/mentor/behavior', signal),
    staleTime: 60_000,
  });

export const usePackages = () =>
  useQuery({
    queryKey: qk.packages(),
    queryFn: ({ signal }) => api.get<PackageSummary[]>('/me/packages', signal),
  });
export const usePackage = (id: string) =>
  useQuery({
    queryKey: qk.pkg(id),
    queryFn: ({ signal }) => api.get<PackageDetail>(`/me/packages/${id}`, signal),
  });
export const useNotifications = (enabled = true) =>
  useQuery({
    queryKey: qk.notifications,
    queryFn: ({ signal }) =>
      api.get<{ unread: number; items: NotificationItem[] }>('/me/notifications', signal),
    enabled,
    refetchInterval: 60_000,
  });
export const useMessages = (enabled = true) =>
  useQuery({
    queryKey: qk.messages,
    queryFn: ({ signal }) => api.get<MessageItem[]>('/me/messages', signal),
    enabled,
    refetchInterval: 60_000,
  });
