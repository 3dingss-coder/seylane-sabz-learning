import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlarmClock,
  BadgeCheck,
  CheckCircle2,
  FileQuestion,
  Sparkles,
  UserCheck,
  Users,
} from 'lucide-react';
import { Card, KpiCard, Skeleton } from '@/components/ui';
import { PageHeader } from '@/components/common/PageHeader';
import { QueryState } from '@/components/common/QueryState';
import { api } from '@/lib/api';
import { toPersianDigits } from '@/lib/digits';
import { faNumber, faPercent } from '@/lib/format';
import type { AdminDashboard as Data } from '@/lib/types';

/** A1 — داشبورد ادمین: product KPIs (§29) + content status. */
export function AdminDashboard() {
  const q = useQuery({
    queryKey: ['admin', 'dashboard'],
    queryFn: ({ signal }) => api.get<Data>('/admin/dashboard', signal),
  });
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="داشبورد" subtitle="وضعیت کلی آموزش و محتوا" />
      <QueryState
        query={q}
        loading={
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-28" />
            ))}
          </div>
        }
      >
        {(d) => (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <KpiCard
                title="بازاریاب‌ها"
                value={faNumber(d.kpis.marketers)}
                subtitle={`${toPersianDigits(d.kpis.activeMarketers)} فعال`}
                icon={Users}
              />
              <KpiCard
                title="نرخ فعال‌سازی"
                value={faPercent(d.kpis.activationRate)}
                icon={UserCheck}
                tone="info"
              />
              <KpiCard
                title="WAU / MAU"
                value={faPercent(d.kpis.wauMau)}
                subtitle={`${toPersianDigits(d.kpis.wau)} / ${toPersianDigits(d.kpis.mau)}`}
                icon={Activity}
                tone="info"
              />
              <KpiCard
                title="تکمیل به‌موقع"
                value={faPercent(d.kpis.onTimeCompletionRate)}
                subtitle={`${toPersianDigits(d.kpis.completions)} تکمیل`}
                icon={CheckCircle2}
              />
              <KpiCard
                title="قبولی در تلاش اول"
                value={faPercent(d.kpis.firstPassRate)}
                icon={BadgeCheck}
              />
              <KpiCard
                title="میانگین تأخیر"
                value={`${toPersianDigits(Math.round(d.kpis.avgDelayHours))} ساعت`}
                icon={AlarmClock}
                tone={d.kpis.avgDelayHours > 24 ? 'warning' : 'primary'}
              />
              <KpiCard
                title="اثر یادآوری منتور"
                value={faPercent(d.kpis.nudgeReengagementRate)}
                icon={Sparkles}
                tone="info"
              />
              <KpiCard
                title="آزمون مجدد در انتظار"
                value={toPersianDigits(d.pendingRetakes)}
                icon={FileQuestion}
                tone={d.pendingRetakes ? 'warning' : 'primary'}
              />
            </div>
            <Card>
              <h2 className="mb-3 font-bold">محتوا</h2>
              <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
                <Stat to="/admin/content" label="منتشرشده" value={d.content.published} />
                <Stat to="/admin/content" label="پیش‌نویس" value={d.content.drafts} />
                <Stat
                  to="/admin/content?tab=unassigned"
                  label="بدون تخصیص"
                  value={d.content.unassigned}
                  warn={d.content.unassigned > 0}
                />
                <Stat to="/admin/content" label="بایگانی" value={d.content.archived} />
              </div>
            </Card>
          </>
        )}
      </QueryState>
    </div>
  );
}

function Stat({
  to,
  label,
  value,
  warn,
}: {
  to: string;
  label: string;
  value: number;
  warn?: boolean;
}) {
  return (
    <Link
      to={to}
      className="flex min-h-16 flex-col items-center justify-center rounded-card border border-border p-2 hover:border-primary/40"
    >
      <span className={warn ? 'text-2xl font-bold text-warning' : 'text-2xl font-bold text-text'}>
        {toPersianDigits(value)}
      </span>
      <span className="text-xs text-text-secondary">{label}</span>
    </Link>
  );
}
