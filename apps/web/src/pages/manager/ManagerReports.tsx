import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { TableSkeleton } from '@/components/ui';
import { PageHeader } from '@/components/common/PageHeader';
import { QueryState } from '@/components/common/QueryState';
import { Tabs } from '@/components/common/Field';
import { CompletionReport } from '@/components/reports/CompletionReport';
import { QuizResultsReport } from '@/components/reports/QuizResultsReport';
import { api } from '@/lib/api';
import type { CompletionReport as Data, QuizReport } from '@/lib/types';

/** W2 — گزارش تیم: تکمیل آموزش + نتایج آزمون هر عضو. */
export function ManagerReports() {
  const [tab, setTab] = useState<'completion' | 'quizzes'>('completion');
  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="گزارش‌ها" subtitle="وضعیت آموزش و نتایج آزمون هر عضو تیم" />
      <Tabs
        label="گزارش"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'completion', label: 'تکمیل آموزش' },
          { value: 'quizzes', label: 'نتایج آزمون' },
        ]}
      />
      {tab === 'completion' ? <ManagerCompletion /> : <ManagerQuizResults />}
    </div>
  );
}

function ManagerQuizResults() {
  const q = useQuery({
    queryKey: ['manager', 'report', 'quizzes'],
    queryFn: ({ signal }) => api.get<QuizReport>('/manager/reports/quizzes', signal),
  });
  return (
    <QueryState query={q} loading={<TableSkeleton rows={6} />}>
      {(d) => <QuizResultsReport data={d} memberLink={(id) => `/manager/members/${id}`} />}
    </QueryState>
  );
}

function ManagerCompletion() {
  const [sp] = useSearchParams();
  const qs = useMemo(() => {
    const params = new URLSearchParams();
    for (const k of [
      'brand',
      'product',
      'user',
      'status',
      'from',
      'to',
      'province',
      'city',
    ] as const) {
      const v = sp.get(k);
      if (v) params.set(k, v);
    }
    return params.toString();
  }, [sp]);
  const q = useQuery({
    queryKey: ['manager', 'report', qs],
    // Keep the filter card mounted (and the last rows visible) while a new range loads.
    placeholderData: keepPreviousData,
    // An inverted range is shown inline by the filter card; don't send it (server answers 400).
    enabled: !(sp.get('from') && sp.get('to') && (sp.get('from') ?? '') > (sp.get('to') ?? '')),
    queryFn: ({ signal }) =>
      api.get<Data>(`/manager/reports/completion${qs ? `?${qs}` : ''}`, signal),
  });
  return (
    <QueryState query={q} loading={<TableSkeleton rows={6} />}>
      {(d) => <CompletionReport rows={d.rows} memberLink={(id) => `/manager/members/${id}`} />}
    </QueryState>
  );
}
