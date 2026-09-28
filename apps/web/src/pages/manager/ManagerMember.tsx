import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { TableSkeleton } from '@/components/ui';
import { PageHeader } from '@/components/common/PageHeader';
import { QueryState } from '@/components/common/QueryState';
import { MemberTimeline } from '@/components/reports/MemberTimeline';
import { api } from '@/lib/api';
import type { Timeline } from '@/lib/types';

export function ManagerMember() {
  const { id = '' } = useParams();
  const q = useQuery({
    queryKey: ['manager', 'member', id],
    queryFn: ({ signal }) => api.get<Timeline>(`/manager/users/${id}/progress`, signal),
  });
  return (
    <div>
      <PageHeader title="جزئیات عضو" back="/manager/reports" />
      <QueryState query={q} loading={<TableSkeleton rows={6} />}>
        {(d) => <MemberTimeline data={d} canMessage />}
      </QueryState>
    </div>
  );
}
