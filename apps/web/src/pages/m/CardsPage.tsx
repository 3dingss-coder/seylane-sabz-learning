import { useQuery } from '@tanstack/react-query';
import {
  AlarmClockCheck,
  Award,
  Brain,
  Lock,
  Medal,
  Sprout,
  Star,
  type LucideIcon,
} from 'lucide-react';
import { Card, EmptyState, Skeleton } from '@/components/ui';
import { PageHeader } from '@/components/common/PageHeader';
import { QueryState } from '@/components/common/QueryState';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { faDate, faNumber } from '@/lib/format';
import { qk } from '@/lib/queries';
import type { BadgeView, PointsData } from '@/lib/types';

const ICONS: Record<string, LucideIcon> = {
  sprout: Sprout,
  'alarm-clock-check': AlarmClockCheck,
  brain: Brain,
  medal: Medal,
  star: Star,
};
const REASON: Record<string, string> = {
  on_time_completion: 'تکمیل به‌موقع',
  first_pass_quiz: 'قبولی در تلاش اول',
  package_completion: 'تکمیل بسته',
  badge: 'نشان جدید',
  policy_penalty: 'کسر امتیاز',
  manual: 'تنظیم مدیر',
};

/** M10 — امتیاز و نشان‌ها (points awarded server-side only). */
export function CardsPage() {
  const points = useQuery({
    queryKey: qk.points,
    queryFn: ({ signal }) => api.get<PointsData>('/me/points', signal),
  });
  const badges = useQuery({
    queryKey: qk.badges,
    queryFn: ({ signal }) => api.get<BadgeView[]>('/me/badges', signal),
  });
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="امتیاز و نشان‌ها" />
      <QueryState query={points} loading={<Skeleton className="h-24 w-full" />}>
        {(p) => (
          <Card tone="brand" className="flex items-center gap-4">
            <Award className="size-10 text-primary" aria-hidden />
            <div>
              <p className="text-sm text-text-secondary">امتیاز کل</p>
              <p className="text-3xl font-bold text-text" data-testid="points-balance">
                {faNumber(p.balance)}
              </p>
            </div>
          </Card>
        )}
      </QueryState>
      <section aria-labelledby="badges-title">
        <h2 id="badges-title" className="mb-2 text-base font-bold">
          نشان‌ها
        </h2>
        <QueryState query={badges} loading={<Skeleton className="h-32 w-full" />}>
          {(list) => (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {list.map((b) => {
                const Icon = ICONS[b.icon] ?? Medal;
                return (
                  <li key={b.id}>
                    <Card
                      className={cn(
                        'flex h-full flex-col items-center gap-2 text-center',
                        !b.earned && 'opacity-60',
                      )}
                    >
                      <span
                        className={cn(
                          'flex size-14 items-center justify-center rounded-full',
                          b.earned ? 'bg-primary-light text-primary' : 'bg-background text-muted',
                        )}
                      >
                        {b.earned ? (
                          <Icon className="size-7" aria-hidden />
                        ) : (
                          <Lock className="size-6" aria-hidden />
                        )}
                      </span>
                      <p className="text-sm font-bold text-text">{b.title}</p>
                      <p className="text-xs leading-5 text-text-secondary">{b.description}</p>
                      {b.earnedAt && <p className="text-xs text-primary">{faDate(b.earnedAt)}</p>}
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
        </QueryState>
      </section>
      <section aria-labelledby="ledger-title">
        <h2 id="ledger-title" className="mb-2 text-base font-bold">
          تاریخچه امتیاز
        </h2>
        <QueryState
          query={points}
          loading={<Skeleton className="h-20 w-full" />}
          isEmpty={(p) => p.ledger.length === 0}
          empty={
            <EmptyState
              title="هنوز امتیازی نگرفته‌ای"
              description="با تکمیل به‌موقع آموزش‌ها و قبولی در آزمون امتیاز بگیر."
            />
          }
        >
          {(p) => (
            <ul className="divide-y divide-border rounded-card border border-border bg-surface">
              {p.ledger.map((l) => (
                <li key={l.id} className="flex items-center justify-between p-3 text-sm">
                  <div>
                    <p className="font-bold text-text">{REASON[l.reason] ?? l.reason}</p>
                    <p className="text-xs text-text-secondary">{faDate(l.createdAt)}</p>
                  </div>
                  <span
                    className={cn('font-bold', l.amount >= 0 ? 'text-success' : 'text-danger')}
                    dir="ltr"
                  >
                    {l.amount >= 0 ? '+' : ''}
                    {faNumber(l.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </QueryState>
      </section>
    </div>
  );
}
