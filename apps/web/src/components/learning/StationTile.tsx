import { Link } from 'react-router-dom';
import { Check, Play } from 'lucide-react';
import { COPY, LINES } from '@/lib/copy/fa';
import { cn } from '@/lib/cn';
import { toPersianDigits } from '@/lib/digits';

export type StationState = 'done' | 'current' | 'upcoming';

export interface StationTileProps {
  /** 1-based station number shown inside the tile. */
  index: number;
  title: string;
  state: StationState;
  to: string;
  /** Small line under the title (duration, deadline, progress…). */
  meta?: string;
  /** Zigzag position of the tile inside the path column (PHASE-4 §4.5). */
  align?: 'start' | 'center' | 'end';
}

const ALIGN = { start: 'self-start', center: 'self-center', end: 'self-end' } as const;

/**
 * PathScreen tile (PHASE-4 §4.5): a 72px circular station on the learning path.
 * State is derived from real package status — there is no invented "locked" state,
 * because the product gates sections inside a package, not packages themselves.
 */
export function StationTile({ index, title, state, to, meta, align = 'center' }: StationTileProps) {
  return (
    <Link
      to={to}
      aria-current={state === 'current' ? 'step' : undefined}
      className={cn(
        'lift group flex w-full max-w-[19rem] items-center gap-3 rounded-card p-1 text-start',
        ALIGN[align],
      )}
    >
      <span
        className={cn(
          'relative flex size-[4.5rem] shrink-0 items-center justify-center rounded-station border-2 text-lg font-extrabold transition-transform duration-300 ease-spring group-hover:scale-[1.04]',
          state === 'done' && 'border-primary bg-primary-light text-primary',
          state === 'current' &&
            'border-green-lip bg-primary text-on-primary [box-shadow:var(--lip-md)]',
          state === 'upcoming' && 'border-chunk-border bg-surface text-text-secondary',
        )}
      >
        {state === 'done' ? (
          <Check className="size-7" aria-hidden />
        ) : state === 'current' ? (
          <Play className="size-7" aria-hidden />
        ) : (
          <span className="num-latin">{index}</span>
        )}
        {state === 'current' && (
          <span
            aria-hidden
            className="animate-pulse-dot absolute inset-0 rounded-station border-2 border-leaf-glow"
          />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            'line-clamp-2 block text-sm font-bold leading-6',
            state === 'upcoming' ? 'text-text-secondary' : 'text-text',
          )}
        >
          {title}
        </span>
        <span className="mt-0.5 block text-xs text-text-secondary">
          {state === 'done'
            ? COPY.path.done
            : state === 'current'
              ? COPY.path.yourTurn
              : COPY.path.nextStation}
          {meta ? ` • ${meta}` : ''}
          <span className="sr-only">{LINES.stationIndex(toPersianDigits(index))}</span>
        </span>
      </span>
    </Link>
  );
}
