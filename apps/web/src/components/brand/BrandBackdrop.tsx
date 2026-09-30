import { cn } from '@/lib/cn';

/**
 * Decorative brand backdrop: deep-green gradient with soft circles and leaf-like shapes.
 * Pure SVG/CSS (no image request), aria-hidden. Parent must be `relative overflow-hidden`.
 */
export function BrandBackdrop({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn('bg-hero pointer-events-none absolute inset-0', className)}>
      <svg
        className="absolute inset-0 size-full"
        viewBox="0 0 400 260"
        preserveAspectRatio="xMidYMid slice"
        focusable="false"
      >
        <circle cx="360" cy="30" r="110" fill="white" fillOpacity="0.07" />
        <circle cx="40" cy="250" r="90" fill="white" fillOpacity="0.06" />
        <path d="M300 210c0-46 34-70 84-70 0 50-30 76-84 70z" fill="white" fillOpacity="0.09" />
        <path d="M20 40c0-30 22-46 54-46 0 32-20 50-54 46z" fill="white" fillOpacity="0.08" />
        <circle cx="200" cy="40" r="3" fill="#fbbf24" fillOpacity="0.8" />
        <circle cx="90" cy="150" r="2" fill="white" fillOpacity="0.5" />
        <circle cx="330" cy="120" r="2.5" fill="white" fillOpacity="0.5" />
      </svg>
    </div>
  );
}
