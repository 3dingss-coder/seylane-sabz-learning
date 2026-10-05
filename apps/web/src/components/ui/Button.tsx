import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'light' | 'cta';
export type ButtonSize = 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Full-width (default for primary CTAs on mobile — §16.5). */
  block?: boolean;
  loading?: boolean;
  icon?: ReactNode;
}

// §16.5 Buttons + §16.6 States: hover ≈8% darker, focus ring (global), disabled 40% opacity.
// Design refresh: soft brand gradient + top highlight, lift on hover, scale(0.98) on press.
// v4 (PHASE-1 §4.1 generalised): EVERY filled button is a physical key — flat colour, a hard
// bottom lip, and a real press (translate down + lip removed). This is the single loudest
// difference from the old "flat card + soft shadow" enterprise look, so it lives here, once.
const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-primary text-on-primary [box-shadow:var(--lip-md)] hover:brightness-[1.06] active:translate-y-1 active:[box-shadow:none]',
  // Semantic alias of primary for the one main action per page (PHASE-4 B-02).
  cta: 'bg-primary text-on-primary [box-shadow:var(--lip-md)] hover:brightness-[1.06] active:translate-y-1 active:[box-shadow:none]',
  secondary:
    'bg-surface text-primary border-2 border-primary/45 [box-shadow:var(--shadow-sm)] hover:bg-primary-light active:translate-y-0.5 active:[box-shadow:none]',
  /** white key for dark brand surfaces (hero cards) — same geometry, white lip */
  light:
    'bg-white text-primary-800 [box-shadow:0_4px_0_rgb(17_86_56/0.35)] hover:bg-primary-50 active:translate-y-1 active:[box-shadow:none]',
  ghost: 'bg-transparent text-text-secondary hover:bg-surface-2 active:bg-border',
  danger:
    'bg-danger text-on-danger [box-shadow:var(--lip-danger)] hover:brightness-[1.06] active:translate-y-1 active:[box-shadow:none]',
};

const SIZES: Record<ButtonSize, string> = {
  md: 'min-h-13 px-5 text-base', // 52px — bigger than the 48px floor, reads as a key not a link
  lg: 'min-h-14 px-6 text-lg', // 56px — hero CTA ("شروع/ادامه")
};

export function Button({
  variant = 'primary',
  size = 'md',
  block = false,
  loading = false,
  disabled,
  icon,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <button
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex select-none items-center justify-center gap-2 rounded-btn font-extrabold',
        'transition-[transform,box-shadow,background-color,filter] duration-150 ease-soft',
        // a disabled key has no lip and does not move (§4.1: «لبه حذف = غیرفعال»)
        'disabled:cursor-not-allowed disabled:opacity-40 disabled:[box-shadow:none] disabled:active:translate-y-0',
        VARIANTS[variant],
        SIZES[size],
        // A-06 (PHASE-7): the info-blue ring is invisible on a filled key, so filled variants ask
        // for the white ring defined in styles/index.css.
        (variant === 'primary' || variant === 'cta' || variant === 'danger') && 'focus-on-fill',
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner className="size-4" /> : icon}
      <span>{children}</span>
    </button>
  );
}
