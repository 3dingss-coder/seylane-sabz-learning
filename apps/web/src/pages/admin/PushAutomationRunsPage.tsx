import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Activity, UserSearch } from 'lucide-react';
import { Card, Skeleton } from '@/components/ui';
import { Select } from '@/components/common/Field';
import { PageHeader } from '@/components/common/PageHeader';
import { QueryState } from '@/components/common/QueryState';
import { DataTable, type Column } from '@/components/admin/DataTable';
import { api } from '@/lib/api';
import { faDateTime } from '@/lib/format';
import { toPersianDigits } from '@/lib/digits';
import { Chip } from './PushAutomationsPanel';
import {
  RUN_KIND_LABELS,
  RUN_LIMITS,
  runDurationLabel,
  runsPath,
  runTally,
  skippedSentence,
  type RunRow,
  type AutomationListLite,
} from './pushAutomationRunModel';

/**
 * «تاریخچه اجراها» — one row per engine run, for every rule (prompt §7 «run history»). Read-only on
 * purpose: an execution is a fact about the past, and the panel offers no way to edit a fact.
 *
 * The numbers come from `push_automation_runs` (`runPushAutomations` writes them in
 * `functions/src/services/push-automation-engine.ts`) and the skip wording is server-rendered, so a
 * reason the engine learns tomorrow shows up here as Persian text without a web release.
 */
export function PushAutomationRunsPage() {
  const [params, setParams] = useSearchParams();
  const key = params.get('key');
  const limit = RUN_LIMITS.includes(Number(params.get('limit')) as (typeof RUN_LIMITS)[number])
    ? Number(params.get('limit'))
    : 30;

  const rules = useQuery({
    queryKey: ['admin', 'push-automations', 'list'],
    queryFn: ({ signal }) => api.get<AutomationListLite>('/admin/push-automations', signal),
    staleTime: 60_000,
  });
  const runs = useQuery({
    queryKey: ['admin', 'push-automations', 'runs', key, limit],
    queryFn: ({ signal }) => api.get<RunRow[]>(runsPath(key, limit), signal),
  });

  const setParam = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '') next.delete(k);
      else next.set(k, v);
    }
    setParams(next, { replace: true });
  };

  const options = (rules.data?.rows ?? []).filter((r) => !r.isGate);

  const columns: Column<RunRow>[] = [
    {
      key: 'started',
      header: 'شروع',
      cell: (r) => (
        <span className="whitespace-nowrap font-bold text-text">{faDateTime(r.startedAt)}</span>
      ),
      sortValue: (r) => r.startedAt,
    },
    {
      key: 'rule',
      header: 'قانون',
      cell: (r) => (
        <Link
          to={`/admin/push-campaigns/automations/${r.key}`}
          className="font-bold text-primary hover:underline"
        >
          {r.label}
        </Link>
      ),
    },
    {
      key: 'kind',
      header: 'نوع',
      hideOnMobile: true,
      cell: (r) => <Chip tone="neutral">{RUN_KIND_LABELS[r.kind] ?? r.kind}</Chip>,
    },
    {
      key: 'window',
      header: 'بازه',
      hideOnMobile: true,
      cell: (r) => <span className="text-xs text-muted-fg">{toPersianDigits(r.windowKey)}</span>,
    },
    {
      key: 'tally',
      header: 'نتیجه',
      cell: (r) => (
        <span className="flex flex-col items-start gap-1">
          <span className="text-xs font-bold text-text-secondary">{runTally(r)}</span>
          {/* The message the engine stored for itself — already truncated and scrubbed on the server. */}
          {r.error && <Chip tone="danger">{r.error}</Chip>}
        </span>
      ),
    },
    {
      key: 'skipped',
      header: 'دلایل رد',
      className: 'max-w-72',
      cell: (r) => (
        <span className="block text-[11px] leading-5 text-muted-fg">{skippedSentence(r)}</span>
      ),
    },
    {
      key: 'duration',
      header: 'مدت',
      hideOnMobile: true,
      cell: (r) => (
        <span className="whitespace-nowrap text-xs text-muted-fg">
          {runDurationLabel(r.startedAt, r.finishedAt)}
        </span>
      ),
      sortValue: (r) => r.startedAt,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="تاریخچه اجرای اتوماسیون"
        subtitle="هر باری که موتور قوانین را بررسی کرد، با تعداد مشمولان، ارسال‌ها و دلایل ردّ"
        back="/admin/push-campaigns/automations"
        actions={
          <Link
            to="/admin/push-campaigns/automations/trace"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-input border border-primary/70 bg-surface px-3 text-sm font-bold text-primary hover:bg-primary-light"
          >
            <UserSearch className="size-4" aria-hidden />
            ردیابی کاربر
          </Link>
        }
      />

      <Card className="flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1">
          <Select
            label="فقط یک قانون"
            value={key ?? ''}
            onChange={(e) => setParam({ key: e.target.value || null })}
          >
            <option value="">همه قوانین</option>
            {options.map((r) => (
              <option key={r.key} value={r.key}>
                {r.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-32">
          <Select
            label="تعداد سطرها"
            value={String(limit)}
            onChange={(e) => setParam({ limit: e.target.value })}
          >
            {RUN_LIMITS.map((n) => (
              <option key={n} value={String(n)}>
                {toPersianDigits(n)}
              </option>
            ))}
          </Select>
        </div>
        {!!key && (
          <p className="pb-2 text-[11px] leading-5 text-muted-fg">
            فهرست روی «{options.find((r) => r.key === key)?.name ?? key}» فیلتر شده است. برای دیدن
            همه، «همه قوانین» را انتخاب کنید.
          </p>
        )}
      </Card>

      <QueryState query={runs} loading={<Skeleton className="h-40" />}>
        {(rows) =>
          rows.length ? (
            <DataTable
              rows={rows}
              columns={columns}
              rowKey={(r) => r.id}
              caption="تاریخچه اجرای اتوماسیون‌ها"
            />
          ) : (
            <Card>
              <p className="flex items-start gap-2 text-sm leading-7 text-text-secondary">
                <Activity className="mt-1 size-4 shrink-0 text-muted-fg" aria-hidden />
                هنوز اجرایی در این بازه ثبت نشده. کران ۱۵ دقیقه‌ای موتور، برای هر قانون در پنجره
                زمانی‌اش یک سطر تاریخچه می‌نویسد؛ «اجرای الان» هم یک سطر «دستی» می‌سازد.
              </p>
            </Card>
          )
        }
      </QueryState>

      <p className="text-[11px] leading-6 text-muted-fg">
        سطرهای خطادار همان پیامِ کوتاه‌شده‌ی موتور را نشان می‌دهند (بدون اطلاعات کاربر و بدون
        رمز/توکن). برای دیدن اینکه یک قانون «چرا برای فلان کاربر نرفت»، صفحه{' '}
        <Link
          to="/admin/push-campaigns/automations/trace"
          className="font-bold text-primary hover:underline"
        >
          ردیابی کاربر
        </Link>{' '}
        را باز کنید.
      </p>
    </div>
  );
}
