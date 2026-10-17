import { useId, type SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';
import { FieldWrap, fieldBaseClass } from './FieldWrap';

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> {
  label: string;
  /** Error text shown under the field and announced via aria-live. */
  error?: string;
  hint?: string;
  id?: string;
}

/**
 * Shared select primitive. Promoted verbatim from components/common/Field.tsx
 * (Stage 2); the old path re-exports this so existing imports are unchanged.
 * Behaviour preserved: 48px height, AA focus ring, aria-invalid on error.
 */
export function Select({ label, error, hint, className, children, id, ...rest }: SelectProps) {
  const autoId = useId();
  const selectId = id ?? autoId;
  const errorId = `${selectId}-error`;
  const hintId = `${selectId}-hint`;
  const describedBy = [error ? errorId : null, hint && !error ? hintId : null]
    .filter(Boolean)
    .join(' ');
  return (
    <FieldWrap
      id={selectId}
      label={label}
      error={error}
      hint={hint}
      errorId={errorId}
      hintId={hintId}
    >
      <select
        id={selectId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={cn(
          fieldBaseClass,
          'min-h-12',
          error ? 'border-danger' : 'border-border',
          className,
        )}
        {...rest}
      >
        {children}
      </select>
    </FieldWrap>
  );
}
