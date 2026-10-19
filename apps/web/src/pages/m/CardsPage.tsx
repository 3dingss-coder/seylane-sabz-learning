import type { CSSProperties } from 'react';
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

const DEFAULT_ICON_TONE = {
  shell: 'from-orange-50 to-amber-50 border-orange-200',
  icon: 'bg-orange-500 text-white',
};

const ICON_TONES: Record<string, { shell: string; icon: string }> = {
  sprout: {
    shell: 'from-emerald-50 to-emerald-100 border-emerald-200',
    icon: 'bg-emerald-600 text-white',
  },
  'alarm-clock-check': {
    shell: 'from-amber-50 to-orange-50 border-amber-200',
    icon: 'bg-amber-500 text-white',
  },
  brain: {
    shell: 'from-violet-50 to-purple-50 border-violet-200',
    icon: 'bg-violet-600 text-white',
  },
  medal: DEFAULT_ICON_TONE,
  star: {
    shell: 'from-yellow-50 to-amber-50 border-yellow-200',
    icon: 'bg-amber-500 text-white',
  },
};

const REASON: Record<string, string> = {
  on_time_completion: 'تکمیل به‌موقع',
  first_pass_quiz: 'قبولی در تلاش اول',
  package_completion: 'تکمیل بسته',
  badge: 'نشان جدید',
  policy_penalty: 'کسر امتیاز',
  manual: 'تنظیم مدیر',
};

