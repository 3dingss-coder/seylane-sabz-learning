import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AudioLines,
  CheckCircle2,
  Film,
  Library,
  RotateCcw,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { Select } from '@/components/common/Field';
import { PageHeader } from '@/components/common/PageHeader';
import { QueryState } from '@/components/common/QueryState';
import {
  Button,
  Card,
  EmptyState,
  Input,
  Modal,
  ProgressBar,
  Skeleton,
  useToast,
} from '@/components/ui';
import { Tabs } from '@/components/common/Field';
import { ApiError, api } from '@/lib/api';
import { toPersianDigits } from '@/lib/digits';
import { faDuration } from '@/lib/format';
import { formatEta } from '@/lib/mediaLibrary/eta';
import { sectionBodyFromItem } from '@/lib/mediaLibrary/sections';
import { getUploadQueue, setOnItemReady, useUploadJobs, type Job } from '@/lib/mediaLibrary/queue';
import type { LibraryItem } from '@/lib/mediaLibrary/types';
import { errMsg } from '@/lib/errors';
import { ak, useBrands, usePackagesAdmin, useProducts } from './adminQueries';

const libKey = ['admin', 'media-library'] as const;
const NEW_PACKAGE = '__new__';

const fmtSize = (bytes: number | null) =>
  bytes
    ? `${toPersianDigits((bytes / 1048576).toFixed(bytes < 10 * 1048576 ? 1 : 0))} مگابایت`
    : '—';

/** Viewers only see simple, human stages — no codec/technical wording. */
const STAGE_LABEL: Record<Job['stage'], string> = {
  queued: 'در صف',
  preparing: 'در حال آماده‌سازی فایل',
  uploading: 'در حال بارگذاری',
  finalizing: 'در حال نهایی‌سازی',
  done: 'آماده شد',
  error: 'ناموفق',
  canceled: 'لغو شد',
};

