import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, CalendarClock, Pencil, Plus, Trash2, X } from 'lucide-react';
import { Button, Card, EmptyState, Input, Modal, TableSkeleton, useToast } from '@/components/ui';
import { Select, Tabs, Textarea } from '@/components/common/Field';
import { PageHeader } from '@/components/common/PageHeader';
import { QueryState } from '@/components/common/QueryState';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { ApiError, api } from '@/lib/api';
import { toPersianDigits } from '@/lib/digits';
import { errMsg } from '@/lib/errors';
import { faDate } from '@/lib/format';
import type { AdminAssignment, AdminPath } from '@/lib/types';
import { useBrands, usePackagesAdmin, useTeams, useUsers } from './adminQueries';
import { fromLocalInput, toLocalInput } from '@/lib/dates';

type Scope = 'global' | 'team' | 'user' | 'brand';
const SCOPE_LABEL: Record<Scope, string> = {
  global: 'همه بازاریاب‌ها',
  team: 'تیم',
  user: 'فرد',
  brand: 'برند',
};

function useTargetNames() {
  const teams = useTeams();
  const users = useUsers();
  const brands = useBrands();
  return useMemo(() => {
    const m = new Map<string, string>();
    for (const t of teams.data ?? []) m.set(`team:${t.id}`, t.name);
    for (const u of users.data ?? []) m.set(`user:${u.id}`, u.name);
    for (const b of brands.data ?? []) m.set(`brand:${b.id}`, b.name);
    return (type: Scope, id: string | null) =>
      type === 'global'
        ? SCOPE_LABEL.global
        : `${SCOPE_LABEL[type]}: ${(id && m.get(`${type}:${id}`)) ?? '—'}`;
  }, [teams.data, users.data, brands.data]);
}

function TargetPicker({
  type,
  value,
  onChange,
  error,
}: {
  type: Scope;
  value: string;
  onChange: (v: string) => void;
  error?: string;
}) {
  const teams = useTeams();
  const users = useUsers();
  const brands = useBrands();
  if (type === 'global') return null;
  const opts =
    type === 'team'
      ? (teams.data ?? []).map((t) => [t.id, t.name] as const)
      : type === 'user'
        ? (users.data ?? [])
            .filter((u) => u.role === 'marketer' && u.status === 'active')
            .map((u) => [u.id, u.name] as const)
        : (brands.data ?? []).filter((b) => !b.archived).map((b) => [b.id, b.name] as const);
  return (
    <Select
      label={SCOPE_LABEL[type]}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      error={error}
    >
      <option value="">انتخاب کنید</option>
      {opts.map(([id, n]) => (
        <option key={id} value={id}>
          {n}
        </option>
      ))}
    </Select>
  );
}

/** A5 — انتساب و مسیرها. */
export function AssignmentsPage() {
  const [tab, setTab] = useState<'assignments' | 'paths'>('assignments');
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="انتساب و مسیرها" subtitle="چه کسی کدام آموزش را ببیند" />
      <Tabs
        label="بخش"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'assignments', label: 'انتساب‌ها' },
          { value: 'paths', label: 'مسیرهای یادگیری' },
        ]}
      />
      {tab === 'assignments' ? <Assignments /> : <Paths />}
    </div>
  );
}

