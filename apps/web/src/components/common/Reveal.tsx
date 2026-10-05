import { useEffect, useRef, useState, type ElementType, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { motionArmed, motionOff } from '@/lib/motion';

/**
 * Scroll-in wrapper (PHASE-5). Content is visible immediately when motion is off or before the
 * first interaction (cold-load calm — docs/DESIGN-REFRESH.md §6), so this never hides information
 * and never costs a frame on first paint.
 */
export function Reveal({
  children,
  className,
  as: Tag = 'div',
  delayMs = 0,
}: {
  children: ReactNode;
  className?: string;
  as?: ElementType;
  delayMs?: number;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const skip = motionOff() || !motionArmed();
  const [shown, setShown] = useState(skip);

  useEffect(() => {
    if (shown) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.05 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [shown]);

  return (
    <Tag
      ref={ref}
      className={cn(shown ? 'reveal-in' : 'reveal', className)}
      style={delayMs ? { transitionDelay: `${delayMs}ms` } : undefined}
    >
      {children}
    </Tag>
  );
}
