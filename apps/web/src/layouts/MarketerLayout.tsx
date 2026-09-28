import { useEffect } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { Bell, BookOpen, Bot, Home, Mail, Trophy, UserRound, WifiOff } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { AppLogo } from '@/components/brand/AppLogo';
import { BottomNav } from '@/components/layout/BottomNav';
import { cn } from '@/lib/cn';
import { toPersianDigits } from '@/lib/digits';
import { flushBeats } from '@/lib/offline-queue';
import { useOnline } from '@/lib/online';
import { useMessages, useNotifications } from '@/lib/queries';

const DESKTOP_NAV = [
  { to: '/', label: 'خانه', icon: Home },
  { to: '/learn', label: 'آموزش‌ها', icon: BookOpen },
  { to: '/messages', label: 'پیام‌ها', icon: Mail },
  { to: '/cards', label: 'کارت‌ها', icon: Trophy },
  { to: '/mentor', label: 'منتور', icon: Bot },
];

/** Marketer shell: header (logo, bell, profile) + bottom nav on mobile, top nav on desktop. */
export function MarketerLayout() {
  const notifications = useNotifications();
  const messages = useMessages();
  const qc = useQueryClient();
  const online = useOnline();
  const unreadMessages = messages.data?.filter((m) => !m.readAt).length ?? 0;
  const unread = (notifications.data?.unread ?? 0) + unreadMessages;

  useEffect(() => {
    const sync = () =>
      void flushBeats().then((n) => {
        if (n) void qc.invalidateQueries({ queryKey: ['me'] });
      });
    sync();
    window.addEventListener('online', sync);
    return () => window.removeEventListener('online', sync);
  }, [qc]);

  return (
    <div className="min-h-dvh bg-background pb-24 lg:pb-8">
      <header className="sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[960px] items-center justify-between gap-2 px-4">
          <Link to="/" aria-label="خانه">
            <AppLogo />
          </Link>
          <nav aria-label="ناوبری اصلی" className="hidden items-center gap-1 lg:flex">
            {DESKTOP_NAV.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  cn(
                    'flex min-h-12 items-center gap-1.5 rounded-card px-3 text-sm font-bold',
                    isActive
                      ? 'bg-primary-light text-primary'
                      : 'text-text-secondary hover:bg-background',
                  )
                }
              >
                <Icon className="size-4" aria-hidden />
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center">
            <Link
              to="/messages"
              aria-label={
                unread
                  ? `پیام‌ها و اعلان‌ها — ${toPersianDigits(unread)} خوانده‌نشده`
                  : 'پیام‌ها و اعلان‌ها'
              }
              className="relative flex size-12 items-center justify-center rounded-card text-text-secondary hover:bg-background"
            >
              <Bell className="size-6" aria-hidden />
              {unread > 0 && (
                <span className="absolute end-2 top-2 flex min-w-[18px] items-center justify-center rounded-full border-2 border-surface bg-danger px-1 text-[10px] font-bold text-white">
                  {toPersianDigits(unread > 99 ? 99 : unread)}
                </span>
              )}
            </Link>
            <Link
              to="/profile"
              aria-label="پروفایل"
              className="flex size-12 items-center justify-center rounded-card text-text-secondary hover:bg-background"
            >
              <UserRound className="size-6" aria-hidden />
            </Link>
          </div>
        </div>
      </header>
      {!online && (
        <div
          role="status"
          className="flex items-center justify-center gap-2 bg-warning-light px-4 py-2 text-sm font-bold text-text"
        >
          <WifiOff className="size-4 text-warning" aria-hidden />
          اتصال اینترنت قطع است. پیشرفت شما ذخیره می‌شود و بعد از اتصال ارسال می‌گردد.
        </div>
      )}
      <main className="mx-auto max-w-[960px] px-4 py-4">
        <Outlet />
      </main>
      <BottomNav
        items={[
          { to: '/', label: 'خانه', icon: Home },
          { to: '/learn', label: 'آموزش‌ها', icon: BookOpen },
          { to: '/messages', label: 'پیام‌ها', icon: Mail, badge: unread },
          { to: '/cards', label: 'کارت‌ها', icon: Trophy },
        ]}
      />
    </div>
  );
}
