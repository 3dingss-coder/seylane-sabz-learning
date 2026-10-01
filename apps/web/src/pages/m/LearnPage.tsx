import { useMemo, useState } from 'react';
import { EmptyState, PackageCardSkeleton } from '@/components/ui';
import { Tabs } from '@/components/common/Field';
import { PageHeader } from '@/components/common/PageHeader';
import { QueryState, StaleBanner } from '@/components/common/QueryState';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { PackageCard } from '@/components/learning/PackageCard';
import { cn } from '@/lib/cn';
import { usePackages } from '@/lib/queries';
import type { PackageUserStatus } from '@/lib/types';

const EMPTY: Record<PackageUserStatus, string> = {
  in_progress: 'چیزی برای ادامه نداری.',
  new: 'آموزش جدیدی نداری.',
  completed: 'هنوز آموزشی را تمام نکرده‌ای.',
};

/** M4 — آموزش‌ها: status tabs + brand filter with real brand logos. */
export function LearnPage() {
  const q = usePackages();
  const [tab, setTab] = useState<PackageUserStatus>('in_progress');
  const [brand, setBrand] = useState<string | null>(null);
  const counts = useMemo(() => {
    const c = { in_progress: 0, new: 0, completed: 0 };
    for (const p of q.data ?? []) c[p.status]++;
    return c;
  }, [q.data]);
  const brands = useMemo(() => {
    const m = new Map<string, { id: string; name: string; logoUrl: string }>();
    for (const p of q.data ?? []) if (p.brand) m.set(p.brand.id, p.brand);
    return [...m.values()];
  }, [q.data]);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="آموزش‌ها" />
      <Tabs
        label="وضعیت آموزش‌ها"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'in_progress', label: 'در حال انجام', count: counts.in_progress },
          { value: 'new', label: 'جدید', count: counts.new },
          { value: 'completed', label: 'تکمیل‌شده', count: counts.completed },
        ]}
      />
      {brands.length > 1 && (
        <div
          className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1"
          role="group"
          aria-label="فیلتر برند"
        >
          {brands.map((b) => (
            <button
              key={b.id}
              type="button"
              aria-pressed={brand === b.id}
              onClick={() => setBrand(brand === b.id ? null : b.id)}
              className={cn(
                'pressable flex min-h-12 shrink-0 items-center gap-2 rounded-full border bg-surface px-2 pe-4 text-sm font-bold shadow-xs',
                brand === b.id
                  ? 'border-primary bg-primary-light text-primary'
                  : 'border-border text-text-secondary hover:border-primary/40',
              )}
            >
              <BrandLogo name={b.name} logoUrl={b.logoUrl} size="sm" className="size-9 p-1" />
              {b.name}
            </button>
          ))}
        </div>
      )}
      <StaleBanner show={q.isError && q.data !== undefined} onRetry={() => void q.refetch()} />
      <QueryState
        query={q}
        loading={
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            <PackageCardSkeleton />
            <PackageCardSkeleton />
            <PackageCardSkeleton />
          </div>
        }
      >
        {(list) => {
          const items = list.filter((p) => p.status === tab && (!brand || p.brand?.id === brand));
          return items.length === 0 ? (
            <EmptyState title={EMPTY[tab]} />
          ) : (
            <div
              key={`${tab}-${brand}`}
              className="stagger grid gap-3 md:grid-cols-2 lg:grid-cols-3"
            >
              {items.map((p) => (
                <PackageCard key={p.id} p={p} />
              ))}
            </div>
          );
        }}
      </QueryState>
    </div>
  );
}
