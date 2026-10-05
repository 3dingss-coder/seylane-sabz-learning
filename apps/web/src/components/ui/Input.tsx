import { useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string;
  /** Error text shown under the field (§15.1 M1) and announced via aria-live. */
  error?: string;
  hint?: string;
  icon?: ReactNode;
  /** Force LTR for phone/email/password while keeping the RTL layout. */
  ltr?: boolean;
  id?: string;
}

export function Input({ label, error, hint, icon, ltr, id, className, ...rest }: InputProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ');

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-semibold text-text">
        {label}
      </label>
      <div className="relative">
        {icon && (
          <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-muted-fg">
            {icon}
          </span>
        )}
        <input
          id={inputId}
          dir={ltr ? 'ltr' : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          className={cn(
            'min-h-13 w-full rounded-input border-2 bg-surface px-4 text-base text-text placeholder:text-muted-fg',
            'shadow-xs transition-[border-color,box-shadow] duration-150 hover:border-muted focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/15',
            'disabled:cursor-not-allowed disabled:opacity-40',
            error ? 'animate-shake border-danger' : 'border-chunk-border',
            icon ? 'ps-10' : null,
            ltr && 'text-left',
            className,
          )}
          {...rest}
        />
      </div>
      {hint && !error && (
        <p id={hintId} className="text-xs text-text-secondary">
          {hint}
        </p>
      )}
      <p id={errorId} aria-live="polite" className="min-h-0 text-xs font-medium text-danger-fg">
        {error}
      </p>
    </div>
  );
}
