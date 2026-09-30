import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Activity, Flame, PhoneCall, Target, TrendingDown, TrendingUp } from 'lucide-react';
import { Skeleton } from '@/components/ui';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { qk } from '@/lib/queries';
import { track } from '@/lib/telemetry';
import type { MentorBrief, Momentum } from '@/lib/types';
import { VoiceCallSheet } from './VoiceCallSheet';

/**
 * The behaviour brief the mentor computed for this marketer («کجای مسیر هستم و الان چه کار کنم؟»).
 * The numbers come from the deterministic engine; the wording is short on purpose — the depth is
 * one tap away in the chat or the voice call.
 */
const MOMENTUM: Record<Momentum, { label: string; tone: string; icon: typeof Activity }> = {
  new: { label: 'تازه شروع کرده‌ای', tone: 'text-info-fg', icon: Activity },
  excelling: { label: 'عالی پیش می‌روی', tone: 'text-success-fg', icon: TrendingUp },
  on_track: { label: 'در مسیر درستی هستی', tone: 'text-success-fg', icon: Target },
  slowing: { label: 'کمی کند شده‌ای', tone: 'text-warning-fg', icon: TrendingDown },
  at_risk: { label: 'خطر از دست دادن ددلاین', tone: 'text-danger-fg', icon: TrendingDown },
  stalled: { label: 'مدتی است متوقف شده‌ای', tone: 'text-danger-fg', icon: TrendingDown },
};

export function MentorBriefCard({ packageId = null }: { packageId?: string | null }) {
  const [callOpen, setCallOpen] = useState(false);
  const brief = useQuery({
    queryKey: qk.behavior,
    queryFn: ({ signal }) => api.get<MentorBrief>('/me/mentor/behavior', signal),
    staleTime: 60_000,
  });

  if (brief.isPending)
    return (
      <div className="mb-3 space-y-2">
        <Skeleton className="h-20 w-full" />
      </div>
    );
  if (!brief.data) return null;

  const b = brief.data;
  const meta = MOMENTUM[b.state.momentum] ?? MOMENTUM.on_track;
  const Icon = meta.icon;
  const top = b.interventions.slice(0, 2);

  return (
    <section
      aria-label="وضعیت یادگیری من"
      className="mb-3 rounded-card border border-border bg-surface p-3 text-sm"
    >
      <div className="flex items-center justify-between gap-2">
        <p className={cn('flex items-center gap-2 font-bold', meta.tone)}>
          <Icon className="size-4" aria-hidden />
          {meta.label}
        </p>
        {b.state.streakDays > 0 && (
          <span className="flex items-center gap-1 text-xs text-text-secondary">
            <Flame className="size-4 text-warning" aria-hidden /> {b.state.streakDays} روز پیوسته
          </span>
        )}
      </div>

      <p className="mt-1 text-xs text-text-secondary">{b.state.reason}</p>

      <div className="mt-2 grid grid-cols-2 gap-3 text-xs text-text-secondary">
        <div>
          <p>سلامت مسیر: {b.state.health}٪</p>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-border">
            <div
              className="h-full rounded-full bg-success"
              style={{ width: `${b.state.health}%` }}
            />
          </div>
        </div>
        <div>
          <p>فشار زمانی: {b.state.pressure}٪</p>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-border">
            <div
              className={cn(
                'h-full rounded-full',
                b.state.pressure >= 70 ? 'bg-danger' : 'bg-warning',
              )}
              style={{ width: `${b.state.pressure}%` }}
            />
          </div>
        </div>
      </div>

      {b.nextAction && (
        <Link
          to={b.nextAction.actionRef ?? '/'}
          className="mt-3 flex min-h-12 items-center justify-between rounded-card bg-primary-light px-3 text-sm font-bold text-primary"
        >
          <span>{b.nextAction.label}</span>
          <span aria-hidden>‹</span>
        </Link>
      )}

      {top.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs text-text-secondary">
          {top.map((i) => (
            <li key={i.refKey}>• {i.message}</li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={() => {
          setCallOpen(true);
          track('mentor_voice_opened', { context: 'brief' });
        }}
        className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-card border border-primary/30 text-sm font-bold text-primary"
      >
        <PhoneCall className="size-4" aria-hidden /> تماس صوتی با منتور
      </button>

      {callOpen && <VoiceCallSheet packageId={packageId} onClose={() => setCallOpen(false)} />}
    </section>
  );
}
