import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FilePlus2, FolderOpen, Plus } from 'lucide-react';
import { Button, EmptyState, Skeleton, StatusBadge } from '@/components/ui';
import { Tabs } from '@/components/common/Field';
import { PageHeader } from '@/components/common/PageHeader';
import { QueryState } from '@/components/common/QueryState';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { api } from '@/lib/api';
import { toPersianDigits } from '@/lib/digits';
import { faDate } from '@/lib/format';
import type { ContentTree } from '@/lib/types';
import { ak, usePackagesAdmin } from './adminQueries';
import { BrandFormDialog } from './BrandDetailPage';
import { PackageFormDialog } from './PackageFormDialog';

/** A2 — محتوا: brand → product → package tree, plus the «بدون تخصیص» tab (D33). */
export function ContentPage() {
  const [sp, setSp] = useSearchParams();
  const tab = sp.get('tab') === 'unassigned' ? 'unassigned' : 'brands';
  const tree = useQuery({
    queryKey: ak.tree,
    queryFn: ({ signal }) => api.get<ContentTree>('/admin/content/tree', signal),
  });
  const unassigned = usePackagesAdmin('unassigned=true');
  const [newPkg, setNewPkg] = useState(false);
  const [newBrand, setNewBrand] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="محتوا"
        subtitle="برندها، محصولات و بسته‌های آموزشی"
        actions={
          <>
            <Button
              variant="ghost"
              icon={<Plus className="size-4" aria-hidden />}
              onClick={() => setNewBrand(true)}
            >
              برند
            </Button>
            <Button
              icon={<FilePlus2 className="size-4" aria-hidden />}
              onClick={() => setNewPkg(true)}
            >
              بسته جدید
            </Button>
          </>
        }
      />
      <Tabs
        label="بخش محتوا"
        value={tab}
        onChange={(v) => setSp(v === 'brands' ? {} : { tab: v }, { replace: true })}
        items={[
          { value: 'brands', label: 'برندها', count: tree.data?.brands.length },
          { value: 'unassigned', label: 'بدون تخصیص', count: tree.data?.unassignedCount },
        ]}
      />
      {tab === 'brands' ? (
        <QueryState
          query={tree}
          loading={
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 8 }, (_, i) => (
                <Skeleton key={i} className="h-40" />
              ))}
            </div>
          }
          isEmpty={(d) => d.brands.length === 0}
          empty={
            <EmptyState
              title="هنوز برندی ثبت نشده"
              actionText="افزودن برند"
              onAction={() => setNewBrand(true)}
            />
          }
        >
          {(d) => (
            <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
              {d.brands.map((b) => (
                <li key={b.id}>
                  <Link
                    to={`/admin/content/brands/${b.id}`}
                    className="flex h-full flex-col items-center gap-2 rounded-card border border-border bg-surface p-4 text-center hover:border-primary/40"
                    data-testid="brand-card"
                  >
                    <BrandLogo name={b.name} logoUrl={b.logoUrl} size="lg" />
                    <p className="font-bold text-text">{b.name}</p>
                    <p className="text-xs text-text-secondary">
                      {toPersianDigits(b.productCount)} محصول • {toPersianDigits(b.packageCount)}{' '}
                      بسته
                    </p>
                    {b.logoIsFallback && (
                      <span className="rounded-full bg-warning-light px-2 py-0.5 text-[11px] font-bold text-warning">
                        لوگوی موقت هلدینگ
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </QueryState>
      ) : (
        <QueryState
          query={unassigned}
          loading={<Skeleton className="h-24" />}
          isEmpty={(l) => l.length === 0}
          empty={
            <EmptyState
              title="محتوای بدون تخصیص وجود ندارد"
              icon={<FolderOpen className="size-8" />}
            />
          }
        >
          {(list) => (
            <>
              <p className="rounded-card border border-warning/30 bg-warning-light p-3 text-sm text-text">
                این بسته‌ها هنوز برند یا محصول ندارند و تا تخصیص داده نشوند منتشر نمی‌شوند. بسته را
                باز کنید و برند/محصول را انتخاب کنید.
              </p>
              <ul className="flex flex-col gap-2">
                {list.map((p) => (
                  <li key={p.id}>
                    <Link
                      to={`/admin/packages/${p.id}`}
                      className="flex items-center justify-between gap-3 rounded-card border border-border bg-surface p-3 hover:border-primary/40"
                    >
                      <div>
                        <p className="font-bold">{p.title}</p>
                        <p className="text-xs text-text-secondary">
                          {toPersianDigits(p.sections.length)} قسمت • آخرین تغییر{' '}
                          {faDate(p.updatedAt)}
                        </p>
                      </div>
                      <StatusBadge status={p.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </QueryState>
      )}
      {newPkg && <PackageFormDialog open onClose={() => setNewPkg(false)} />}
      {newBrand && <BrandFormDialog open onClose={() => setNewBrand(false)} />}
    </div>
  );
}
