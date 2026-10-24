import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { RotateCcw, Trash2 } from 'lucide-react';
import { Button, EmptyState, TableSkeleton, useToast } from '@/components/ui';
import { Tabs } from '@/components/common/Field';
import { PageHeader } from '@/components/common/PageHeader';
import { QueryState } from '@/components/common/QueryState';
import { DataTable } from '@/components/admin/DataTable';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { api } from '@/lib/api';
import { toPersianDigits } from '@/lib/digits';
import { errMsg } from '@/lib/errors';
import { ROLE_LABEL, faDate } from '@/lib/format';
import { groupByPerson, type PersonGroup } from '@/lib/people';
import type { ArchivedReportRow, ArchivedUser } from '@/lib/types';
import { useArchivedReports, useArchivedUsers } from './adminQueries';

type Tab = 'blacklist' | 'reports';

/** آرشیو — deleted users («لیست سیاه») and deleted reports. Deleting here removes the data. */
export function ArchivePage() {
  const [tab, setTab] = useState<Tab>('blacklist');
  const users = useArchivedUsers();
  const reports = useArchivedReports();
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="آرشیو"
        subtitle="کاربران و گزارش‌های حذف‌شده. حذف از آرشیو، اطلاعات را برای همیشه از دیتابیس پاک می‌کند."
      />
      <Tabs
        label="آرشیو"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'blacklist', label: 'لیست سیاه', count: users.data?.length },
          { value: 'reports', label: 'گزارش‌ها', count: reports.data?.length },
        ]}
      />
      {tab === 'blacklist' ? <BlacklistTab /> : <ReportsTab />}
    </div>
  );
}

