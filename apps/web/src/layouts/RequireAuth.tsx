import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Spinner } from '@/components/ui';
import { homePathFor, useAuth } from '@/lib/auth';
import type { Role } from '@/lib/types';

export function FullPageSpinner() {
  return (
    <div
      className="flex min-h-dvh items-center justify-center"
      role="status"
      aria-label="در حال بارگذاری"
    >
      <Spinner className="size-8 text-primary" />
    </div>
  );
}

/** Route guard: unauthenticated → /login; wrong role → own home (UI mirror of server RBAC). */
export function RequireAuth({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { status, user } = useAuth();
  const loc = useLocation();
  if (status === 'loading') return <FullPageSpinner />;
  if (status === 'anonymous' || !user)
    return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  if (!roles.includes(user.role)) return <Navigate to={homePathFor(user.role)} replace />;
  if (user.role === 'marketer' && !user.onboardedAt && loc.pathname !== '/onboarding')
    return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}
