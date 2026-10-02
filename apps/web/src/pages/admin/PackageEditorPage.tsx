import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  Check,
  Users,
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
import { ApiError, api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { toPersianDigits } from '@/lib/digits';
import { errMsg } from '@/lib/errors';
import { faDateTime, faDuration } from '@/lib/format';
import type { AdminAssignment, AdminPackageDetail, AdminPath, AdminSection } from '@/lib/types';
import { ak, useBrands, useProducts, useTeams, useUsers } from './adminQueries';
import { AssignmentDialog } from './AssignmentsPage';
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
  const [assign, setAssign] = useState(false);
  const assignments = useQuery({
    queryKey: ['admin', 'assignments'],
    queryFn: ({ signal }) => api.get<AdminAssignment[]>('/admin/assignments', signal),
  });
  const paths = useQuery({
    queryKey: ['admin', 'paths'],
    queryFn: ({ signal }) => api.get<AdminPath[]>('/admin/paths', signal),
  });
  const audience = (assignments.data ?? []).filter(
    (a) => !a.revokedAt && a.packageIds.includes(p.id),
  );
  const brand = brands.data?.find((b) => b.id === p.brandId);
  const product = products.data?.find((x) => x.id === p.productId);
  const live = d.sections.filter((s) => !s.archived);
  const archived = d.sections.filter((s) => s.archived);
  const refresh = () => void qc.invalidateQueries({ queryKey: ['admin'] });

  const action = useMutation({
    mutationFn: (a: 'publish' | 'unpublish' | 'archive' | 'unarchive') =>
      api.post<{
        notified?: number;
        recipients?: number;
        affectedAssignments?: number;
      }>(`/admin/packages/${p.id}/${a}`),
    onSuccess: (r, a) => {
      // `recipients` is undefined when the package was already published (nothing new to announce).
      const recipients = r?.recipients;
      const affected = r?.affectedAssignments ?? 0;
      let message = 'منتشر شد.';
      if (a === 'publish' && recipients)
        message = `منتشر شد و هم‌اکنون برای ${toPersianDigits(recipients)} مخاطب در دسترس است.`;
      if (a === 'publish' && recipients === 0)
        message =
          'منتشر شد؛ اما هنوز مخاطبی ندارد — تا وقتی در «مسیرها و مخاطبان» به کسی انتساب نگیرد، هیچ بازاریابی آن را نمی‌بیند.';
      if (a === 'unpublish') message = 'از انتشار خارج شد؛ پیشرفت‌های ثبت‌شده باقی می‌ماند.';
      if (a === 'unarchive') message = 'از بایگانی بازگردانده شد.';
      if (a === 'archive')
        message =
          affected > 0
            ? `بایگانی شد ${toPersianDigits(affected)} انتساب فعال هنوز به آن اشاره می‌کند.`
            : 'بایگانی شد.';
      toast.show({
        type: a === 'publish' && recipients === 0 ? 'warning' : 'success',
        message,
      });
      setConfirm(null);
      refresh();
    },
    onError: (e) => {
      setConfirm(null);
      // Publishing is refused with a list of concrete problems (`details.issues`); the generic
      // message alone left the admin guessing which of them was the blocker.
      const issues =
        e instanceof ApiError
          ? ((e.details as { issues?: string[] } | undefined)?.issues ?? [])
          : [];
      toast.show({
        type: 'error',
        message: issues.length
          ? `${errMsg(e)} ${issues.slice(0, 3).join(' | ')}${issues.length > 3 ? ' …' : ''}`
          : errMsg(e),
      });
    },
  });
  // One click: make a published package visible to every marketer (global assignment).
  const assignAll = useMutation({
    mutationFn: () =>
      api.post<{ recipients?: number }>('/admin/assignments', {
        type: 'global',
        packageIds: [p.id],
      }),
    onSuccess: (r) => {
      toast.show({
        type: 'success',
        message: r?.recipients
          ? `برای همه بازاریاب‌ها فعال شد (${toPersianDigits(r.recipients)} نفر).`
          : 'برای همه بازاریاب‌ها فعال شد.',
      });
      refresh();
    },
    onError: (e) => toast.show({ type: 'error', message: errMsg(e) }),
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
          <>
            {p.status === 'archived' && (
              <Button
                icon={<ArchiveRestore className="size-4" aria-hidden />}
                loading={action.isPending && action.variables === 'unarchive'}
                onClick={() => action.mutate('unarchive')}
              >
                بازگردانی از بایگانی
              </Button>
            )}
            <Button
              variant="ghost"
              icon={<Pencil className="size-4" aria-hidden />}
              onClick={() => setEditMeta(true)}
            >
              ویرایش
            </Button>
          </>
        }
      />
      <PackageSteps
        steps={[
          {
            label: 'محصول',
            done: !!p.brandId,
            hint: 'برند و محصول این آموزش را انتخاب کنید.',
            action: { text: 'انتخاب برند و محصول', run: () => setEditMeta(true) },
          },
          {
            label: 'قسمت‌ها',
            done: live.length > 0,
            hint: 'اولین قسمت را اضافه کنید: ویدیو، صوت یا لینک یوتیوب.',
            action: { text: 'افزودن قسمت', run: () => setSection('new') },
          },
          {
            label: 'آزمون‌ها',
            done: live.length > 0 && live.every((s) => (s.quiz?.questionCount ?? 0) >= 3),
            hint: 'برای هر قسمت حداقل ۳ سؤال بنویسید.',
            action: (() => {
              const s = live.find((x) => (x.quiz?.questionCount ?? 0) < 3);
              return s
                ? { text: `آزمون «${s.title}»`, to: `/admin/quizzes/${s.quizId}` }
                : undefined;
            })(),
          },
          {
            label: 'مهلت',
            done: !!p.deadlineAt,
            hint: 'تا چه روزی باید این آموزش تمام شود؟',
            action: { text: 'تعیین مهلت', run: () => setEditMeta(true) },
          },
          {
            label: 'انتشار',
            done: p.status === 'published',
            hint:
              d.publishIssues.length > 0
                ? 'موارد زرد رنگ کنار صفحه را کامل کنید تا انتشار فعال شود.'
                : 'همه چیز آماده است. منتشر کنید.',
            action:
              d.publishIssues.length > 0 || p.status === 'archived'
                ? undefined
                : { text: 'انتشار', run: () => setConfirm('publish') },
          },
          {
            label: 'مخاطبان',
            done: audience.length > 0,
            hint: 'مشخص کنید کدام بازاریاب‌ها این آموزش را ببینند.',
            action:
              p.status === 'published'
                ? { text: 'انتخاب مخاطبان', run: () => setAssign(true) }
                : undefined,
          },
        ]}
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
          </Card>
          <AudienceCard
            audience={audience}
            paths={paths.data ?? []}
            published={p.status === 'published'}
            onAssign={() => setAssign(true)}
            onAssignAll={() => assignAll.mutate()}
            assigningAll={assignAll.isPending}
          />
        </aside>
      </div>
      {editMeta && <PackageFormDialog open onClose={() => setEditMeta(false)} initial={p} />}
      {assign && <AssignmentDialog presetPackageIds={[p.id]} onClose={() => setAssign(false)} />}
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

interface Step {
  label: string;
  done: boolean;
  hint: string;
  action?: { text: string; run?: () => void; to?: string };
}

/** «در یک نگاه»: where this package is in the create → publish → assign journey, and what's next. */
function PackageSteps({ steps }: { steps: Step[] }) {
  const next = steps.find((s) => !s.done);
  return (
    <Card className="flex flex-col gap-3" data-testid="package-steps">
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-2" aria-label="مراحل آماده‌سازی">
        {steps.map((s, i) => (
          <li key={s.label} className="flex items-center gap-1">
            <span
              className={cn(
                'flex items-center gap-1.5 rounded-full px-3 py-1 text-sm',
                s.done
                  ? 'bg-primary-light font-bold text-primary'
                  : s === next
                    ? 'border-2 border-primary font-bold text-text'
                    : 'border border-border text-text-secondary',
              )}
            >
              {s.done ? (
                <Check className="size-4" aria-hidden />
              ) : (
                <span aria-hidden>{toPersianDigits(i + 1)}</span>
              )}
              {s.label}
              <span className="sr-only">{s.done ? ' (انجام شد)' : ' (مانده)'}</span>
            </span>
            {i < steps.length - 1 && <span className="h-px w-3 bg-border" aria-hidden />}
          </li>
        ))}
      </ol>
      {next ? (
        <div className="flex flex-col gap-2 rounded-input bg-background p-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-text">
            <span className="font-bold">قدم بعدی — {next.label}: </span>
            {next.hint}
          </p>
          {next.action &&
            (next.action.to ? (
              <Link
                to={next.action.to}
                className="flex min-h-12 shrink-0 items-center justify-center rounded-input bg-primary px-4 text-sm font-bold text-on-primary hover:bg-primary-hover"
              >
                {next.action.text}
              </Link>
            ) : (
              <Button className="shrink-0" onClick={next.action.run}>
                {next.action.text}
              </Button>
            ))}
        </div>
      ) : (
        <p className="rounded-input bg-primary-light p-3 text-sm font-bold text-primary">
          این آموزش کامل است: منتشر شده و بازاریاب‌ها آن را می‌بینند.
        </p>
      )}
    </Card>
  );
}

function AudienceCard({
  audience,
  paths,
  published,
  onAssign,
  onAssignAll,
  assigningAll,
}: {
  audience: AdminAssignment[];
  paths: AdminPath[];
  published: boolean;
  onAssign: () => void;
  onAssignAll: () => void;
  assigningAll: boolean;
}) {
  const teams = useTeams();
  const users = useUsers();
  const brands = useBrands();
  const name = (a: AdminAssignment) => {
    if (a.type === 'global') return 'همه بازاریاب‌ها';
    const list = a.type === 'team' ? teams.data : a.type === 'user' ? users.data : brands.data;
    const n = (list ?? []).find((x) => x.id === a.targetId)?.name ?? '—';
    return `${a.type === 'team' ? 'تیم' : a.type === 'user' ? 'فرد' : 'برند'}: ${n}`;
  };
  const pathName = new Map(paths.map((x) => [x.id, x.name]));
  return (
    <Card className="flex flex-col gap-2 text-sm" data-testid="audience-card">
      <h2 className="flex items-center gap-2 font-bold">
        <Users className="size-4 text-primary" aria-hidden /> چه کسانی این آموزش را می‌بینند؟
      </h2>
      {audience.length === 0 ? (
        published ? (
          <div
            role="alert"
            className="flex flex-col gap-2 rounded-input border border-warning bg-warning/10 p-3"
          >
            <p className="font-bold text-text">
              این آموزش منتشر شده، اما هیچ بازاریابی آن را نمی‌بیند.
            </p>
            <p className="text-text-secondary">
              تا مخاطب انتخاب نشود یا آموزش در یک مسیر یادگیری نباشد، در پنل بازاریاب نمایش داده
              نمی‌شود.
            </p>
            <Button onClick={onAssignAll} loading={assigningAll}>
              نمایش برای همه بازاریاب‌ها
            </Button>
          </div>
        ) : (
          <p className="text-text-secondary">بعد از انتشار، مخاطبان را انتخاب کنید.</p>
        )
      ) : (
        <ul className="flex flex-col gap-1">
          {audience.map((a) => (
            <li key={a.id} className="rounded-input bg-background px-2 py-1.5">
              <span className="font-medium">{name(a)}</span>
              {a.pathId && (
                <span className="block text-xs text-text-secondary">
                  از مسیر «{pathName.get(a.pathId) ?? '—'}»
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {published && (
        <Button variant="secondary" onClick={onAssign}>
          افزودن مخاطب
        </Button>
      )}
      <Link
        to="/admin/assignments"
        className="flex min-h-12 items-center justify-center gap-1 text-sm font-bold text-primary"
      >
        <Eye className="size-4" aria-hidden /> همه مسیرها و مخاطبان
      </Link>
    </Card>
  );
}
