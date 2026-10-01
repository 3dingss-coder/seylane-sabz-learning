import { useCountUp } from '@/lib/motion';

/** A number that counts up from 0 once (respects reduced motion). `format` keeps Persian digits. */
export function CountUp({
  value,
  format = (n) => String(n),
  durationMs,
}: {
  value: number;
  format?: (n: number) => string;
  durationMs?: number;
}) {
  const shown = useCountUp(value, durationMs);
  return <>{format(Math.round(shown))}</>;
}
