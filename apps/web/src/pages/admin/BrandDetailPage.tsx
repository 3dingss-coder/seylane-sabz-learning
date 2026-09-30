import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Archive, ArchiveRestore, FilePlus2, Pencil, Plus, Route as RouteIcon } from 'lucide-react';
import {
  Button,
  Card,
  EmptyState,
  Input,
  Modal,
  Skeleton,
  StatusBadge,
  useToast,
} from '@/components/ui';
import { Textarea } from '@/components/common/Field';
import { PageHeader } from '@/components/common/PageHeader';
import { ProductImage } from '@/components/common/ProductImage';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { Uploader } from '@/components/admin/Uploader';
import { ApiError, api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { toPersianDigits } from '@/lib/digits';
import { errMsg } from '@/lib/errors';
import type { AdminBrand, AdminPackage, AdminProduct } from '@/lib/types';
import { useBrands, usePackagesAdmin, useProducts } from './adminQueries';
import { PackageFormDialog } from './PackageFormDialog';
import { PathDialog } from './AssignmentsPage';

/** A2 — جزئیات برند: logo upload (D34), products with images, packages per product / brand-level (D32). */
export function BrandDetailPage() {
  const { id = '' } = useParams();
  const brands = useBrands();
  const products = useProducts(id);
  const packages = usePackagesAdmin(`brandId=${id}`);
  const qc = useQueryClient();
  const toast = useToast();
  const [editBrand, setEditBrand] = useState(false);
  const [editProduct, setEditProduct] = useState<AdminProduct | 'new' | null>(null);
  const [newPkg, setNewPkg] = useState<{ productId: string | null } | null>(null);
  const [archive, setArchive] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [pathPreset, setPathPreset] = useState<{
    name: string;
    description: string;
    packageIds: string[];
  } | null>(null);
  const brand = brands.data?.find((b) => b.id === id);

  const patchBrand = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch(`/admin/brands/${id}`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin'] });
      toast.show({ type: 'success', message: 'ذخیره شد.' });
      setArchive(false);
    },
    onError: (e) => toast.show({ type: 'error', message: errMsg(e) }),
  });
  const patchProduct = useMutation({
    mutationFn: ({ pid, body }: { pid: string; body: Record<string, unknown> }) =>
      api.patch(`/admin/products/${pid}`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin'] });
      toast.show({ type: 'success', message: 'ذخیره شد.' });
    },
    onError: (e) => toast.show({ type: 'error', message: errMsg(e) }),
  });

  if (brands.isPending) return <Skeleton className="h-40 w-full" />;
  if (!brand) return <EmptyState title="برند پیدا نشد" />;

  const pkgs = packages.data ?? [];
  const byProduct = (pid: string | null) => pkgs.filter((p) => p.productId === pid);
  const list = (products.data ?? []).filter((p) => showArchived || !p.archived);
  const publishedIds = (items: AdminPackage[]) =>
    items.filter((x) => x.status === 'published').map((x) => x.id);
  // Brand path: brand-level trainings first, then each product's trainings. Built from the
  // products themselves — not from `list`, which the «نمایش بایگانی» toggle filters: ticking a
  // checkbox while reading must never change what a generated path contains.
  const brandPathIds = [
    ...publishedIds(byProduct(null)),
    ...(products.data ?? [])
      .filter((p) => !p.archived)
      .flatMap((p) => publishedIds(byProduct(p.id))),
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={brand.name}
        back="/admin/content"
        subtitle={brand.nameLatin ?? undefined}
      />
      <Card className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <BrandLogo name={brand.name} logoUrl={brand.logoUrl} size="lg" className="size-28" />
        <div className="flex flex-1 flex-col gap-2">
          {brand.logoIsFallback && (
            <p className="text-sm text-warning-fg">
              لوگوی این برند هنوز آپلود نشده و لوگوی هلدینگ نمایش داده می‌شود.
            </p>
          )}
          {brand.archived && <StatusBadge status="archived" />}
          <div className="flex flex-wrap gap-2">
            <Uploader
              kind="image"
              compact
              label={brand.logoIsFallback ? 'آپلود لوگو' : 'تغییر لوگو'}
              target={{ type: 'brand_logo', id: brand.id }}
              onUploaded={(m) => patchBrand.mutateAsync({ logoMediaId: m.id })}
            />
            <Button
              variant="ghost"
              icon={<Pencil className="size-4" aria-hidden />}
              onClick={() => setEditBrand(true)}
            >
              ویرایش
            </Button>
            <Button
              variant="ghost"
              icon={
                brand.archived ? (
                  <ArchiveRestore className="size-4" aria-hidden />
                ) : (
                  <Archive className="size-4" aria-hidden />
                )
              }
              onClick={() =>
                brand.archived ? patchBrand.mutate({ archived: false }) : setArchive(true)
              }
            >
              {brand.archived ? 'فعال‌سازی' : 'بایگانی'}
            </Button>
          </div>
        </div>
      </Card>

      <div className="flex flex-col gap-2 rounded-card border border-info/30 bg-info-light p-3 text-sm leading-6 text-text sm:flex-row sm:items-center sm:justify-between">
        <p>
          هر محصول می‌تواند چند آموزش داشته باشد (مثلاً معرفی صوتی + آموزش کامل ویدیویی). «مسیر
          آشنایی کامل» آموزش‌های منتشرشده را به ترتیب و با مهلت به بازاریاب‌ها می‌دهد.
        </p>
        <Button
          variant="secondary"
          className="shrink-0"
          icon={<RouteIcon className="size-4" aria-hidden />}
          disabled={!brandPathIds.length}
          title={brandPathIds.length ? undefined : 'این برند هنوز آموزش منتشرشده ندارد'}
          onClick={() =>
            setPathPreset({
              name: `آشنایی کامل با برند ${brand.name}`,
              description: `همه آموزش‌های منتشرشده برند ${brand.name} به ترتیب.`,
              packageIds: brandPathIds,
            })
          }
        >
          مسیر آشنایی با برند
        </Button>
      </div>

      <section className="flex flex-col gap-2" aria-labelledby="brand-level">
        <div className="flex items-center justify-between">
          <h2 id="brand-level" className="font-bold">
            آموزش‌های سطح برند
          </h2>
          <Button
            variant="ghost"
            icon={<FilePlus2 className="size-4" aria-hidden />}
            onClick={() => setNewPkg({ productId: null })}
          >
            آموزش سطح برند
          </Button>
        </div>
        <PackageList items={byProduct(null)} empty="بسته سطح برند ندارد." />
      </section>

      <section className="flex flex-col gap-2" aria-labelledby="products-title">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="products-title" className="font-bold">
            محصولات ({toPersianDigits(list.length)})
          </h2>
          <div className="flex gap-2">
            <label className="flex min-h-12 items-center gap-2 text-sm text-text-secondary">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
                className="size-4 accent-primary"
              />
              نمایش بایگانی‌ها
            </label>
            <Button
              variant="secondary"
              icon={<Plus className="size-4" aria-hidden />}
              onClick={() => setEditProduct('new')}
            >
              محصول
            </Button>
          </div>
        </div>
        {products.isPending ? (
          <Skeleton className="h-32" />
        ) : list.length === 0 ? (
          <EmptyState title="محصولی ثبت نشده" />
        ) : (
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {list.map((p) => (
              <li key={p.id}>
                <Card className={cn('flex h-full flex-col gap-3', p.archived && 'opacity-60')}>
                  <div className="flex gap-3">
                    <ProductImage src={p.imageUrl} alt={p.name} className="size-20" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold leading-6">{p.name}</p>
                      <p className="text-xs text-text-secondary" dir="ltr">
                        {p.code}
                      </p>
                      {p.imageIsFallback && <p className="text-xs text-warning-fg">تصویر موقت</p>}
                    </div>
                  </div>
                  <PackageList items={byProduct(p.id)} empty="هنوز آموزشی ندارد." />
                  <div className="mt-auto flex flex-wrap gap-2">
                    <Button
                      variant="ghost"
                      className="px-2 text-xs"
                      icon={<FilePlus2 className="size-4" aria-hidden />}
                      onClick={() => setNewPkg({ productId: p.id })}
                    >
                      آموزش جدید
                    </Button>
                    <Button
                      variant="ghost"
                      className="px-2 text-xs"
                      icon={<RouteIcon className="size-4" aria-hidden />}
                      disabled={!publishedIds(byProduct(p.id)).length}
                      title={
                        publishedIds(byProduct(p.id)).length
                          ? undefined
                          : 'اول یک آموزش برای این محصول منتشر کنید'
                      }
                      onClick={() =>
                        setPathPreset({
                          name: `آشنایی کامل با ${p.name}`,
                          description: `آموزش‌های محصول «${p.name}» به ترتیب.`,
                          packageIds: publishedIds(byProduct(p.id)),
                        })
                      }
                    >
                      مسیر آشنایی کامل
                    </Button>
                    <Uploader
                      kind="image"
                      compact
                      label="تصویر"
                      target={{ type: 'product_image', id: p.id }}
                      onUploaded={(m) =>
                        patchProduct.mutateAsync({ pid: p.id, body: { imageMediaId: m.id } })
                      }
                    />
                    <Button
                      variant="ghost"
                      className="px-2 text-xs"
                      aria-label={`ویرایش ${p.name}`}
                      icon={<Pencil className="size-4" aria-hidden />}
                      onClick={() => setEditProduct(p)}
                    />
                    <Button
                      variant="ghost"
                      className="px-2 text-xs"
                      aria-label={p.archived ? 'فعال‌سازی' : 'بایگانی'}
                      icon={
                        p.archived ? (
                          <ArchiveRestore className="size-4" aria-hidden />
                        ) : (
                          <Archive className="size-4" aria-hidden />
                        )
                      }
                      onClick={() =>
                        patchProduct.mutate({ pid: p.id, body: { archived: !p.archived } })
                      }
                    />
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
      {editBrand && <BrandFormDialog open onClose={() => setEditBrand(false)} initial={brand} />}
      {pathPreset && <PathDialog preset={pathPreset} onClose={() => setPathPreset(null)} />}
      {editProduct && (
        <ProductFormDialog
          open
          onClose={() => setEditProduct(null)}
          brandId={brand.id}
          initial={editProduct === 'new' ? undefined : editProduct}
        />
      )}
      {newPkg && (
        <PackageFormDialog
          open
          onClose={() => setNewPkg(null)}
          presetBrandId={brand.id}
          presetProductId={newPkg.productId}
        />
      )}
      <ConfirmDialog
        open={archive}
        title="بایگانی برند؟"
        danger
        confirmText="بایگانی"
        loading={patchBrand.isPending}
        onClose={() => setArchive(false)}
        onConfirm={() => patchBrand.mutate({ archived: true })}
      >
        برند بایگانی‌شده در لیست‌ها نمایش داده نمی‌شود. آموزش‌های قبلی و پیشرفت‌ها حفظ می‌شوند.
      </ConfirmDialog>
    </div>
  );
}

function PackageList({ items, empty }: { items: AdminPackage[]; empty: string }) {
  if (!items.length) return <p className="text-xs text-muted-fg">{empty}</p>;
  return (
    <ul className="flex flex-col gap-1">
      {items.map((p) => (
        <li key={p.id}>
          <Link
            to={`/admin/packages/${p.id}`}
            className="flex min-h-12 items-center justify-between gap-2 rounded-input border border-border bg-background px-3 text-sm hover:border-primary/40"
          >
            <span className="line-clamp-1 font-medium">{p.title}</span>
            <StatusBadge status={p.status} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function BrandFormDialog({
  open,
  onClose,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  initial?: AdminBrand;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [nameLatin, setNameLatin] = useState(initial?.nameLatin ?? '');
  const [sortOrder, setSortOrder] = useState(String(initial?.sortOrder ?? 100));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const qc = useQueryClient();
  const toast = useToast();
  const m = useMutation({
    mutationFn: () => {
      const body = {
        name: name.trim(),
        nameLatin: nameLatin.trim() || null,
        sortOrder: Number(sortOrder) || 0,
      };
      return initial
        ? api.patch(`/admin/brands/${initial.id}`, body)
        : api.post('/admin/brands', body);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin'] });
      toast.show({ type: 'success', message: 'ذخیره شد.' });
      onClose();
    },
    onError: (e) =>
      e instanceof ApiError && Object.keys(e.fields).length
        ? setErrors(e.fields)
        : toast.show({ type: 'error', message: errMsg(e) }),
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? 'ویرایش برند' : 'برند جدید'}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            انصراف
          </Button>
          <Button
            loading={m.isPending}
            disabled={name.trim().length < 2}
            onClick={() => m.mutate()}
          >
            ذخیره
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Input
          label="نام برند"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name}
        />
        <Input
          label="نام لاتین (اختیاری)"
          ltr
          value={nameLatin}
          onChange={(e) => setNameLatin(e.target.value)}
          error={errors.nameLatin}
        />
        <Input
          label="ترتیب نمایش"
          type="number"
          ltr
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value)}
          error={errors.sortOrder}
        />
        {!initial && (
          <p className="text-xs text-text-secondary">
            بعد از ساخت، از صفحه برند لوگو را آپلود کنید. تا آن زمان لوگوی هلدینگ نمایش داده می‌شود.
          </p>
        )}
      </div>
    </Modal>
  );
}

function ProductFormDialog({
  open,
  onClose,
  brandId,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  brandId: string;
  initial?: AdminProduct;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [code, setCode] = useState(initial?.code ?? '');
  const [category, setCategory] = useState(initial?.category ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const qc = useQueryClient();
  const toast = useToast();
  const m = useMutation({
    mutationFn: () => {
      const body = {
        brandId,
        name: name.trim(),
        code: code.trim() || null,
        category: category.trim() || null,
        description: description.trim() || null,
      };
      return initial
        ? api.patch(`/admin/products/${initial.id}`, body)
        : api.post('/admin/products', body);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin'] });
      toast.show({ type: 'success', message: 'ذخیره شد.' });
      onClose();
    },
    onError: (e) =>
      e instanceof ApiError && Object.keys(e.fields).length
        ? setErrors(e.fields)
        : toast.show({ type: 'error', message: errMsg(e) }),
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? 'ویرایش محصول' : 'محصول جدید'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            انصراف
          </Button>
          <Button
            loading={m.isPending}
            disabled={name.trim().length < 2}
            onClick={() => m.mutate()}
          >
            ذخیره
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Input
          label="نام محصول"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="کد کالا"
            ltr
            value={code}
            onChange={(e) => setCode(e.target.value)}
            error={errors.code}
          />
          <Input
            label="دسته"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            error={errors.category}
          />
        </div>
        <Textarea
          label="توضیح"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          error={errors.description}
        />
      </div>
    </Modal>
  );
}
