import { cn } from '@/lib/cn';

export interface ProgressRingProps {
  /** 0–100 (clamped). */
  value: number;
  size?: number;
  stroke?: number;
  label: string;
  className?: string;
  /** Color by meaning (§16.1): primary for progress, success when complete. */
  tone?: 'primary' | 'success' | 'warning';
}

const TONES = {
  primary: 'text-primary',
  success: 'text-success',
  warning: 'text-warning',
} as const;

export function ProgressRing({
  value,
  size = 64,
  stroke = 6,
  label,
  className,
  tone,
}: ProgressRingProps) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const resolvedTone = tone ?? (pct >= 100 ? 'success' : 'primary');
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
          className="stroke-border"
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
          strokeDashoffset={c - (pct / 100) * c}
          className={cn('transition-[stroke-dashoffset] duration-500', TONES[resolvedTone])}
        />
      </svg>
      <span className="num-latin absolute text-sm font-bold text-text">{pct}%</span>
    </div>
  );
}

/** Linear bar — package cards / table cells (§16.5). */
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
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className={cn('h-2 w-full overflow-hidden rounded-full bg-border', className)}
    >
      <div
        className={cn(
          'h-full rounded-full transition-[width] duration-500',
          pct >= 100 ? 'bg-success' : 'bg-primary',
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
