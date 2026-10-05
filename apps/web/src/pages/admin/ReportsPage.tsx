import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, Database, RefreshCw, ThumbsDown, ThumbsUp, Users, Volume2 } from 'lucide-react';
import { Button, Card, KpiCard, Skeleton, TableSkeleton, useToast } from '@/components/ui';
import { Tabs } from '@/components/common/Field';
import { PageHeader } from '@/components/common/PageHeader';
import { QueryState } from '@/components/common/QueryState';
import { CompletionReport } from '@/components/reports/CompletionReport';
import { RetakeList } from '@/components/reports/RetakeList';
import { api } from '@/lib/api';
import { toPersianDigits } from '@/lib/digits';
import { faDateTime, faNumber, faPercent } from '@/lib/format';
import { errMsg } from '@/lib/errors';
import type {
  CompletionReport as Data,
  KnowledgeStats,
  MentorQuality,
  MentorReport,
} from '@/lib/types';
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
  const [sp] = useSearchParams();
  const qs = useMemo(() => {
    const params = new URLSearchParams();
    for (const k of [
      'brand',
      'product',
      'user',
      'team',
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
    queryKey: ['admin', 'report', 'completion', qs],
    queryFn: ({ signal }) =>
      api.get<Data>(`/admin/reports/completion${qs ? `?${qs}` : ''}`, signal),
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
          <AiQuality />
          <KnowledgePanel />
        </div>
      )}
    </QueryState>
  );
}

