import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  BellRing,
  BookOpenCheck,
  Bot,
  CheckCircle2,
  ChevronLeft,
  Headphones,
  Mail,
  PlayCircle,
  Sparkles,
  Trophy,
} from 'lucide-react';
import {
  Button,
  CountdownChip,
  EmptyState,
  PackageCardSkeleton,
  ProgressRing,
  Skeleton,
} from '@/components/ui';
import { QueryState, StaleBanner } from '@/components/common/QueryState';
import { ProductImage } from '@/components/common/ProductImage';
import { Mascot } from '@/components/brand/Mascot';
import { PackageCard } from '@/components/learning/PackageCard';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/cn';
import { toPersianDigits } from '@/lib/digits';
import { faDuration, faNumber } from '@/lib/format';
import { qk, useHome } from '@/lib/queries';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { track } from '@/lib/telemetry';
import type { Nudge } from '@/lib/types';

const ACTION_LABEL = { start: 'شروع', resume: 'ادامه', quiz: 'شروع آزمون' } as const;

/** M3 — Home («کار بعدی»): the single most important screen. */
export function HomePage() {
  const { user } = useAuth();
  const home = useHome(user?.id);
  const nav = useNavigate();
  const loc = useLocation();
  const highlight = (loc.state as { highlightNext?: boolean } | null)?.highlightNext;
  const nudges = useQuery({
    queryKey: qk.nudges,
    queryFn: ({ signal }) => api.get<Nudge[]>('/me/mentor/nudges', signal),
  });
  const topNudge = nudges.data?.[0];

  return (
    <div className="flex flex-col gap-5 pb-3">
      <div className="flex items-center justify-between gap-3 px-1">
        <div>
          <p className="text-sm text-text-secondary">سلام {user?.name.split(' ')[0]} جان!</p>
          <h1 className="mt-0.5 text-xl font-extrabold text-text">امروز یک قدم جلوتر برو</h1>
        </div>
        <Link
          to="/messages"
          className="relative grid size-12 place-items-center rounded-full border border-border bg-surface shadow-sm"
          aria-label="پیام‌ها و اعلان‌ها"
        >
          <BellRing className="size-5 text-text-secondary" aria-hidden />
        </Link>
      </div>

      <StaleBanner
        show={home.isError && home.data !== undefined}
        onRetry={() => void home.refetch()}
      />

      <QueryState
        query={home}
        loading={
          <div className="flex flex-col gap-3" aria-busy>
            <Skeleton className="h-80 w-full rounded-[28px]" />
            <PackageCardSkeleton />
          </div>
        }
        isEmpty={(d) => d.packages.length === 0}
        empty={
          <EmptyState
            title="هنوز آموزشی ندارید"
            description="منتظر آموزش جدید باشید؛ وقتی فعال شد همین‌جا می‌بینید."
            illustration={<Mascot mood="thinking" className="h-32 w-auto" />}
          />
        }
      >
        {(d) => (
          <>
            {d.nextItem ? (
              <section
                className={cn(
                  'relative min-h-[330px] overflow-hidden rounded-[30px] border border-[#eadfce] bg-[#fffaf2] px-5 py-5 shadow-[0_18px_50px_-28px_rgba(15,23,42,.28)] sm:min-h-[350px] sm:px-7 sm:py-7',
                  highlight && 'ring-4 ring-primary/25',
                )}
                data-testid="next-item"
              >
                <div
                  aria-hidden
                  className="absolute -end-20 -top-24 size-64 rounded-full bg-[#e7f6e9]"
                />
                <div
                  aria-hidden
                  className="absolute -bottom-28 -start-20 size-72 rounded-full bg-[#fff0cf]"
                />
                <div
                  aria-hidden
                  className="absolute end-10 top-16 h-24 w-12 rotate-[24deg] rounded-[100%_0] bg-primary/10"
                />

                <div className="relative z-10 max-w-[58%] sm:max-w-[56%]">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-light px-3 py-1 text-xs font-extrabold text-accent-fg">
                    <Sparkles className="size-3.5" aria-hidden />
                    کار بعدی
                  </span>
                  <h2 className="mt-4 text-xl font-extrabold leading-8 text-text sm:text-2xl">
                    {d.nextItem.packageTitle}
                  </h2>
                  <p className="mt-1.5 line-clamp-2 text-sm leading-7 text-text-secondary">
                    {d.nextItem.sectionTitle}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-text-secondary">
                    {d.nextItem.mediaType === 'audio' ? (
                      <Headphones className="size-4" aria-hidden />
                    ) : (
                      <PlayCircle className="size-4" aria-hidden />
                    )}
                    <span>{faDuration(d.nextItem.durationSec)}</span>
                    {d.nextItem.deadlineAt && <CountdownChip deadline={d.nextItem.deadlineAt} />}
                  </div>

                  <Button
                    size="lg"
                    className="mt-5 min-h-14 rounded-full px-6 shadow-md"
                    icon={<PlayCircle className="size-5" aria-hidden />}
                    onClick={() => {
                      track('next_item_cta_clicked', { action: d.nextItem?.action ?? '' });
                      nav(
                        d.nextItem?.action === 'quiz'
                          ? `/quiz/${d.nextItem.sectionId}`
                          : `/sections/${d.nextItem?.sectionId}`,
                      );
                    }}
                  >
                    {ACTION_LABEL[d.nextItem.action]}
                  </Button>
                </div>

                <div className="pointer-events-none absolute -bottom-4 -end-5 z-0 flex h-[290px] w-[48%] items-end justify-center sm:-end-2 sm:h-[320px]">
                  {/* Real product image (contract: accessible name = package title, real catalog src) —
                      the mascot stays reserved for empty/success/encouragement/mentor states. */}
                  <ProductImage
                    src={d.nextItem.imageUrl}
                    alt={d.nextItem.packageTitle}
                    className="size-44 rounded-[24px] border-white/60 shadow-lg sm:size-52"
                  />
                </div>
              </section>
            ) : (
              <section className="relative overflow-hidden rounded-[30px] border border-[#eadfce] bg-[#fffaf2] p-6 shadow-sm">
                <div className="flex items-center gap-5">
                  <Mascot mood="success" className="h-36 w-auto" />
                  <div>
                    <p className="text-lg font-extrabold text-text">
                      همه آموزش‌ها را تمام کردی! 🎉
                    </p>
                    <p className="mt-1 text-sm leading-7 text-text-secondary">
                      به محض فعال‌شدن آموزش جدید، همین‌جا می‌بینیش.
                    </p>
                  </div>
                </div>
              </section>
            )}

            <nav aria-label="میانبرها" className="grid grid-cols-4 gap-2">
              <QuickLink to="/learn" label="دوره‌ها" icon={BookOpenCheck} tone="amber" />
              <QuickLink to="/messages" label="پیام‌ها" icon={Mail} tone="green" />
              <QuickLink to="/cards" label="کارت‌ها" icon={Trophy} tone="violet" />
              <QuickLink to="/mentor" label="منتور" icon={Bot} tone="blue" />
            </nav>

            {topNudge && (
              <Link
                to={topNudge.actionRef ?? '/mentor'}
                className="pressable flex items-start gap-3 rounded-[20px] border border-info/20 bg-info-light p-4 text-sm text-text shadow-xs"
              >
                <Sparkles className="mt-0.5 size-5 shrink-0 text-info" aria-hidden />
                <span>{topNudge.message}</span>
              </Link>
            )}

            <section className="rounded-[24px] border border-border bg-surface p-5 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-base font-extrabold text-text">پیشرفت شما</p>
                  <p className="mt-1 text-sm text-text-secondary">در مسیر عالی هستید!</p>
                </div>
                <ProgressRing value={d.totalProgress} size={92} stroke={9} label="پیشرفت کلی" />
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-4">
                <Stat label="در حال انجام" value={d.counts.inProgress} icon={PlayCircle} />
                <Stat label="جدید" value={d.counts.new} icon={BookOpenCheck} />
                <Stat label="تکمیل" value={d.counts.completed} icon={CheckCircle2} />
              </div>
              <Link
                to="/cards"
                className="pressable mt-4 flex min-h-14 items-center justify-between rounded-[18px] bg-accent-light px-4 text-accent-fg"
              >
                <span className="flex items-center gap-2 text-sm font-extrabold">
                  <span className="grid size-9 place-items-center rounded-full bg-accent/20">
                    <Trophy className="size-5" aria-hidden />
                  </span>
                  امتیاز شما
                </span>
                <span className="text-lg font-extrabold">{faNumber(d.pointsBalance)}</span>
              </Link>
            </section>

            {d.counts.overdue > 0 && (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-[18px] border border-danger/20 bg-danger-light p-4 text-sm text-danger-fg"
              >
                <BellRing className="size-5" aria-hidden />
                مهلت {toPersianDigits(d.counts.overdue)} آموزش گذشته است. هر چه زودتر تمامش کن.
              </div>
            )}

            <section aria-labelledby="my-trainings" className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 id="my-trainings" className="text-lg font-extrabold text-text">
                    آموزش‌های من
                  </h2>
                  <p className="mt-0.5 text-xs text-text-secondary">مسیرهای فعال شما</p>
                </div>
                <Link
                  to="/learn"
                  className="flex min-h-12 items-center gap-0.5 px-2 text-sm font-bold text-primary-fg"
                >
                  همه
                  <ChevronLeft className="size-4" aria-hidden />
                </Link>
              </div>
              <div className="stagger grid gap-3 md:grid-cols-2">
                {d.packages
                  .filter((p) => p.status !== 'completed')
                  .slice(0, 6)
                  .map((p) => (
                    <PackageCard key={p.id} p={p} />
                  ))}
              </div>
            </section>
          </>
        )}
      </QueryState>
    </div>
  );
}

