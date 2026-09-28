// Adapted from helper kit: «پنل مدیر/کامپوننت‌ها/common/Sidebar.tsx»
// — sales menu replaced by manager/admin menus from §15.2/§15.3; role gating moved to
//   the caller; ChevronLeft marks the active item (already RTL-forward).
import { NavLink } from 'react-router-dom';
import { ChevronLeft, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface SidebarItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

export function Sidebar({ items, title }: { items: SidebarItem[]; title: string }) {
  return (
    <aside
      className="hidden w-64 shrink-0 border-s border-border bg-surface lg:block"
      aria-label={title}
    >
      <div className="sticky top-16 p-3">
        <p className="mb-2 px-3 text-xs font-bold text-muted">{title}</p>
        <nav>
          <ul className="space-y-1">
            {items.map(({ to, label, icon: Icon }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  className={({ isActive }) =>
                    cn(
                      'flex min-h-12 items-center justify-between rounded-card px-3 text-sm transition-colors',
                      isActive
                        ? 'bg-primary font-bold text-white shadow-sm'
                        : 'font-medium text-text-secondary hover:bg-background hover:text-primary',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span className="flex items-center gap-2.5">
                        <Icon className="size-5" aria-hidden />
                        {label}
                      </span>
                      {isActive && <ChevronLeft className="size-4 opacity-80" aria-hidden />}
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </aside>
  );
}
