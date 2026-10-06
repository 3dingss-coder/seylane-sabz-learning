import { useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
  /** Hide this column in the stacked mobile card view. */
  hideOnMobile?: boolean;
  /** Makes the column sortable; return a number/string, or null/undefined to sort last. */
  sortValue?: (row: T) => string | number | null | undefined;
}

type Sort = { key: string; dir: 'asc' | 'desc' } | null;

const collator = new Intl.Collator('fa');
function compare(a: string | number | null | undefined, b: string | number | null | undefined) {
  const an = a === null || a === undefined || a === '';
  const bn = b === null || b === undefined || b === '';
  if (an || bn) return an === bn ? 0 : an ? 1 : -1;
  return typeof a === 'number' && typeof b === 'number'
    ? a - b
    : collator.compare(String(a), String(b));
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
  const [sort, setSort] = useState<Sort>(null);
  const sorted = useMemo(() => {
    const col = sort && columns.find((c) => c.key === sort.key);
    if (!sort || !col?.sortValue) return rows;
    const get = col.sortValue;
    const sign = sort.dir === 'asc' ? 1 : -1;
    // Empty values stay last in both directions.
    return [...rows].sort((a, b) => {
      const x = get(a);
      const y = get(b);
      const xe = x === null || x === undefined || x === '';
      const ye = y === null || y === undefined || y === '';
      return xe || ye ? compare(x, y) : sign * compare(x, y);
    });
  }, [rows, columns, sort]);
  const toggle = (key: string) =>
    setSort((s) =>
      !s || s.key !== key ? { key, dir: 'desc' } : s.dir === 'desc' ? { key, dir: 'asc' } : null,
    );
  const sortable = columns.filter((c) => c.sortValue);
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
                  aria-sort={
                    sort?.key === c.key
                      ? sort.dir === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : undefined
                  }
                  className={cn('px-3 py-3 text-start text-xs font-bold', c.className)}
                >
                  {c.sortValue ? (
                    <button
                      type="button"
                      onClick={() => toggle(c.key)}
                      className="inline-flex min-h-8 items-center gap-1 font-bold hover:text-text"
                    >
                      {c.header}
                      {sort?.key === c.key ? (
                        sort.dir === 'asc' ? (
                          <ArrowUp className="size-3.5" aria-hidden />
                        ) : (
                          <ArrowDown className="size-3.5" aria-hidden />
                        )
                      ) : (
                        <ArrowUpDown className="size-3.5 opacity-40" aria-hidden />
                      )}
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sorted.map((r) => (
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
      {sortable.length > 0 && (
        <label className="flex items-center gap-2 text-sm text-text-secondary md:hidden">
          مرتب‌سازی
          <select
            className="min-h-12 flex-1 rounded-input border border-border bg-surface px-3 text-text"
            value={sort ? `${sort.key}:${sort.dir}` : ''}
            onChange={(e) => {
              const [key, dir] = e.target.value.split(':');
              setSort(key ? { key, dir: dir === 'asc' ? 'asc' : 'desc' } : null);
            }}
          >
            <option value="">پیش‌فرض</option>
            {sortable.flatMap((c) => [
              <option key={`${c.key}:desc`} value={`${c.key}:desc`}>
                {c.header} (نزولی)
              </option>,
              <option key={`${c.key}:asc`} value={`${c.key}:asc`}>
                {c.header} (صعودی)
              </option>,
            ])}
          </select>
        </label>
      )}
      <ul className="stagger flex flex-col gap-2 md:hidden" aria-label={caption}>
        {sorted.map((r) => {
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