const QUICK_TONES = {
  amber: 'bg-accent-light text-accent-fg',
  green: 'bg-success-light text-success-fg',
  violet: 'bg-violet-light text-violet-fg',
  blue: 'bg-info-light text-info-fg',
} as const;

function QuickLink({
  to,
  label,
  icon: Icon,
  tone,
}: {
  to: string;
  label: string;
  icon: typeof BookOpenCheck;
  tone: keyof typeof QUICK_TONES;
}) {
  return (
    <Link
      to={to}
      className="pressable flex min-h-24 flex-col items-center justify-center gap-2 rounded-[20px] border border-border bg-surface px-2 py-3 text-center shadow-sm hover:-translate-y-0.5 hover:shadow-md"
    >
      <span className={cn('grid size-11 place-items-center rounded-[16px]', QUICK_TONES[tone])}>
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="text-xs font-extrabold text-text">{label}</span>
    </Link>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: typeof PlayCircle;
}) {
  return (
    <div className="rounded-card border border-border bg-background p-3 text-center">
      <Icon className="mx-auto mb-2 size-5 text-primary-fg" aria-hidden />
      <p className="text-xl font-extrabold text-text">{toPersianDigits(value)}</p>
      <p className="mt-0.5 text-[11px] text-text-secondary">{label}</p>
    </div>
  );
}
