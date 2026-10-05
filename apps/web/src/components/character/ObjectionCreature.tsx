import { LINES } from '@/lib/copy/fa';
import { cn } from '@/lib/cn';
import { OBJECTIONS, type ObjectionId } from './data';

/**
 * PHASE-2 §2.3 — the six objection creatures.
 *
 * They are round, neutral-coloured (#CBD5E1 body / #64748B detail) so they never steal the reward
 * palette, and when the marketer plays the winning move they do NOT die: they shrink and calm down
 * (`state="calm"`), because an objection is information, not an enemy.
 */

const BODY = '#cbd5e1';
const DETAIL = '#64748b';

/** One small prop per creature, so 64px is still enough to tell them apart. */
function Prop({ id }: { id: ObjectionId }) {
  const s = { stroke: DETAIL, strokeWidth: 2, fill: 'none', strokeLinecap: 'round' as const };
  switch (id) {
    case 'gholombe':
      return <circle cx={32} cy={40} r={7} {...s} />;
    case 'soukhte':
      return <path d="M32 33 q6 6 0 13 q-6 -7 0 -13Z" {...s} />;
    case 'ajaleh':
      return (
        <g {...s}>
          <circle cx={32} cy={40} r={7} />
          <path d="M32 36 v4 l3 2" />
        </g>
      );
    case 'vafadar':
      return <rect x={25} y={34} width={14} height={12} rx={3} {...s} />;
    case 'shakkak':
      return (
        <g {...s}>
          <circle cx={30} cy={38} r={6} />
          <path d="M35 43 l5 5" />
        </g>
      );
    case 'dosar':
      return (
        <g {...s}>
          <circle cx={28} cy={38} r={4} />
          <circle cx={37} cy={41} r={4} />
        </g>
      );
  }
}

export function ObjectionCreature({
  id,
  state = 'active',
  size = 64,
  className,
}: {
  id: ObjectionId;
  state?: 'active' | 'calm';
  size?: number;
  className?: string;
}) {
  const o = OBJECTIONS.find((x) => x.id === id);
  const calm = state === 'calm';
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      role="img"
      aria-label={LINES.objectionLabel(o?.says ?? '', calm)}
      className={cn(calm && 'opacity-90', className)}
    >
      <ellipse
        cx={32}
        cy={58}
        rx={16}
        ry={2.6}
        fill="#0f172a"
        className="opacity-[0.08] dark:opacity-[0.16]"
      />
      <g
        className={calm ? 'animate-settle' : 'animate-bob'}
        style={{ transformOrigin: '32px 40px', transform: calm ? 'scale(0.82)' : undefined }}
      >
        {/* everyone is round — nobody here is a real enemy */}
        <circle cx={32} cy={38} r={20} fill={BODY} stroke={DETAIL} strokeWidth={2} />
        <Prop id={id} />
        {calm ? (
          <g stroke={DETAIL} strokeWidth={2} strokeLinecap="round" fill="none">
            <path d="M23 27 q3 -3 6 0" />
            <path d="M35 27 q3 -3 6 0" />
            <path d="M27 20 q5 3 10 0" />
          </g>
        ) : (
          <g stroke={DETAIL} strokeWidth={2} strokeLinecap="round" fill="none">
            <circle cx={26} cy={27} r={1.8} fill={DETAIL} stroke="none" />
            <circle cx={38} cy={27} r={1.8} fill={DETAIL} stroke="none" />
            <path d="M21 20 l7 3 M43 20 l-7 3" />
          </g>
        )}
      </g>
    </svg>
  );
}
