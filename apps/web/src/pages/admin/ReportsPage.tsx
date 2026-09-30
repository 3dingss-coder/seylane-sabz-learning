import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bot, ThumbsDown, ThumbsUp, Users } from 'lucide-react';
import { Card, KpiCard, Skeleton, TableSkeleton } from '@/components/ui';
import { Tabs } from '@/components/common/Field';
import { PageHeader } from '@/components/common/PageHeader';
import { QueryState } from '@/components/common/QueryState';
import { CompletionReport } from '@/components/reports/CompletionReport';
import { RetakeList } from '@/components/reports/RetakeList';
import { api } from '@/lib/api';
import { toPersianDigits } from '@/lib/digits';
import { faNumber, faPercent } from '@/lib/format';
import type { CompletionReport as Data, MentorReport } from '@/lib/types';
import { useTeams } from './adminQueries';

const OUTCOME: Record<string, string> = {
  answered: 'پاسخ داده شد',
  unknown: 'پاسخ در محتوا نبود',
  blocked: 'مسدود (خارج از موضوع)',
  fallback: 'پاسخ جایگزین (بدون AI)',
};

/** A9 — گزارش‌ها: completion (all teams), retakes (incl. escalated), mentor quality (aggregate only). */
export function ReportsPage() {
  const [tab, setTab] = useState<'completion' | 'retakes' | 'mentor'>('completion');
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="گزارش‌ها" />
      <Tabs
        label="گزارش"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'completion', label: 'تکمیل' },
          { value: 'retakes', label: 'آزمون مجدد' },
          { value: 'mentor', label: 'کیفیت منتور' },
        ]}
      />
      {tab === 'completion' ? (
        <Completion />
      ) : tab === 'retakes' ? (
        <RetakeList base="/admin" memberLink={(id) => `/admin/users/${id}`} isAdmin />
      ) : (
        <Mentor />
      )}
    </div>
  );
}

function Completion() {
  const q = useQuery({
    queryKey: ['admin', 'report', 'completion'],
    queryFn: ({ signal }) => api.get<Data>('/admin/reports/completion', signal),
  });
  const teams = useTeams();
  return (
    <QueryState query={q} loading={<TableSkeleton rows={8} />}>
      {(d) => (
        <CompletionReport
          rows={d.rows}
          memberLink={(id) => `/admin/users/${id}`}
          teams={teams.data?.map((t) => ({ id: t.id, name: t.name }))}
        />
      )}
    </QueryState>
  );
}

function Mentor() {
  const q = useQuery({
    queryKey: ['admin', 'report', 'mentor'],
    queryFn: ({ signal }) => api.get<MentorReport>('/admin/reports/mentor', signal),
  });
  return (
    <QueryState query={q} loading={<Skeleton className="h-40" />}>
      {(d) => (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-text-secondary">
            آمار {toPersianDigits(d.days)} روز اخیر. متن گفتگوها برای حفظ حریم خصوصی نمایش داده
            نمی‌شود.
          </p>
          <div className="stagger grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard title="پاسخ‌ها" value={faNumber(d.replies)} icon={Bot} />
            <KpiCard title="کاربران" value={faNumber(d.users)} icon={Users} tone="info" />
            <KpiCard
              title="بازخورد مثبت"
              value={faNumber(d.up)}
              subtitle={
                d.satisfaction === null ? 'بدون بازخورد' : `رضایت ${faPercent(d.satisfaction)}`
              }
              icon={ThumbsUp}
            />
            <KpiCard
              title="بازخورد منفی"
              value={faNumber(d.down)}
              icon={ThumbsDown}
              tone={d.down > d.up ? 'danger' : 'warning'}
            />
          </div>
          <Card>
            <h3 className="mb-2 font-bold">نتیجه پاسخ‌ها</h3>
            <ul className="flex flex-col gap-1 text-sm">
              {Object.entries(d.byOutcome).map(([k, v]) => (
                <li key={k} className="flex justify-between">
                  <span>{OUTCOME[k] ?? k}</span>
                  <span className="font-bold">{faNumber(v)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </QueryState>
  );
}
