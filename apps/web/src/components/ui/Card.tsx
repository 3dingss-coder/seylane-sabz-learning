import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** brand: subtle brand-tinted surface · hero: deep-green gradient with white text. */
  tone?: 'default' | 'brand' | 'hero';
  padded?: boolean;
  /** Hover lift + press feedback (use on cards that are clickable as a whole). */
  interactive?: boolean;
}

export function Card({
  tone = 'default',
  padded = true,
  interactive = false,
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
        tone === 'hero' && 'bg-hero border-transparent',
        tone === 'default' && 'border-border bg-surface',
        padded && 'p-4',
        interactive && 'pressable hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md',
        className,
      )}
      {...rest}
    />
  );
}
