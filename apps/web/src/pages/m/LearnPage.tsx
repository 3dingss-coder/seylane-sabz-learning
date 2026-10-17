import { useEffect, useMemo, useState } from 'react';
import { BookOpenCheck, CheckCircle2, PlayCircle, Sparkles } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { EmptyState, PackageCardSkeleton } from '@/components/ui';
import { Tabs } from '@/components/common/Field';
import { QueryState, StaleBanner } from '@/components/common/QueryState';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { Mascot } from '@/components/brand/Mascot';
import { PackageCard } from '@/components/learning/PackageCard';
import { cn } from '@/lib/cn';
import { clearSubject, rememberSubject } from '@/lib/pageContext';
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
  const [params, setParams] = useSearchParams();
  const brand = params.get('brand');
  const setBrand = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set('brand', id);
    else next.delete('brand');
    setParams(next, { replace: true });
    if (!id) clearSubject();
  };
  const [tab, setTab] = useState<PackageUserStatus>('in_progress');
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
  useEffect(() => {
    const id = brand ?? (brands.length === 1 ? brands[0]?.id : null);
    if (!id) return;
    const b = brands.find((x) => x.id === id);
    if (!b) return;
    rememberSubject({
      kind: 'brand',
      brandId: b.id,
      brandName: b.name,
      productId: null,
      productName: null,
      packageId: null,
      packageTitle: null,
      sectionId: null,
      sectionTitle: null,
      activityLine: `صفحه برند «${b.name}» را باز کرد`,
    });
  }, [brand, brands]);

  const total = counts.in_progress + counts.new + counts.completed;
  const completion = total > 0 ? Math.round((counts.completed / total) * 100) : 0;

  return (
    <div className="flex flex-col gap-5 pb-2">
      <section className="relative overflow-hidden rounded-hero bg-hero px-5 py-6 shadow-lg sm:px-7 sm:py-7">
        <div aria-hidden className="bg-dots absolute inset-0 text-white/[0.05]" />
        <div
          aria-hidden
          className="absolute -end-14 -top-20 size-52 rounded-full bg-primary-300/15 blur-3xl"
        />
        <div
          aria-hidden
          className="absolute -bottom-20 -start-16 size-48 rounded-full bg-accent/10 blur-3xl"
        />
        <div className="relative grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-white/90">
              <Sparkles className="size-4 text-accent" aria-hidden />
              مسیر یادگیری من
            </div>
            <h1 className="text-2xl font-extrabold text-white sm:text-3xl">آموزش‌ها</h1>
            <p className="mt-2 max-w-xl text-sm leading-7 text-white/75">
              آموزش‌های فعال، دوره‌های جدید و پیشرفتت را یک‌جا دنبال کن.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:min-w-[360px]">
            <div className="rounded-card border border-white/10 bg-white/10 p-3">
              <PlayCircle className="mb-2 size-5 text-primary-200" aria-hidden />
              <strong className="block text-xl text-white">
                {counts.in_progress.toLocaleString('fa-IR')}
              </strong>
              <span className="text-xs text-white/65">در حال انجام</span>
            </div>
            <div className="rounded-card border border-white/10 bg-white/10 p-3">
              <BookOpenCheck className="mb-2 size-5 text-accent" aria-hidden />
              <strong className="block text-xl text-white">
                {counts.new.toLocaleString('fa-IR')}
              </strong>
              <span className="text-xs text-white/65">جدید</span>
            </div>
            <div className="rounded-card border border-white/10 bg-white/10 p-3">
              <CheckCircle2 className="mb-2 size-5 text-primary-200" aria-hidden />
              <strong className="block text-xl text-white">
                {completion.toLocaleString('fa-IR')}٪
              </strong>
              <span className="text-xs text-white/65">تکمیل کل</span>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-hero border border-border bg-surface p-3 shadow-sm sm:p-4">
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
          <div className="mt-4 border-t border-border pt-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm font-bold text-text">برندها</p>
              {brand && (
                <button
                  type="button"
                  onClick={() => setBrand(null)}
                  className="min-h-12 rounded-full px-3 text-xs font-bold text-primary-fg hover:bg-primary-light"
                >
                  نمایش همه
                </button>
              )}
            </div>
            <div
              className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
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
                    'pressable flex min-h-14 shrink-0 items-center gap-2 rounded-full border px-2 pe-4 text-sm font-bold transition-colors',
                    brand === b.id
                      ? 'border-primary bg-primary-light text-primary-fg shadow-sm'
                      : 'border-border bg-background text-text-secondary hover:border-primary/40 hover:bg-primary-light/40',
                  )}
                >
                  <span className="grid size-10 place-items-center rounded-full bg-white shadow-xs">
                    <BrandLogo name={b.name} logoUrl={b.logoUrl} size="sm" className="size-8 p-1" />
                  </span>
                  {b.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      <StaleBanner show={q.isError && q.data !== undefined} onRetry={() => void q.refetch()} />
      <QueryState
        query={q}
        loading={
          <div className="grid gap-4 md:grid-cols-2">
            <PackageCardSkeleton />
            <PackageCardSkeleton />
            <PackageCardSkeleton />
          </div>
        }
      >
        {(list) => {
          const items = list.filter((p) => p.status === tab && (!brand || p.brand?.id === brand));
          return items.length === 0 ? (
            <EmptyState
              title={EMPTY[tab]}
              description="وقتی آموزش مرتبطی برایت فعال شود، همین‌جا نمایش داده می‌شود."
              illustration={<Mascot mood="thinking" className="h-28 w-auto" />}
            />
          ) : (
            <section>
              <div className="mb-3 flex items-end justify-between gap-3">
                <div>
                  <h2 className="text-lg font-extrabold text-text">
                    {tab === 'in_progress'
                      ? 'ادامه مسیر'
                      : tab === 'new'
                        ? 'آموزش‌های جدید'
                        : 'تکمیل‌شده‌ها'}
                  </h2>
                  <p className="mt-1 text-xs text-text-secondary">
                    {items.length.toLocaleString('fa-IR')} آموزش
                  </p>
                </div>
              </div>
              <div key={`${tab}-${brand}`} className="stagger grid gap-4 md:grid-cols-2">
                {items.map((p) => (
                  <PackageCard key={p.id} p={p} />
                ))}
              </div>
            </section>
          );
        }}
      </QueryState>
    </div>
  );
}
