import type { Expression, FaceGeometry } from './types';

/**
 * The shared face rig (PHASE-2 §2.5.3).
 *
 * 6 characters × 8 expressions = 48 states, but they are NOT 48 drawings: every character
 * reuses these three part-sets and only changes silhouette, signature colour and prop. That is
 * what keeps the cast consistent (and the whole system a few KB instead of 48 assets).
 *
 * Hard visual rules (§2.5.4): no sharp corners (round joins/caps), one uniform 2px stroke at the
 * 96px reference, one soft ground ellipse, no blurry drop-shadow.
 */

const S = (g: FaceGeometry) => g.scale ?? 1;

export function Eyes({ expression, ...g }: FaceGeometry & { expression: Expression }) {
  const s = S(g);
  const x = g.spread * s;
  const y = g.eyeY;
  const stroke = { stroke: g.ink, strokeWidth: 2, strokeLinecap: 'round' as const, fill: 'none' };
  const dot = (cx: number) => <circle cx={cx} cy={y} r={2.6 * s} fill={g.ink} />;
  const happyArc = (cx: number) => (
    <path d={`M ${cx - 3.4 * s} ${y + 1 * s} Q ${cx} ${y - 3.2 * s} ${cx + 3.4 * s} ${y + 1 * s}`} {...stroke} />
  );
  const softArc = (cx: number) => (
    <path d={`M ${cx - 3.2 * s} ${y - 1 * s} Q ${cx} ${y + 2.4 * s} ${cx + 3.2 * s} ${y - 1 * s}`} {...stroke} />
  );

  switch (expression) {
    case 'happy':
    case 'celebrate':
    case 'proud':
      return (
        <g>
          {happyArc(-x)}
          {happyArc(x)}
          {expression === 'celebrate' && (
            <path
              d={`M ${x + 6 * s} ${y - 6 * s} l 0 4 M ${x + 4 * s} ${y - 4 * s} l 4 0`}
              stroke="#ffc800"
              strokeWidth={2}
              strokeLinecap="round"
            />
          )}
        </g>
      );
    case 'thinking':
      return (
        <g>
          {dot(-x)}
          <path d={`M ${x - 3 * s} ${y} l ${6 * s} 0`} {...stroke} />
        </g>
      );
    case 'nudge':
      return (
        <g>
          {dot(-x)}
          {happyArc(x)}
        </g>
      );
    case 'worried':
      return (
        <g>
          <circle cx={-x} cy={y} r={2.2 * s} fill={g.ink} />
          <circle cx={x} cy={y} r={2.2 * s} fill={g.ink} />
        </g>
      );
    case 'empathy':
      return (
        <g>
          {softArc(-x)}
          {softArc(x)}
        </g>
      );
    default: // idle
      return (
        <g>
          {dot(-x)}
          {dot(x)}
        </g>
      );
  }
}

export function Brows({ expression, ...g }: FaceGeometry & { expression: Expression }) {
  const s = S(g);
  const x = g.spread * s;
  const y = g.eyeY - 7.5 * s;
  const stroke = {
    stroke: g.ink,
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    fill: 'none',
    opacity: 0.85,
  };
  const w = 4.2 * s;
  switch (expression) {
    case 'celebrate':
      return (
        <g>
          <path d={`M ${-x - w} ${y - 3 * s} Q ${-x} ${y - 6 * s} ${-x + w} ${y - 3 * s}`} {...stroke} />
          <path d={`M ${x - w} ${y - 3 * s} Q ${x} ${y - 6 * s} ${x + w} ${y - 3 * s}`} {...stroke} />
        </g>
      );
    case 'happy':
    case 'proud':
      return (
        <g>
          <path d={`M ${-x - w} ${y} Q ${-x} ${y - 3 * s} ${-x + w} ${y}`} {...stroke} />
          <path d={`M ${x - w} ${y} Q ${x} ${y - 3 * s} ${x + w} ${y}`} {...stroke} />
        </g>
      );
    case 'thinking':
      return (
        <g>
          <path d={`M ${-x - w} ${y} l ${2 * w} 0`} {...stroke} />
          <path d={`M ${x - w} ${y - 2.5 * s} l ${2 * w} ${1.5 * s}`} {...stroke} />
        </g>
      );
    case 'worried':
      return (
        <g>
          <path d={`M ${-x - w} ${y - 2 * s} l ${2 * w} ${2 * s}`} {...stroke} />
          <path d={`M ${x + w} ${y - 2 * s} l ${-2 * w} ${2 * s}`} {...stroke} />
        </g>
      );
    case 'empathy':
      return (
        <g>
          <path d={`M ${-x - w} ${y - 1.5 * s} l ${2 * w} ${1.2 * s}`} {...stroke} />
          <path d={`M ${x + w} ${y - 1.5 * s} l ${-2 * w} ${1.2 * s}`} {...stroke} />
        </g>
      );
    case 'nudge':
      return (
        <g>
          <path d={`M ${-x - w} ${y} l ${2 * w} 0`} {...stroke} />
          <path d={`M ${x - w} ${y - 1 * s} Q ${x} ${y - 4 * s} ${x + w} ${y - 1 * s}`} {...stroke} />
        </g>
      );
    default:
      return (
        <g>
          <path d={`M ${-x - w} ${y} l ${2 * w} 0`} {...stroke} />
          <path d={`M ${x - w} ${y} l ${2 * w} 0`} {...stroke} />
        </g>
      );
  }
}

export function Mouth({ expression, ...g }: FaceGeometry & { expression: Expression }) {
  const s = S(g);
  const y = g.mouthY;
  const stroke = { stroke: g.ink, strokeWidth: 2, strokeLinecap: 'round' as const, fill: 'none' };
  switch (expression) {
    case 'celebrate':
      return <path d={`M ${-5 * s} ${y} Q 0 ${y + 7 * s} ${5 * s} ${y} Z`} fill={g.ink} />;
    case 'happy':
    case 'proud':
      return <path d={`M ${-5.5 * s} ${y} Q 0 ${y + 5 * s} ${5.5 * s} ${y}`} {...stroke} />;
    case 'thinking':
      return <circle cx={1 * s} cy={y + 1 * s} r={1.9 * s} {...stroke} />;
    case 'worried':
      return <path d={`M ${-4 * s} ${y + 2.5 * s} Q 0 ${y - 1 * s} ${4 * s} ${y + 2.5 * s}`} {...stroke} />;
    case 'empathy':
      return <path d={`M ${-3.4 * s} ${y + 2 * s} Q 0 ${y} ${3.4 * s} ${y + 2 * s}`} {...stroke} />;
    case 'nudge':
      return <path d={`M ${-4 * s} ${y + 0.5 * s} Q ${1 * s} ${y + 4 * s} ${5 * s} ${y - 1 * s}`} {...stroke} />;
    default:
      return <path d={`M ${-4 * s} ${y} Q 0 ${y + 2.4 * s} ${4 * s} ${y}`} {...stroke} />;
  }
}


/** One soft ground ellipse and nothing else (§2.5.4). Dark mode only deepens it. */
export function GroundShadow({ cx = 48, cy = 115, rx = 24 }: { cx?: number; cy?: number; rx?: number }) {
  return (
    <ellipse
      cx={cx}
      cy={cy}
      rx={rx}
      ry={3.6}
      fill="#0f172a"
      className="opacity-[0.08] dark:opacity-[0.16]"
    />
  );
}
