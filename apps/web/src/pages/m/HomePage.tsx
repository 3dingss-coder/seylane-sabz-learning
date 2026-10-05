import { Link, useLocation, useNavigate } from 'react-router-dom';
import { BellRing, ChevronLeft, Headphones, PlayCircle, Sparkles, Trophy } from 'lucide-react';
import {
  Button,
  Card,
  CoinChip,
  CountdownChip,
  EmptyState,
  PackageCardSkeleton,
  ProgressRing,
  Skeleton,
  TrophyIllustration,
} from '@/components/ui';
import { QueryState, StaleBanner } from '@/components/common/QueryState';
import { MascotAvatar } from '@/components/brand/MascotAvatar';
import { ProductImage } from '@/components/common/ProductImage';
import { PackageCard } from '@/components/learning/PackageCard';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/cn';
import { toPersianDigits } from '@/lib/digits';
import { faDuration } from '@/lib/format';
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
    <div className="stagger flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <MascotAvatar size={52} />
        <div>
          <p className="text-sm text-text-secondary">سلام {user?.name.split(' ')[0]} 👋</p>
          <h1 className="text-2xl font-extrabold text-text">کار بعدی تو</h1>
        </div>
      </div>
      <StaleBanner
        show={home.isError && home.data !== undefined}
        onRetry={() => void home.refetch()}
      />
      <QueryState
        query={home}
        loading={
          <div className="flex flex-col gap-3" aria-busy>
            <Skeleton className="h-44 w-full" />
            <PackageCardSkeleton />
            <PackageCardSkeleton />
          </div>
        }
        isEmpty={(d) => d.packages.length === 0}
        empty={
          <EmptyState
            title="هنوز آموزشی ندارید"
            description="منتظر آموزش جدید باشید؛ وقتی فعال شد همین‌جا می‌بینید."
          />
        }
      >
        {(d) => (
          <>
            {d.nextItem ? (
              <Card
                tone="hero"
                className={cn(
                  'relative overflow-hidden p-5',
                  highlight && 'ring-4 ring-primary/40',
                )}
                data-testid="next-item"
              >
                {/* brand texture: dot grid + soft circles (decorative) */}
                <div
                  aria-hidden
                  className="bg-dots pointer-events-none absolute inset-0 text-white/10 [mask-image:radial-gradient(70%_70%_at_0%_0%,#000,transparent)]"
                />
                <div
                  aria-hidden
                  className="pointer-events-none absolute -end-10 -top-12 size-40 rounded-full bg-white/10"
                />
                <p className="relative mb-3 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-bold text-white">
                  <Sparkles className="size-3.5" aria-hidden />
                  کار بعدی
                </p>
                <div className="relative flex gap-3">
                  <ProductImage
                    src={d.nextItem.imageUrl}
                    alt={d.nextItem.packageTitle}
                    className="size-20 border-white/20 shadow-md"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-base font-bold leading-7 text-white">
                      {d.nextItem.packageTitle}
                    </p>
                    <p className="mt-1 flex items-center gap-1 text-sm text-white/85">
                      {d.nextItem.mediaType === 'audio' ? (
                        <Headphones className="size-4" aria-hidden />
                      ) : (
                        <PlayCircle className="size-4" aria-hidden />
                      )}
                      <span className="line-clamp-1">{d.nextItem.sectionTitle}</span>
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {d.nextItem.deadlineAt && <CountdownChip deadline={d.nextItem.deadlineAt} />}
                      <span className="text-xs text-white/85">
                        {faDuration(d.nextItem.durationSec)}
                      </span>
                    </div>
                  </div>
                </div>
                <Button
                  size="lg"
                  block
                  variant="light"
                  className="relative mt-4"
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
              </Card>
            ) : (
              <Card tone="brand" className="flex items-center gap-3">
                <TrophyIllustration className="h-20 shrink-0" />
                <div>
                  <p className="font-bold text-text">همه آموزش‌ها را تمام کردی! 🎉</p>
                  <p className="text-sm text-text-secondary">
                    آموزش جدید که فعال شود، اینجا می‌بینی.
                  </p>
                </div>
              </Card>
            )}

            {topNudge && (
              <Link
                to={topNudge.actionRef ?? '/mentor'}
                className="pressable flex items-start gap-3 rounded-card border border-info/30 bg-info-light p-3 text-sm text-text hover:shadow-sm"
              >
                <Sparkles className="mt-0.5 size-5 shrink-0 text-info" aria-hidden />
                <span>{topNudge.message}</span>
              </Link>
            )}

            <Card chunky className="flex flex-col gap-3">
              <div className="flex items-center gap-4">
                <ProgressRing value={d.totalProgress} size={76} stroke={8} label="پیشرفت کلی" />
                <div className="grid flex-1 grid-cols-3 gap-2 text-center">
                  <Stat label="در حال انجام" value={d.counts.inProgress} />
                  <Stat label="جدید" value={d.counts.new} />
                  <Stat label="تکمیل" value={d.counts.completed} />
                </div>
              </div>
              <Link
                to="/cards"
                className="pressable flex min-h-12 items-center justify-between rounded-card bg-mint px-3 text-text"
              >
                <span className="flex items-center gap-2 text-sm font-bold">
                  <Trophy className="size-5 text-primary" aria-hidden />
                  امتیاز شما
                </span>
                <CoinChip value={d.pointsBalance} />
              </Link>
            </Card>

            {d.counts.overdue > 0 && (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-card border border-danger/30 bg-danger-light p-3 text-sm text-danger-fg"
              >
                <BellRing className="size-5" aria-hidden />
                مهلت {toPersianDigits(d.counts.overdue)} آموزش گذشته است. هر چه زودتر تمامش کن.
              </div>
            )}

            <section aria-labelledby="my-trainings" className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h2 id="my-trainings" className="text-base font-bold text-text">
                  آموزش‌های من
                </h2>
                <Link
                  to="/learn"
                  className="flex min-h-12 items-center gap-0.5 px-2 text-sm font-bold text-primary"
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

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-xl font-extrabold text-text">{toPersianDigits(value)}</p>
      <p className="text-[11px] text-text-secondary">{label}</p>
    </div>
  );
}
