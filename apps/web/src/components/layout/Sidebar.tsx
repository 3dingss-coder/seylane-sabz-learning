// Adapted from helper kit: «پنل مدیر/کامپوننت‌ها/common/Sidebar.tsx»
// — sales menu replaced by manager/admin menus from §15.2/§15.3; role gating moved to
//   the caller; ChevronLeft marks the active item (already RTL-forward).
// Design refresh: the active highlight is a single pill that glides between items.
import { NavLink, useLocation } from 'react-router-dom';
import { ChevronLeft, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import { isItemActive } from '@/lib/navMatch';

export interface SidebarItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Extra path prefixes that belong to this item (e.g. /admin/packages → محتوا). */
  match?: string[];
}

const ITEM_H = 48; // px (touch target)
const GAP = 4;

export function Sidebar({ items, title }: { items: SidebarItem[]; title: string }) {
  const { pathname } = useLocation();
  const activeIdx = items.findIndex((it) => isItemActive(pathname, it));
  return (
    <aside
      className="hidden w-64 shrink-0 border-s border-border bg-surface lg:block"
      aria-label={title}
    >
      <div className="sticky top-16 p-3">
        <p className="mb-2 px-3 text-xs font-bold text-muted-fg">{title}</p>
        <nav>
          <ul className="relative space-y-1">
            <li
              aria-hidden
              className={cn(
                'pointer-events-none absolute inset-x-0 top-0 rounded-card bg-primary bg-brand-gradient shadow-brand transition-[transform,opacity] duration-300 ease-soft',
                activeIdx < 0 && 'opacity-0',
              )}
              style={{
                height: ITEM_H,
                transform: `translateY(${Math.max(activeIdx, 0) * (ITEM_H + GAP)}px)`,
              }}
            />
            {items.map((item, i) => {
              const { to, label, icon: Icon } = item;
              const active = i === activeIdx;
              return (
                <li key={to} className="relative">
                  <NavLink
                    to={to}
                    end={to.split('/').length <= 2}
                    className={cn(
                      'flex min-h-12 items-center justify-between rounded-card px-3 text-sm transition-colors duration-200',
                      active
                        ? 'font-bold text-on-primary'
                        : 'font-medium text-text-secondary hover:bg-background hover:text-primary',
                    )}
                  >
                    <span className="flex items-center gap-2.5">
                      <Icon className="size-5" aria-hidden />
                      {label}
                    </span>
                    {active && <ChevronLeft className="size-4 opacity-80" aria-hidden />}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </aside>
  );
}
