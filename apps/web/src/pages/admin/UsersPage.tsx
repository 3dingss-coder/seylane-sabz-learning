import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, KeyRound, Pencil, Search, Trash2 } from 'lucide-react';
import {
  Button,
  EmptyState,
  Input,
  Modal,
  StatusBadge,
  TableSkeleton,
  useToast,
} from '@/components/ui';
import { Select } from '@/components/common/Field';
import { PageHeader } from '@/components/common/PageHeader';
import { ResidencePicker, type Residence } from '@/components/common/ResidencePicker';
import { QueryState } from '@/components/common/QueryState';
import { DataTable } from '@/components/admin/DataTable';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { MemberTimeline } from '@/components/reports/MemberTimeline';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { groupByPerson, type PersonGroup } from '@/lib/people';
import { toPersianDigits } from '@/lib/digits';
import { errMsg } from '@/lib/errors';
import { ROLE_LABEL, faNumber, faRelative } from '@/lib/format';
import type { Me, Role, Timeline } from '@/lib/types';
import { useBrands, useTeams, useUsers } from './adminQueries';

/** The account an admin edits by default for a person: the one used most recently. */
function primaryOf(g: PersonGroup<Me>): Me {
  return (
    [...g.rows].sort((a, b) =>
      (b.lastActiveAt ?? b.createdAt).localeCompare(a.lastActiveAt ?? a.createdAt),
    )[0] ?? g.first
  );
}

