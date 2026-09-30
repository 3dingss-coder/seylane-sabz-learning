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
import { PageHeader } from '@/components/common/PageHeader';
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
                      ? `آموزش برند ${p.brand.name}`
                      : undefined
                }
              />
              <Card className="flex gap-4 bg-soft-brand">
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
                      <span className="text-text-secondary">مهلت: {faDate(p.deadlineAt)}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <ProgressBar value={p.percent} label="پیشرفت بسته" className="flex-1" />
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
              {current && (
                <Button
                  size="lg"
                  block
                  icon={<PlayCircle className="size-5" aria-hidden />}
                  onClick={() =>
                    nav(
                      current.state === 'quiz' ? `/quiz/${current.id}` : `/sections/${current.id}`,
                    )
                  }
                >
                  {current.state === 'quiz'
                    ? 'شروع آزمون قسمت'
                    : current.state === 'in_progress'
                      ? 'ادامه قسمت فعلی'
                      : 'شروع قسمت'}
                </Button>
              )}
            </div>
            <section aria-labelledby="sections-title" className="flex flex-col gap-2 lg:w-96">
              <h2 id="sections-title" className="text-base font-bold text-text">
                قسمت‌ها ({toPersianDigits(live.length)})
              </h2>
              {live.length === 0 ? (
                <EmptyState
                  title="این بسته هنوز قسمتی ندارد"
                  description="به مدیر اطلاع داده شد."
                />
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
          {s.mediaType === 'audio' ? 'صوتی' : 'ویدیو'} • {faDuration(s.durationSec)}
          {s.percent > 0 && s.state !== 'completed' && ` • ${faPercent(s.percent)} دیده شده`}
        </p>
        {locked && (
          <p className="mt-0.5 text-xs text-muted-fg">
            {s.lockReason ?? 'ابتدا قسمت قبل را کامل کنید.'}
          </p>
        )}
      </div>
      <StatusBadge status={s.state} />
    </div>
  );
  if (locked)
    return (
      <li title="ابتدا قسمت قبل را کامل کنید">
        <div aria-disabled="true">{body}</div>
      </li>
    );
  return (
    <li className="flex flex-col gap-1">
      <Link to={`/sections/${s.id}`} data-testid="section-row">
        {body}
      </Link>
      {!s.quizPassed && s.quizId && (
        <Link
          to={`/quiz/${s.id}`}
          className="pressable flex min-h-12 items-center justify-center gap-2 rounded-card border border-info/30 bg-info-light text-sm font-bold text-info-fg hover:shadow-sm"
        >
          <ClipboardCheck className="size-4" aria-hidden /> آزمون این قسمت
        </Link>
      )}
    </li>
  );
}
