import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlarmClock, CheckCircle2, ClipboardList, Send, TrendingUp, Users } from 'lucide-react';
import { Button, EmptyState, KpiCard, ProgressBar, Skeleton, TableSkeleton } from '@/components/ui';
import { DataTable } from '@/components/admin/DataTable';
import { PageHeader } from '@/components/common/PageHeader';
import { QueryState } from '@/components/common/QueryState';
import { api } from '@/lib/api';
import { toPersianDigits } from '@/lib/digits';
import { faDate, faPercent, faRelative } from '@/lib/format';
import type { Laggard, ManagerDashboard as Data } from '@/lib/types';
import { SendMessageDialog } from './SendMessageDialog';

/** W1 — داشبورد مدیر: team KPIs + laggards with quick message. */
export function ManagerDashboard() {
  const q = useQuery({
    queryKey: ['manager', 'dashboard'],
    queryFn: ({ signal }) => api.get<Data>('/manager/dashboard', signal),
  });
  const nav = useNavigate();
  const [target, setTarget] = useState<Laggard | null>(null);
  return (
    <div className="flex flex-col gap-4">
      <QueryState
        query={q}
        loading={
          <>
            <div className="stagger grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-28" />
              ))}
            </div>
            <TableSkeleton rows={5} />
          </>
        }
      >
        {(d) => (
          <>
            <PageHeader
              title={d.team ? `تیم ${d.team.name}` : 'داشبورد تیم'}
              subtitle="وضعیت آموزش اعضای تیم"
            />
            {!d.team ? (
              <EmptyState
                title="هنوز تیمی به شما سپرده نشده"
                description="از مدیر سیستم بخواهید شما را مدیر یک تیم کند."
              />
            ) : (
              <>
                <div className="stagger grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <KpiCard
                    title="نرخ تکمیل"
                    value={faPercent(d.kpis.completionRate)}
                    subtitle={`${toPersianDigits(d.kpis.completed)} از ${toPersianDigits(d.kpis.assigned)}`}
                    icon={CheckCircle2}
                    tone="primary"
                  />
                  <KpiCard
                    title="تکمیل به‌موقع"
                    value={faPercent(d.kpis.onTimeRate)}
                    icon={TrendingUp}
                    tone="info"
                  />
                  <KpiCard
                    title="عقب‌مانده"
                    value={toPersianDigits(d.kpis.laggardCount)}
                    subtitle={`از ${toPersianDigits(d.kpis.members)} نفر`}
                    icon={AlarmClock}
                    tone={d.kpis.laggardCount ? 'danger' : 'primary'}
                  />
                  <KpiCard
                    title="درخواست آزمون مجدد"
                    value={toPersianDigits(d.pendingRetakes)}
                    icon={ClipboardList}
                    tone={d.pendingRetakes ? 'warning' : 'primary'}
                  />
                </div>
                {d.pendingRetakes > 0 && (
                  <Link
                    to="/manager/retakes"
                    className="flex min-h-12 items-center justify-between rounded-card border border-warning/30 bg-warning-light px-3 text-sm font-bold text-text"
                  >
                    {toPersianDigits(d.pendingRetakes)} درخواست آزمون مجدد منتظر بررسی شماست
                    <span className="text-primary">بررسی</span>
                  </Link>
                )}
                <section aria-labelledby="laggards" className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <h2 id="laggards" className="text-base font-bold">
                      عقب‌مانده‌ها
                    </h2>
                    <Link
                      to="/manager/reports?status=overdue"
                      className="flex min-h-12 items-center px-2 text-sm font-bold text-primary"
                    >
                      گزارش کامل
                    </Link>
                  </div>
                  {d.laggards.length === 0 ? (
                    <EmptyState
                      title="همه اعضا طبق برنامه پیش می‌روند 👏"
                      icon={<Users className="size-8" />}
                    />
                  ) : (
                    <DataTable
                      caption="عقب‌مانده‌ها"
                      rows={d.laggards}
                      rowKey={(r) => `${r.userId}-${r.packageId}`}
                      onRowClick={(r) => nav(`/manager/members/${r.userId}`)}
                      columns={[
                        {
                          key: 'name',
                          header: 'نام',
                          cell: (r) => <span className="font-bold">{r.name}</span>,
                        },
                        { key: 'pkg', header: 'آموزش', cell: (r) => r.packageTitle },
                        {
                          key: 'pct',
                          header: 'پیشرفت',
                          cell: (r) => (
                            <div className="flex min-w-24 items-center gap-2">
                              <ProgressBar
                                value={r.percent}
                                label={`پیشرفت ${r.name}`}
                                className="flex-1"
                              />
                              <span className="text-xs">{faPercent(r.percent)}</span>
                            </div>
                          ),
                        },
                        {
                          key: 'late',
                          header: 'تأخیر',
                          cell: (r) =>
                            r.overdueDays > 0 ? (
                              <span className="font-bold text-danger">
                                {toPersianDigits(r.overdueDays)} روز
                              </span>
                            ) : r.deadlineAt ? (
                              `مهلت ${faDate(r.deadlineAt)}`
                            ) : (
                              '—'
                            ),
                        },
                        {
                          key: 'stuck',
                          header: 'گیر کرده در',
                          cell: (r) => r.stuckAt ?? '—',
                          hideOnMobile: true,
                        },
                        {
                          key: 'last',
                          header: 'آخرین فعالیت',
                          cell: (r) => (r.lastActivityAt ? faRelative(r.lastActivityAt) : 'هرگز'),
                          hideOnMobile: true,
                        },
                        {
                          key: 'act',
                          header: '',
                          cell: (r) => (
                            <Button
                              variant="secondary"
                              icon={<Send className="size-4" aria-hidden />}
                              onClick={(e) => {
                                e.stopPropagation();
                                setTarget(r);
                              }}
                            >
                              پیام
                            </Button>
                          ),
                        },
                      ]}
                    />
                  )}
                </section>
              </>
            )}
          </>
        )}
      </QueryState>
      {target && (
        <SendMessageDialog
          open
          onClose={() => setTarget(null)}
          userId={target.userId}
          userName={target.name}
          packages={[{ id: target.packageId, title: target.packageTitle }]}
          defaultPackageId={target.packageId}
        />
      )}
    </div>
  );
}
