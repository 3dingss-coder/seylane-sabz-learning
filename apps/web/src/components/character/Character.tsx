import { cn } from '@/lib/cn';
import { Brows, Eyes, Mouth, GroundShadow } from './parts';
import { BODY_MOTION, FACE } from './data';
import { BahramBody, GolnarBody, KamranBody, RahaBody, SiminBody } from './bodies';
import { CHARACTER_NAME, SIZE_PX, type CharacterProps, type Expression } from './types';

const INK = '#0f172a';

/** Persian label for each expression — the accessible name must say the state, not the id. */
const EXPRESSION_FA: Record<Expression, string> = {
  idle: 'آرام',
  happy: 'خوشحال',
  celebrate: 'در حال جشن',
  thinking: 'در حال فکر',
  worried: 'نگرانِ مهلت',
  proud: 'سرافراز',
  nudge: 'دعوت ملایم',
  empathy: 'همدل',
};

const HUMAN_BODY = {
  raha: RahaBody,
  kamran: KamranBody,
  simin: SiminBody,
  bahram: BahramBody,
  golnar: GolnarBody,
} as const;

/**
 * PHASE-2 §2.5.3 — one contract for the whole cast (decision D-100: layered SVG, Rive-ready).
 *
 * Seyla is the official brand render and is used *as it is* (§2.5.4): her state is carried by
 * motion and by the crest that grows with mastery (C-07), never by redrawing the bird.
 * The five humans are drawn from the shared face rig, so 5×8 states stay visually one family.
 */
export function Character({
  id,
  expression = 'idle',
  speech,
  size = 'md',
  mastery = 0,
  className,
}: CharacterProps) {
  const px = SIZE_PX[size];
  const label = speech
    ? `${CHARACTER_NAME[id]} می‌گوید: ${speech}`
    : `${CHARACTER_NAME[id]}، حالت ${EXPRESSION_FA[expression]}`;

  return (
    <div className={cn('flex items-end gap-2', className)} style={{ maxWidth: px * 3 }}>
      <div className="relative shrink-0" style={{ width: px, height: px * 1.25 }}>
        {id === 'seyla' ? (
          <>
            <img
              src="/brand/mascot.png"
              alt=""
              aria-hidden
              width={px}
              height={px * 1.25}
              className={cn('size-full object-contain', BODY_MOTION[expression])}
            />
            <Crest mastery={mastery} width={px * 0.42} />
          </>
        ) : (
          <svg
            viewBox="0 0 96 120"
            width={px}
            height={px * 1.25}
            role="img"
            aria-label={label}
            className="overflow-visible"
          >
            <GroundShadow />
            <g className={BODY_MOTION[expression]} style={{ transformOrigin: '48px 90px' }}>
              <Body id={id} />
              <Face id={id} expression={expression} />
            </g>
          </svg>
        )}
      </div>
      {speech && (
        <div className="min-w-0 flex-1">
          {/* the speaker is named ABOVE the bubble, so the bubble text stays the pure quote */}
          <span className="mb-1 block text-[11px] font-extrabold text-text-secondary">
            {CHARACTER_NAME[id]}
          </span>
          <p
            aria-live="polite"
            className="rounded-card rounded-ss-none border-2 border-mint bg-mint px-3.5 py-2.5 text-sm font-bold leading-7 text-text"
          >
            {speech}
          </p>
        </div>
      )}
      {id === 'seyla' && !speech && <span className="sr-only">{label}</span>}
    </div>
  );
}

function Body({ id }: { id: Exclude<CharacterProps['id'], 'seyla'> | CharacterProps['id'] }) {
  if (id === 'seyla') return null;
  const Cmp = HUMAN_BODY[id as keyof typeof HUMAN_BODY];
  return <Cmp />;
}

function Face({
  id,
  expression,
}: {
  id: CharacterProps['id'];
  expression: Expression;
}) {
  if (id === 'seyla') return null;
  const geo = FACE[id as keyof typeof FACE];
  return (
    <g>
      <Eyes expression={expression} {...geo} ink={INK} />
      <Brows expression={expression} {...geo} ink={INK} />
      <Mouth expression={expression} {...geo} ink={INK} />
    </g>
  );
}

/**
 * Seyla's crest is the mastery meter (C-07): 0 = a small bud, 3 = the full three-feather crest.
 * Drawn over the official render — the bird itself is never modified.
 */
function Crest({ mastery, width }: { mastery: 0 | 1 | 2 | 3; width: number }) {
  const feathers = [0, 1, 2].filter((i) => i < Math.max(1, mastery));
  return (
    <svg
      viewBox="0 0 40 24"
      width={width}
      height={width * 0.6}
      className="absolute -top-1 start-1/2 -translate-x-1/2"
      aria-hidden
    >
      {feathers.map((i) => {
        const h = 8 + mastery * 4 - i * 1.5;
        const x = 12 + i * 8;
        return (
          <path
            key={i}
            d={`M ${x} 22 Q ${x - 3} ${22 - h} ${x + 1} ${22 - h - 3} Q ${x + 4} ${22 - h} ${x + 3} 22 Z`}
            fill="#c55d41"
            stroke="#8a3423"
            strokeWidth={1.5}
            strokeLinejoin="round"
            className={mastery >= 3 ? 'animate-grow-y' : undefined}
            style={{ transformOrigin: `${x}px 22px` }}
          />
        );
      })}
    </svg>
  );
}
