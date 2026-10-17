import { useId, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';
import { FieldWrap, fieldBaseClass } from './FieldWrap';

export interface TextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> {
  label: string;
  /** Error text shown under the field and announced via aria-live. */
  error?: string;
  hint?: string;
  id?: string;
}

/**
 * Shared textarea primitive. Promoted verbatim from components/common/Field.tsx
 * (Stage 2); the old path re-exports this so existing imports are unchanged.
 */
export function Textarea({ label, error, hint, className, id, ...rest }: TextareaProps) {
  const autoId = useId();
  const textareaId = id ?? autoId;
  const errorId = `${textareaId}-error`;
  const hintId = `${textareaId}-hint`;
  const describedBy = [error ? errorId : null, hint && !error ? hintId : null]
    .filter(Boolean)
    .join(' ');
  return (
    <FieldWrap
      id={textareaId}
      label={label}
      error={error}
      hint={hint}
      errorId={errorId}
      hintId={hintId}
    >
      <textarea
        id={textareaId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={cn(
          fieldBaseClass,
          'min-h-24 py-2',
          error ? 'border-danger' : 'border-border',
          className,
        )}
        {...rest}
      />
    </FieldWrap>
  );
}
