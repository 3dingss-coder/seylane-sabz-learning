import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  AdminBrand,
  AdminPackage,
  AdminProduct,
  AdminTeam,
  Me,
  MentorGuideDetail,
  MentorGuideRow,
} from '@/lib/types';

export const ak = {
  tree: ['admin', 'tree'] as const,
  brands: ['admin', 'brands'] as const,
  products: (brandId?: string) => ['admin', 'products', brandId ?? 'all'] as const,
  packages: (q: string) => ['admin', 'packages', q] as const,
  pkg: (id: string) => ['admin', 'package', id] as const,
  quiz: (id: string) => ['admin', 'quiz', id] as const,
  users: ['admin', 'users'] as const,
  teams: ['admin', 'teams'] as const,
  guides: ['admin', 'mentor-guides'] as const,
  guide: (key: string) => ['admin', 'mentor-guide', key] as const,
};

/** `mentor_guides` key: `global` | `brand:<id>` | `product:<id>`. */
export const guideKey = (kind: MentorGuideRow['kind'], targetId: string | null) =>
  kind === 'global' ? 'global' : `${kind}:${targetId ?? ''}`;

export const useBrands = () =>
  useQuery({
    queryKey: ak.brands,
    queryFn: ({ signal }) => api.get<AdminBrand[]>('/admin/brands', signal),
    staleTime: 60_000,
  });
export const useProducts = (brandId?: string) =>
  useQuery({
    queryKey: ak.products(brandId),
    queryFn: ({ signal }) =>
      api.get<AdminProduct[]>(`/admin/products${brandId ? `?brandId=${brandId}` : ''}`, signal),
    staleTime: 60_000,
  });
export const usePackagesAdmin = (qs = '') =>
  useQuery({
    queryKey: ak.packages(qs),
    queryFn: ({ signal }) =>
      api.get<AdminPackage[]>(`/admin/packages${qs ? `?${qs}` : ''}`, signal),
  });
export const useUsers = () =>
  useQuery({
    queryKey: ak.users,
    queryFn: ({ signal }) => api.get<Me[]>('/admin/users', signal),
    staleTime: 30_000,
  });
export const useTeams = () =>
  useQuery({
    queryKey: ak.teams,
    queryFn: ({ signal }) => api.get<AdminTeam[]>('/admin/teams', signal),
    staleTime: 30_000,
  });

/** Every brand + product with its mentor behaviour box (defined or not). */
export const useMentorGuides = (qs = '') =>
  useQuery({
    queryKey: [...ak.guides, qs],
    queryFn: ({ signal }) =>
      api.get<MentorGuideRow[]>(`/admin/mentor/guides${qs ? `?${qs}` : ''}`, signal),
    staleTime: 30_000,
  });

/** One box (`global` | `brand/<id>` | `product/<id>`). */
export const useMentorGuide = (kind: MentorGuideRow['kind'], targetId: string | null) =>
  useQuery({
    queryKey: ak.guide(guideKey(kind, targetId)),
    queryFn: ({ signal }) =>
      api.get<MentorGuideDetail>(
        `/admin/mentor/guides/${kind}${targetId ? `/${targetId}` : ''}`,
        signal,
      ),
    staleTime: 30_000,
  });
