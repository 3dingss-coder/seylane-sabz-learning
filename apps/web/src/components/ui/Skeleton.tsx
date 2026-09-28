// Adapted from helper kit: «اپ بازاریاب/کامپوننت‌ها/common/Skeleton.tsx»
// (Order/Customer/Product skeletons → generic Skeleton + learning-domain presets).
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Card } from './Card';

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-pulse rounded-input bg-border', className)} />;
}

/** Package card placeholder (§15.1 M3/M4 loading). */
export function PackageCardSkeleton() {
  return (
    <Card className="space-y-3" aria-hidden>
      <div className="flex items-center gap-3">
        <Skeleton className="size-12 rounded-card" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
      <Skeleton className="h-2 w-full rounded-full" />
      <div className="flex justify-between">
        <Skeleton className="h-6 w-20 rounded-full" />
        <Skeleton className="h-6 w-16 rounded-full" />
      </div>
    </Card>
  );
}

/** Table rows placeholder (§16.5 tables, manager/admin). */
export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

/** Wrapper that exposes a single accessible "loading" status for a skeleton region. */
export function LoadingRegion({
  label = 'در حال بارگذاری…',
  children,
}: {
  label?: string;
  children: ReactNode;
}) {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}
