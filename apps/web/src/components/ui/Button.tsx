import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
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
const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-white shadow-sm hover:bg-primary-hover active:bg-primary-hover',
  secondary:
    'bg-surface text-primary border border-primary hover:bg-primary-light active:bg-primary-light',
  ghost: 'bg-transparent text-text-secondary hover:bg-border/60 active:bg-border',
  danger: 'bg-danger text-white shadow-sm hover:brightness-[0.92] active:brightness-90',
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
        'inline-flex select-none items-center justify-center gap-2 rounded-card font-bold transition-colors duration-150',
        'disabled:cursor-not-allowed disabled:opacity-40',
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
