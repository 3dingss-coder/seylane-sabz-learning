import { toPersianDigits } from '@/lib/digits';
import { cn } from '@/lib/cn';

/** Unread/new counter: pops in when the number changes and pulses softly while non-zero. */
export function CountBadge({
  count,
  srLabel,
  className,
}: {
  count: number;
  /** Screen-reader suffix, e.g. " پیام خوانده‌نشده". */
  srLabel?: string;
  className?: string;
}) {
  if (count <= 0) return null;
  return (
    <span className={cn('absolute flex', className)}>
      <span aria-hidden className="animate-pulse-dot absolute inset-0 rounded-full bg-danger" />
      <span
        key={count}
        className="animate-pop relative flex min-w-[18px] items-center justify-center rounded-full border-2 border-surface bg-danger px-1 text-[10px] font-bold leading-[14px] text-on-danger"
      >
        {toPersianDigits(count > 99 ? 99 : count)}
        {srLabel && <span className="sr-only">{srLabel}</span>}
      </span>
    </span>
  );
}
