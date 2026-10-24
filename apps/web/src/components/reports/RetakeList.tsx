import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, X } from 'lucide-react';
import { Button, Card, EmptyState, TableSkeleton, useToast } from '@/components/ui';
import { Tabs, Textarea } from '@/components/common/Field';
import { QueryState } from '@/components/common/QueryState';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { api } from '@/lib/api';
import { errMsg } from '@/lib/errors';
import { faPercent, faRelative } from '@/lib/format';
import type { RetakeItem } from '@/lib/types';

type Status = 'pending' | 'approved' | 'rejected';

/** W4 — درخواست‌های آزمون مجدد (manager: team; admin: all + escalated). */
export function RetakeList({
  base,
  memberLink,
  isAdmin,
}: {
  base: '/manager' | '/admin';
  memberLink: (id: string) => string;
  isAdmin: boolean;
}) {
  const [status, setStatus] = useState<Status>('pending');
  const [decide, setDecide] = useState<{ item: RetakeItem; decision: 'approve' | 'reject' } | null>(
    null,
  );
  const [note, setNote] = useState('');
  const qc = useQueryClient();
  const toast = useToast();
  const key = [base.slice(1), 'retakes', status];
  const q = useQuery({
    queryKey: key,
    queryFn: ({ signal }) =>
      api.get<RetakeItem[]>(`${base}/retake-requests?status=${status}`, signal),
  });
  const m = useMutation({
    mutationFn: (v: { id: string; decision: 'approve' | 'reject' }) =>
      api.post(`${base}/retake-requests/${v.id}/${v.decision}`, { note: note.trim() || null }),
    onSuccess: (_r, v) => {
      toast.show({
        type: 'success',
        message: v.decision === 'approve' ? 'تأیید شد؛ یک فرصت دیگر داده شد.' : 'رد شد.',
      });
      setDecide(null);
      setNote('');
      void qc.invalidateQueries({ queryKey: [base.slice(1)] });
    },
    onError: (e) => toast.show({ type: 'error', message: errMsg(e) }),
  });
  return (
    <div className="flex flex-col gap-3">
      <Tabs
        label="وضعیت"
        value={status}
        onChange={setStatus}
        items={[
          { value: 'pending', label: 'در انتظار' },
          { value: 'approved', label: 'تأییدشده' },
          { value: 'rejected', label: 'ردشده' },
        ]}
      />
      <QueryState
        query={q}
        loading={<TableSkeleton rows={4} />}
        isEmpty={(l) => l.length === 0}
        empty={
          <EmptyState title={status === 'pending' ? 'درخواستی در انتظار نیست' : 'موردی نیست'} />
        }
      >
        {(list) => (
          <ul className="flex flex-col gap-2">
            {list.map((r) => {
              const blocked = !isAdmin && r.escalated;
              return (
                <li key={r.id}>
                  <Card className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-sm">
                      <Link to={memberLink(r.userId)} className="font-bold text-primary">
                        {r.userName}
                      </Link>
                      {r.userCity && (
                        <span className="ms-2 text-xs text-text-secondary">
                          ({r.userCity}
                          {r.userProvince ? ` • ${r.userProvince}` : ''})
                        </span>
                      )}
                      <p className="text-text">
                        {r.packageTitle} • {r.sectionTitle}
                      </p>
                      <p className="text-xs text-text-secondary">
                        نمره‌ها: {r.scores.map((s) => faPercent(s)).join('، ') || '—'} •{' '}
                        {faRelative(r.createdAt)}
                      </p>
                      {r.escalated && (
                        <p className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-warning-fg">
                          <AlertTriangle className="size-3.5" aria-hidden /> ارجاع به مدیر ارشد (سقف
                          آزمون‌های مجدد این کاربر پر شده)
                        </p>
                      )}
                    </div>
                    {status === 'pending' && !blocked && (
                      <div className="flex gap-2">
                        <Button
                          variant="secondary"
                          icon={<X className="size-4" aria-hidden />}
                          onClick={() => setDecide({ item: r, decision: 'reject' })}
                        >
                          رد
                        </Button>
                        <Button
                          icon={<Check className="size-4" aria-hidden />}
                          onClick={() => setDecide({ item: r, decision: 'approve' })}
                        >
                          تأیید
                        </Button>
                      </div>
                    )}
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </QueryState>
      <ConfirmDialog
        open={decide !== null}
        title={decide?.decision === 'approve' ? 'تأیید آزمون مجدد' : 'رد درخواست'}
        confirmText={decide?.decision === 'approve' ? 'تأیید' : 'رد'}
        danger={decide?.decision === 'reject'}
        loading={m.isPending}
        onClose={() => setDecide(null)}
        onConfirm={() => decide && m.mutate({ id: decide.item.id, decision: decide.decision })}
      >
        <p className="mb-2">
          {decide?.item.userName} — {decide?.item.sectionTitle}
        </p>
        <Textarea
          label="یادداشت (اختیاری)"
          value={note}
          maxLength={500}
          onChange={(e) => setNote(e.target.value)}
        />
      </ConfirmDialog>
    </div>
  );
}
