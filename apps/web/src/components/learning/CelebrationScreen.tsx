import type { ReactNode } from 'react';
import { Button, Card, CoinChip, Confetti, CountUp, StreakChip } from '@/components/ui';
import { MascotAvatar } from '@/components/brand/MascotAvatar';
import { COPY, LINES } from '@/lib/copy/fa';
import { faNumber } from '@/lib/format';

export interface CelebrationScreenProps {
  title: string;
  subtitle?: string;
  /** Shown with CountUp; hidden when 0 (no celebration without a real gain). */
  pointsEarned?: number;
  streakDays?: number;
  /** Anything that belongs above the number (score ring, badge art…). */
  badge?: ReactNode;
  actionLabel: string;
  onAction: () => void;
  /** Below the fold: review list, next steps… */
  children?: ReactNode;
  /** Test hook; pages that already own a testid keep it (e.g. quiz-result). */
  testId?: string;
}

/**
 * CelebrationScreen (PHASE-4 §4.7) — the peak moment, and only for a real achievement
 * (package complete / quiz passed / mastery). Order: confetti → mascot → number → chips → one CTA.
 * All animation is transform/opacity and finishes under 1.8s (M-02).
 */
export function CelebrationScreen({
  title,
  subtitle,
  pointsEarned = 0,
  streakDays,
  badge,
  actionLabel,
  onAction,
  children,
  testId = 'celebration',
}: CelebrationScreenProps) {
  return (
    <div className="flex flex-col gap-4">
      <Card
        tone="brand"
        chunky
        data-testid={testId}
        className="relative flex flex-col items-center gap-2 overflow-hidden py-8 text-center"
      >
        <Confetti />
        <MascotAvatar size={96} className="animate-pop" alt={COPY.celebrate.happyAlt} />
        {badge}
        <h2 className="mt-1 text-xl font-extrabold text-text">{title}</h2>
        {subtitle && <p className="max-w-xs text-sm text-text-secondary">{subtitle}</p>}
        {pointsEarned > 0 && (
          <p
            className="mt-1 text-3xl font-extrabold text-primary-800"
            aria-label={LINES.pointsEarned(faNumber(pointsEarned))}
          >
            <span aria-hidden>
              +<CountUp value={pointsEarned} format={(n) => faNumber(n)} />
            </span>
            <span className="ms-1 text-sm font-bold text-text-secondary">
              {COPY.celebrate.pointsUnit}
            </span>
          </p>
        )}
        {streakDays ? (
          <div className="stagger mt-1 flex flex-wrap items-center justify-center gap-2">
            <StreakChip count={streakDays} className="px-3 py-1 text-sm" />
            {pointsEarned > 0 && <CoinChip value={pointsEarned} className="px-3 py-1 text-sm" />}
          </div>
        ) : null}
        <Button size="lg" variant="cta" className="mt-4 min-w-52" onClick={onAction}>
          {actionLabel}
        </Button>
      </Card>
      {children}
    </div>
  );
}
