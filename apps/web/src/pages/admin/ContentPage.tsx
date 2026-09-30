import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArchiveRestore, FilePlus2, FolderOpen, Plus } from 'lucide-react';
import { Button, EmptyState, Skeleton, StatusBadge, useToast } from '@/components/ui';
import { Tabs } from '@/components/common/Field';
import { PageHeader } from '@/components/common/PageHeader';
import { QueryState } from '@/components/common/QueryState';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { api } from '@/lib/api';
import { toPersianDigits } from '@/lib/digits';
import { errMsg } from '@/lib/errors';
import { faDate } from '@/lib/format';
import type { ContentTree } from '@/lib/types';
import { ak, usePackagesAdmin } from './adminQueries';
import { BrandFormDialog } from './BrandDetailPage';
import { PackageFormDialog } from './PackageFormDialog';

/** A2 — محتوا: brand → product → package tree, plus the «بدون تخصیص» tab (D33). */
export function ContentPage() {
  const [sp, setSp] = useSearchParams();
  const tab =
    sp.get('tab') === 'unassigned'
      ? 'unassigned'
      : sp.get('tab') === 'archive'
        ? 'archive'
        : 'brands';
  const tree = useQuery({
    queryKey: ak.tree,
    queryFn: ({ signal }) => api.get<ContentTree>('/admin/content/tree', signal),
  });
  const unassigned = usePackagesAdmin('unassigned=true');
  const archived = usePackagesAdmin('status=archived');
  const [newPkg, setNewPkg] = useState(false);
  const [newBrand, setNewBrand] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="محتوای آموزشی"
        subtitle="برند ← محصول ← آموزش‌ها. برای دیدن و ساختن آموزش‌های یک محصول، برندش را باز کنید."
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
              آموزش جدید
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
          { value: 'archive', label: 'بایگانی', count: archived.data?.length },
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
                      <span className="rounded-full bg-warning-light px-2 py-0.5 text-[11px] font-bold text-warning-fg">
                        لوگوی موقت هلدینگ
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </QueryState>
      ) : tab === 'archive' ? (
        <ArchivedPackages />
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

/** B6 — بایگانی‌شده‌ها جایی برای دیدن نداشتند: یک آموزش بایگانی عملاً گم می‌شد. */
function ArchivedPackages() {
  const list = usePackagesAdmin('status=archived');
  const qc = useQueryClient();
  const toast = useToast();
  const restore = useMutation({
    mutationFn: (id: string) =>
      api.post<{ status: string; publishIssues: string[] }>(`/admin/packages/${id}/unarchive`),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ['admin'] });
      toast.show({
        type: r.status === 'published' ? 'success' : 'warning',
        message:
          r.status === 'published'
            ? 'آموزش بازگردانده شد و برای مخاطبان فعال است.'
            : `آموزش به پیش‌نویس برگشت: ${r.publishIssues.join(' ') || 'منتشر نشده است.'}`,
      });
    },
    onError: (e) => toast.show({ type: 'error', message: errMsg(e) }),
  });
  return (
    <QueryState
      query={list}
      loading={<Skeleton className="h-24" />}
      isEmpty={(l) => l.length === 0}
      empty={
        <EmptyState title="آموزش بایگانی‌شده‌ای نیست" icon={<FolderOpen className="size-8" />} />
      }
    >
      {(rows) => (
        <>
          <p className="rounded-card border border-border bg-surface p-3 text-sm text-text-secondary">
            آموزش‌های بایگانی‌شده برای هیچ بازاریابی نمایش داده نمی‌شوند؛ پیشرفت‌ها و آمارشان حفظ
            می‌شود. با بازگردانی، اگر آموزش هنوز شرایط انتشار را داشته باشد مستقیم منتشر می‌شود.
          </p>
          <ul className="flex flex-col gap-2">
            {rows.map((p) => (
              <li key={p.id}>
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-border bg-surface p-3">
                  <div className="min-w-0">
                    <Link
                      to={`/admin/packages/${p.id}`}
                      className="block font-bold hover:underline"
                    >
                      {p.title}
                    </Link>
                    <p className="text-xs text-text-secondary">
                      {toPersianDigits(p.sections.length)} قسمت • آخرین تغییر {faDate(p.updatedAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={p.status} />
                    <Button
                      variant="secondary"
                      icon={<ArchiveRestore className="size-4" aria-hidden />}
                      loading={restore.isPending && restore.variables === p.id}
                      onClick={() => restore.mutate(p.id)}
                    >
                      بازگردانی
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </QueryState>
  );
}
