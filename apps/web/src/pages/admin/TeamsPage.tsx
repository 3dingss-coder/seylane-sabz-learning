import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus } from 'lucide-react';
import { Button, EmptyState, Input, Modal, TableSkeleton, useToast } from '@/components/ui';
import { Select } from '@/components/common/Field';
import { PageHeader } from '@/components/common/PageHeader';
import { QueryState } from '@/components/common/QueryState';
import { DataTable } from '@/components/admin/DataTable';
import { ApiError, api } from '@/lib/api';
import { toPersianDigits } from '@/lib/digits';
import { errMsg } from '@/lib/errors';
import type { AdminTeam } from '@/lib/types';
import { useTeams, useUsers } from './adminQueries';

/** A6 — تیم‌ها: name + manager (team scope for manager panel & rules). */
export function TeamsPage() {
  const teams = useTeams();
  const [edit, setEdit] = useState<AdminTeam | 'new' | null>(null);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="تیم‌ها"
        actions={
          <Button icon={<Plus className="size-4" aria-hidden />} onClick={() => setEdit('new')}>
            تیم جدید
          </Button>
        }
      />
      <QueryState
        query={teams}
        loading={<TableSkeleton rows={4} />}
        isEmpty={(l) => l.length === 0}
        empty={
          <EmptyState
            title="هنوز تیمی ساخته نشده"
            actionText="ساخت تیم"
            onAction={() => setEdit('new')}
          />
        }
      >
        {(list) => (
          <DataTable
            caption="تیم‌ها"
            rows={list}
            rowKey={(t) => t.id}
            columns={[
              {
                key: 'n',
                header: 'نام تیم',
                cell: (t) => <span className="font-bold">{t.name}</span>,
              },
              {
                key: 'm',
                header: 'مدیر',
                cell: (t) => t.managerName ?? <span className="text-warning">تعیین نشده</span>,
              },
              { key: 'c', header: 'اعضا', cell: (t) => toPersianDigits(t.memberCount) },
              {
                key: 'e',
                header: '',
                cell: (t) => (
                  <Button
                    variant="ghost"
                    className="px-2"
                    aria-label={`ویرایش ${t.name}`}
                    icon={<Pencil className="size-4" />}
                    onClick={() => setEdit(t)}
                  />
                ),
              },
            ]}
          />
        )}
      </QueryState>
      {edit && (
        <TeamDialog initial={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />
      )}
    </div>
  );
}

function TeamDialog({ initial, onClose }: { initial?: AdminTeam; onClose: () => void }) {
  const users = useUsers();
  const [name, setName] = useState(initial?.name ?? '');
  const [managerId, setManagerId] = useState(initial?.managerId ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const qc = useQueryClient();
  const toast = useToast();
  const m = useMutation({
    mutationFn: () => {
      const body = { name: name.trim(), managerId: managerId || null };
      return initial
        ? api.patch(`/admin/teams/${initial.id}`, body)
        : api.post('/admin/teams', body);
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
      open
      onClose={onClose}
      title={initial ? 'ویرایش تیم' : 'تیم جدید'}
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
          label="نام تیم"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name}
        />
        <Select
          label="مدیر تیم"
          value={managerId}
          onChange={(e) => setManagerId(e.target.value)}
          error={errors.managerId}
          hint="فقط کاربران با نقش «مدیر فروش»"
        >
          <option value="">— بدون مدیر —</option>
          {(users.data ?? [])
            .filter((u) => u.role === 'manager' && u.status === 'active')
            .map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
        </Select>
      </div>
    </Modal>
  );
}
