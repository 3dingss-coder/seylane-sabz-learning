import { cn } from '@/lib/cn';

export interface TabItem<T extends string> {
  value: T;
  label: string;
  count?: number;
}

export interface TabsProps<T extends string> {
  value: T;
  onChange: (v: T) => void;
  items: Array<TabItem<T>>;
  label: string;
}

/**
 * Segmented tabs used for status filters and admin sub-pages.
 * Promoted verbatim from components/common/Field.tsx (Stage 2), with one
 * accessibility fix: tab height is now min-h-12 (48px touch target, §16.8)
 * instead of the previous min-h-11 (44px). Selected tab uses the CTA token
 * (white text 5.48:1), never white on the identity primary.
 */
export function Tabs<T extends string>({ value, onChange, items, label }: TabsProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="flex gap-1 overflow-x-auto rounded-card border border-border bg-surface p-1"
    >
      {items.map((it) => (
        <button
          key={it.value}
          role="tab"
          type="button"
          aria-selected={value === it.value}
          onClick={() => onChange(it.value)}
          className={cn(
            'pressable flex min-h-12 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-input px-3 text-sm font-bold',
            value === it.value
              ? 'bg-cta bg-brand-gradient text-on-cta shadow-sm'
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
