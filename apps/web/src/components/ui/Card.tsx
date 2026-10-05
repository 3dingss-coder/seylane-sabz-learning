import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** brand: subtle brand-tinted surface · hero: deep-green gradient with white text. */
  tone?: 'default' | 'brand' | 'hero';
  padded?: boolean;
  /** Hover lift + press feedback (use on cards that are clickable as a whole). */
  interactive?: boolean;
  /** Design v3 (PHASE-1/§4.2): 2px physical border for the marketer app (depth without blur). */
  chunky?: boolean;
}

export function Card({
  tone = 'default',
  padded = true,
  interactive = false,
  chunky = false,
  className,
  ...rest
}: CardProps) {
  return (
    <div
      className={cn(
        // v4: no hairline gray border — depth is the hard lip from --shadow-sm/--shadow-md
        'border-0',
        tone === 'hero'
          ? 'rounded-hero shadow-lg [will-change:transform]'
          : 'rounded-card shadow-sm',
        tone === 'brand' && 'bg-soft-brand bg-primary-light',
        // the page hero sits on the deepest lip (PHASE-4 §4.2)
        tone === 'hero' && 'bg-hero [box-shadow:var(--lip-lg)]',
        tone === 'default' && 'bg-surface',
        padded && 'p-5',
        chunky && 'border-2 border-chunk-border',
        interactive &&
          'pressable transition-transform hover:-translate-y-0.5 active:translate-y-0 active:[box-shadow:none]',
        className,
      )}
      {...rest}
    />
  );
}