/** A6 — کاربران: role, team, status, brand access, password reset, delete (→ archive). */
export function UsersPage() {
  const users = useUsers();
  const teams = useTeams();
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [team, setTeam] = useState('');
  const [city, setCity] = useState('');
  const [edit, setEdit] = useState<{ accounts: Me[]; id: string } | null>(null);
  const [del, setDel] = useState<PersonGroup<Me> | null>(null);
  const editUser = edit
    ? (edit.accounts.find((a) => a.id === edit.id) ?? edit.accounts[0])
    : undefined;
  const teamName = useMemo(
    () => new Map((teams.data ?? []).map((t) => [t.id, t.name])),
    [teams.data],
  );
  const cityOptions = useMemo(() => {
    const s = new Set<string>();
    for (const u of users.data ?? []) if (u.city) s.add(u.city);
    return [...s].sort();
  }, [users.data]);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="کاربران" subtitle="نقش، تیم و وضعیت کاربران" />
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
        <Input
          label="جستجو"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          icon={<Search className="size-5" />}
          placeholder="نام یا شماره"
        />
        <Select label="نقش" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">همه</option>
          {Object.entries(ROLE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
        <Select label="تیم" value={team} onChange={(e) => setTeam(e.target.value)}>
          <option value="">همه</option>
          <option value="none">بدون تیم</option>
          {(teams.data ?? []).map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
        <Select label="شهر" value={city} onChange={(e) => setCity(e.target.value)}>
          <option value="">همه</option>
          {cityOptions.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
      </div>
      <QueryState query={users} loading={<TableSkeleton rows={8} />}>
        {(list) => {
          const needle = q.trim().replace(/[۰-۹]/g, (c) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c)));
          const rows = list.filter(
            (u) =>
              (!needle ||
                u.name.includes(needle) ||
                (u.phone ?? '').includes(needle) ||
                (u.email ?? '').includes(needle) ||
                (u.province ?? '').includes(needle) ||
                (u.city ?? '').includes(needle)) &&
              (!role || u.role === role) &&
              (!team || (team === 'none' ? !u.teamId : u.teamId === team)) &&
              (!city || u.city === city),
          );
          // One row per person: accounts that share a name are merged and their numbers are
          // listed (small) under the name, so the number is what tells two people apart.
          const people = groupByPerson(rows, (u) => ({
            name: u.name,
            phone: u.phone ?? u.email,
          }));
          const uniq = (l: Array<string | null | undefined>) => [
            ...new Set(l.filter((x): x is string => !!x)),
          ];
          return people.length === 0 ? (
            <EmptyState title="کاربری پیدا نشد" />
          ) : (
            <DataTable
              caption="کاربران"
              rows={people}
              rowKey={(g) => g.key}
              columns={[
                {
                  key: 'n',
                  header: 'نام',
                  sortValue: (g) => g.name,
                  cell: (g) => (
                    <div>
                      <Link
                        to={`/admin/users/${primaryOf(g).id}`}
                        className="font-bold text-primary-fg"
                      >
                        {g.name}
                      </Link>
                      {g.phones.map((p) => (
                        <span
                          key={p}
                          dir="ltr"
                          className="block text-start text-[11px] leading-5 text-text-secondary"
                        >
                          {toPersianDigits(p)}
                        </span>
                      ))}
                    </div>
                  ),
                },
                {
                  key: 'loc',
                  header: 'محل فعالیت',
                  cell: (g) => {
                    const l = uniq(
                      g.rows.map((u) => (u.province ? `${u.province} • ${u.city ?? ''}` : null)),
                    );
                    return l.length ? (
                      <div className="flex flex-col">
                        {l.map((x) => (
                          <span key={x}>{x}</span>
                        ))}
                      </div>
                    ) : (
                      '—'
                    );
                  },
                  hideOnMobile: true,
                },
                {
                  key: 'r',
                  header: 'نقش',
                  cell: (g) => uniq(g.rows.map((u) => ROLE_LABEL[u.role])).join('، '),
                },
                {
                  key: 't',
                  header: 'تیم',
                  cell: (g) =>
                    uniq(g.rows.map((u) => (u.teamId ? teamName.get(u.teamId) : null))).join(
                      '، ',
                    ) || '—',
                },
                {
                  key: 's',
                  header: 'وضعیت',
                  cell: (g) => (
                    <div className="flex flex-col items-start gap-1">
                      {uniq(g.rows.map((u) => u.status)).map((st) => (
                        <StatusBadge key={st} status={st as Me['status']} />
                      ))}
                    </div>
                  ),
                },
                {
                  key: 'pt',
                  header: 'امتیاز',
                  sortValue: (g) => g.rows.reduce((n, u) => n + u.pointsBalance, 0),
                  cell: (g) => faNumber(g.rows.reduce((n, u) => n + u.pointsBalance, 0)),
                  hideOnMobile: true,
                },
                {
                  key: 'a',
                  header: 'آخرین فعالیت',
                  sortValue: (g) =>
                    Math.max(
                      0,
                      ...g.rows.map((u) => (u.lastActiveAt ? Date.parse(u.lastActiveAt) : 0)),
                    ) || null,
                  cell: (g) => {
                    const last = g.rows
                      .map((u) => u.lastActiveAt)
                      .filter((x): x is string => !!x)
                      .sort()
                      .pop();
                    return last ? faRelative(last) : 'هرگز';
                  },
                  hideOnMobile: true,
                },
                {
                  key: 'e',
                  header: '',
                  cell: (g) => (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        className="px-2"
                        aria-label={`ویرایش ${g.name}`}
                        icon={<Pencil className="size-4" />}
                        onClick={() => setEdit({ accounts: g.rows, id: primaryOf(g).id })}
                      />
                      <Button
                        variant="ghost"
                        className="px-2 text-danger"
                        aria-label={`حذف ${g.name}`}
                        icon={<Trash2 className="size-4" />}
                        onClick={() => setDel(g)}
                      />
                    </div>
                  ),
                },
              ]}
            />
          );
        }}
      </QueryState>
      {editUser && edit && (
        <UserDialog
          key={editUser.id}
          user={editUser}
          accounts={edit.accounts}
          onSwitch={(id) => setEdit({ ...edit, id })}
          onClose={() => setEdit(null)}
        />
      )}
      {del && <DeleteUsersDialog group={del} onClose={() => setDel(null)} />}
    </div>
  );
}

/** «حذف کاربر»: the chosen numbers are blocked and moved to the archive blacklist. */
function DeleteUsersDialog({ group, onClose }: { group: PersonGroup<Me>; onClose: () => void }) {
  const { user: me } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const deletable = group.rows.filter((u) => u.id !== me?.id);
  const [picked, setPicked] = useState<string[]>(deletable.map((u) => u.id));
  const run = useMutation({
    mutationFn: async () => {
      for (const id of picked) await api.del(`/admin/users/${id}`);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin'] });
      toast.show({
        type: 'success',
        message: 'به آرشیو (لیست سیاه) منتقل شد. این شماره دیگر نمی‌تواند وارد اپ شود.',
      });
      onClose();
    },
    onError: (e) => {
      void qc.invalidateQueries({ queryKey: ['admin'] });
      toast.show({ type: 'error', message: errMsg(e) });
    },
  });
  return (
    <ConfirmDialog
      open
      danger
      title={`حذف ${group.name}؟`}
      confirmText="حذف و انتقال به لیست سیاه"
      loading={run.isPending}
      onClose={onClose}
      onConfirm={() => picked.length && run.mutate()}
    >
      <p>
        شماره‌ی انتخاب‌شده مسدود می‌شود و کاربر دیگر نمی‌تواند وارد اپ شود یا دوباره ثبت‌نام کند.
        اطلاعاتش در{' '}
        <b className="inline-flex items-center gap-1">
          <Archive className="size-3.5" aria-hidden /> آرشیو
        </b>{' '}
        می‌ماند و فقط با «حذف از آرشیو» برای همیشه پاک می‌شود.
      </p>
      <ul className="mt-3 flex flex-col gap-2">
        {group.rows.map((u) => {
          const self = u.id === me?.id;
          return (
            <li key={u.id}>
              <label className="flex min-h-12 items-center gap-2">
                <input
                  type="checkbox"
                  disabled={self}
                  checked={picked.includes(u.id)}
                  onChange={(e) =>
                    setPicked((l) =>
                      e.target.checked ? [...l, u.id] : l.filter((x) => x !== u.id),
                    )
                  }
                />
                <span dir="ltr">{toPersianDigits(u.phone ?? u.email ?? u.id)}</span>
                {self && <span className="text-xs">(حساب خودتان؛ قابل حذف نیست)</span>}
              </label>
            </li>
          );
        })}
      </ul>
    </ConfirmDialog>
  );
}

function UserDialog({
  user,
  accounts,
  onSwitch,
  onClose,
}: {
  user: Me;
  accounts: Me[];
  onSwitch: (id: string) => void;
  onClose: () => void;
}) {
  const { user: me } = useAuth();
  const teams = useTeams();
  const brands = useBrands();
  const [name, setName] = useState(user.name);
  const [role, setRole] = useState<Role>(user.role);
  const [teamId, setTeamId] = useState(user.teamId ?? '');
  const [status, setStatus] = useState(user.status);
  const [brandIds, setBrandIds] = useState<string[]>(user.brandIds);
  const [residence, setResidence] = useState<Residence>({
    province: user.province ?? '',
    city: user.city ?? '',
  });
  const [reset, setReset] = useState(false);
  const [tempPwd, setTempPwd] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const qc = useQueryClient();
  const toast = useToast();
  const canPrivileged = me?.role === 'superadmin';
  const save = useMutation({
    mutationFn: () =>
      api.patch<{ warnings?: string[] }>(`/admin/users/${user.id}`, {
        name: name.trim(),
        role,
        teamId: teamId || null,
        status,
        brandIds,
        // null clears the pair (the API rejects a stray city without its province).
        province: residence.province || null,
        city: residence.city || null,
      }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ['admin'] });
      const warnings = r?.warnings ?? [];
      // Changes that detach a team or revoke a role must not be swallowed by a generic toast.
      toast.show({
        type: warnings.length ? 'warning' : 'success',
        message: warnings.length ? `ذخیره شد. ${warnings.join(' ')}` : 'ذخیره شد.',
      });
      onClose();
    },
    onError: (e) =>
      e instanceof ApiError && Object.keys(e.fields).length
        ? setErrors(e.fields)
        : toast.show({ type: 'error', message: errMsg(e) }),
  });
  const doReset = useMutation({
    mutationFn: () =>
      api.post<{ method: 'email' | 'temporary'; temporaryPassword: string | null }>(
        `/admin/users/${user.id}/reset-password`,
      ),
    onSuccess: (r) => {
      setReset(false);
      if (r.temporaryPassword) setTempPwd(r.temporaryPassword);
      else toast.show({ type: 'success', message: 'لینک بازیابی به ایمیل کاربر ارسال شد.' });
    },
    onError: (e) => toast.show({ type: 'error', message: errMsg(e) }),
  });
  const submit = () => {
    if (residence.province && !residence.city) {
      setErrors({ city: 'شهر را انتخاب کنید.' });
      return;
    }
    save.mutate();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={`ویرایش ${user.name}`}
      size="lg"
      footer={
        <>
          <Button
            variant="ghost"
            icon={<KeyRound className="size-4" aria-hidden />}
            onClick={() => setReset(true)}
          >
            بازتنظیم رمز
          </Button>
          <Button loading={save.isPending} onClick={submit}>
            ذخیره
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {accounts.length > 1 && (
          <Select
            label="شماره‌ی این کاربر"
            value={user.id}
            onChange={(e) => onSwitch(e.target.value)}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {toPersianDigits(a.phone ?? a.email ?? a.id)}
              </option>
            ))}
          </Select>
        )}
        {tempPwd && (
          <div
            role="status"
            className="rounded-card border border-primary/30 bg-primary-light p-3 text-sm"
          >
            رمز موقت:{' '}
            <b dir="ltr" className="select-all font-mono text-base">
              {tempPwd}
            </b>
            <p className="mt-1 text-xs text-text-secondary">
              این رمز فقط یک بار نمایش داده می‌شود. آن را به کاربر بدهید تا بعد از ورود عوض کند.
            </p>
          </div>
        )}
        <Input
          label="نام"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name}
        />
        <div className="grid gap-3 sm:grid-cols-3">
          <Select
            label="نقش"
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            error={errors.role}
          >
            <option value="marketer">{ROLE_LABEL.marketer}</option>
            <option value="manager">{ROLE_LABEL.manager}</option>
            <option value="admin" disabled={!canPrivileged && user.role !== 'admin'}>
              {ROLE_LABEL.admin}
            </option>
            <option value="superadmin" disabled={!canPrivileged}>
              {ROLE_LABEL.superadmin}
            </option>
          </Select>
          <Select
            label="تیم"
            value={teamId}
            onChange={(e) => setTeamId(e.target.value)}
            error={errors.teamId}
          >
            <option value="">بدون تیم</option>
            {(teams.data ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
          <Select
            label="وضعیت"
            value={status}
            onChange={(e) => setStatus(e.target.value as 'active' | 'inactive')}
            error={errors.status}
          >
            <option value="active">فعال</option>
            <option value="inactive">غیرفعال</option>
          </Select>
        </div>
        <ResidencePicker
          value={residence}
          onChange={setResidence}
          label="محل فعالیت"
          cityError={errors.city}
          clearable
        />
        <fieldset>
          <legend className="mb-1 text-sm font-medium">برندهای مرتبط (برای انتساب برندی)</legend>
          <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto">
            {(brands.data ?? [])
              .filter((b) => !b.archived)
              .map((b) => {
                const on = brandIds.includes(b.id);
                return (
                  <button
                    key={b.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      setBrandIds((l) => (on ? l.filter((x) => x !== b.id) : [...l, b.id]))
                    }
                    className={
                      on
                        ? 'min-h-12 rounded-full border border-primary bg-primary-light px-3 text-sm font-bold text-primary-fg'
                        : 'min-h-12 rounded-full border border-border px-3 text-sm text-text-secondary'
                    }
                  >
                    {b.name}
                  </button>
                );
              })}
          </div>
        </fieldset>
      </div>
      <ConfirmDialog
        open={reset}
        title="بازتنظیم رمز؟"
        loading={doReset.isPending}
        onClose={() => setReset(false)}
        onConfirm={() => doReset.mutate()}
        confirmText="بازتنظیم"
      >
        همه نشست‌های فعلی کاربر بسته می‌شود. برای کاربران موبایلی یک رمز موقت ساخته می‌شود.
      </ConfirmDialog>
    </Modal>
  );
}

export function AdminUserDetail() {
  const { id = '' } = useParams();
  const q = useQuery({
    queryKey: ['admin', 'user', id],
    queryFn: ({ signal }) => api.get<Timeline>(`/admin/users/${id}`, signal),
  });
  return (
    <div>
      <PageHeader title="جزئیات کاربر" back="/admin/users" />
      <QueryState query={q} loading={<TableSkeleton rows={6} />}>
        {(d) => <MemberTimeline data={d} canMessage={false} />}
      </QueryState>
    </div>
  );
}