export function MediaLibraryPage() {
  const qc = useQueryClient();
  const jobs = useUploadJobs();
  const [kind, setKind] = useState<'all' | 'video' | 'audio'>('all');
  const [brandId, setBrandId] = useState('');
  const [onlyUnassigned, setOnlyUnassigned] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<LibraryItem | null>(null);

  useEffect(() => {
    setOnItemReady(() => void qc.invalidateQueries({ queryKey: libKey }));
    return () => setOnItemReady(() => {});
  }, [qc]);

  // Leaving the tab kills compression/upload — warn only while something is running.
  const active = jobs.some((j) =>
    ['queued', 'preparing', 'uploading', 'finalizing'].includes(j.stage),
  );
  useEffect(() => {
    if (!active) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [active]);

  const params = new URLSearchParams();
  if (kind !== 'all') params.set('kind', kind);
  if (brandId) params.set('brandId', brandId);
  if (onlyUnassigned) params.set('unassigned', 'true');
  if (search.trim()) params.set('q', search.trim());
  const qs = params.toString();
  const list = useQuery({
    queryKey: [...libKey, qs],
    queryFn: ({ signal }) =>
      api.get<LibraryItem[]>(`/admin/media/library${qs ? `?${qs}` : ''}`, signal),
    refetchInterval: active ? 15_000 : false,
  });
  const brands = useBrands();

  return (
    <div>
      <PageHeader
        title="کتابخانه رسانه"
        subtitle="ویدئو و صوت را یک‌بار بارگذاری کنید، به برند و محصول اختصاص دهید و در آموزش‌ها استفاده کنید."
      />
      <UploadPanel />
      <JobList jobs={jobs} />

      <section aria-label="فایل‌های کتابخانه" className="mt-6">
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <div className="min-w-[14rem] flex-1">
            <Tabs
              label="نوع رسانه"
              value={kind}
              onChange={setKind}
              items={[
                { value: 'all', label: 'همه' },
                { value: 'video', label: 'ویدئو' },
                { value: 'audio', label: 'صوت' },
              ]}
            />
          </div>
          <div className="w-full sm:w-52">
            <Select label="برند" value={brandId} onChange={(e) => setBrandId(e.target.value)}>
              <option value="">همه برندها</option>
              {(brands.data ?? [])
                .filter((b) => !b.archived)
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
            </Select>
          </div>
          <div className="w-full sm:w-52">
            <Input
              label="جستجو"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="نام فایل…"
            />
          </div>
          <label className="mb-1.5 flex min-h-12 items-center gap-2 text-sm text-text">
            <input
              type="checkbox"
              checked={onlyUnassigned}
              onChange={(e) => setOnlyUnassigned(e.target.checked)}
              className="size-5"
            />
            بدون برند
          </label>
        </div>

        <QueryState
          query={list}
          loading={<Skeleton className="h-40 w-full" />}
          isEmpty={(d) => d.length === 0}
          empty={
            <EmptyState
              icon={<Library className="size-10" aria-hidden />}
              title="هنوز فایلی در کتابخانه نیست"
              description="فایل‌های ویدئویی یا صوتی را در کادر بالا رها کنید."
            />
          }
        >
          {(items) => (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((it) => (
                <li key={it.id}>
                  <MediaCard item={it} onOpen={() => setSelected(it)} />
                </li>
              ))}
            </ul>
          )}
        </QueryState>
      </section>

      {selected && (
        <ItemModal key={selected.id} item={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

function UploadPanel() {
  const brands = useBrands();
  const [brandId, setBrandId] = useState('');
  const [productId, setProductId] = useState('');
  const products = useProducts(brandId || undefined);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const add = (files: FileList | File[] | null) => {
    const list = Array.from(files ?? []);
    if (!list.length) return;
    getUploadQueue().add(
      list.map((file) => ({ file, brandId: brandId || null, productId: productId || null })),
    );
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    add(e.dataTransfer.files);
  };

  return (
    <Card>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={`flex flex-col items-center gap-3 rounded-card border-2 border-dashed p-6 text-center transition-colors ${
          over ? 'border-primary bg-primary-light' : 'border-border'
        }`}
      >
        <UploadCloud className="size-10 text-primary" aria-hidden />
        <p className="text-sm text-text">فایل‌های ویدئویی یا صوتی را اینجا رها کنید</p>
        <p className="text-xs text-text-secondary">
          حجم فایل مهم نیست؛ سیستم خودش آن را برای پخش روان آماده می‌کند. تا پایان کار این صفحه را
          نبندید.
        </p>
        <Button
          onClick={() => input.current?.click()}
          icon={<UploadCloud className="size-4" aria-hidden />}
        >
          انتخاب فایل
        </Button>
        <input
          ref={input}
          type="file"
          multiple
          accept="video/*,audio/*,.m4a,.mkv,.mov,.avi,.webm,.mp3,.wav,.aac,.ogg,.3gp"
          className="hidden"
          onChange={(e) => {
            add(e.target.files);
            e.target.value = '';
          }}
        />
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Select
          label="اختصاص فایل‌های جدید به برند (اختیاری)"
          value={brandId}
          onChange={(e) => {
            setBrandId(e.target.value);
            setProductId('');
          }}
        >
          <option value="">بعداً مشخص می‌کنم</option>
          {(brands.data ?? [])
            .filter((b) => !b.archived)
            .map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
        </Select>
        <Select
          label="محصول (اختیاری)"
          value={productId}
          disabled={!brandId}
          onChange={(e) => setProductId(e.target.value)}
        >
          <option value="">کل برند</option>
          {(products.data ?? [])
            .filter((p) => !p.archived)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
        </Select>
      </div>
    </Card>
  );
}

function JobList({ jobs }: { jobs: Job[] }) {
  if (!jobs.length) return null;
  const q = getUploadQueue();
  const finished = jobs.some((j) => j.stage === 'done' || j.stage === 'canceled');
  return (
    <section aria-label="در حال بارگذاری" className="mt-4 space-y-2">
      {finished && (
        <div className="flex justify-end">
          <Button variant="ghost" onClick={() => q.clearFinished()}>
            پاک‌کردن موارد تمام‌شده
          </Button>
        </div>
      )}
      {jobs.map((j) => {
        const running = ['preparing', 'uploading', 'finalizing'].includes(j.stage);
        return (
          <Card key={j.id} className="space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-text" dir="auto">
                  {j.fileName}
                </p>
                <p className="text-xs text-text-secondary">
                  {STAGE_LABEL[j.stage]}
                  {running && ` • ${formatEta(j.etaMs)}`}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {(j.stage === 'error' || j.stage === 'canceled') && (
                  <Button
                    variant="ghost"
                    aria-label="تلاش دوباره"
                    onClick={() => q.retry(j.id)}
                    icon={<RotateCcw className="size-4" aria-hidden />}
                  >
                    تلاش دوباره
                  </Button>
                )}
                {(j.stage === 'queued' || running) && (
                  <Button
                    variant="ghost"
                    aria-label="لغو"
                    onClick={() => q.cancel(j.id)}
                    icon={<X className="size-4" aria-hidden />}
                  >
                    لغو
                  </Button>
                )}
                {['error', 'canceled', 'done'].includes(j.stage) && (
                  <Button
                    variant="ghost"
                    aria-label="حذف از فهرست"
                    onClick={() => q.dismiss(j.id)}
                    icon={<X className="size-4" aria-hidden />}
                  >
                    بستن
                  </Button>
                )}
              </div>
            </div>
            {j.stage !== 'error' && j.stage !== 'canceled' && (
              <div className="flex items-center gap-3">
                <ProgressBar
                  value={j.progress * 100}
                  label={`پیشرفت ${j.fileName}`}
                  className="flex-1"
                />
                <span className="w-10 shrink-0 text-end text-xs tabular-nums text-text-secondary">
                  {toPersianDigits(Math.round(j.progress * 100))}٪
                </span>
              </div>
            )}
            {j.stage === 'done' && (
              <p className="flex items-center gap-1 text-xs font-medium text-primary">
                <CheckCircle2 className="size-4" aria-hidden /> به کتابخانه اضافه شد
              </p>
            )}
            {j.note && <p className="text-xs text-warning">{j.note}</p>}
            {j.detail && (
              <p className="text-[11px] text-text-secondary" dir="ltr">
                {j.detail}
              </p>
            )}
            {j.error && <p className="text-xs font-medium text-danger">{j.error}</p>}
          </Card>
        );
      })}
    </section>
  );
}

function MediaCard({ item, onOpen }: { item: LibraryItem; onOpen: () => void }) {
  const Icon = item.kind === 'video' ? Film : AudioLines;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full flex-col gap-2 rounded-card border border-border bg-surface p-4 text-start shadow-sm transition-colors hover:border-primary focus-visible:outline-2"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-card bg-primary-light text-primary">
          <Icon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-text" dir="auto">
            {item.title}
          </p>
          <p className="text-xs text-text-secondary">
            {fmtSize(item.sizeBytes)}
            {item.durationSec ? ` • ${faDuration(item.durationSec)}` : ''}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 text-xs">
        {item.brandName ? (
          <span className="rounded-full bg-primary-light px-2 py-0.5 text-primary">
            {item.brandName}
            {item.productName ? ` › ${item.productName}` : ''}
          </span>
        ) : (
          <span className="rounded-full bg-border/60 px-2 py-0.5 text-text-secondary">
            بدون برند
          </span>
        )}
        {item.usedBy.length > 0 && (
          <span className="rounded-full bg-border/60 px-2 py-0.5 text-text-secondary">
            در {toPersianDigits(item.usedBy.length)} آموزش
          </span>
        )}
      </div>
    </button>
  );
}

/**
 * Put this file into a training: pick one of the brand's packages and a section title; the file
 * becomes a new section there. This is what makes a library file actually show up for marketers.
 */
function AddToPackage({
  item,
  brandId,
  productId,
}: {
  item: LibraryItem;
  brandId: string;
  productId: string;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const brands = useBrands();
  const pkgs = usePackagesAdmin(brandId ? `brandId=${brandId}` : '');
  const [picked, setPicked] = useState('');
  const [sectionTitle, setSectionTitle] = useState(item.title);
  const [added, setAdded] = useState<{ packageId: string; packageTitle: string } | null>(null);

  const brandName = (id: string | null) => brands.data?.find((b) => b.id === id)?.name;
  const options = useMemo(() => {
    const all = (pkgs.data ?? []).filter(
      (p) => p.status !== 'archived' && (!brandId || p.brandId === brandId),
    );
    const mine = (p: { productId: string | null }) =>
      Boolean(productId) && p.productId === productId;
    return [...all].sort((a, b) => Number(mine(b)) - Number(mine(a)));
  }, [pkgs.data, brandId, productId]);

  // The obvious choice is made for the admin: the only candidate is preselected.
  const packageId = picked || (options.length === 1 ? (options[0]?.id ?? '') : '');
  const isNew = packageId === NEW_PACKAGE;

  const add = useMutation({
    mutationFn: async () => {
      let targetId = packageId;
      let targetTitle = options.find((p) => p.id === packageId)?.title ?? '';
      if (isNew) {
        const created = await api.post<{ id: string; title: string }>('/admin/packages', {
          title:
            sectionTitle.trim().length >= 3
              ? sectionTitle.trim()
              : `${sectionTitle.trim()} (آموزش)`,
          brandId: brandId || null,
          productId: productId || null,
        });
        targetId = created.id;
        targetTitle = created.title;
        try {
          await api.post(
            `/admin/packages/${targetId}/sections`,
            sectionBodyFromItem(item, sectionTitle),
          );
        } catch (e) {
          // Never leave an empty draft behind when the section could not be created.
          await api.post(`/admin/packages/${targetId}/archive`).catch(() => {});
          throw e;
        }
      } else {
        await api.post(
          `/admin/packages/${targetId}/sections`,
          sectionBodyFromItem(item, sectionTitle),
        );
      }
      return { packageId: targetId, packageTitle: targetTitle };
    },
    onSuccess: (r) => {
      setAdded(r);
      void qc.invalidateQueries({ queryKey: libKey });
      void qc.invalidateQueries({ queryKey: ak.pkg(r.packageId) });
      void qc.invalidateQueries({ queryKey: ['admin', 'packages'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'tree'] });
    },
    onError: (e) => toast.show({ type: 'error', message: errMsg(e) }),
  });

  if (added)
    return (
      <div
        role="status"
        className="rounded-card border border-primary bg-primary-light p-3 text-sm"
      >
        <p className="font-bold text-text">به آموزش «{added.packageTitle}» اضافه شد.</p>
        <p className="mt-1 text-text-secondary">
          فقط سؤال‌های آزمون این قسمت را بنویسید و آموزش را منتشر کنید.
        </p>
        <Link
          to={`/admin/packages/${added.packageId}`}
          className="mt-2 inline-block font-bold text-primary underline"
        >
          رفتن به آموزش
        </Link>
      </div>
    );

  return (
    <div className="space-y-3 rounded-card border border-border p-3">
      <p className="text-sm font-bold text-text">افزودن به یک آموزش</p>
      <Select
        label="آموزش"
        value={packageId}
        onChange={(e) => setPicked(e.target.value)}
        hint={
          isNew && !brandId
            ? 'برای ساخت آموزش جدید، ابتدا برند را انتخاب و ذخیره کنید.'
            : options.length === 0 && brandId
              ? 'این برند هنوز آموزشی ندارد؛ «آموزش جدید از این فایل» را بزنید.'
              : undefined
        }
      >
        <option value="">انتخاب آموزش…</option>
        <option value={NEW_PACKAGE}>＋ آموزش جدید از این فایل</option>
        {options.map((p) => (
          <option key={p.id} value={p.id}>
            {p.title}
            {!brandId && brandName(p.brandId) ? ` — ${brandName(p.brandId)}` : ''}
            {p.status === 'draft' ? ' (پیش‌نویس)' : ''}
          </option>
        ))}
      </Select>
      <Input
        label={isNew ? 'عنوان آموزش و قسمت' : 'عنوان قسمت'}
        value={sectionTitle}
        onChange={(e) => setSectionTitle(e.target.value)}
        maxLength={120}
      />
      <Button
        onClick={() => add.mutate()}
        loading={add.isPending}
        disabled={!packageId || sectionTitle.trim().length < 2 || (isNew && !brandId)}
      >
        {isNew ? 'ساخت آموزش و قسمت' : 'افزودن به آموزش'}
      </Button>
    </div>
  );
}

function ItemModal({ item, onClose }: { item: LibraryItem; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const brands = useBrands();
  const [title, setTitle] = useState(item.title);
  const [brandId, setBrandId] = useState(item.brandId ?? '');
  const [productId, setProductId] = useState(item.productId ?? '');
  const products = useProducts(brandId || undefined);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const preview = useQuery({
    queryKey: [...libKey, 'preview', item.id],
    queryFn: ({ signal }) =>
      api.get<{ url: string; mime: string | null; kind: 'video' | 'audio' }>(
        `/admin/media/library/${item.id}/preview-url`,
        signal,
      ),
    staleTime: 10 * 60_000,
  });

  const dirty = useMemo(
    () =>
      title.trim() !== item.title ||
      brandId !== (item.brandId ?? '') ||
      productId !== (item.productId ?? ''),
    [title, brandId, productId, item],
  );

  const fail = (e: unknown) =>
    toast.show({
      type: 'error',
      message: e instanceof ApiError ? e.message : 'ذخیره نشد. دوباره تلاش کنید.',
    });

  const save = useMutation({
    mutationFn: () =>
      api.patch<LibraryItem>(`/admin/media/library/${item.id}`, {
        title: title.trim() || item.title,
        brandId: brandId || null,
        productId: productId || null,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: libKey });
      toast.show({ type: 'success', message: 'تغییرات ذخیره شد.' });
      onClose();
    },
    onError: fail,
  });
  const remove = useMutation({
    mutationFn: () => api.del(`/admin/media/library/${item.id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: libKey });
      toast.show({ type: 'success', message: 'فایل حذف شد.' });
      onClose();
    },
    onError: (e) => {
      setConfirmDelete(false);
      fail(e);
    },
  });

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title="جزئیات رسانه"
        size="lg"
        footer={
          <>
            <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!dirty}>
              ذخیره
            </Button>
            <Button variant="ghost" onClick={onClose}>
              بستن
            </Button>
            <Button
              variant="danger"
              className="me-auto"
              disabled={item.usedBy.length > 0}
              title={
                item.usedBy.length ? 'این فایل در آموزش‌ها استفاده شده و حذف نمی‌شود.' : undefined
              }
              onClick={() => setConfirmDelete(true)}
              icon={<Trash2 className="size-4" aria-hidden />}
            >
              حذف
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {preview.data &&
            (item.kind === 'video' ? (
              // eslint-disable-next-line jsx-a11y/media-has-caption -- admin preview of an internal training file
              <video
                src={preview.data.url}
                controls
                preload="metadata"
                className="max-h-72 w-full rounded-card bg-black"
              />
            ) : (
              // eslint-disable-next-line jsx-a11y/media-has-caption -- admin preview of an internal training file
              <audio src={preview.data.url} controls preload="metadata" className="w-full" />
            ))}
          <Input
            label="عنوان"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={160}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              label="برند"
              value={brandId}
              hint={
                item.assignmentInferred && !dirty
                  ? 'برند از آموزشی که این فایل را استفاده می‌کند گرفته شده است.'
                  : undefined
              }
              onChange={(e) => {
                setBrandId(e.target.value);
                setProductId('');
              }}
            >
              <option value="">بدون برند</option>
              {(brands.data ?? [])
                .filter((b) => !b.archived)
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
            </Select>
            <Select
              label="محصول"
              value={productId}
              disabled={!brandId}
              onChange={(e) => setProductId(e.target.value)}
            >
              <option value="">کل برند</option>
              {(products.data ?? [])
                .filter((p) => !p.archived)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </Select>
          </div>
          <p className="text-xs text-text-secondary">
            {fmtSize(item.sizeBytes)}
            {item.durationSec ? ` • ${faDuration(item.durationSec)}` : ''} • فایل اصلی:{' '}
            <span dir="auto">{item.originalName}</span>
          </p>
          <AddToPackage item={item} brandId={brandId} productId={productId} />
          {item.usedBy.length > 0 && (
            <div>
              <p className="mb-1 text-sm font-medium text-text">استفاده‌شده در:</p>
              <ul className="list-inside list-disc text-sm text-text-secondary">
                {item.usedBy.map((u) => (
                  <li key={u.sectionId}>
                    {u.packageTitle} — {u.sectionTitle}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Modal>
      <ConfirmDialog
        open={confirmDelete}
        title="حذف فایل"
        danger
        confirmText="حذف"
        loading={remove.isPending}
        onConfirm={() => remove.mutate()}
        onClose={() => setConfirmDelete(false)}
      >
        این فایل برای همیشه از کتابخانه حذف می‌شود.
      </ConfirmDialog>
    </>
  );
}
