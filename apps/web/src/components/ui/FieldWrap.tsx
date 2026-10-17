import type { ReactNode } from 'react';

/**
 * Shared label + hint + error shell for form primitives (moved verbatim from
 * components/common/Field.tsx in Stage 2 so Select/Textarea/Input share one
 * accessible structure: label htmlFor, aria-live error, hint hidden on error).
 */
export function FieldWrap({
  id,
  label,
  error,
  hint,
  errorId,
  hintId,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  errorId?: string;
  hintId?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-text">
        {label}
      </label>
      {children}
      {hint && !error && (
        <p id={hintId} className="text-xs text-text-secondary">
          {hint}
        </p>
      )}
      <p id={errorId} aria-live="polite" className="text-xs font-medium text-danger-fg">
        {error}
      </p>
    </div>
  );
}

/** Class shared by Select/Textarea (same string the old Field.tsx used). */
export const fieldBaseClass =
  'w-full rounded-input border bg-surface px-3 text-base text-text placeholder:text-muted-fg shadow-xs transition-[border-color,box-shadow] duration-150 hover:border-muted focus:border-info focus:outline-none focus:ring-4 focus:ring-info/15 disabled:cursor-not-allowed disabled:opacity-40';
