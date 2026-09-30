import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Pencil, Search } from 'lucide-react';
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
import { QueryState } from '@/components/common/QueryState';
import { DataTable } from '@/components/admin/DataTable';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { MemberTimeline } from '@/components/reports/MemberTimeline';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { toPersianDigits } from '@/lib/digits';
import { errMsg } from '@/lib/errors';
import { ROLE_LABEL, faNumber, faRelative } from '@/lib/format';
import type { Me, Role, Timeline } from '@/lib/types';
import { useBrands, useTeams, useUsers } from './adminQueries';

/** A6 — کاربران: role, team, status, brand access, password reset. */
export function UsersPage() {
  const users = useUsers();
  const teams = useTeams();
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [team, setTeam] = useState('');
  const [edit, setEdit] = useState<Me | null>(null);
  const teamName = useMemo(
    () => new Map((teams.data ?? []).map((t) => [t.id, t.name])),
    [teams.data],
  );
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="کاربران" subtitle="نقش، تیم و وضعیت کاربران" />
      <div className="grid gap-3 sm:grid-cols-3">
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
      </div>
      <QueryState query={users} loading={<TableSkeleton rows={8} />}>
        {(list) => {
          const needle = q.trim().replace(/[۰-۹]/g, (c) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c)));
          const rows = list.filter(
            (u) =>
              (!needle ||
                u.name.includes(needle) ||
                (u.phone ?? '').includes(needle) ||
                (u.email ?? '').includes(needle)) &&
              (!role || u.role === role) &&
              (!team || (team === 'none' ? !u.teamId : u.teamId === team)),
          );
          return rows.length === 0 ? (
            <EmptyState title="کاربری پیدا نشد" />
          ) : (
            <DataTable
              caption="کاربران"
              rows={rows}
              rowKey={(u) => u.id}
              columns={[
                {
                  key: 'n',
                  header: 'نام',
                  cell: (u) => (
                    <Link to={`/admin/users/${u.id}`} className="font-bold text-primary">
                      {u.name}
                    </Link>
                  ),
                },
                {
                  key: 'p',
                  header: 'موبایل/ایمیل',
                  cell: (u) => <span dir="ltr">{toPersianDigits(u.phone ?? u.email ?? '')}</span>,
                },
                { key: 'r', header: 'نقش', cell: (u) => ROLE_LABEL[u.role] },
                {
                  key: 't',
                  header: 'تیم',
                  cell: (u) => (u.teamId ? (teamName.get(u.teamId) ?? '—') : '—'),
                },
                { key: 's', header: 'وضعیت', cell: (u) => <StatusBadge status={u.status} /> },
                {
                  key: 'pt',
                  header: 'امتیاز',
                  cell: (u) => faNumber(u.pointsBalance),
                  hideOnMobile: true,
                },
                {
                  key: 'a',
                  header: 'آخرین فعالیت',
                  cell: (u) => (u.lastActiveAt ? faRelative(u.lastActiveAt) : 'هرگز'),
                  hideOnMobile: true,
                },
                {
                  key: 'e',
                  header: '',
                  cell: (u) => (
                    <Button
                      variant="ghost"
                      className="px-2"
                      aria-label={`ویرایش ${u.name}`}
                      icon={<Pencil className="size-4" />}
                      onClick={() => setEdit(u)}
                    />
                  ),
                },
              ]}
            />
          );
        }}
      </QueryState>
      {edit && <UserDialog user={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function UserDialog({ user, onClose }: { user: Me; onClose: () => void }) {
  const { user: me } = useAuth();
  const teams = useTeams();
  const brands = useBrands();
  const [name, setName] = useState(user.name);
  const [role, setRole] = useState<Role>(user.role);
  const [teamId, setTeamId] = useState(user.teamId ?? '');
  const [status, setStatus] = useState(user.status);
  const [brandIds, setBrandIds] = useState<string[]>(user.brandIds);
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
          <Button loading={save.isPending} onClick={() => save.mutate()}>
            ذخیره
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
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
                        ? 'min-h-12 rounded-full border border-primary bg-primary-light px-3 text-sm font-bold text-primary'
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
