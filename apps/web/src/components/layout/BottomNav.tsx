// Adapted from helper kit: «اپ بازاریاب/کامپوننت‌ها/common/BottomNav.tsx»
// — 5 sales tabs → the 4 spec tabs (§16.5): خانه | آموزش‌ها | پیام‌ها | کارت‌ها;
//   router NavLink instead of AppContext; 48px targets; tokens instead of emerald.
import { NavLink } from 'react-router-dom';
import { BookOpen, Home, Mail, Trophy, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import { toPersianDigits } from '@/lib/digits';

export interface BottomNavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
}

const MARKETER_NAV: BottomNavItem[] = [
  { to: '/', label: 'خانه', icon: Home },
  { to: '/learn', label: 'آموزش‌ها', icon: BookOpen },
  { to: '/messages', label: 'پیام‌ها', icon: Mail },
  { to: '/cards', label: 'کارت‌ها', icon: Trophy },
];

export function BottomNav({ items = MARKETER_NAV }: { items?: BottomNavItem[] }) {
  return (
    <nav
      aria-label="ناوبری اصلی"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 backdrop-blur safe-bottom lg:hidden"
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-around px-2">
        {items.map(({ to, label, icon: Icon, badge }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                cn(
                  'relative flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-card text-xs transition-colors',
                  isActive
                    ? 'font-bold text-primary'
                    : 'font-medium text-text-secondary hover:text-text',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span aria-hidden className="absolute top-0 h-1 w-8 rounded-full bg-primary" />
                  )}
                  <span className="relative">
                    <Icon className="size-6" aria-hidden />
                    {badge !== undefined && badge > 0 && (
                      <span className="absolute -end-2 -top-1.5 flex min-w-[18px] items-center justify-center rounded-full border-2 border-surface bg-danger px-1 text-[10px] font-bold text-white">
                        {toPersianDigits(badge)}
                        <span className="sr-only"> پیام خوانده‌نشده</span>
                      </span>
                    )}
                  </span>
                  <span>{label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
