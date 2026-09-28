import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Subtle brand-tinted surface for success/brand highlights (primary-light). */
  tone?: 'default' | 'brand';
  padded?: boolean;
}

export function Card({ tone = 'default', padded = true, className, ...rest }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-card border shadow-sm',
        tone === 'brand' ? 'border-primary/20 bg-primary-light' : 'border-border bg-surface',
        padded && 'p-4',
        className,
      )}
      {...rest}
    />
  );
}
