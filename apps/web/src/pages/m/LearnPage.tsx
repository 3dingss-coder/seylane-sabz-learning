import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ListChecks, Route } from 'lucide-react';
import { EmptyState, PackageCardSkeleton } from '@/components/ui';
import { Tabs } from '@/components/common/Field';
import { PageHeader } from '@/components/common/PageHeader';
import { QueryState, StaleBanner } from '@/components/common/QueryState';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { PackageCard } from '@/components/learning/PackageCard';
import { PathScreen } from '@/components/learning/PathScreen';
import { Reveal } from '@/components/common/Reveal';
import { cn } from '@/lib/cn';
import { useAuth } from '@/lib/auth';
import { useBehavior, useHome, usePackages } from '@/lib/queries';
import type { PackageSummary, PackageUserStatus } from '@/lib/types';

const EMPTY: Record<PackageUserStatus, string> = {
  in_progress: 'چیزی برای ادامه نداری.',
  new: 'آموزش جدیدی نداری.',
  completed: 'هنوز آموزشی را تمام نکرده‌ای.',
};

/** Stations follow the order the admin assigned (`pathOrder`), not the status. */
const byPathOrder = (a: PackageSummary, b: PackageSummary) => a.pathOrder - b.pathOrder;

/**
 * M4 — آموزش‌ها.
 * Design v3 (PHASE-4 §4.5): the default view is the learning **path** (stations); the
 * status-tab list is still one tap away for people who want to scan/filter.
 */
export function LearnPage() {
  const q = usePackages();
  const { user } = useAuth();
  const home = useHome(user?.id);
  const behavior = useBehavior();
  const nav = useNavigate();
  const [view, setView] = useState<'path' | 'list'>('path');
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
  const ordered = useMemo(() => [...(q.data ?? [])].sort(byPathOrder), [q.data]);

  const loading = (
    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
      <PackageCardSkeleton />
      <PackageCardSkeleton />
      <PackageCardSkeleton />
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="آموزش‌ها"
        actions={
          <div role="group" aria-label="نوع نمایش" className="flex gap-1 rounded-pill bg-surface-2 p-1">
            {(
              [
                { id: 'path', label: 'مسیر', icon: Route },
                { id: 'list', label: 'فهرست', icon: ListChecks },
              ] as const
            ).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                aria-pressed={view === id}
                onClick={() => setView(id)}
                className={cn(
                  'pressable flex min-h-10 items-center gap-1.5 rounded-pill px-3 text-sm font-bold',
                  view === id ? 'bg-surface text-primary shadow-sm' : 'text-text-secondary',
                )}
              >
                <Icon className="size-4" aria-hidden />
                {label}
              </button>
            ))}
          </div>
        }
      />
      <StaleBanner show={q.isError && q.data !== undefined} onRetry={() => void q.refetch()} />

      {view === 'path' ? (
        <QueryState query={q} loading={loading}>
          {() =>
            ordered.length === 0 ? (
              <EmptyState
                character="seyla"
                title="هنوز آموزشی نداری"
                description="سیلا منتظرته؛ به محض فعال‌شدن اولین بسته، مسیر همین‌جا ساخته می‌شود."
                actionText="رفتن به کارت‌های من"
                onAction={() => nav('/cards')}
              />
            ) : (
              <Reveal>
                <PathScreen
                packages={ordered}
                points={user?.pointsBalance ?? home.data?.pointsBalance ?? 0}
                streakDays={behavior.data?.state.streakDays ?? 0}
                totalProgress={home.data?.totalProgress ?? 0}
                />
              </Reveal>
            )
          }
        </QueryState>
      ) : (
        <>
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
          <QueryState query={q} loading={loading}>
            {(list: PackageSummary[]) => {
              const items = list.filter(
                (p) => p.status === tab && (!brand || p.brand?.id === brand),
              );
              return items.length === 0 ? (
                <EmptyState
                  character="seyla"
                  title={EMPTY[tab]}
                  description="می‌توانی نمای مسیر را ببینی؛ شاید ایستگاه بعدی همان‌جا باشد."
                  actionText="نمایش مسیر"
                  onAction={() => setView('path')}
                />
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
        </>
      )}
    </div>
  );
}
