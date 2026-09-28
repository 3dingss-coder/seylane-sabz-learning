import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import type {
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
};

export const useHome = () =>
  useQuery({ queryKey: qk.home, queryFn: ({ signal }) => api.get<HomeData>('/me/home', signal) });
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