const PAGE_THEME = {
  '--color-primary': '#08785f',
  '--color-primary-hover': '#06674f',
  '--color-primary-light': '#e9f6f1',
  '--color-text': '#123430',
  '--color-text-secondary': '#6f7f7c',
  '--color-muted': '#9aa6a2',
  '--color-muted-fg': '#71807c',
  '--color-border': '#e9e1d5',
  '--color-background': '#fbf8ef',
  '--color-surface': '#fffdf8',
  '--color-surface-2': '#f5f1e8',
  '--color-accent': '#f6aa17',
  '--color-accent-light': '#fff4cf',
  '--color-accent-fg': '#8a4c00',
  '--color-success-fg': '#08785f',
  '--color-danger': '#c24135',
} as CSSProperties;

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
    <div
      style={PAGE_THEME}
      className="-mx-4 -my-4 min-h-[calc(100dvh-4rem)] bg-[#fbf8ef] px-4 py-5 text-text sm:py-6 lg:rounded-[28px] lg:px-6 lg:py-7"
    >
      <div className="mx-auto flex max-w-[920px] flex-col gap-7">
        <PageHeader title="امتیاز و نشان‌ها" />

        <QueryState
          query={points}
          loading={<Skeleton className="h-[190px] w-full rounded-[28px] sm:h-[220px]" />}
        >
          {(p) => (
            <section aria-label="امتیاز کل">
              <div
                className="relative min-h-[190px] overflow-hidden rounded-[28px] border border-[#eddcae] shadow-[0_14px_40px_-28px_rgba(83,62,20,0.55)] sm:min-h-[220px]"
                style={{
                  background:
                    'radial-gradient(circle at 18% 18%, rgba(255,255,255,.95), transparent 27%), radial-gradient(circle at 75% 18%, rgba(255,231,137,.72), transparent 34%), linear-gradient(135deg, #fffdf5 0%, #fff8df 48%, #eef7de 100%)',
                }}
              >
                <div
                  aria-hidden
                  className="absolute -bottom-14 -end-16 size-56 rounded-full bg-[#a8d37b]/30 blur-2xl sm:size-72"
                />
                <div
                  aria-hidden
                  className="absolute -start-14 -top-20 size-56 rounded-full bg-[#ffe378]/35 blur-3xl"
                />

                <img
                  src="/brand/mascot.webp"
                  alt=""
                  width={250}
                  height={320}
                  aria-hidden
                  className="pointer-events-none absolute bottom-[-42px] right-[-22px] h-[205px] w-auto select-none object-contain sm:bottom-[-54px] sm:right-2 sm:h-[270px] lg:right-12"
                />

                <div className="relative z-10 flex min-h-[190px] items-center sm:min-h-[220px]">
                  <div className="mr-auto w-[62%] min-w-0 py-6 pe-2 ps-2 sm:w-[54%] sm:ps-8 lg:w-[48%]">
                    <div className="mb-3 flex items-center gap-2">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-[#fff1bd] text-[#b86900] shadow-[inset_0_0_0_1px_rgba(212,151,28,.24)]">
                        <Award className="size-6" aria-hidden />
                      </span>
                      <p className="text-base font-extrabold text-[#5f6f6a] sm:text-lg">
                        امتیاز کل
                      </p>
                    </div>
                    <div className="flex items-end gap-2">
                      <p
                        className="text-[2.6rem] font-black leading-none text-[#0a574b] sm:text-6xl"
                        data-testid="points-balance"
                      >
                        <CountUp value={p.balance} format={faNumber} />
                      </p>
                      <span className="pb-1 text-sm font-bold text-[#6f7f7c] sm:text-base">
                        امتیاز
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )}
        </QueryState>

        <section aria-labelledby="badges-title">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 id="badges-title" className="text-lg font-extrabold text-[#143532] sm:text-xl">
                نشان‌ها
              </h2>
            </div>
            <span
              aria-hidden
              className="flex size-10 items-center justify-center rounded-2xl bg-[#fff4d1] text-[#aa6500]"
            >
              <Medal className="size-5" />
            </span>
          </div>

          <QueryState
            query={badges}
            loading={
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" aria-hidden>
                {Array.from({ length: 5 }, (_, i) => (
                  <Skeleton key={i} className="h-[210px] w-full rounded-[22px]" />
                ))}
              </div>
            }
          >
            {(list) => (
              <ul className="stagger grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {list.map((b) => {
                  const Icon = ICONS[b.icon] ?? Medal;
                  const tone = ICON_TONES[b.icon] ?? DEFAULT_ICON_TONE;
                  return (
                    <li key={b.id} className="min-w-0">
                      <Card
                        className={cn(
                          'relative flex h-full min-h-[210px] flex-col items-center overflow-hidden !rounded-[22px] p-4 text-center',
                          b.earned
                            ? `!border-solid !bg-gradient-to-b ${tone.shell} shadow-[0_12px_30px_-24px_rgba(62,47,16,.55)]`
                            : '!border-[#ddd8cf] !bg-[#f5f3ee] shadow-none',
                        )}
                      >
                        {b.earned && (
                          <span
                            aria-hidden
                            className="absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent"
                          />
                        )}

                        <span
                          className={cn(
                            'relative mb-3 mt-1 flex size-[74px] shrink-0 items-center justify-center rounded-[24px] border shadow-[inset_0_1px_0_rgba(255,255,255,.65),0_8px_18px_-13px_rgba(27,48,42,.45)]',
                            b.earned
                              ? tone.icon
                              : 'border-[#c9c7c2] bg-gradient-to-b from-[#e7e7e4] to-[#cececa] text-[#7d8582]',
                          )}
                        >
                          <Icon className="size-8" aria-hidden />
                          {!b.earned && (
                            <span className="absolute -bottom-2 -end-2 flex size-8 items-center justify-center rounded-full border-2 border-[#f5f3ee] bg-[#7f8784] text-white shadow-sm">
                              <Lock className="size-4" aria-hidden />
                              <span className="sr-only">قفل شده</span>
                            </span>
                          )}
                        </span>

                        <p
                          className={cn(
                            'text-sm font-extrabold leading-6',
                            b.earned ? 'text-[#153732]' : 'text-[#59625f]',
                          )}
                        >
                          {b.title}
                        </p>
                        <p
                          className={cn(
                            'mt-1 text-xs leading-5',
                            b.earned ? 'text-[#73807d]' : 'text-[#8c9491]',
                          )}
                        >
                          {b.description}
                        </p>

                        {b.earnedAt && (
                          <p className="mt-auto pt-3 text-[11px] font-medium text-primary">
                            {faDate(b.earnedAt)}
                          </p>
                        )}
                      </Card>
                    </li>
                  );
                })}
              </ul>
            )}
          </QueryState>
        </section>

        <section aria-labelledby="ledger-title" className="pb-2">
          <div className="mb-3">
            <h2 id="ledger-title" className="text-lg font-extrabold text-[#143532] sm:text-xl">
              تاریخچه امتیاز
            </h2>
          </div>

          <QueryState
            query={points}
            loading={
              <div className="space-y-2" aria-hidden>
                <Skeleton className="h-[72px] w-full rounded-[18px]" />
                <Skeleton className="h-[72px] w-full rounded-[18px]" />
                <Skeleton className="h-[72px] w-full rounded-[18px]" />
              </div>
            }
            isEmpty={(p) => p.ledger.length === 0}
            empty={
              <EmptyState
                title="هنوز امتیازی نگرفته‌ای"
                description="با تکمیل به‌موقع آموزش‌ها و قبولی در آزمون امتیاز بگیر."
              />
            }
          >
            {(p) => (
              <ul className="stagger overflow-hidden rounded-[22px] border border-[#e7e0d6] bg-[#fffdf8] shadow-[0_14px_34px_-30px_rgba(36,53,48,.5)]">
                {p.ledger.map((l) => (
                  <li
                    key={l.id}
                    className="flex min-h-[72px] items-center justify-between gap-4 border-b border-[#eee8df] px-4 py-3 last:border-b-0 sm:px-5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-extrabold text-[#193b37] sm:text-base">
                        {REASON[l.reason] ?? l.reason}
                      </p>
                      <p className="mt-0.5 text-xs text-[#85908d]">{faDate(l.createdAt)}</p>
                    </div>
                    <span
                      className={cn(
                        'shrink-0 rounded-xl px-2.5 py-1 text-sm font-black sm:text-base',
                        l.amount >= 0
                          ? 'bg-[#e7f6f0] text-[#08785f]'
                          : 'bg-[#fff0ed] text-[#b63b31]',
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
    </div>
  );
}
