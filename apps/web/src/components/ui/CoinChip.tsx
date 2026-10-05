import { Coins } from 'lucide-react';
import { LINES } from '@/lib/copy/fa';
import { cn } from '@/lib/cn';
import { toPersianDigits } from '@/lib/digits';

/**
 * Design v3 (PHASE-1/§4.8): «سکهٔ توانمندی» chip.
 * Reward yellow is the exclusive color of points; label uses reward-fg at 7.43:1.
 */
export function CoinChip({ value, className }: { value: number; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-pill bg-reward px-2.5 py-0.5 text-xs font-extrabold text-reward-fg transition-transform duration-150 ease-spring hover:scale-105',
        className,
      )}
      aria-label={LINES.coinWalletLabel(toPersianDigits(value))}
    >
      <Coins className="size-3.5" aria-hidden />
      <span className="num-latin" dir="ltr">
        {value}
      </span>
    </span>
  );
}
