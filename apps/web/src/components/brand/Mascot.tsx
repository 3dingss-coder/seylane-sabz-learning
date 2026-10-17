import { cn } from '@/lib/cn';

/**
 * Handoff "mascot states" over the single identity-locked provided asset
 * (`public/brand/mascot.webp`, verified against Drive 02-mascot/mascot-original.png).
 *
 * Per the handoff mascot guide: use the provided art, never regenerate it, never
 * add costumes. States are therefore expressed as CSS framing of the SAME asset
 * (tilt, halo, sparkles) — decorative and aria-hidden, always secondary to the
 * content it supports.
 *
 * `success` is part of the approved vocabulary but has no screen in the
 * auth/onboarding flow (it belongs to completion moments, e.g. Stage 4).
 */
export type MascotMood = 'welcome' | 'guide' | 'thinking' | 'success';

const POSE: Record<MascotMood, string> = {
  welcome: '-rotate-6',
  guide: 'rotate-6',
  thinking: '-rotate-3',
  success: 'rotate-0',
};

function Sparkle({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      focusable="false"
      className={className}
    >
      <path d="M12 2.5l1.9 5.6 5.6 1.9-5.6 1.9-1.9 5.6-1.9-5.6-5.6-1.9 5.6-1.9z" />
    </svg>
  );
}

export function Mascot({ mood = 'welcome', className }: { mood?: MascotMood; className?: string }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none relative inline-flex shrink-0 items-end justify-center"
    >
      {/* thinking: three amber "hmm…" dots rising on the head side (RTL start = right) */}
      {mood === 'thinking' && (
        <span className="absolute -top-2 start-1 flex flex-col items-center gap-1">
          <span className="size-1.5 rounded-full bg-accent shadow-xs" />
          <span className="size-1 rounded-full bg-accent/80" />
          <span className="size-0.5 rounded-full bg-accent/60" />
        </span>
      )}
      {/* success: amber sparkles top-left/top-right */}
      {mood === 'success' && (
        <>
          <Sparkle className="absolute -top-1 end-0 size-3.5 text-accent drop-shadow-sm" />
          <Sparkle className="absolute top-3 start-0 size-2.5 text-accent/80 drop-shadow-sm" />
        </>
      )}
      <img
        src="/brand/mascot.webp"
        alt=""
        width={250}
        height={324}
        decoding="async"
        className={cn(
          // Size comes from the caller (h-*/w-*). No `h-auto w-auto` here: those
          // utilities are emitted after numeric sizes in Tailwind's CSS order and
          // would silently defeat every consumer size class (mascots rendered at
          // natural size and overflowed narrow viewports).
          'block max-w-full object-contain drop-shadow-md',
          POSE[mood],
          className,
        )}
      />
    </span>
  );
}