function Assignments() {
  const q = useQuery({
    queryKey: ['admin', 'assignments'],
    queryFn: ({ signal }) => api.get<AdminAssignment[]>('/admin/assignments', signal),
  });
  const pkgs = usePackagesAdmin();
  const title = useMemo(() => new Map((pkgs.data ?? []).map((p) => [p.id, p.title])), [pkgs.data]);
  const target = useTargetNames();
  const [create, setCreate] = useState(false);
  const [revoke, setRevoke] = useState<AdminAssignment | null>(null);
  const qc = useQueryClient();
  const toast = useToast();
  const del = useMutation({
    mutationFn: (id: string) => api.del(`/admin/assignments/${id}`),
    onSuccess: () => {
      setRevoke(null);
      toast.show({ type: 'success', message: 'انتساب لغو شد. پیشرفت‌های قبلی حفظ می‌شود.' });
      void qc.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: (e) => toast.show({ type: 'error', message: errMsg(e) }),
  });
  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button icon={<Plus className="size-4" aria-hidden />} onClick={() => setCreate(true)}>
          انتساب جدید
        </Button>
      </div>
      <QueryState query={q} loading={<TableSkeleton rows={4} />}>
        {(list) => {
          const active = list.filter((a) => !a.revokedAt);
          return active.length === 0 ? (
            <EmptyState
              title="انتسابی وجود ندارد"
              description="بسته‌های منتشرشده را به همه، یک تیم، یک برند یا یک فرد بدهید."
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {active.map((a) => (
                <li key={a.id}>
                  <Card className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-bold">{target(a.type, a.targetId)}</p>
                      <ul className="mt-1 flex flex-wrap gap-1">
                        {a.packageIds.map((id) => (
                          <li key={id} className="rounded-full bg-background px-2 py-1 text-xs">
                            {title.get(id) ?? id}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <Button
                      variant="ghost"
                      className="text-danger"
                      icon={<X className="size-4" aria-hidden />}
                      onClick={() => setRevoke(a)}
                    >
                      لغو
                    </Button>
                  </Card>
                </li>
              ))}
            </ul>
          );
        }}
      </QueryState>
      {create && <AssignmentDialog onClose={() => setCreate(false)} />}
      <ConfirmDialog
        open={revoke !== null}
        title="لغو انتساب؟"
        danger
        confirmText="لغو انتساب"
        loading={del.isPending}
        onClose={() => setRevoke(null)}
        onConfirm={() => revoke && del.mutate(revoke.id)}
      >
        این آموزش‌ها از لیست مخاطبان این انتساب حذف می‌شوند (مگر از انتساب دیگری داشته باشند).
      </ConfirmDialog>
    </div>
  );
}

function PackagePicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const pkgs = usePackagesAdmin('status=published');
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-medium">بسته‌های منتشرشده</legend>
      <div className="flex max-h-56 flex-col gap-1 overflow-y-auto rounded-input border border-border p-2">
        {(pkgs.data ?? []).length === 0 && (
          <p className="text-sm text-text-secondary">بسته منتشرشده‌ای نیست.</p>
        )}
        {(pkgs.data ?? []).map((p) => (
          <label
            key={p.id}
            className="flex min-h-12 items-center gap-2 rounded-input px-2 text-sm hover:bg-background"
          >
            <input
              type="checkbox"
              className="size-5 accent-primary"
              checked={value.includes(p.id)}
              onChange={(e) =>
                onChange(e.target.checked ? [...value, p.id] : value.filter((x) => x !== p.id))
              }
            />
            {p.title}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function AssignmentDialog({ onClose }: { onClose: () => void }) {
  const [type, setType] = useState<Scope>('team');
  const [targetId, setTargetId] = useState('');
  const [packageIds, setPackageIds] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const qc = useQueryClient();
  const toast = useToast();
  const m = useMutation({
    mutationFn: () =>
      api.post('/admin/assignments', {
        type,
        targetId: type === 'global' ? null : targetId,
        packageIds,
      }),
    onSuccess: () => {
      toast.show({ type: 'success', message: 'انتساب ثبت شد و به مخاطبان اطلاع داده شد.' });
      void qc.invalidateQueries({ queryKey: ['admin'] });
      onClose();
    },
    onError: (e) =>
      e instanceof ApiError && Object.keys(e.fields).length
        ? setErrors(e.fields)
        : toast.show({ type: 'error', message: errMsg(e) }),
  });
  return (
    <Modal
      open
      onClose={onClose}
      title="انتساب جدید"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            انصراف
          </Button>
          <Button
            loading={m.isPending}
            disabled={!packageIds.length || (type !== 'global' && !targetId)}
            onClick={() => m.mutate()}
          >
            ثبت انتساب
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Select
          label="مخاطب"
          value={type}
          onChange={(e) => {
            setType(e.target.value as Scope);
            setTargetId('');
          }}
        >
          {(Object.keys(SCOPE_LABEL) as Scope[]).map((s) => (
            <option key={s} value={s}>
              {SCOPE_LABEL[s]}
            </option>
          ))}
        </Select>
        <TargetPicker type={type} value={targetId} onChange={setTargetId} error={errors.targetId} />
        <PackagePicker value={packageIds} onChange={setPackageIds} />
        {errors.packageIds && <p className="text-xs text-danger">{errors.packageIds}</p>}
      </div>
    </Modal>
  );
}

function Paths() {
  const q = useQuery({
    queryKey: ['admin', 'paths'],
    queryFn: ({ signal }) => api.get<AdminPath[]>('/admin/paths', signal),
  });
  const pkgs = usePackagesAdmin();
  const title = useMemo(() => new Map((pkgs.data ?? []).map((p) => [p.id, p.title])), [pkgs.data]);
  const target = useTargetNames();
  const [edit, setEdit] = useState<AdminPath | 'new' | null>(null);
  const [del, setDel] = useState<AdminPath | null>(null);
  const qc = useQueryClient();
  const toast = useToast();
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/admin/paths/${id}`),
    onSuccess: () => {
      setDel(null);
      void qc.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: (e) => toast.show({ type: 'error', message: errMsg(e) }),
  });
  const apply = useMutation({
    mutationFn: (id: string) => api.post<{ updated: number }>(`/admin/paths/${id}/apply-deadlines`),
    onSuccess: (r) =>
      toast.show({
        type: 'success',
        message: `مهلت ${toPersianDigits(r.updated ?? 0)} بسته به‌روز شد.`,
      }),
    onError: (e) => toast.show({ type: 'error', message: errMsg(e) }),
  });
  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button icon={<Plus className="size-4" aria-hidden />} onClick={() => setEdit('new')}>
          مسیر جدید
        </Button>
      </div>
      <QueryState query={q} loading={<TableSkeleton rows={3} />}>
        {(list) => {
          const live = list.filter((p) => !p.archived);
          return live.length === 0 ? (
            <EmptyState
              title="مسیری تعریف نشده"
              description="مسیر، ترتیب بسته‌ها و مهلت هر مرحله را تعیین می‌کند."
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {live.map((p) => (
                <li key={p.id}>
                  <Card className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-bold">{p.name}</p>
                        <p className="text-xs text-text-secondary">
                          {target(p.scope, p.targetId)} • شروع:{' '}
                          {p.startAt ? faDate(p.startAt) : 'از زمان انتساب'}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          className="px-2"
                          icon={<CalendarClock className="size-4" aria-hidden />}
                          loading={apply.isPending && apply.variables === p.id}
                          onClick={() => apply.mutate(p.id)}
                        >
                          اعمال مهلت‌ها
                        </Button>
                        <Button
                          variant="ghost"
                          className="px-2"
                          aria-label="ویرایش"
                          icon={<Pencil className="size-4" />}
                          onClick={() => setEdit(p)}
                        />
                        <Button
                          variant="ghost"
                          className="px-2 text-danger"
                          aria-label="حذف"
                          icon={<Trash2 className="size-4" />}
                          onClick={() => setDel(p)}
                        />
                      </div>
                    </div>
                    <ol className="flex flex-col gap-1 text-sm">
                      {p.items.map((it, i) => (
                        <li
                          key={it.packageId}
                          className="flex items-center justify-between rounded-input bg-background px-2 py-1"
                        >
                          <span>
                            {toPersianDigits(i + 1)}. {title.get(it.packageId) ?? it.packageId}
                          </span>
                          {it.deadlineOffsetDays !== null && (
                            <span className="text-xs text-text-secondary">
                              روز {toPersianDigits(it.deadlineOffsetDays)}
                            </span>
                          )}
                        </li>
                      ))}
                    </ol>
                  </Card>
                </li>
              ))}
            </ul>
          );
        }}
      </QueryState>
      {edit && (
        <PathDialog initial={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />
      )}
      <ConfirmDialog
        open={del !== null}
        title="حذف مسیر؟"
        danger
        confirmText="حذف"
        loading={remove.isPending}
        onClose={() => setDel(null)}
        onConfirm={() => del && remove.mutate(del.id)}
      >
        {del?.name}
      </ConfirmDialog>
    </div>
  );
}

function PathDialog({ initial, onClose }: { initial?: AdminPath; onClose: () => void }) {
  const pkgs = usePackagesAdmin('status=published');
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [scope, setScope] = useState<Scope>(initial?.scope ?? 'global');
  const [targetId, setTargetId] = useState(initial?.targetId ?? '');
  const [startAt, setStartAt] = useState(toLocalInput(initial?.startAt ?? null));
  const [items, setItems] = useState<Array<{ packageId: string; deadlineOffsetDays: string }>>(
    (initial?.items ?? []).map((i) => ({
      packageId: i.packageId,
      deadlineOffsetDays: i.deadlineOffsetDays === null ? '' : String(i.deadlineOffsetDays),
    })),
  );
  const [add, setAdd] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const qc = useQueryClient();
  const toast = useToast();
  const titles = new Map((pkgs.data ?? []).map((p) => [p.id, p.title]));
  const m = useMutation({
    mutationFn: () => {
      const body = {
        name: name.trim(),
        description: description.trim(),
        scope,
        targetId: scope === 'global' ? null : targetId,
        startAt: fromLocalInput(startAt),
        items: items.map((i) => ({
          packageId: i.packageId,
          deadlineOffsetDays: i.deadlineOffsetDays === '' ? null : Number(i.deadlineOffsetDays),
        })),
      };
      return initial ? api.put(`/admin/paths/${initial.id}`, body) : api.post('/admin/paths', body);
    },
    onSuccess: () => {
      toast.show({ type: 'success', message: 'مسیر ذخیره شد.' });
      void qc.invalidateQueries({ queryKey: ['admin'] });
      onClose();
    },
    onError: (e) =>
      e instanceof ApiError && Object.keys(e.fields).length
        ? setErrors(e.fields)
        : toast.show({ type: 'error', message: errMsg(e) }),
  });
  const move = (i: number, dir: -1 | 1) =>
    setItems((l) => {
      const n = [...l];
      const a = n[i];
      const b = n[i + dir];
      if (!a || !b) return l;
      n[i] = b;
      n[i + dir] = a;
      return n;
    });
  return (
    <Modal
      open
      onClose={onClose}
      title={initial ? 'ویرایش مسیر' : 'مسیر جدید'}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            انصراف
          </Button>
          <Button
            loading={m.isPending}
            disabled={name.trim().length < 2 || !items.length || (scope !== 'global' && !targetId)}
            onClick={() => m.mutate()}
          >
            ذخیره مسیر
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Input
          label="نام مسیر"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name}
        />
        <Textarea
          label="توضیح"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Select
            label="مخاطب"
            value={scope}
            onChange={(e) => {
              setScope(e.target.value as Scope);
              setTargetId('');
            }}
          >
            {(Object.keys(SCOPE_LABEL) as Scope[]).map((s) => (
              <option key={s} value={s}>
                {SCOPE_LABEL[s]}
              </option>
            ))}
          </Select>
          <TargetPicker
            type={scope}
            value={targetId}
            onChange={setTargetId}
            error={errors.targetId}
          />
        </div>
        <Input
          label="تاریخ شروع (برای محاسبه مهلت مراحل)"
          type="datetime-local"
          ltr
          value={startAt}
          onChange={(e) => setStartAt(e.target.value)}
          error={errors.startAt}
        />
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">مراحل (به ترتیب)</p>
          {items.map((it, i) => (
            <div
              key={it.packageId}
              className="flex items-center gap-2 rounded-input border border-border p-2"
            >
              <span className="flex-1 text-sm">
                {toPersianDigits(i + 1)}. {titles.get(it.packageId) ?? it.packageId}
              </span>
              <input
                type="number"
                min={0}
                dir="ltr"
                aria-label="مهلت (روز پس از شروع)"
                placeholder="روز"
                value={it.deadlineOffsetDays}
                onChange={(e) =>
                  setItems((l) =>
                    l.map((x, j) => (j === i ? { ...x, deadlineOffsetDays: e.target.value } : x)),
                  )
                }
                className="min-h-11 w-20 rounded-input border border-border px-2"
              />
              <Button
                variant="ghost"
                className="px-2"
                aria-label="بالا"
                disabled={i === 0}
                onClick={() => move(i, -1)}
                icon={<ArrowUp className="size-4" />}
              />
              <Button
                variant="ghost"
                className="px-2"
                aria-label="پایین"
                disabled={i === items.length - 1}
                onClick={() => move(i, 1)}
                icon={<ArrowDown className="size-4" />}
              />
              <Button
                variant="ghost"
                className="px-2 text-danger"
                aria-label="حذف"
                onClick={() => setItems((l) => l.filter((_, j) => j !== i))}
                icon={<X className="size-4" />}
              />
            </div>
          ))}
          {errors.items && <p className="text-xs text-danger">{errors.items}</p>}
          <div className="flex gap-2">
            <Select
              label="افزودن بسته"
              value={add}
              onChange={(e) => setAdd(e.target.value)}
              className="flex-1"
            >
              <option value="">انتخاب بسته</option>
              {(pkgs.data ?? [])
                .filter((p) => !items.some((i) => i.packageId === p.id))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
            </Select>
            <Button
              variant="secondary"
              className="self-end"
              disabled={!add}
              onClick={() => {
                setItems((l) => [...l, { packageId: add, deadlineOffsetDays: '' }]);
                setAdd('');
              }}
            >
              افزودن
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
