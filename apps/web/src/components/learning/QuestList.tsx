import { Award, Gift } from 'lucide-react';
import { cn } from '@/lib/cn';
import { toPersianDigits } from '@/lib/digits';
import { useGamification } from '@/lib/queries';
import type { ChestQuality } from '@/lib/types';
import { Card, ProgressBar } from '@/components/ui';

/**
 * PHASE-3 §3.6 — مأموریت امروز.
 *
 * Three quests, drawn from a pool that only contains kinds with a real trigger (no quest can be
 * impossible). The chest is a controlled variable reward: the contents per quality are fixed and
 * declared, only the quality is a surprise.
 */
const CHEST_FA: Record<ChestQuality, string> = {
  bronze: 'صندوق برنزی',
  silver: 'صندوق نقره‌ای',
  gold: 'صندوق طلایی',
};

/* §8.4.2 rule 1: semantic tokens only — the chest tiers reuse gated colour pairs
   (warning / border / reward) instead of three new decorative hexes. */
const CHEST_STYLE: Record<ChestQuality, string> = {
  bronze: 'bg-warning/25 text-accent-fg', // 5.41:1 — warn-fg on /25 was only 3.83:1
  silver: 'bg-border text-text-secondary',
  gold: 'bg-reward text-reward-fg',
};

export function QuestList() {
  const g = useGamification();
  const quests = g.data?.quests.quests ?? [];
  if (g.isLoading || quests.length === 0) return null;
  const done = g.data?.quests.completed ?? 0;

  return (
    <Card chunky className="flex flex-col gap-3" data-testid="quest-list">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-bold text-text">
          <Award className="size-4 text-reward-fg" aria-hidden />
          مأموریت امروز
        </h2>
        <span className="text-xs font-extrabold text-text-secondary">
          {toPersianDigits(done)} از {toPersianDigits(quests.length)}
        </span>
      </div>

      <div className="flex flex-col gap-2.5">
        {quests.map((q) => (
          <div key={q.kind} className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <p
                className={cn(
                  'min-w-0 flex-1 truncate text-sm font-bold',
                  q.done ? 'text-text-secondary line-through' : 'text-text',
                )}
              >
                {q.title}
              </p>
              {q.done && q.chest ? (
                <span
                  className={cn(
                    'inline-flex shrink-0 items-center gap-1 rounded-pill px-2 py-0.5 text-[11px] font-extrabold',
                    CHEST_STYLE[q.chest],
                  )}
                >
                  <Gift className="size-3" aria-hidden />
                  {CHEST_FA[q.chest]} +{toPersianDigits(q.chestCoins)}
                </span>
              ) : (
                <span className="shrink-0 text-[11px] font-extrabold text-text-secondary">
                  {toPersianDigits(q.progress)}/{toPersianDigits(q.target)} ·{' '}
                  {toPersianDigits(q.coinReward)} سکه
                </span>
              )}
            </div>
            <ProgressBar
              value={Math.round((q.progress / q.target) * 100)}
              label={q.title}
              className="h-2"
            />
          </div>
        ))}
      </div>
    </Card>
  );
}
