import { useNavigate } from 'react-router-dom';
import { Button, CoinChip, ProgressRing, StreakChip } from '@/components/ui';
import { StationTile, type StationState } from './StationTile';
import { COPY } from '@/lib/copy/fa';
import { faDuration } from '@/lib/format';
import type { PackageSummary } from '@/lib/types';

export interface PathScreenProps {
  packages: PackageSummary[];
  points: number;
  /** Real streak from /me/mentor/behavior; the chip is hidden when it is 0. */
  streakDays?: number;
  totalProgress: number;
}

const ALIGN: Array<'start' | 'center' | 'end'> = ['end', 'center', 'start'];

/**
 * PathScreen (PHASE-4 §4.5) — the visual replacement for the flat list of trainings.
 *
 * Honest-data rule: station state comes from the real package status
 * (completed → done, in_progress → current, new → upcoming). Nothing is invented and
 * no package is shown as "locked", because gating in this product happens per section.
 */
export function PathScreen({ packages, points, streakDays, totalProgress }: PathScreenProps) {
  const nav = useNavigate();
  const currentIdx = Math.max(
    packages.findIndex((p) => p.status === 'in_progress'),
    packages.findIndex((p) => p.status === 'new'),
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-center gap-2">
        <CoinChip value={points} />
        {streakDays ? <StreakChip count={streakDays} /> : null}
        {/* div (not span): ProgressRing renders a div with role="progressbar" */}
        <div className="inline-flex items-center gap-1.5 rounded-pill bg-mint px-2.5 py-1 text-xs font-extrabold text-primary-800">
          <ProgressRing
            value={totalProgress}
            size={20}
            stroke={4}
            label={COPY.path.totalProgress}
          />
        </div>
      </div>

      <ol
        className="mx-auto flex w-full max-w-md flex-col items-stretch gap-1"
        aria-label={COPY.path.pathLabel}
      >
        {packages.map((p, i) => {
          const state: StationState =
            p.status === 'completed' ? 'done' : i === currentIdx ? 'current' : 'upcoming';
          return (
            <li key={p.id} className="flex flex-col items-stretch">
              <StationTile
                index={i + 1}
                title={p.title}
                state={state}
                to={`/packages/${p.id}`}
                meta={`${p.brand?.name ?? ''} • ${faDuration(p.totalDurationSec)}`}
                align={ALIGN[i % ALIGN.length] ?? 'center'}
              />
              {i < packages.length - 1 && (
                <span
                  aria-hidden
                  className="mx-auto h-5 border-s-2 border-dashed border-chunk-border"
                />
              )}
            </li>
          );
        })}
      </ol>

      {currentIdx >= 0 && (
        <Button
          size="lg"
          block
          variant="cta"
          className="mx-auto w-full max-w-md"
          onClick={() => nav(`/packages/${packages[currentIdx]?.id}`)}
        >
          {COPY.path.continuePath}
        </Button>
      )}
    </div>
  );
}
