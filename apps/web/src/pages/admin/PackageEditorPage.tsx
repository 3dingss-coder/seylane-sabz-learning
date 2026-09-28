import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Archive,
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  FileQuestion,
  Headphones,
  Pencil,
  PlayCircle,
  Plus,
  Rocket,
  Youtube,
} from 'lucide-react';
import { Button, Card, EmptyState, Skeleton, StatusBadge, useToast } from '@/components/ui';
import { PageHeader } from '@/components/common/PageHeader';
import { QueryState } from '@/components/common/QueryState';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { toPersianDigits } from '@/lib/digits';
import { errMsg } from '@/lib/errors';
import { faDateTime, faDuration } from '@/lib/format';
import type { AdminPackageDetail, AdminSection } from '@/lib/types';
import { ak, useBrands, useProducts } from './adminQueries';
import { PackageFormDialog } from './PackageFormDialog';
import { SectionEditor } from './SectionEditor';

/** A3 — ویرایشگر بسته: metadata, ordered sections, publish checklist. */
export function PackageEditorPage() {
  const { id = '' } = useParams();
  const q = useQuery({
    queryKey: ak.pkg(id),
    queryFn: ({ signal }) => api.get<AdminPackageDetail>(`/admin/packages/${id}`, signal),
  });
  return (
    <QueryState query={q} loading={<Skeleton className="h-64 w-full" />}>
      {(d) => <Editor d={d} />}
    </QueryState>
  );
}

