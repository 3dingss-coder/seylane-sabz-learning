import { useMemo, type CSSProperties } from 'react';
import { cn } from '@/lib/cn';
import { motionOff } from '@/lib/motion';

const COLORS = ['bg-primary', 'bg-accent', 'bg-info', 'bg-primary-300', 'bg-danger'] as const;

/**
 * Light CSS-only confetti (no library): ~28 pieces that fall once and fade.
 * Decorative (aria-hidden), pointer-events-none, transform/opacity only; renders nothing when the
 * user prefers reduced motion.
 */
export function Confetti({ count = 28, className }: { count?: number; className?: string }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        // deterministic pseudo-random spread (stable across re-renders, no Math.random in render)
        const r = (k: number) => ((Math.sin((i + 1) * k) + 1) / 2) % 1;
        return {
          left: `${Math.round(r(12.9898) * 100)}%`,
          dx: `${Math.round((r(78.233) - 0.5) * 120)}px`,
          dy: `${180 + Math.round(r(37.719) * 140)}px`,
          rot: `${Math.round((r(4.1414) - 0.5) * 1080)}px`.replace('px', 'deg'),
          delay: `${Math.round(r(93.989) * 280)}ms`,
          color: COLORS[i % COLORS.length],
          round: i % 3 === 0,
        };
      }),
    [count],
  );
  if (motionOff()) return null;
  return (
    <div aria-hidden className={cn('pointer-events-none absolute inset-x-0 top-0 h-0', className)}>
      {pieces.map((p, i) => (
        <span
          key={i}
          className={cn(
            'animate-confetti absolute top-0 block h-2.5 w-1.5',
            p.color,
            p.round ? 'rounded-full' : 'rounded-[2px]',
          )}
          style={
            {
              left: p.left,
              animationDelay: p.delay,
              '--dx': p.dx,
              '--dy': p.dy,
              '--rot': p.rot,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
