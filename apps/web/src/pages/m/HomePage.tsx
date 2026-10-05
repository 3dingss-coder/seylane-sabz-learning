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
import { Reveal } from '@/components/common/Reveal';
import { Character } from '@/components/character/Character';
import { COPY, LINES } from '@/lib/copy/fa';
import type { Expression } from '@/components/character/types';
import { ProductImage } from '@/components/common/ProductImage';
import { PackageCard } from '@/components/learning/PackageCard';
import { ReviewDeck } from '@/components/learning/ReviewDeck';
import { QuestList } from '@/components/learning/QuestList';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/cn';
import { toPersianDigits } from '@/lib/digits';
import { faDuration } from '@/lib/format';
import { qk, useHome } from '@/lib/queries';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { track } from '@/lib/telemetry';
import type { Nudge } from '@/lib/types';

const ACTION_LABEL = {
  start: COPY.home.start,
  resume: COPY.home.resume,
  quiz: COPY.home.startQuiz,
} as const;

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

  /* M3 §2.4: Seyla is on the home card, and her FACE is the state of the real deadline —
     not decoration. No deadline → idle; under 72h → nudge; under 24h → worried. */
  const deadlineAt = home.data?.nextItem?.deadlineAt;
  const deadlineMs = deadlineAt ? Date.parse(deadlineAt) - Date.now() : null;
  const seylaMood: Expression =
    deadlineMs == null
      ? 'idle'
      : deadlineMs < 86_400_000
        ? 'worried'
        : deadlineMs < 259_200_000
          ? 'nudge'
          : 'happy';

  return (
    <div className="stagger flex flex-col gap-4">
      <div className="min-w-0">
        <p className="text-sm font-bold text-text-secondary">
          {LINES.greeting(user?.name.split(' ')[0] ?? '')}
        </p>
        <h1 className="display text-3xl text-text">{COPY.home.nextWork}</h1>
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
            character="seyla"
            title={COPY.home.noTraining}
            description={COPY.empty.home}
            actionText={COPY.home.goToCards}
            onAction={() => nav('/cards')}
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
                  {COPY.home.nextWorkLabel}
                </p>
                <div className="relative flex gap-3">
                  <ProductImage
                    src={d.nextItem.imageUrl}
                    alt={d.nextItem.packageTitle}
                    className="size-24 rounded-card border-white/20 shadow-md"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="display line-clamp-2 text-xl leading-8 text-white">
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
                  className="spot relative mt-4"
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
                  <p className="font-bold text-text">{COPY.home.allDone}</p>
                  <p className="text-sm text-text-secondary">{COPY.home.allDoneNext}</p>
                </div>
              </Card>
            )}

            {/* PHASE-3: the motivation engine is visible where the work happens — today's review
                queue (spaced repetition) and today's quests, both driven by real server data. */}
            <ReviewDeck />
            <QuestList />

            {/* v4: the mascot's real job — a coach that speaks, not a logo in the header. */}
            <Link
              to={topNudge?.actionRef ?? '/mentor'}
              className="pressable flex items-center gap-3 rounded-card bg-mint p-4 shadow-sm"
            >
              <Character id="seyla" expression={seylaMood} size="md" />
              <span className="relative min-w-0 flex-1 rounded-card rounded-ss-none bg-surface px-4 py-3 text-sm font-bold leading-7 text-text shadow-xs">
                {topNudge?.message ?? COPY.home.askSeyla}
              </span>
            </Link>

            <Reveal>
              <Card chunky className="flex flex-col gap-3">
                <div className="flex items-center gap-4">
                  <ProgressRing
                    value={d.totalProgress}
                    size={76}
                    stroke={8}
                    label={COPY.home.totalProgress}
                  />
                  <div className="grid flex-1 grid-cols-3 gap-2 text-center">
                    <Stat label={COPY.home.inProgress} value={d.counts.inProgress} />
                    <Stat label={COPY.home.fresh} value={d.counts.new} />
                    <Stat label={COPY.home.completed} value={d.counts.completed} />
                  </div>
                </div>
                <Link
                  to="/cards"
                  className="pressable flex min-h-12 items-center justify-between rounded-card bg-mint px-3 text-text"
                >
                  <span className="flex items-center gap-2 text-sm font-bold">
                    <Trophy className="size-5 text-primary" aria-hidden />
                    {COPY.home.yourPoints}
                  </span>
                  <CoinChip value={d.pointsBalance} />
                </Link>
              </Card>
            </Reveal>

            {d.counts.overdue > 0 && (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-card border border-danger/30 bg-danger-light p-3 text-sm text-danger-fg"
              >
                <BellRing className="size-5" aria-hidden />
                {LINES.overdueWarning(toPersianDigits(d.counts.overdue))}
              </div>
            )}

            <Reveal
              as="section"
              aria-labelledby="my-trainings"
              className="flex flex-col gap-3"
              delayMs={60}
            >
              <div className="flex items-center justify-between">
                <h2 id="my-trainings" className="display text-xl text-text">
                  {COPY.home.myTraining}
                </h2>
                <Link
                  to="/learn"
                  className="flex min-h-12 items-center gap-0.5 px-2 text-sm font-bold text-primary"
                >
                  {COPY.home.allFilter}
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
            </Reveal>
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