function Editor({ d }: { d: AdminPackageDetail }) {
  const p = d.package;
  const qc = useQueryClient();
  const toast = useToast();
  const brands = useBrands();
  const products = useProducts(p.brandId ?? undefined);
  const [editMeta, setEditMeta] = useState(false);
  const [section, setSection] = useState<AdminSection | 'new' | null>(null);
  const [confirm, setConfirm] = useState<'publish' | 'unpublish' | 'archive' | null>(null);
  const brand = brands.data?.find((b) => b.id === p.brandId);
  const product = products.data?.find((x) => x.id === p.productId);
  const live = d.sections.filter((s) => !s.archived);
  const archived = d.sections.filter((s) => s.archived);
  const refresh = () => void qc.invalidateQueries({ queryKey: ['admin'] });

  const action = useMutation({
    mutationFn: (a: 'publish' | 'unpublish' | 'archive') =>
      api.post(`/admin/packages/${p.id}/${a}`),
    onSuccess: (_r, a) => {
      toast.show({
        type: 'success',
        message:
          a === 'publish'
            ? 'منتشر شد و برای مخاطبان فعال است.'
            : a === 'unpublish'
              ? 'از انتشار خارج شد.'
              : 'بایگانی شد.',
      });
      setConfirm(null);
      refresh();
    },
    onError: (e) => {
      setConfirm(null);
      toast.show({ type: 'error', message: errMsg(e) });
    },
  });
  const reorder = useMutation({
    mutationFn: (ids: string[]) => api.put(`/admin/packages/${p.id}/sections/order`, { ids }),
    onSuccess: refresh,
    onError: (e) => toast.show({ type: 'error', message: errMsg(e) }),
  });
  const patchSection = useMutation({
    mutationFn: ({ sid, body }: { sid: string; body: Record<string, unknown> }) =>
      api.patch(`/admin/packages/${p.id}/sections/${sid}`, body),
    onSuccess: refresh,
    onError: (e) => toast.show({ type: 'error', message: errMsg(e) }),
  });
  const move = (i: number, dir: -1 | 1) => {
    const ids = live.map((s) => s.id);
    const j = i + dir;
    const a = ids[i];
    const b = ids[j];
    if (a === undefined || b === undefined) return;
    ids[i] = b;
    ids[j] = a;
    reorder.mutate(ids);
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={p.title}
        back={p.brandId ? `/admin/content/brands/${p.brandId}` : '/admin/content?tab=unassigned'}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={p.status} />
            {brand ? (
              `${brand.name}${product ? ` • ${product.name}` : ' • آموزش سطح برند'}`
            ) : (
              <span className="font-bold text-warning-fg">بدون تخصیص</span>
            )}
          </span>
        }
        actions={
          <Button
            variant="ghost"
            icon={<Pencil className="size-4" aria-hidden />}
            onClick={() => setEditMeta(true)}
          >
            ویرایش
          </Button>
        }
      />
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <section className="flex flex-col gap-2 lg:flex-1" aria-labelledby="sections-h">
          <div className="flex items-center justify-between">
            <h2 id="sections-h" className="font-bold">
              قسمت‌ها ({toPersianDigits(live.length)})
            </h2>
            <Button
              variant="secondary"
              icon={<Plus className="size-4" aria-hidden />}
              onClick={() => setSection('new')}
            >
              افزودن قسمت
            </Button>
          </div>
          {live.length === 0 ? (
            <EmptyState
              title="هنوز قسمتی ندارد"
              description="اولین قسمت (ویدیو یا صوت) را اضافه کنید."
              actionText="افزودن قسمت"
              onAction={() => setSection('new')}
            />
          ) : (
            <ol className="flex flex-col gap-2">
              {live.map((s, i) => {
                const Icon =
                  s.mediaType === 'audio'
                    ? Headphones
                    : s.mediaSource === 'youtube'
                      ? Youtube
                      : PlayCircle;
                const qCount = s.quiz?.questionCount ?? 0;
                return (
                  <li key={s.id}>
                    <Card className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <div className="flex flex-1 items-center gap-3">
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-card bg-primary-light text-primary">
                          <Icon className="size-5" aria-hidden />
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-bold">
                            {toPersianDigits(i + 1)}. {s.title}
                          </p>
                          <p className="text-xs text-text-secondary">
                            {s.mediaType === 'audio'
                              ? 'صوت'
                              : s.mediaSource === 'youtube'
                                ? 'یوتیوب'
                                : 'ویدیو'}{' '}
                            • {faDuration(s.durationSec)} •{' '}
                            <span className={cn(qCount < 3 && 'font-bold text-danger')}>
                              {toPersianDigits(qCount)} سؤال
                            </span>
                            {s.quiz?.needsReview && (
                              <span className="ms-1 font-bold text-warning-fg">
                                • نیاز به بازبینی
                              </span>
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-1">
                        <Button
                          variant="ghost"
                          className="px-2"
                          aria-label="بالا"
                          disabled={i === 0 || reorder.isPending}
                          onClick={() => move(i, -1)}
                          icon={<ArrowUp className="size-4" />}
                        />
                        <Button
                          variant="ghost"
                          className="px-2"
                          aria-label="پایین"
                          disabled={i === live.length - 1 || reorder.isPending}
                          onClick={() => move(i, 1)}
                          icon={<ArrowDown className="size-4" />}
                        />
                        <Link
                          to={`/admin/quizzes/${s.quizId}`}
                          className="flex min-h-12 items-center gap-1 rounded-input px-3 text-sm font-bold text-primary hover:bg-primary-light"
                        >
                          <FileQuestion className="size-4" aria-hidden /> آزمون
                        </Link>
                        <Button
                          variant="ghost"
                          className="px-2"
                          aria-label={`ویرایش ${s.title}`}
                          onClick={() => setSection(s)}
                          icon={<Pencil className="size-4" />}
                        />
                        <Button
                          variant="ghost"
                          className="px-2"
                          aria-label={`بایگانی ${s.title}`}
                          onClick={() =>
                            patchSection.mutate({ sid: s.id, body: { archived: true } })
                          }
                          icon={<Archive className="size-4" />}
                        />
                      </div>
                    </Card>
                  </li>
                );
              })}
            </ol>
          )}
          {archived.length > 0 && (
            <details className="rounded-card border border-border bg-surface p-3 text-sm">
              <summary className="min-h-8 cursor-pointer font-bold text-text-secondary">
                قسمت‌های بایگانی‌شده ({toPersianDigits(archived.length)})
              </summary>
              <ul className="mt-2 flex flex-col gap-1">
                {archived.map((s) => (
                  <li key={s.id} className="flex items-center justify-between">
                    {s.title}
                    <Button
                      variant="ghost"
                      onClick={() => patchSection.mutate({ sid: s.id, body: { archived: false } })}
                    >
                      بازگردانی
                    </Button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
        <aside className="flex flex-col gap-3 lg:w-80">
          <Card className="flex flex-col gap-2 text-sm">
            <h2 className="font-bold">انتشار</h2>
            <p className="text-text-secondary">
              مهلت: {p.deadlineAt ? faDateTime(p.deadlineAt) : 'تعیین نشده'}
            </p>
            {p.description && <p className="leading-6 text-text-secondary">{p.description}</p>}
            {d.publishIssues.length > 0 && p.status !== 'published' && (
              <ul className="flex flex-col gap-1 rounded-input bg-warning-light p-2">
                {d.publishIssues.map((x) => (
                  <li key={x} className="flex items-start gap-1 text-xs text-text">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />{' '}
                    {x}
                  </li>
                ))}
              </ul>
            )}
            {p.status === 'published' ? (
              <Button
                variant="secondary"
                icon={<EyeOff className="size-4" aria-hidden />}
                onClick={() => setConfirm('unpublish')}
              >
                خروج از انتشار
              </Button>
            ) : (
              <Button
                icon={<Rocket className="size-4" aria-hidden />}
                disabled={d.publishIssues.length > 0}
                onClick={() => setConfirm('publish')}
              >
                انتشار
              </Button>
            )}
            {p.status !== 'archived' && (
              <Button
                variant="ghost"
                icon={<Archive className="size-4" aria-hidden />}
                onClick={() => setConfirm('archive')}
              >
                بایگانی بسته
              </Button>
            )}
            {p.status === 'published' && (
              <Link
                to="/admin/assignments"
                className="flex min-h-12 items-center justify-center gap-1 text-sm font-bold text-primary"
              >
                <Eye className="size-4" aria-hidden /> مدیریت انتساب‌ها
              </Link>
            )}
          </Card>
        </aside>
      </div>
      {editMeta && <PackageFormDialog open onClose={() => setEditMeta(false)} initial={p} />}
      {section && (
        <SectionEditor
          open
          onClose={() => setSection(null)}
          packageId={p.id}
          initial={section === 'new' ? undefined : section}
        />
      )}
      <ConfirmDialog
        open={confirm !== null}
        title={
          confirm === 'publish'
            ? 'انتشار بسته؟'
            : confirm === 'unpublish'
              ? 'خروج از انتشار؟'
              : 'بایگانی بسته؟'
        }
        danger={confirm !== 'publish'}
        loading={action.isPending}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && action.mutate(confirm)}
      >
        {confirm === 'publish'
          ? 'بعد از انتشار، بسته برای مخاطبان انتساب‌یافته نمایش داده می‌شود و اعلان «آموزش جدید» ارسال می‌شود.'
          : confirm === 'unpublish'
            ? 'بسته از لیست بازاریاب‌ها پنهان می‌شود. پیشرفت‌ها حفظ می‌شود.'
            : 'بسته بایگانی می‌شود و دیگر نمایش داده نمی‌شود. سوابق حفظ می‌شود.'}
      </ConfirmDialog>
    </div>
  );
}
