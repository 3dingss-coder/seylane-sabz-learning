import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { EmptyState, Input, TableSkeleton } from '@/components/ui';
import { PageHeader } from '@/components/common/PageHeader';
import { QueryState } from '@/components/common/QueryState';
import { DataTable } from '@/components/admin/DataTable';
import { api } from '@/lib/api';
import { faDateTime } from '@/lib/format';
import type { AuditEntry } from '@/lib/types';
import { useUsers } from './adminQueries';

/** A10 — لاگ تغییرات (append-only audit log). */
export function AuditPage() {
  const q = useQuery({
    queryKey: ['admin', 'audit'],
    queryFn: ({ signal }) => api.get<AuditEntry[]>('/admin/audit-logs', signal),
  });
  const users = useUsers();
  const names = useMemo(() => new Map((users.data ?? []).map((u) => [u.id, u.name])), [users.data]);
  const [filter, setFilter] = useState('');
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="لاگ تغییرات" subtitle="همه تغییرات مدیریتی ثبت می‌شود" />
      <Input
        label="فیلتر عملیات یا موجودیت"
        ltr
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="package.published"
      />
      <QueryState query={q} loading={<TableSkeleton rows={10} />}>
        {(list) => {
          const rows = list.filter(
            (a) =>
              !filter ||
              a.action.includes(filter) ||
              a.entity.includes(filter) ||
              a.entityId.includes(filter),
          );
          return rows.length === 0 ? (
            <EmptyState title="موردی نیست" />
          ) : (
            <DataTable
              caption="لاگ تغییرات"
              rows={rows}
              rowKey={(a) => a.id}
              columns={[
                { key: 't', header: 'زمان', cell: (a) => faDateTime(a.createdAt) },
                {
                  key: 'u',
                  header: 'انجام‌دهنده',
                  cell: (a) =>
                    a.actorId === 'system' ? 'سیستم' : (names.get(a.actorId) ?? a.actorId),
                },
                {
                  key: 'a',
                  header: 'عملیات',
                  cell: (a) => (
                    <code dir="ltr" className="text-xs">
                      {a.action}
                    </code>
                  ),
                },
                {
                  key: 'e',
                  header: 'موجودیت',
                  cell: (a) => (
                    <code dir="ltr" className="text-xs">{`${a.entity}/${a.entityId}`}</code>
                  ),
                  hideOnMobile: true,
                },
                {
                  key: 'c',
                  header: 'تغییر',
                  hideOnMobile: true,
                  cell: (a) => (
                    <details>
                      <summary className="cursor-pointer text-xs text-primary">جزئیات</summary>
                      <pre
                        dir="ltr"
                        className="max-w-md overflow-x-auto whitespace-pre-wrap text-[11px] text-text-secondary"
                      >
                        {JSON.stringify({ before: a.before, after: a.after }, null, 1)}
                      </pre>
                    </details>
                  ),
                },
              ]}
            />
          );
        }}
      </QueryState>
    </div>
  );
}
