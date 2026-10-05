import { Link, useNavigate, useParams } from 'react-router-dom';
import { ClipboardCheck, Headphones, Lock, MessageSquareQuote, PlayCircle } from 'lucide-react';
import {
  Button,
  Card,
  CountdownChip,
  EmptyState,
  ProgressBar,
  Skeleton,
  StatusBadge,
} from '@/components/ui';
import { COPY, LINES } from '@/lib/copy/fa';
import { PageHeader } from '@/components/common/PageHeader';
import { Character } from '@/components/character/Character';
import { ProductImage } from '@/components/common/ProductImage';
import { QueryState } from '@/components/common/QueryState';
import { MentorLauncher } from '@/components/learning/MentorSheet';
import { cn } from '@/lib/cn';
import { toPersianDigits } from '@/lib/digits';
import { faDate, faDuration, faPercent } from '@/lib/format';
import { usePackage } from '@/lib/queries';
import type { SectionView } from '@/lib/types';

/** M5 — صفحه بسته: header, manager notes banner, section list with lock/status, one CTA. */
export function PackagePage() {
  const { id = '' } = useParams();
  const q = usePackage(id);
  const nav = useNavigate();
  return (
    <QueryState
      query={q}
      loading={
        <div className="flex flex-col gap-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      }
    >
      {({ package: p, sections, notes }) => {
        const live = sections.filter((s) => !s.archived);
        const quizSection = live.find((s) => s.quizRequired !== false && s.quizId);
        const current = live.find((s) => s.state !== 'completed' && s.state !== 'locked');
        return (
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
            <div className="flex flex-col gap-4 lg:flex-1">
              <PageHeader
                title={p.title}
                back="/learn"
                subtitle={
                  p.product
                    ? `${p.brand?.name} • ${p.product.name}`
                    : p.brand
                      ? LINES.brandTraining(p.brand.name)
                      : undefined
                }
              />
              <Card className="flex gap-4 bg-soft-brand">
                {/* M5: Raha owns deep product knowledge — one plain line, no hype (§2.6) */}
                <Character
                  id="raha"
                  expression="idle"
                  size="sm"
                  speech={LINES.stationCount(toPersianDigits(live.length))}
                />
                <ProductImage
                  src={p.product?.imageUrl ?? p.brand?.logoUrl}
                  alt={p.product?.name ?? p.brand?.name ?? p.title}
                  className="size-24"
                />
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <p className="text-sm leading-7 text-text-secondary">{p.description}</p>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {p.status === 'completed' ? (
                      <StatusBadge status="completed" />
                    ) : (
                      p.deadlineAt && <CountdownChip deadline={p.deadlineAt} />
                    )}
                    {p.deadlineAt && (
                      <span className="text-text-secondary">
                        {LINES.deadlineOn(faDate(p.deadlineAt))}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <ProgressBar
                      value={p.percent}
                      label={COPY.pkg.progressLabel}
                      className="flex-1"
                    />
                    <span className="text-xs font-bold">{faPercent(p.percent)}</span>
                  </div>
                </div>
              </Card>
              {notes.length > 0 && (
                <div
                  role="note"
                  className="flex flex-col gap-2 rounded-card border border-warning/30 bg-warning-light p-3"
                >
                  {notes.slice(0, 2).map((n) => (
                    <p key={n.id} className="flex items-start gap-2 text-sm text-text">
                      <MessageSquareQuote
                        className="mt-0.5 size-4 shrink-0 text-warning"
                        aria-hidden
                      />
                      <span>
                        <b>{n.fromName}:</b> {n.body}
                      </span>
                    </p>
                  ))}
                </div>
              )}
              {quizSection && !quizSection.quizPassed && (
                <Link
                  to={`/quiz/${quizSection.id}`}
                  data-testid="package-quiz"
                  className="pressable flex min-h-14 items-center justify-center gap-2 rounded-card border border-info/30 bg-info-light text-base font-bold text-info-fg hover:shadow-sm"
                >
                  <ClipboardCheck className="size-5" aria-hidden /> {COPY.pkg.packageQuiz}
                </Link>
              )}
              {quizSection?.quizPassed && (
                <p className="rounded-card bg-success-light p-3 text-center text-sm font-bold text-success-fg">
                  {COPY.pkg.packageQuizPassed}
                </p>
              )}
              {current && (
                <Button
                  size="lg"
                  block
                  variant="cta"
                  icon={<PlayCircle className="size-5" aria-hidden />}
                  onClick={() =>
                    nav(
                      current.state === 'quiz' ? `/quiz/${current.id}` : `/sections/${current.id}`,
                    )
                  }
                >
                  {current.state === 'quiz'
                    ? COPY.pkg.startQuiz
                    : current.state === 'in_progress'
                      ? COPY.pkg.continueSection
                      : COPY.pkg.startSection}
                </Button>
              )}
            </div>
            <section aria-labelledby="sections-title" className="flex flex-col gap-2 lg:w-96">
              <h2 id="sections-title" className="text-base font-bold text-text">
                {LINES.mediaListHeading(toPersianDigits(live.length))}
              </h2>
              {live.length === 0 ? (
                <EmptyState title={COPY.pkg.emptyTitle} description={COPY.pkg.emptyDesc} />
              ) : (
                <ol className="stagger flex flex-col gap-2">
                  {live.map((s) => (
                    <SectionRow key={s.id} s={s} />
                  ))}
                </ol>
              )}
            </section>
            <MentorLauncher packageId={p.id} />
          </div>
        );
      }}
    </QueryState>
  );
}

function SectionRow({ s }: { s: SectionView }) {
  const locked = s.state === 'locked';
  const Icon = locked ? Lock : s.mediaType === 'audio' ? Headphones : PlayCircle;
  const body = (
    <div
      className={cn(
        'pressable flex items-center gap-3 rounded-card border bg-surface p-3 shadow-xs',
        locked
          ? 'border-dashed border-border opacity-70'
          : 'border-border hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md',
      )}
    >
      <span
        className={cn(
          'flex size-11 shrink-0 items-center justify-center rounded-card',
          locked ? 'bg-surface-2 text-muted-fg' : 'bg-primary-light text-primary',
        )}
      >
        <Icon className="size-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-sm font-bold text-text">
          {toPersianDigits(s.order)}. {s.title}
        </p>
        <p className="mt-0.5 text-xs text-text-secondary">
          {s.mediaType === 'audio' ? COPY.pkg.audio : COPY.pkg.video} • {faDuration(s.durationSec)}
          {s.percent > 0 && s.state !== 'completed' && LINES.percentWatched(faPercent(s.percent))}
        </p>
        {locked && (
          <p className="mt-0.5 text-xs text-muted-fg">{s.lockReason ?? COPY.pkg.lockedHint}</p>
        )}
      </div>
      <StatusBadge status={s.state} />
    </div>
  );
  if (locked)
    return (
      <li title={COPY.pkg.lockedHint}>
        <div aria-disabled="true">{body}</div>
      </li>
    );
  return (
    <li className="flex flex-col gap-1">
      <Link to={`/sections/${s.id}`} data-testid="section-row">
        {body}
      </Link>
    </li>
  );
}
