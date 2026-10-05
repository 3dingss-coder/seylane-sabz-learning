import { cn } from '@/lib/cn';

/**
 * Accessible on/off switch (32×56 target, role="switch"). Added for the opt-in sound setting
 * (PHASE-5 S-07); reusable for any future preference. The knob travels with the reading
 * direction — the transform rules live in index.css (.switch-knob) so RTL stays correct.
 */
export function Switch({
  checked,
  onChange,
  label,
  className,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-9 w-14 shrink-0 rounded-pill border-2 transition-colors duration-150 ease-soft',
        checked ? 'border-green-lip bg-primary' : 'border-chunk-border bg-surface-2',
        className,
      )}
    >
      <span
        aria-hidden
        className="switch-knob absolute start-0.5 top-0.5 size-6 rounded-pill bg-surface shadow-sm"
      />
    </button>
  );
}
