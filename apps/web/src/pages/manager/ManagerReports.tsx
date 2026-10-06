import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { TableSkeleton } from '@/components/ui';
import { PageHeader } from '@/components/common/PageHeader';
import { QueryState } from '@/components/common/QueryState';
import { CompletionReport } from '@/components/reports/CompletionReport';
import { api } from '@/lib/api';
import type { CompletionReport as Data } from '@/lib/types';

/** W2 — گزارش تکمیل تیم. */
export function ManagerReports() {
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
    <div>
      <PageHeader title="گزارش تکمیل" subtitle="وضعیت آموزش هر عضو به تفکیک بسته" />
      <QueryState query={q} loading={<TableSkeleton rows={6} />}>
        {(d) => <CompletionReport rows={d.rows} memberLink={(id) => `/manager/members/${id}`} />}
      </QueryState>
    </div>
  );
}
