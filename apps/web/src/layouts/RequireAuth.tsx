import { useState, type ReactNode } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { Button, Spinner } from '@/components/ui';
import { homePathFor, useAuth } from '@/lib/auth';
import { PANEL_LABEL, panelOf } from '@/lib/roles';
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
  if (!roles.includes(user.role)) {
    // Panels (/admin, /manager) explain why instead of silently bouncing to another screen.
    const panel = panelOf(loc.pathname);
    if (panel === 'admin' || panel === 'manager')
      return <WrongAccount panel={panel} role={user.role} from={loc.pathname} />;
    return <Navigate to={homePathFor(user.role)} replace />;
  }
  if (user.role === 'marketer' && !user.onboardedAt && loc.pathname !== '/onboarding')
    return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

const ROLE_LABEL: Record<Role, string> = {
  marketer: 'بازاریاب',
  manager: 'مدیر',
  admin: 'ادمین',
  superadmin: 'مدیر ارشد',
};

/** Signed in with an account that can't open this panel: offer to switch accounts. */
function WrongAccount({
  panel,
  role,
  from,
}: {
  panel: 'admin' | 'manager';
  role: Role;
  from: string;
}) {
  const { logout } = useAuth();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const switchAccount = async () => {
    setBusy(true);
    await logout();
    nav('/login', { replace: true, state: { from } });
  };
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm rounded-card border border-border bg-surface p-6 text-center shadow-sm">
        <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-card bg-primary-light text-primary">
          <ShieldAlert className="size-8" aria-hidden />
        </div>
        <h1 className="text-lg font-bold text-text">{PANEL_LABEL[panel]}</h1>
        <p className="mt-2 text-sm leading-7 text-text-secondary">
          شما با حساب «{ROLE_LABEL[role]}» وارد شده‌اید. برای ورود به {PANEL_LABEL[panel]} با حساب{' '}
          {panel === 'admin' ? 'ادمین' : 'مدیر'} وارد شوید.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <Button onClick={() => void switchAccount()} loading={busy}>
            ورود با حساب {panel === 'admin' ? 'ادمین' : 'مدیر'}
          </Button>
          <Button variant="secondary" onClick={() => nav(homePathFor(role), { replace: true })}>
            بازگشت به {PANEL_LABEL[panelOf(homePathFor(role)) as keyof typeof PANEL_LABEL]}
          </Button>
        </div>
      </div>
    </main>
  );
}
