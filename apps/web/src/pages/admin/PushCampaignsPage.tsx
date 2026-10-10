import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  FileEdit,
  Megaphone,
  Plus,
  Send,
  XCircle,
} from 'lucide-react';
import { Button, Card, EmptyState, KpiCard, TableSkeleton } from '@/components/ui';
import { Tabs } from '@/components/common/Field';
import { PushSectionTabs } from './PushSectionTabs';
import { PageHeader } from '@/components/common/PageHeader';
import { QueryState } from '@/components/common/QueryState';
import { api } from '@/lib/api';
import { faNumber } from '@/lib/format';
import { cn } from '@/lib/cn';
import {
  AUDIENCE_TYPE_LABEL,
  STATUS_META,
  acceptanceRate,
  faTehranDateTime,
  type CampaignStatus,
  type PushCampaign,
} from './pushCampaignModel';

interface Dashboard {
  counts: {
    total: number;
    draft: number;
    scheduled: number;
    inProgress: number;
    sent: number;
    failed: number;
    cancelled: number;
  };
  providerRequests: { attempted: number; accepted: number; failed: number; invalid: number };
  recent: PushCampaign[];
}

interface CampaignPage {
  items: PushCampaign[];
  nextCursor: string | null;
  total: number;
}

type Filter = 'all' | CampaignStatus;

const FILTER_ITEMS: Array<{ value: Filter; label: string }> = [
  { value: 'all', label: 'همه' },
  { value: 'draft', label: 'پیش‌نویس' },
  { value: 'scheduled', label: 'زمان‌بندی‌شده' },
  { value: 'sent', label: 'ارسال‌شده' },
  { value: 'sent_with_errors', label: 'با خطا' },
  { value: 'failed', label: 'ناموفق' },
  { value: 'cancelled', label: 'لغوشده' },
];

const TONE_CLS: Record<'neutral' | 'info' | 'warning' | 'success' | 'danger', string> = {
  neutral: 'bg-background text-text-secondary border-border',
  info: 'bg-info-light text-info-fg border-info/30',
  warning: 'bg-warning-light text-warning-fg border-warning/30',
  success: 'bg-success-light text-success-fg border-success/30',
  danger: 'bg-danger-light text-danger-fg border-danger/30',
};

/** Status badge: colour + icon + text, never colour alone (§16.8). */
export function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  const meta = STATUS_META[status];
  const Icon =
    status === 'sent'
      ? CheckCircle2
      : status === 'failed'
        ? XCircle
        : status === 'sent_with_errors' || status === 'sending'
          ? AlertTriangle
          : status === 'scheduled'
            ? CalendarClock
            : status === 'draft'
              ? FileEdit
              : Send;
  return (
    <span
      data-testid="campaign-status"
      data-status={status}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-bold whitespace-nowrap',
        TONE_CLS[meta.tone],
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {meta.label}
    </span>
  );
}

