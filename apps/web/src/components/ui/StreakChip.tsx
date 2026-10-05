import { useEffect, useState } from 'react';
import { Flame } from 'lucide-react';
import { LINES } from '@/lib/copy/fa';
import { cn } from '@/lib/cn';
import { toPersianDigits } from '@/lib/digits';
import { playMoment } from '@/lib/sound';

const SEEN = 'ssl.streak.seen';

/**
 * Design v3 (PHASE-1/§4.8): streak («پیوستگی») chip.
 * Crest red is fill/icon only; the label sits on the light tint at 6.93:1 (contrast gate).
 */
export function StreakChip({ count, className }: { count: number; className?: string }) {
  // PHASE-5 §5.2 moment 4: the flame "catches" once per day — sound or haptic, never both,
  // and never again on the same day (M-04: one shining point, and no nagging).
  const [fresh, setFresh] = useState(false);
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    let last: string | null = null;
    try {
      last = localStorage.getItem(SEEN);
      localStorage.setItem(SEEN, today);
    } catch {
      return;
    }
    if (last !== today) {
      setFresh(true);
      playMoment('streakUp');
    }
  }, []);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-pill bg-streak-100 px-2.5 py-0.5 text-xs font-extrabold text-streak-deep transition-transform duration-150 ease-spring hover:scale-105',
        fresh && 'animate-pop',
        className,
      )}
      aria-label={LINES.streakDays(toPersianDigits(count))}
    >
      <Flame className="size-3.5 text-streak" aria-hidden />
      <span className="num-latin" dir="ltr">
        {count}
      </span>
    </span>
  );
}