/** AI layer health: providers, failover, latency, voice minutes — from /admin/reports/mentor-quality. */
function AiQuality() {
  const q = useQuery({
    queryKey: ['admin', 'report', 'mentor-quality'],
    queryFn: ({ signal }) => api.get<MentorQuality>('/admin/reports/mentor-quality', signal),
  });
  return (
    <QueryState query={q} loading={<Skeleton className="h-40" />}>
      {(d) => (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard
              title="نرخ «نمی‌دانم»"
              value={d.answers.unknownRate === null ? '—' : faPercent(d.answers.unknownRate)}
              subtitle="بالا بودن = کمبود محتوا یا آستانه سخت‌گیر"
              icon={Bot}
              tone={
                d.answers.unknownRate !== null && d.answers.unknownRate > 35 ? 'warning' : 'primary'
              }
            />
            <KpiCard
              title="میانگین تأخیر پاسخ"
              value={
                d.answers.avgLatencyMs === null ? '—' : `${faNumber(d.answers.avgLatencyMs)} ms`
              }
              icon={RefreshCw}
              tone="info"
            />
            <KpiCard
              title="دقیقه تماس صوتی"
              value={faNumber(d.voice.minutes)}
              subtitle={`${faNumber(d.voice.turns)} دور گفت‌وگو در ${faNumber(d.voice.sessions)} تماس`}
              icon={Volume2}
            />
            <KpiCard
              title="رضایت"
              value={d.satisfaction.score === null ? '—' : faPercent(d.satisfaction.score)}
              subtitle={`${faNumber(d.satisfaction.up)} 👍 / ${faNumber(d.satisfaction.down)} 👎`}
              icon={ThumbsUp}
            />
          </div>
          <Card>
            <h3 className="mb-2 font-bold">ارائه‌دهنده‌ها</h3>
            <p className="mb-2 text-xs text-text-secondary">
              «تغییر مسیر» یعنی ارائه‌دهنده‌ی اول پاسخ نداده و بعدی جواب داده — افزایش آن نشانه‌ی
              افت یک سرویس است.
            </p>
            <ul className="flex flex-col gap-1 text-sm">
              {d.providers.length === 0 && (
                <li className="text-text-secondary">هنوز فراخوانی هوش مصنوعی ثبت نشده است.</li>
              )}
              {d.providers.map((p) => (
                <li key={p.provider} className="flex justify-between">
                  <span>
                    {p.provider}
                    {p.failovers > 0 && (
                      <span className="text-xs text-warning-fg">
                        {' '}
                        (تغییر مسیر: {faNumber(p.failovers)})
                      </span>
                    )}
                  </span>
                  <span className="text-text-secondary">
                    {faNumber(p.calls)} فراخوانی
                    {p.avgLatencyMs !== null ? ` · ${faNumber(p.avgLatencyMs)} ms` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <h3 className="mb-2 font-bold">لایه‌های فعال</h3>
            <ul className="flex flex-col gap-1 text-sm">
              {d.health.map((h) => (
                <li key={h.provider} className="flex justify-between gap-2">
                  <span className="font-bold">{h.labelFa}</span>
                  <span className="text-text-secondary" dir="ltr">
                    {h.model} · {h.tasks.join(', ')}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </QueryState>
  );
}

/** What the assistant knows: index size, embedding coverage, media coverage + manual reindex. */
function KnowledgePanel() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({
    queryKey: ['admin', 'knowledge'],
    queryFn: ({ signal }) => api.get<KnowledgeStats>('/admin/knowledge', signal),
  });
  const extract = useMutation({
    mutationFn: () =>
      api.post<{ extracted: number; skipped: number; failed: number }>('/admin/knowledge/extract', {
        limit: 8,
      }),
    onSuccess: (r) => {
      toast.show({
        type: 'success',
        message: `استخراج انجام شد: ${toPersianDigits(r.extracted)} فایل خوانده شد، ${toPersianDigits(r.failed)} خطا.`,
      });
      void qc.invalidateQueries({ queryKey: ['admin', 'knowledge'] });
    },
    onError: (e) => toast.show({ type: 'error', message: errMsg(e) }),
  });
  const rebuild = useMutation({
    mutationFn: () => api.post('/admin/knowledge/rebuild', {}),
    onSuccess: () => {
      toast.show({ type: 'success', message: 'ایندکس دانش‌نامه بازسازی شد.' });
      void qc.invalidateQueries({ queryKey: ['admin', 'knowledge'] });
    },
    onError: (e) => toast.show({ type: 'error', message: errMsg(e) }),
  });
  return (
    <QueryState query={q} loading={<Skeleton className="h-40" />}>
      {(d) => (
        <Card>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 font-bold">
              <Database className="size-4" aria-hidden /> دانش‌نامه‌ی منتور
            </h3>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                size="md"
                loading={extract.isPending}
                onClick={() => extract.mutate()}
              >
                خواندن فایل‌های جدید
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="md"
                loading={rebuild.isPending}
                onClick={() => rebuild.mutate()}
              >
                بازسازی ایندکس
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard title="مطالب ایندکس‌شده" value={faNumber(d.live)} icon={Database} />
            <KpiCard
              title="با جست‌وجوی معنایی"
              value={d.live ? faPercent(Math.round((d.embedded / d.live) * 100)) : '—'}
              subtitle={d.embeddingProvider ?? 'بدون ایمبدینگ'}
              icon={Bot}
              tone="info"
            />
            <KpiCard
              title="بخش‌های خوانده‌شده"
              value={`${faNumber(d.media.sections.extracted)}/${faNumber(d.media.sections.total)}`}
              subtitle={`${faNumber(d.media.sections.withTranscript)} بخش متن آموزش دارد`}
              icon={Volume2}
            />
            <KpiCard
              title="تصاویر محصول خوانده‌شده"
              value={`${faNumber(d.media.products.extracted)}/${faNumber(d.media.products.withImage)}`}
              subtitle={
                d.media.failing > 0 ? `${faNumber(d.media.failing)} فایل با خطا` : 'بدون خطا'
              }
              icon={Database}
              tone={d.media.failing > 0 ? 'warning' : 'primary'}
            />
          </div>
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-secondary">
            {Object.entries(d.byKind).map(([k, v]) => (
              <li key={k}>
                {KIND[k] ?? k}: <span className="font-bold">{faNumber(v)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-text-secondary">
            {d.builtAt ? `آخرین بازسازی: ${faDateTime(d.builtAt)}` : 'هنوز ایندکسی ساخته نشده است.'}
            {' · '}
            خواندن فایل‌ها روزانه ۰۸:۳۰ تهران خودکار انجام می‌شود؛ فقط فایل‌های تغییر‌یافته دوباره
            خوانده می‌شوند.
          </p>
        </Card>
      )}
    </QueryState>
  );
}

const KIND: Record<string, string> = {
  brand: 'برند',
  product: 'محصول',
  package: 'بسته',
  section: 'قسمت',
  quiz: 'آزمون',
  policy: 'سیاست',
  faq: 'پرسش پرتکرار',
  play: 'پلی فروش',
  media: 'رسانه',
};
