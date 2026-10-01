import { NavLink, Outlet } from 'react-router-dom';
import { LogOut, type LucideIcon } from 'lucide-react';
import { AppLogo } from '@/components/brand/AppLogo';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { PageTransition } from '@/components/layout/PageTransition';
import { Sidebar } from '@/components/layout/Sidebar';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/cn';
import { ROLE_LABEL } from '@/lib/format';

export interface PanelNavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Extra path prefixes that keep this entry highlighted (detail pages). */
  match?: string[];
}

/** Manager/Admin web shell (§15.2/§15.3): sidebar on desktop, scrollable tab row on mobile. */
export function PanelLayout({ title, items }: { title: string; items: PanelNavItem[] }) {
  const { user, logout } = useAuth();
  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-30 glass border-b border-border">
        <div className="flex h-16 items-center justify-between gap-3 px-4">
          <div className="flex items-center gap-3">
            <AppLogo />
            <span className="hidden rounded-full bg-primary-light px-2.5 py-1 text-xs font-bold text-primary sm:inline">
              {title}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="hidden size-9 items-center justify-center rounded-full bg-primary-light text-sm font-extrabold text-primary sm:flex"
            >
              {user?.name.trim().charAt(0)}
            </span>
            <div className="hidden text-start sm:block">
              <p className="text-sm font-bold text-text">{user?.name}</p>
              <p className="text-xs text-text-secondary">{user ? ROLE_LABEL[user.role] : ''}</p>
            </div>
            <button
              type="button"
              onClick={() => void logout()}
              className="flex min-h-12 items-center gap-1.5 rounded-card px-3 text-sm font-bold text-text-secondary hover:bg-background"
              aria-label="خروج از حساب"
            >
              <LogOut className="size-5" aria-hidden />
              <span className="hidden sm:inline">خروج</span>
            </button>
          </div>
        </div>
        <nav
          aria-label={title}
          className="flex gap-1 overflow-x-auto border-t border-border px-2 py-1 lg:hidden"
        >
          {items.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to.split('/').length <= 2}
              className={({ isActive }) =>
                cn(
                  'pressable flex min-h-11 shrink-0 items-center gap-1.5 rounded-input px-3 text-sm font-bold transition-colors',
                  isActive ? 'bg-primary text-on-primary' : 'text-text-secondary',
                )
              }
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </NavLink>
          ))}
        </nav>
      </header>
      <div className="flex min-h-[calc(100dvh-4rem)]">
        <Sidebar title={title} items={items} />
        <main className="min-w-0 flex-1 px-4 py-5 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <Breadcrumb title={title} items={items} />
            <PageTransition>
              <Outlet />
            </PageTransition>
          </div>
        </main>
      </div>
    </div>
  );
}
