import {
  useId,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from '@/lib/cn';

const base =
  'w-full rounded-input border bg-surface px-3 text-base text-text placeholder:text-muted-fg shadow-xs transition-[border-color,box-shadow] duration-150 hover:border-muted focus:border-info focus:outline-none focus:ring-4 focus:ring-info/15 disabled:cursor-not-allowed disabled:opacity-40';

function Wrap({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-text">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-text-secondary">{hint}</p>}
      <p aria-live="polite" className="text-xs font-medium text-danger-fg">
        {error}
      </p>
    </div>
  );
}

export function Select({
  label,
  error,
  hint,
  className,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string; error?: string; hint?: string }) {
  const id = useId();
  return (
    <Wrap id={id} label={label} error={error} hint={hint}>
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        className={cn(base, 'min-h-12', error ? 'border-danger' : 'border-border', className)}
        {...rest}
      >
        {children}
      </select>
    </Wrap>
  );
}

export function Textarea({
  label,
  error,
  hint,
  className,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; error?: string; hint?: string }) {
  const id = useId();
  return (
    <Wrap id={id} label={label} error={error} hint={hint}>
      <textarea
        id={id}
        aria-invalid={error ? true : undefined}
        className={cn(base, 'min-h-24 py-2', error ? 'border-danger' : 'border-border', className)}
        {...rest}
      />
    </Wrap>
  );
}

/** Segmented tabs (≥48px) used for status filters and admin sub-pages. */
export function Tabs<T extends string>({
  value,
  onChange,
  items,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  items: Array<{ value: T; label: string; count?: number }>;
  label: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="flex gap-1 overflow-x-auto rounded-card border-2 border-chunk-border bg-surface p-1"
    >
      {items.map((it) => (
        <button
          key={it.value}
          role="tab"
          type="button"
          aria-selected={value === it.value}
          onClick={() => onChange(it.value)}
          className={cn(
            'pressable flex min-h-11 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-input px-3 text-sm font-bold',
            value === it.value
              ? 'bg-primary text-on-primary [box-shadow:var(--lip-sm)]'
              : 'text-text-secondary hover:bg-surface-2',
          )}
        >
          {it.label}
          {it.count !== undefined && (
            <span
              className={cn(
                'rounded-full px-1.5 text-xs',
                value === it.value ? 'bg-on-primary/20' : 'bg-surface-2',
              )}
            >
              {it.count.toLocaleString('fa-IR')}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
