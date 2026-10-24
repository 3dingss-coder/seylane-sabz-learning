import type { ReactNode } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { ErrorState } from '@/components/ui';
import { ApiError } from '@/lib/api';

/** Standard Loading / Error / Empty / Success switch for a query (§16.6). */
export function QueryState<T>({
  query,
  loading,
  empty,
  isEmpty,
  children,
}: {
  query: UseQueryResult<T>;
  loading: ReactNode;
  empty?: ReactNode;
  isEmpty?: (data: T) => boolean;
  children: (data: T) => ReactNode;
}) {
  if (query.isPending) return <>{loading}</>;
  if (query.isError && query.data === undefined) {
    const msg =
      query.error instanceof ApiError && query.error.code !== 'INTERNAL'
        ? query.error.message
        : undefined;
    return <ErrorState message={msg} onRetry={() => void query.refetch()} />;
  }
  const data = query.data as T;
  if (empty && isEmpty?.(data)) return <>{empty}</>;
  return <>{children(data)}</>;
}

/** Offline/stale banner shown above cached content (§15.1 M3 error state). */
export function StaleBanner({ show, onRetry }: { show: boolean; onRetry: () => void }) {
  if (!show) return null;
  return (
    <div
      role="status"
      className="flex items-center justify-between gap-3 rounded-card border border-warning/30 bg-warning-light px-3 py-2 text-sm text-text"
    >
      <span>اتصال برقرار نیست — آخرین اطلاعات ذخیره‌شده را می‌بینید.</span>
      <button
        type="button"
        onClick={onRetry}
        className="min-h-12 shrink-0 px-2 font-bold text-primary"
      >
        تلاش مجدد
      </button>
    </div>
  );
}