function BlacklistTab() {
  const q = useArchivedUsers();
  const [act, setAct] = useState<{
    group: PersonGroup<ArchivedUser>;
    mode: 'restore' | 'purge';
  } | null>(null);
  return (
    <>
      <p className="text-sm text-text-secondary">
        این شماره‌ها نمی‌توانند وارد اپ شوند یا ثبت‌نام کنند. با «بازگردانی» دوباره اجازه‌ی ورود
        دارند.
      </p>
      <QueryState query={q} loading={<TableSkeleton rows={5} />}>
        {(list) => {
          const people = groupByPerson(list, (u) => ({ name: u.name, phone: u.phone ?? u.email }));
          return people.length === 0 ? (
            <EmptyState title="لیست سیاه خالی است" />
          ) : (
            <DataTable
              caption="لیست سیاه"
              rows={people}
              rowKey={(g) => g.key}
              columns={[
                {
                  key: 'n',
                  header: 'نام',
                  sortValue: (g) => g.name,
                  cell: (g) => (
                    <div>
                      <span className="font-bold">{g.name}</span>
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
                  hideOnMobile: true,
                  cell: (g) => {
                    const u = g.first;
                    return u.province ? `${u.province} • ${u.city ?? ''}` : '—';
                  },
                },
                {
                  key: 'r',
                  header: 'نقش',
                  hideOnMobile: true,
                  cell: (g) => [...new Set(g.rows.map((u) => ROLE_LABEL[u.role]))].join('، '),
                },
                {
                  key: 'at',
                  header: 'تاریخ حذف',
                  sortValue: (g) =>
                    Math.max(0, ...g.rows.map((u) => Date.parse(u.blacklistedAt ?? ''))) || null,
                  cell: (g) => {
                    const last = g.rows
                      .map((u) => u.blacklistedAt)
                      .filter((x): x is string => !!x)
                      .sort()
                      .pop();
                    return last ? faDate(last) : '—';
                  },
                },
                {
                  key: 'act',
                  header: '',
                  cell: (g) => (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="secondary"
                        icon={<RotateCcw className="size-4" aria-hidden />}
                        onClick={() => setAct({ group: g, mode: 'restore' })}
                      >
                        بازگردانی
                      </Button>
                      <Button
                        variant="ghost"
                        className="text-danger"
                        icon={<Trash2 className="size-4" aria-hidden />}
                        aria-label={`حذف ${g.name} از آرشیو`}
                        onClick={() => setAct({ group: g, mode: 'purge' })}
                      >
                        حذف از آرشیو
                      </Button>
                    </div>
                  ),
                },
              ]}
            />
          );
        }}
      </QueryState>
      {act && <UserActionDialog {...act} onClose={() => setAct(null)} />}
    </>
  );
}

/** Restore or permanently delete the chosen numbers of one person. */
function UserActionDialog({
  group,
  mode,
  onClose,
}: {
  group: PersonGroup<ArchivedUser>;
  mode: 'restore' | 'purge';
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [picked, setPicked] = useState<string[]>(group.rows.map((u) => u.id));
  const run = useMutation({
    mutationFn: async () => {
      for (const id of picked) {
        if (mode === 'restore') await api.post(`/admin/archive/users/${id}/restore`);
        else await api.del(`/admin/archive/users/${id}`);
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin'] });
      toast.show({
        type: 'success',
        message:
          mode === 'restore'
            ? 'از آرشیو خارج شد و دوباره می‌تواند از اپ استفاده کند.'
            : 'برای همیشه از دیتابیس حذف شد.',
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
      danger={mode === 'purge'}
      title={mode === 'restore' ? `بازگردانی ${group.name}؟` : `حذف ${group.name} از آرشیو؟`}
      confirmText={mode === 'restore' ? 'بازگردانی و اجازه‌ی ورود' : 'حذف برای همیشه'}
      loading={run.isPending}
      onClose={onClose}
      onConfirm={() => picked.length && run.mutate()}
    >
      <p>
        {mode === 'restore'
          ? 'کاربر از لیست سیاه خارج می‌شود و با همین شماره دوباره می‌تواند وارد اپ شود.'
          : 'حساب، پیشرفت آموزشی، نتایج آزمون، امتیازها و همه‌ی داده‌های این کاربر برای همیشه پاک می‌شود و قابل بازگشت نیست.'}
      </p>
      <ul className="mt-3 flex flex-col gap-2">
        {group.rows.map((u) => (
          <li key={u.id}>
            <label className="flex min-h-11 items-center gap-2">
              <input
                type="checkbox"
                checked={picked.includes(u.id)}
                onChange={(e) =>
                  setPicked((l) => (e.target.checked ? [...l, u.id] : l.filter((x) => x !== u.id)))
                }
              />
              <span dir="ltr">{toPersianDigits(u.phone ?? u.email ?? u.id)}</span>
            </label>
          </li>
        ))}
      </ul>
    </ConfirmDialog>
  );
}

/** One archived-reports row per account (name + phone). Actions apply to all of its reports. */
function ReportsTab() {
  const q = useArchivedReports();
  const qc = useQueryClient();
  const toast = useToast();
  const [purge, setPurge] = useState<ArchivedReportRow[] | null>(null);
  const run = useMutation({
    mutationFn: async (v: { rows: ArchivedReportRow[]; mode: 'restore' | 'purge' }) => {
      for (const r of v.rows)
        await api.post(`/admin/archive/reports/${v.mode}`, {
          userId: r.userId,
          packageId: r.packageId,
        });
      return v.mode;
    },
    onSuccess: (mode) => {
      setPurge(null);
      void qc.invalidateQueries({ queryKey: ['admin'] });
      toast.show({
        type: 'success',
        message: mode === 'restore' ? 'به گزارش‌ها برگشت.' : 'برای همیشه از دیتابیس حذف شد.',
      });
    },
    onError: (e) => {
      void qc.invalidateQueries({ queryKey: ['admin'] });
      toast.show({ type: 'error', message: errMsg(e) });
    },
  });
  const who = purge?.[0];
  return (
    <>
      <p className="text-sm text-text-secondary">
        گزارش‌هایی که از صفحه‌ی گزارش‌ها حذف شده‌اند. «حذف از آرشیو» پیشرفت و نتیجه‌ی آزمون‌های آن
        کاربر را برای همیشه پاک می‌کند.
      </p>
      <QueryState query={q} loading={<TableSkeleton rows={5} />}>
        {(list) => {
          const m = new Map<string, ArchivedReportRow[]>();
          for (const r of list) m.set(r.userId, [...(m.get(r.userId) ?? []), r]);
          const accounts = [...m.values()].flatMap((rows) => {
            const first = rows[0];
            return first ? [{ id: first.userId, first, rows }] : [];
          });
          return accounts.length === 0 ? (
            <EmptyState title="گزارشی در آرشیو نیست" />
          ) : (
            <DataTable
              caption="گزارش‌های آرشیوشده"
              rows={accounts}
              rowKey={(a) => a.id}
              columns={[
                {
                  key: 'n',
                  header: 'نام',
                  sortValue: (a) => a.first.userName,
                  cell: (a) => (
                    <div>
                      <span className="font-bold">{a.first.userName}</span>
                      {a.first.phone && (
                        <span
                          dir="ltr"
                          className="block text-start text-[11px] leading-5 text-text-secondary"
                        >
                          {toPersianDigits(a.first.phone)}
                        </span>
                      )}
                    </div>
                  ),
                },
                {
                  key: 'c',
                  header: 'گزارش‌های حذف‌شده',
                  sortValue: (a) => a.rows.length,
                  cell: (a) => `${toPersianDigits(a.rows.length)} آموزش`,
                },
                {
                  key: 'at',
                  header: 'تاریخ حذف',
                  hideOnMobile: true,
                  sortValue: (a) =>
                    Math.max(0, ...a.rows.map((r) => Date.parse(r.archivedAt))) || null,
                  cell: (a) =>
                    faDate(
                      a.rows
                        .map((r) => r.archivedAt)
                        .sort()
                        .pop() ?? '',
                    ),
                },
                {
                  key: 'act',
                  header: '',
                  cell: (a) => (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="secondary"
                        icon={<RotateCcw className="size-4" aria-hidden />}
                        loading={run.isPending && run.variables?.rows === a.rows}
                        onClick={() => run.mutate({ rows: a.rows, mode: 'restore' })}
                      >
                        بازگردانی
                      </Button>
                      <Button
                        variant="ghost"
                        className="text-danger"
                        icon={<Trash2 className="size-4" aria-hidden />}
                        aria-label={`حذف گزارش‌های ${a.first.userName} از آرشیو`}
                        onClick={() => setPurge(a.rows)}
                      >
                        حذف از آرشیو
                      </Button>
                    </div>
                  ),
                },
              ]}
            />
          );
        }}
      </QueryState>
      <ConfirmDialog
        open={!!purge}
        danger
        title="حذف گزارش‌ها از آرشیو؟"
        confirmText="حذف برای همیشه"
        loading={run.isPending}
        onClose={() => setPurge(null)}
        onConfirm={() => purge && run.mutate({ rows: purge, mode: 'purge' })}
      >
        پیشرفت و نتیجه‌ی آزمون‌های {who?.userName} ({toPersianDigits(purge?.length ?? 0)} آموزش)
        برای همیشه از دیتابیس پاک می‌شود و قابل بازگشت نیست.
      </ConfirmDialog>
    </>
  );
}
