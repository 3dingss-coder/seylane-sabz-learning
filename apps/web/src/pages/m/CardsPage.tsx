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
import { Card, CountUp, EmptyState, Skeleton } from '@/components/ui';
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

function BadgeSkeletons() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" aria-busy>
      {Array.from({ length: 4 }).map((_, index) => (
        <Skeleton key={index} className="h-48 w-full rounded-card" />
      ))}
    </div>
  );
}

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
    <div className="flex flex-col gap-6 pb-2">
      <PageHeader title="امتیاز و نشان‌ها" />

      <QueryState
        query={points}
        loading={<Skeleton className="h-44 w-full rounded-hero sm:h-48" />}
      >
        {(p) => (
          <Card
            padded={false}
            className="relative isolate min-h-44 overflow-hidden rounded-hero border-primary/10 bg-[linear-gradient(135deg,#fffdf7_0%,#fff8e8_50%,#eef8ef_100%)] shadow-md sm:min-h-48"
          >
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_15%_20%,rgba(245,180,44,0.16),transparent_28%),radial-gradient(circle_at_88%_85%,rgba(24,126,93,0.13),transparent_30%)]"
            />

            <div className="flex min-h-44 items-center justify-between gap-3 px-5 py-5 sm:min-h-48 sm:px-7">
              <div className="min-w-0 flex-1">
                <div className="mb-3 flex items-center gap-2 text-primary">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-light text-accent-fg shadow-sm">
                    <Award className="size-5" aria-hidden />
                  </span>
                  <p className="text-sm font-bold text-text-secondary">امتیاز کل</p>
                </div>

                <p
                  className="text-4xl font-extrabold tracking-tight text-primary sm:text-5xl"
                  data-testid="points-balance"
                >
                  <CountUp value={p.balance} format={faNumber} />
                </p>
                <p className="mt-2 text-xs font-medium text-text-secondary sm:text-sm">
                  امتیازهای شما از فعالیت‌های آموزشی
                </p>
              </div>

              <div className="relative h-32 w-28 shrink-0 self-end sm:h-40 sm:w-36">
                <div
                  aria-hidden
                  className="absolute inset-x-2 bottom-1 h-8 rounded-[50%] bg-primary/10 blur-xl"
                />
                <img
                  src="/brand/mascot.webp"
                  alt=""
                  aria-hidden
                  className="relative h-full w-full object-contain object-bottom"
                  loading="eager"
                />
              </div>
            </div>
          </Card>
        )}
      </QueryState>

      <section aria-labelledby="badges-title" className="min-w-0">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="badges-title" className="text-lg font-extrabold text-text sm:text-xl">
            نشان‌ها
          </h2>
          <span className="h-px flex-1 bg-border" aria-hidden />
        </div>

        <QueryState query={badges} loading={<BadgeSkeletons />}>
          {(list) => (
            <ul className="stagger grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {list.map((b) => {
                const Icon = ICONS[b.icon] ?? Medal;
                return (
                  <li key={b.id} className="min-w-0">
                    <Card
                      className={cn(
                        'relative flex h-full min-h-48 flex-col items-center justify-start gap-2 overflow-hidden px-3 py-4 text-center sm:min-h-52 sm:px-4',
                        b.earned
                          ? 'border-accent/30 bg-[linear-gradient(180deg,#fffdfa_0%,#fff8e8_100%)] shadow-sm'
                          : 'border-border bg-surface-2/70 shadow-none',
                      )}
                    >
                      {b.earned && (
                        <div
                          aria-hidden
                          className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-[radial-gradient(circle_at_50%_0%,rgba(245,180,44,0.18),transparent_72%)]"
                        />
                      )}

                      <span
                        className={cn(
                          'relative mt-1 flex size-16 shrink-0 items-center justify-center rounded-[20px] border shadow-sm sm:size-18',
                          b.earned
                            ? 'border-accent/35 bg-accent-light text-accent-fg'
                            : 'border-border bg-surface text-muted-fg',
                        )}
                      >
                        <Icon className="size-8 sm:size-9" aria-hidden />
                        {!b.earned && (
                          <span
                            className="absolute -bottom-1 -end-1 flex size-7 items-center justify-center rounded-full border-2 border-surface bg-surface-2 text-text-secondary shadow-sm"
                            aria-label="قفل"
                          >
                            <Lock className="size-4" aria-hidden />
                          </span>
                        )}
                      </span>

                      <p
                        className={cn(
                          'mt-1 text-sm font-extrabold leading-6 sm:text-base',
                          b.earned ? 'text-text' : 'text-text-secondary',
                        )}
                      >
                        {b.title}
                      </p>
                      <p className="line-clamp-3 text-xs leading-5 text-text-secondary sm:text-sm">
                        {b.description}
                      </p>

                      <div className="mt-auto min-h-5 pt-1">
                        {b.earnedAt ? (
                          <p className="text-xs font-bold text-primary">{faDate(b.earnedAt)}</p>
                        ) : !b.earned ? (
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-text-secondary">
                            <Lock className="size-3.5" aria-hidden />
                            قفل
                          </span>
                        ) : null}
                      </div>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
        </QueryState>
      </section>

      <section aria-labelledby="ledger-title" className="min-w-0">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="ledger-title" className="text-lg font-extrabold text-text sm:text-xl">
            تاریخچه امتیاز
          </h2>
          <span className="h-px flex-1 bg-border" aria-hidden />
        </div>

        <QueryState
          query={points}
          loading={<Skeleton className="h-36 w-full rounded-card" />}
          isEmpty={(p) => p.ledger.length === 0}
          empty={
            <EmptyState
              title="هنوز امتیازی نگرفته‌ای"
              description="با تکمیل به‌موقع آموزش‌ها و قبولی در آزمون امتیاز بگیر."
            />
          }
        >
          {(p) => (
            <ul className="stagger overflow-hidden rounded-card border border-border bg-surface shadow-sm">
              {p.ledger.map((l) => (
                <li
                  key={l.id}
                  className="flex min-h-16 items-center justify-between gap-3 border-b border-border/80 px-4 py-3 text-sm last:border-b-0 sm:px-5"
                >
                  <div className="min-w-0">
                    <p className="truncate font-bold text-text">{REASON[l.reason] ?? l.reason}</p>
                    <p className="mt-0.5 text-xs text-text-secondary">{faDate(l.createdAt)}</p>
                  </div>

                  <span
                    className={cn(
                      'shrink-0 rounded-full px-2.5 py-1 text-sm font-extrabold tabular-nums',
                      l.amount >= 0
                        ? 'bg-success-light text-success-fg'
                        : 'bg-danger-light text-danger',
                    )}
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
