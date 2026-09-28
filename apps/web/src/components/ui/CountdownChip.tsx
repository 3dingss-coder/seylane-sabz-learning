import { useEffect, useState } from 'react';
import { AlarmClock, Clock } from 'lucide-react';
import { cn } from '@/lib/cn';
import { getCountdown, type CountdownTone } from '@/lib/countdown';

export interface CountdownChipProps {
  deadline: Date | string | number;
  warningHours?: readonly [number, number];
  className?: string;
  /** Injected clock for tests/storybook. */
  now?: number;
}

// Meaning via icon + text, not color alone (§16.8).
const STYLES: Record<CountdownTone, string> = {
  normal: 'bg-background text-text-secondary border-border',
  warning: 'bg-warning-light text-warning border-warning/30',
  danger: 'bg-danger-light text-danger border-danger/30',
  overdue: 'bg-danger text-white border-danger',
};

const PREFIX: Record<CountdownTone, string> = {
  normal: 'مهلت',
  warning: 'مهلت نزدیک',
  danger: 'فوری',
  overdue: 'مهلت گذشته',
};

export function CountdownChip({ deadline, warningHours, className, now }: CountdownChipProps) {
  const [tick, setTick] = useState(() => now ?? Date.now());
  useEffect(() => {
    if (now !== undefined) return;
    const id = window.setInterval(() => setTick(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [now]);

  const state = getCountdown(deadline, now ?? tick, warningHours);
  const Icon = state.tone === 'normal' ? Clock : AlarmClock;

  return (
    <span
      role="timer"
      aria-live="off"
      aria-label={state.spoken}
      className={cn(
        'inline-flex min-h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-bold',
        STYLES[state.tone],
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      <span>{PREFIX[state.tone]}</span>
      {state.tone !== 'overdue' && <span className="num-latin">{state.short}</span>}
    </span>
  );
}
