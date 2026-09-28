import { Link, useLocation, useNavigate } from 'react-router-dom';
import { BellRing, Headphones, PlayCircle, Sparkles, Trophy } from 'lucide-react';
import {
  Button,
  Card,
  CountdownChip,
  EmptyState,
  PackageCardSkeleton,
  ProgressRing,
  Skeleton,
} from '@/components/ui';
import { QueryState, StaleBanner } from '@/components/common/QueryState';
import { ProductImage } from '@/components/common/ProductImage';
import { PackageCard } from '@/components/learning/PackageCard';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/cn';
import { toPersianDigits } from '@/lib/digits';
import { faDuration, faNumber } from '@/lib/format';
import { qk, useHome } from '@/lib/queries';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Nudge } from '@/lib/types';

const ACTION_LABEL = { start: 'شروع', resume: 'ادامه', quiz: 'شروع آزمون' } as const;

/** M3 — Home («کار بعدی»): the single most important screen. */
export function HomePage() {
  const home = useHome();
  const { user } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const highlight = (loc.state as { highlightNext?: boolean } | null)?.highlightNext;
  const nudges = useQuery({
    queryKey: qk.nudges,
    queryFn: ({ signal }) => api.get<Nudge[]>('/me/mentor/nudges', signal),
  });
  const topNudge = nudges.data?.[0];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-sm text-text-secondary">سلام {user?.name.split(' ')[0]} 👋</p>
        <h1 className="text-xl font-bold text-text">کار بعدی تو</h1>
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
                tone="brand"
                className={cn('p-4', highlight && 'ring-4 ring-primary/30')}
                data-testid="next-item"
              >
                <div className="flex gap-3">
                  <ProductImage
                    src={d.nextItem.imageUrl}
                    alt={d.nextItem.packageTitle}
                    className="size-20 bg-surface"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-bold text-text">
                      {d.nextItem.packageTitle}
                    </p>
                    <p className="mt-1 flex items-center gap-1 text-sm text-text-secondary">
                      {d.nextItem.mediaType === 'audio' ? (
                        <Headphones className="size-4" aria-hidden />
                      ) : (
                        <PlayCircle className="size-4" aria-hidden />
                      )}
                      <span className="line-clamp-1">{d.nextItem.sectionTitle}</span>
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {d.nextItem.deadlineAt && <CountdownChip deadline={d.nextItem.deadlineAt} />}
                      <span className="text-xs text-text-secondary">
                        {faDuration(d.nextItem.durationSec)}
                      </span>
                    </div>
                  </div>
                </div>
                <Button
                  size="lg"
                  block
                  className="mt-4"
                  icon={<PlayCircle className="size-5" aria-hidden />}
                  onClick={() =>
                    nav(
                      d.nextItem?.action === 'quiz'
                        ? `/quiz/${d.nextItem.sectionId}`
                        : `/sections/${d.nextItem?.sectionId}`,
                    )
                  }
                >
                  {ACTION_LABEL[d.nextItem.action]}
                </Button>
              </Card>
            ) : (
              <Card tone="brand" className="flex items-center gap-3">
                <Trophy className="size-8 text-primary" aria-hidden />
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
                className="flex items-start gap-3 rounded-card border border-info/30 bg-info-light p-3 text-sm text-text"
              >
                <Sparkles className="mt-0.5 size-5 shrink-0 text-info" aria-hidden />
                <span>{topNudge.text}</span>
              </Link>
            )}

            <Card className="flex items-center gap-4">
              <ProgressRing value={d.totalProgress} label="پیشرفت کلی" />
              <div className="grid flex-1 grid-cols-3 gap-2 text-center">
                <Stat label="در حال انجام" value={d.counts.inProgress} />
                <Stat label="جدید" value={d.counts.new} />
                <Stat label="تکمیل" value={d.counts.completed} />
              </div>
              <Link
                to="/cards"
                className="hidden flex-col items-center rounded-card px-2 py-1 text-primary sm:flex"
              >
                <Trophy className="size-5" aria-hidden />
                <span className="text-sm font-bold">{faNumber(d.pointsBalance)}</span>
                <span className="text-[11px] text-text-secondary">امتیاز</span>
              </Link>
            </Card>

            {d.counts.overdue > 0 && (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-card border border-danger/30 bg-danger-light p-3 text-sm text-danger"
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
                  className="flex min-h-12 items-center px-2 text-sm font-bold text-primary"
                >
                  همه
                </Link>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
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
      <p className="text-lg font-bold text-text">{toPersianDigits(value)}</p>
      <p className="text-[11px] text-text-secondary">{label}</p>
    </div>
  );
}