export function PushCampaignsPage() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>('all');
  const dash = useQuery({
    queryKey: ['admin', 'push-campaigns', 'dashboard'],
    queryFn: ({ signal }) => api.get<Dashboard>('/admin/push-campaigns/dashboard', signal),
  });
  const list = useInfiniteQuery({
    queryKey: ['admin', 'push-campaigns', 'list', filter],
    initialPageParam: '' as string,
    queryFn: ({ pageParam, signal }) => {
      const qs = new URLSearchParams({ limit: '20' });
      if (pageParam) qs.set('cursor', pageParam);
      if (filter !== 'all') qs.set('status', filter);
      return api.get<CampaignPage>(`/admin/push-campaigns?${qs.toString()}`, signal);
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="کمپین‌های اعلان (Push)"
        subtitle="ساخت، زمان‌بندی، ارسال و گزارش نتیجه اعلان‌های سیستمی"
        actions={
          <Button
            icon={<Plus className="size-4" aria-hidden />}
            onClick={() => navigate('/admin/push-campaigns/new')}
          >
            کمپین جدید
          </Button>
        }
      />

      <PushSectionTabs value="campaigns" />

      <QueryState
        query={dash}
        loading={
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Card key={i} className="h-24 animate-pulse" aria-hidden />
            ))}
          </div>
        }
      >
        {(d) => (
          <section aria-label="خلاصه کمپین‌ها" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard title="کل کمپین‌ها" value={faNumber(d.counts.total)} icon={Megaphone} />
            <KpiCard
              title="پیش‌نویس"
              value={faNumber(d.counts.draft)}
              subtitle="ذخیره‌شده و بدون ارسال"
              icon={FileEdit}
              tone="info"
            />
            <KpiCard
              title="زمان‌بندی‌شده"
              value={faNumber(d.counts.scheduled)}
              subtitle={
                d.counts.inProgress
                  ? `${faNumber(d.counts.inProgress)} کمپین در صف یا در حال ارسال`
                  : 'در انتظار زمان ارسال'
              }
              icon={CalendarClock}
              tone="warning"
            />
            <KpiCard
              title="ارسال‌شده"
              value={faNumber(d.counts.sent)}
              subtitle={`ناموفق: ${faNumber(d.counts.failed)}`}
              icon={CheckCircle2}
              tone="primary"
            />
            <div className="sm:col-span-2 xl:col-span-4">
              <p className="text-xs leading-6 text-muted-fg">
                «پذیرفته‌شده» یعنی سرویس ارسال اعلان درخواست را قبول کرده است؛ این به معنی تحویل
                قطعی به دستگاه یا دیده‌شدن اعلان توسط کاربر نیست. درخواست‌های ارسال‌شده:{' '}
                {faNumber(d.providerRequests.attempted)} · پذیرفته‌شده:{' '}
                {faNumber(d.providerRequests.accepted)} · ناموفق:{' '}
                {faNumber(d.providerRequests.failed)}
                {d.providerRequests.invalid
                  ? ` · توکن نامعتبر حذف‌شده: ${faNumber(d.providerRequests.invalid)}`
                  : ''}
              </p>
            </div>
          </section>
        )}
      </QueryState>

      <Tabs label="فیلتر وضعیت" value={filter} onChange={setFilter} items={FILTER_ITEMS} />

      <QueryState
        query={list}
        loading={<TableSkeleton rows={5} />}
        isEmpty={() => items.length === 0}
        empty={
          <EmptyState
            icon={<Megaphone className="size-8" aria-hidden />}
            title={filter === 'all' ? 'هنوز کمپینی ساخته نشده است' : 'کمپینی با این وضعیت پیدا نشد'}
            description="برای ارسال اعلان به کاربران، یک کمپین جدید بسازید؛ می‌توانید پیش‌نویس ذخیره کنید یا زمان ارسال تعیین کنید."
            actionText="ساخت کمپین"
            onAction={() => navigate('/admin/push-campaigns/new')}
          />
        }
      >
        {() => (
          <section aria-label="تاریخچه کمپین‌ها" className="flex flex-col gap-3">
            <ul className="flex flex-col gap-3">
              {items.map((c) => (
                <li key={c.id}>
                  <CampaignRow campaign={c} />
                </li>
              ))}
            </ul>
            {list.hasNextPage && (
              <div className="flex justify-center">
                <Button
                  variant="secondary"
                  loading={list.isFetchingNextPage}
                  onClick={() => list.fetchNextPage()}
                >
                  نمایش بیشتر
                </Button>
              </div>
            )}
          </section>
        )}
      </QueryState>
    </div>
  );
}

function CampaignRow({ campaign: c }: { campaign: PushCampaign }) {
  const s = c.summary;
  const rate = acceptanceRate(s);
  const when =
    c.status === 'scheduled' && c.scheduledAt
      ? `زمان ارسال: ${faTehranDateTime(c.scheduledAt)}`
      : c.finishedAt
        ? `پایان: ${faTehranDateTime(c.finishedAt)}`
        : c.startedAt
          ? `شروع: ${faTehranDateTime(c.startedAt)}`
          : `ایجاد: ${faTehranDateTime(c.createdAt)}`;
  return (
    <Link
      to={`/admin/push-campaigns/${c.id}`}
      data-testid="campaign-row"
      className="pressable block rounded-card border border-border bg-surface p-4 shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-base font-extrabold text-text">{c.name}</p>
          <p className="mt-0.5 truncate text-sm text-text-secondary">{c.title}</p>
        </div>
        <CampaignStatusBadge status={c.status} />
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-secondary">
        <span>مخاطب: {AUDIENCE_TYPE_LABEL[c.audience.type]}</span>
        <span>{when}</span>
        {c.targetCount !== null && <span>تعداد مخاطب: {faNumber(c.targetCount)}</span>}
        {s.attempted > 0 && (
          <span>
            درخواست به سرویس: {faNumber(s.attempted)} · پذیرفته: {faNumber(s.accepted)} · ناموفق:{' '}
            {faNumber(s.failed)}
            {rate !== null ? ` (${faNumber(rate)}٪ پذیرفته)` : ''}
          </span>
        )}
      </div>
      {c.lastError && (
        <p className="mt-2 flex items-start gap-1.5 text-xs font-medium text-danger-fg">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {c.lastError}
        </p>
      )}
    </Link>
  );
}
