import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { useMountedFlag } from '@/lib/motion';

export interface ProgressRingProps {
  /** 0–100 (clamped). */
  value: number;
  size?: number;
  stroke?: number;
  label: string;
  className?: string;
  /** Color by meaning (§16.1): primary for progress, success when complete. */
  tone?: 'primary' | 'success' | 'warning' | 'danger';
  /** Replaces the default «NN%» centre label. */
  center?: ReactNode;
}

const TONES = {
  primary: 'text-primary',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
} as const;

export function ProgressRing({
  value,
  size = 64,
  stroke = 6,
  label,
  className,
  tone,
  center,
}: ProgressRingProps) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const resolvedTone = tone ?? (pct >= 100 ? 'success' : 'primary');
  // the arc fills from empty on first paint (CSS transition), then follows later changes
  const ready = useMountedFlag();
  const shownPct = ready ? pct : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className={cn('relative inline-flex items-center justify-center', className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-border/80"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          stroke="currentColor"
          strokeDasharray={c}
          strokeDashoffset={c - (shownPct / 100) * c}
          className={cn(
            'transition-[stroke-dashoffset] duration-[900ms] ease-soft',
            TONES[resolvedTone],
          )}
        />
      </svg>
      {center ?? <span className="num-latin absolute text-sm font-bold text-text">{pct}%</span>}
    </div>
  );
}

/** Linear bar — package cards / table cells (§16.5). The fill slides in with transform only. */
export function ProgressBar({
  value,
  label,
  className,
}: {
  value: number;
  label: string;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  const ready = useMountedFlag();
  const rest = 100 - (ready ? pct : 0);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className={cn('h-4 w-full overflow-hidden rounded-pill bg-surface-2 shadow-xs', className)}
    >
      <div
        className={cn(
          // v4: thick bar, vivid leaf fill with a top highlight (PHASE-1 leaf/glow)
          'h-full w-full rounded-pill transition-transform duration-700 ease-soft [box-shadow:inset_0_3px_0_rgb(255_255_255/0.35)]',
          pct >= 100 ? 'bg-success' : 'bg-leaf',
        )}
        // RTL: the fill is anchored to the right edge, so the unfilled part slides out to the right
        style={{ transform: `translateX(${document.dir === 'ltr' ? -rest : rest}%)` }}
      />
    </div>
  );
}
