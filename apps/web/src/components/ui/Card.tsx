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
        'border',
        tone === 'hero'
          ? 'rounded-hero shadow-md [will-change:transform]'
          : 'rounded-card shadow-sm',
        tone === 'brand' && 'border-primary/20 bg-soft-brand bg-primary-light',
        // v3: the page hero sits on a deep lip (PHASE-4 §4.2)
        tone === 'hero' && 'bg-hero border-transparent [box-shadow:var(--lip-lg)]',
        tone === 'default' && 'border-border bg-surface',
        padded && 'p-4',
        chunky && 'border-2 border-chunk-border',
        interactive && 'pressable hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md',
        className,
      )}
      {...rest}
    />
  );
}
