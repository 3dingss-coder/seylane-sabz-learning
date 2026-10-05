// Brand illustrations — small geometric SVGs built from the same tokens as the UI, so they follow
// the palette (and dark mode) automatically. Decorative only (aria-hidden).
import { cn } from '@/lib/cn';

const base = 'h-28 w-auto';

/** A leaf glyph used across illustrations. */
function Leaf({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M-9 6C-9 -6 -1 -11 10 -11C10 1 4 9 -9 6Z" className="fill-on-primary" />
      <path d="M-9 6L4 -5" className="stroke-primary" strokeWidth="1.6" strokeLinecap="round" />
    </g>
  );
}

function Sparkles() {
  return (
    <>
      <circle
        cx="26"
        cy="36"
        r="3"
        className="animate-pulse-dot fill-accent origin-center [transform-box:fill-box]"
      />
      <circle cx="140" cy="70" r="2.5" className="fill-primary/40" />
      <circle cx="132" cy="16" r="2" className="fill-accent/70" />
      <circle cx="22" cy="78" r="2" className="fill-primary/30" />
    </>
  );
}

/** "Nothing here yet": a floating card stack with a leaf badge. */
export function EmptyIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 120" className={cn(base, className)} aria-hidden focusable="false">
      <ellipse cx="80" cy="110" rx="44" ry="5" className="fill-text/10" />
      <g className="animate-bob">
        <rect x="44" y="34" width="84" height="62" rx="14" className="fill-primary/10" />
        <rect
          x="36"
          y="26"
          width="84"
          height="62"
          rx="14"
          className="fill-surface stroke-primary/30"
          strokeWidth="1.5"
        />
        <rect x="48" y="40" width="40" height="6" rx="3" className="fill-primary/35" />
        <rect x="48" y="54" width="60" height="6" rx="3" className="fill-primary/15" />
        <rect x="48" y="68" width="30" height="6" rx="3" className="fill-primary/15" />
        <circle cx="116" cy="28" r="17" className="fill-primary" />
        <Leaf x={116} y={29} s={1.1} />
      </g>
      <Sparkles />
    </svg>
  );
}

/** Connection / load error: a cloud with an unplugged spark. */
export function ErrorIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 120" className={cn(base, className)} aria-hidden focusable="false">
      <ellipse cx="80" cy="110" rx="40" ry="5" className="fill-text/10" />
      <g className="animate-bob">
        <path
          d="M52 90a20 20 0 0 1-2-39.9A28 28 0 0 1 104 46a22 22 0 0 1 4 44Z"
          className="fill-surface stroke-danger/50"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <circle cx="80" cy="64" r="15" className="fill-danger/15" />
        <path d="M80 56v10" className="stroke-danger" strokeWidth="3.2" strokeLinecap="round" />
        <circle cx="80" cy="73" r="2" className="fill-danger" />
      </g>
      <circle cx="30" cy="40" r="3" className="fill-danger/30" />
      <circle cx="136" cy="30" r="2.5" className="fill-accent/70" />
    </svg>
  );
}

/** 404: a compass floating above the horizon. */
export function NotFoundIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 120" className={cn(base, className)} aria-hidden focusable="false">
      <ellipse cx="80" cy="110" rx="42" ry="5" className="fill-text/10" />
      <g className="animate-bob">
        <circle cx="80" cy="56" r="38" className="fill-primary/10" />
        <circle cx="80" cy="56" r="30" className="fill-surface stroke-primary" strokeWidth="2.5" />
        <path d="M80 38l9 22-9 4-9-4z" className="fill-primary" />
        <path d="M80 74l-9-10 9-4 9 4z" className="fill-primary/25" />
        <circle cx="80" cy="56" r="3" className="fill-surface" />
      </g>
      <Sparkles />
    </svg>
  );
}

/** Finished / celebration: trophy-like cup with a star. */
export function TrophyIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 120" className={cn(base, className)} aria-hidden focusable="false">
      <ellipse cx="80" cy="110" rx="36" ry="5" className="fill-text/10" />
      <g className="animate-bob">
        <path d="M56 28h48v22a24 24 0 0 1-48 0z" className="fill-accent" />
        <path
          d="M56 36H42a10 10 0 0 0 12 18M104 36h14a10 10 0 0 1-12 18"
          className="stroke-accent"
          strokeWidth="4"
          fill="none"
          strokeLinecap="round"
        />
        <rect x="74" y="72" width="12" height="14" className="fill-accent/70" />
        <rect x="60" y="86" width="40" height="8" rx="4" className="fill-accent" />
        <path
          d="M80 34l4 8 9 1-6.5 6 1.7 9-8.2-4.4L71.8 58l1.7-9L67 43l9-1z"
          className="fill-on-primary"
          opacity="0.9"
        />
      </g>
      <Sparkles />
    </svg>
  );
}
