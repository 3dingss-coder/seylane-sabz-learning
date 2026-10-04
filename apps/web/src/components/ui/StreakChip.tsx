import { Flame } from 'lucide-react';
import { cn } from '@/lib/cn';
import { toPersianDigits } from '@/lib/digits';

/**
 * Design v3 (PHASE-1/§4.8): streak («پیوستگی») chip.
 * Crest red is fill/icon only; the label sits on the light tint at 6.93:1 (contrast gate).
 */
export function StreakChip({ count, className }: { count: number; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-pill bg-streak-100 px-2.5 py-0.5 text-xs font-extrabold text-streak-deep',
        className,
      )}
      aria-label={`پیوستگی ${toPersianDigits(count)} روز`}
    >
      <Flame className="size-3.5 text-streak" aria-hidden />
      <span className="num-latin" dir="ltr">
        {count}
      </span>
    </span>
  );
}
