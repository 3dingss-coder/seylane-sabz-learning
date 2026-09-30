import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
  /** Hide this column in the stacked mobile card view. */
  hideOnMobile?: boolean;
}

/** Responsive table (§16.5): real table on ≥md, stacked cards on mobile. */
export function DataTable<T>({
  rows,
  columns,
  rowKey,
  onRowClick,
  caption,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (r: T) => string;
  onRowClick?: (r: T) => void;
  caption: string;
}) {
  return (
    <>
      <div className="animate-fade-in hidden overflow-x-auto rounded-card border border-border bg-surface shadow-sm md:block">
        <table className="w-full text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="border-b border-border bg-surface-2 text-text-secondary">
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={cn('px-3 py-3 text-start text-xs font-bold', c.className)}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr
                key={rowKey(r)}
                className={cn(
                  'transition-colors duration-150',
                  onRowClick ? 'cursor-pointer hover:bg-primary-light/50' : 'hover:bg-surface-2/60',
                )}
                onClick={onRowClick ? () => onRowClick(r) : undefined}
                onKeyDown={onRowClick ? (e) => e.key === 'Enter' && onRowClick(r) : undefined}
                tabIndex={onRowClick ? 0 : undefined}
              >
                {columns.map((c) => (
                  <td key={c.key} className={cn('px-3 py-3 align-middle text-text', c.className)}>
                    {c.cell(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="stagger flex flex-col gap-2 md:hidden" aria-label={caption}>
        {rows.map((r) => {
          const inner = (
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              {columns
                .filter((c) => !c.hideOnMobile)
                .map((c) => (
                  <div key={c.key} className="contents">
                    <dt className="text-text-secondary">{c.header}</dt>
                    <dd className="min-w-0 text-text">{c.cell(r)}</dd>
                  </div>
                ))}
            </dl>
          );
          return (
            <li key={rowKey(r)}>
              {onRowClick ? (
                <button
                  type="button"
                  onClick={() => onRowClick(r)}
                  className="pressable w-full rounded-card border border-border bg-surface p-3 text-start shadow-xs hover:border-primary/30 hover:shadow-sm"
                >
                  {inner}
                </button>
              ) : (
                <div className="rounded-card border border-border bg-surface p-3 shadow-xs">
                  {inner}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
