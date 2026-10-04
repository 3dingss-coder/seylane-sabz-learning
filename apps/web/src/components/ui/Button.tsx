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
const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-primary bg-brand-gradient text-on-primary [box-shadow:var(--shadow-sm),var(--shadow-inset-top)] hover:bg-primary-hover hover:[box-shadow:var(--shadow-brand),var(--shadow-inset-top)] active:bg-primary-hover',
  // Design v3 (PHASE-1/§4.1): green CTA with a solid 3D "lip"; press = translateY + lip removed.
  // Use size="lg" so the white label stays ≥18px. Green stays the action color (D-102).
  cta: 'bg-primary text-on-primary [box-shadow:var(--lip-md)] hover:bg-primary-hover active:translate-y-1 active:[box-shadow:none]',
  secondary:
    'bg-surface text-primary border border-primary/70 hover:bg-primary-light active:bg-primary-light',
  /** white button for dark brand surfaces (hero cards) — same look in light and dark mode */
  light: 'bg-white text-primary-800 shadow-md hover:bg-primary-50 active:bg-primary-100',
  ghost: 'bg-transparent text-text-secondary hover:bg-border/60 active:bg-border',
  danger:
    'bg-danger text-on-danger shadow-sm hover:brightness-[0.92] active:brightness-90 hover:shadow-md',
};

const SIZES: Record<ButtonSize, string> = {
  md: 'min-h-12 px-4 text-sm', // 48px — minimum touch target
  lg: 'min-h-14 px-6 text-base', // hero CTA ("شروع/ادامه")
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
        'pressable inline-flex select-none items-center justify-center gap-2 rounded-card font-bold',
        'disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100',
        VARIANTS[variant],
        SIZES[size],
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
