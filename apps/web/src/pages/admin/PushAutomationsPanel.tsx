import { useState, type ChangeEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  BellOff,
  Gauge,
  History,
  Lock,
  PlayCircle,
  Save,
  UserSearch,
  ShieldAlert,
  Plus,
  SlidersHorizontal,
  Users,
} from 'lucide-react';
import { Button, Card, Input, KpiCard, Modal, Skeleton, useToast } from '@/components/ui';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { DataTable, type Column } from '@/components/admin/DataTable';
import { QueryState } from '@/components/common/QueryState';
import { api } from '@/lib/api';
import { errMsg } from '@/lib/errors';
import { cn } from '@/lib/cn';
import { faTehranDateTime } from './pushCampaignModel';
import {
  PRIORITY_META,
  capsSummary,
  draftFromSettings,
  estimateChip,
  estimateSentence,
  faNum,
  groupRows,
  healthItems,
  needsCriticalConfirm,
  settingsFromDraft,
  stateOf,
  validateCaps,
  type AutomationList,
  type AutomationRow,
  type CapDraft,
  type DryRunResult,
  type SystemHealth,
  type Tone,
} from './pushAutomationModel';

/**
 * The automation tab of «کمپین‌های Push»: what is switched on, what it will do, and whether the
 * machinery underneath it is alive. Everything here is a *view* of `/admin/push-automations` — the
 * engine's own gate (`functions/src/services/push-automation-governor.ts`) is what decides a send,
 * so no rule is re-implemented in the client.
 */

const TONE_CLS: Record<Tone, string> = {
  neutral: 'bg-background text-text-secondary border-border',
  info: 'bg-info-light text-info-fg border-info/30',
  warning: 'bg-warning-light text-warning-fg border-warning/30',
  success: 'bg-success-light text-success-fg border-success/30',
  danger: 'bg-danger-light text-danger-fg border-danger/30',
};

export function Chip({ tone, children, hint }: { tone: Tone; children: ReactNode; hint?: string }) {
  return (
    <span
      title={hint}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold whitespace-nowrap',
        TONE_CLS[tone],
      )}
    >
      {children}
    </span>
  );
}

export function PushAutomationsPanel() {
  const toast = useToast();
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ['admin', 'push-automations', 'list'],
    queryFn: ({ signal }) => api.get<AutomationList>('/admin/push-automations', signal),
  });
  const health = useQuery({
    queryKey: ['admin', 'system-health'],
    queryFn: ({ signal }) => api.get<SystemHealth>('/admin/system-health', signal),
    staleTime: 30_000,
  });

  const [pendingCritical, setPendingCritical] = useState<{
    row: AutomationRow;
    next: boolean;
  } | null>(null);
  const [pauseAsk, setPauseAsk] = useState<boolean | null>(null);
  const [capsOpen, setCapsOpen] = useState(false);
  /** Which row's switch is in flight — only that one shows a spinner, not the whole table. */
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<{ row: AutomationRow; dry: DryRunResult } | null>(null);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['admin', 'push-automations'] });
    void qc.invalidateQueries({ queryKey: ['admin', 'system-health'] });
  };

  const enable = useMutation({
    mutationFn: (v: { key: string; enabled: boolean; confirmCritical?: boolean }) => {
      setBusyKey(v.key);
      return api.post(`/admin/push-automations/${v.key}/enabled`, {
        enabled: v.enabled,
        ...(v.confirmCritical ? { confirmCritical: true } : {}),
      });
    },
    onSettled: () => setBusyKey(null),
    onSuccess: (_r, v) => {
      refresh();
      toast.show({
        type: 'success',
        message: v.enabled
          ? 'روشن شد؛ از پنجره زمانی بعدی اعمال می‌شود.'
          : 'خاموش شد؛ از این پس اعلانی از این قانون ساخته نمی‌شود.',
      });
    },
    // The server always wins: on any error (including a 409 from a concurrent edit) the list is
    // refetched so the switch shows the real state instead of a rolled-back guess.
    onError: (e) => {
      refresh();
      toast.show({ type: 'error', message: errMsg(e, 'تغییر وضعیت انجام نشد.') });
    },
  });

  const pause = useMutation({
    mutationFn: (paused: boolean) => api.post('/admin/push-automations/pause', { paused }),
    onSuccess: (_r, paused) => {
      refresh();
      toast.show({
        type: paused ? 'warning' : 'success',
        message: paused
          ? 'توقف کلی روشن شد: هیچ اتوماسیونی ارسال نمی‌کند (از همین لحظه).'
          : 'توقف کلی خاموش شد؛ قانون‌های روشن دوباره اجرا می‌شوند.',
      });
    },
    onError: (e) => toast.show({ type: 'error', message: errMsg(e) }),
  });

  const runNow = useMutation({
    mutationFn: () =>
      api.post<{
        sweeps: Array<{ key: string; sent: number; evaluated: number; skipped: number }>;
        paused: boolean;
      }>('/admin/push-automations/run', { force: true }),
    onSuccess: (r) => {
      refresh();
      const sent = r.sweeps.reduce((n, s) => n + s.sent, 0);
      const evald = r.sweeps.reduce((n, s) => n + s.evaluated, 0);
      toast.show({
        type: 'info',
        message: r.paused
          ? 'اتوماسیون‌ها در حالت توقف‌اند؛ چیزی اجرا نشد.'
          : `${faNum(r.sweeps.length)} قانون بررسی شد · ${faNum(evald)} کاربر ارزیابی شد · ${faNum(sent)} ارسال.`,
        durationMs: 6000,
      });
    },
    onError: (e) => toast.show({ type: 'error', message: errMsg(e) }),
  });

  const dryRun = useMutation({
    mutationFn: (row: AutomationRow) =>
      api.post<DryRunResult>(`/admin/push-automations/${row.key}/dry-run`),
    onSuccess: (dry, row) => setEstimate({ row, dry }),
    onError: (e) => toast.show({ type: 'error', message: errMsg(e, 'برآورد انجام نشد.') }),
  });

  return (
    <QueryState query={list} loading={<PanelSkeleton />}>
      {(data) => (
        <div data-testid="automations-panel" className="flex flex-col gap-4">
          <HealthCard health={health.data} settings={data.settings} loading={health.isPending} />

          <section
            aria-label="کنترل‌های کلی اتوماسیون"
            className="flex flex-wrap items-center gap-2 rounded-card border border-border bg-surface p-3 shadow-sm"
          >
            <KpiStrip data={data} />
            <div className="ms-auto flex flex-wrap items-center gap-2">
              <Link
                to="/admin/push-campaigns/automations/new"
                className="inline-flex min-h-10 items-center gap-1.5 rounded-input border border-primary/70 bg-surface px-3 text-sm font-bold text-primary hover:bg-primary-light"
              >
                <Plus className="size-4" aria-hidden />
                اتوماسیون دست‌ساز
              </Link>
              <Button
                variant="ghost"
                icon={<SlidersHorizontal className="size-4" aria-hidden />}
                onClick={() => setCapsOpen(true)}
              >
                سقف‌ها و تنظیمات کلی
              </Button>
              {/* History and trace are the read-only half of the same product: they answer «what did
                  it do» and «why not for this person», so they live next to the switches. */}
              <Link
                to="/admin/push-campaigns/automations/runs"
                className="inline-flex min-h-10 items-center gap-1.5 rounded-input border border-border bg-surface px-3 text-sm font-bold text-text-secondary hover:bg-surface-2 hover:text-primary"
              >
                <History className="size-4" aria-hidden />
                تاریخچه اجراها
              </Link>
              <Link
                to="/admin/push-campaigns/automations/trace"
                className="inline-flex min-h-10 items-center gap-1.5 rounded-input border border-border bg-surface px-3 text-sm font-bold text-text-secondary hover:bg-surface-2 hover:text-primary"
              >
                <UserSearch className="size-4" aria-hidden />
                ردیابی کاربر
              </Link>
              <Button
                variant="secondary"
                loading={runNow.isPending}
                icon={<PlayCircle className="size-4" aria-hidden />}
                onClick={() => runNow.mutate()}
              >
                اجرای الان
              </Button>
              <Button
                variant={data.paused ? 'primary' : 'danger'}
                icon={
                  data.paused ? (
                    <PlayCircle className="size-4" aria-hidden />
                  ) : (
                    <BellOff className="size-4" aria-hidden />
                  )
                }
                onClick={() => setPauseAsk(!data.paused)}
              >
                {data.paused ? 'ادامه همه اتوماسیون‌ها' : 'توقف همه اتوماسیون‌ها'}
              </Button>
            </div>
          </section>

          {data.paused && (
            <Card tone="default" className="border-danger/30 bg-danger-light">
              <p className="flex items-start gap-2 text-sm font-bold text-danger-fg">
                <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                توقف کلی روشن است. هیچ اتوماسیونی اعلان نمی‌سازد و پوش نمی‌فرستد؛ اعلان‌های دستی و
                کمپین‌های زمان‌بندی‌شده همچنان کار می‌کنند.
              </p>
            </Card>
          )}

          {groupRows(data.rows).map((g) => (
            <section
              key={g.category}
              aria-label={`گروه ${g.label}`}
              className="flex flex-col gap-2"
            >
              <header className="flex flex-wrap items-baseline gap-2">
                <h3 className="text-sm font-extrabold text-text">{g.label}</h3>
                <span className="text-xs text-text-secondary">
                  {faNum(g.enabledCount)} از {faNum(g.rows.length)} روشن
                </span>
              </header>
              <AutomationTable
                rows={g.rows}
                busy={busyKey}
                estimating={dryRun.isPending ? (dryRun.variables?.key ?? null) : null}
                onToggle={(row, next) => {
                  if (needsCriticalConfirm(row)) return setPendingCritical({ row, next });
                  enable.mutate({ key: row.key, enabled: next });
                }}
                onEstimate={(row) => dryRun.mutate(row)}
              />
            </section>
          ))}

          <p className="text-xs leading-6 text-muted-fg">
            «اجرای الان» فقط پنجره زمانی را دور می‌زند؛ سقف‌ها، فاصله‌ی بین دو پوش، ساعت سکوت و
            «یک‌بار در هر بازه» همچنان رعایت می‌شوند، پس این دکمه پیام تکراری نمی‌فرستد. برای
            اطمینان از متن و مخاطب، از «چند نفر مشمول؟» استفاده کنید — این دکمه هیچ اعلانی نمی‌سازد.
          </p>

          {pauseAsk !== null && (
            <ConfirmDialog
              open
              danger={pauseAsk}
              title={pauseAsk ? 'توقف همه اتوماسیون‌ها؟' : 'ادامه همه اتوماسیون‌ها؟'}
              confirmText={pauseAsk ? 'توقف را روشن کن' : 'ادامه بده'}
              loading={pause.isPending}
              onClose={() => setPauseAsk(null)}
              onConfirm={() => {
                pause.mutate(pauseAsk);
                setPauseAsk(null);
              }}
            >
              {pauseAsk
                ? 'با روشن‌کردن این کلید، از همین لحظه هیچ اتوماسیونی اجرا نمی‌شود (بدون انتظار برای کش یا اجرای بعدی زمان‌بندی). یادآوری‌های مهلت هم متوقف می‌شوند؛ برای همین فقط در زمان خرابی استفاده‌اش کنید.'
                : 'قانون‌هایی که روشن‌اند دوباره در پنجره زمانی خودشان بررسی می‌شوند. ارسال‌های قبلی تکرار نمی‌شوند، چون هر قانون برای هر کاربر در هر بازه یک بار ارسال می‌کند.'}
            </ConfirmDialog>
          )}

          {pendingCritical && (
            <ConfirmDialog
              open
              danger={!pendingCritical.next}
              title={pendingCritical.next ? 'روشن‌کردن این قانون' : 'خاموش‌کردن این قانون'}
              confirmText="تأیید می‌کنم"
              loading={enable.isPending}
              onClose={() => setPendingCritical(null)}
              onConfirm={() => {
                enable.mutate({
                  key: pendingCritical.row.key,
                  enabled: pendingCritical.next,
                  confirmCritical: true,
                });
                setPendingCritical(null);
              }}
            >
              این اتوماسیون بخشی از زنجیره پیگیری مهلت است.{' '}
              {pendingCritical.next
                ? 'با روشن‌کردنش ممکن است یک یادآوری تکراری برای کاربر حذف یا جابه‌جا شود (قانون جایگزین‌شدن).'
                : 'با خاموش‌کردنش کاربرانی که مهلتشان گذشته پیامی دریافت نمی‌کنند و مدیر هم از این طریق باخبر نمی‌شود.'}
            </ConfirmDialog>
          )}

          {estimate && (
            <EstimateDialog
              row={estimate.row}
              dry={estimate.dry}
              onClose={() => setEstimate(null)}
              chip={estimateChip(estimate.dry)}
            />
          )}

          {capsOpen && (
            <CapsDialog
              list={data}
              onClose={() => setCapsOpen(false)}
              onSaved={() => {
                setCapsOpen(false);
                refresh();
              }}
            />
          )}
        </div>
      )}
    </QueryState>
  );
}

function KpiStrip({ data }: { data: AutomationList }) {
  const due = data.rows.filter((r) => r.dueNow).length;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-secondary">
      <span className="inline-flex items-center gap-1 font-bold text-text">
        <Gauge className="size-4" aria-hidden />
        {faNum(data.counts.enabled)} قانون روشن از {faNum(data.counts.total)}
      </span>
      {due > 0 && (
        <span className="inline-flex items-center gap-1">
          <Activity className="size-4" aria-hidden />
          {faNum(due)} تا ۹۰ دقیقه این بعد پنجره زمانی دارند
        </span>
      )}
      <span>
        امروز: {faNum(data.today.sent)} ارسال
        {Object.keys(data.today.skipped).length
          ? ` · ${faNum(Object.values(data.today.skipped).reduce((a, b) => a + b, 0))} رد با دلیل`
          : ''}
      </span>
      <span>{capsSummary(data.settings)}</span>
    </div>
  );
}

function HealthCard({
  health,
  settings,
  loading,
}: {
  health: SystemHealth | undefined;
  settings: AutomationList['settings'];
  loading: boolean;
}) {
  if (loading || !health)
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    );
  const items = healthItems(health, settings);
  return (
    <section aria-label="سلامت اتوماسیون" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((it) => (
        <KpiCard
          key={it.id}
          title={it.label}
          value={it.value}
          subtitle={it.detail}
          icon={it.id === 'scheduler' ? Activity : it.id === 'provider' ? BellOff : Users}
          tone={it.tone === 'danger' ? 'danger' : it.tone === 'success' ? 'primary' : 'info'}
        />
      ))}
    </section>
  );
}

function AutomationTable({
  rows,
  busy,
  estimating,
  onToggle,
  onEstimate,
}: {
  rows: AutomationRow[];
  busy: string | null;
  estimating: string | null;
  onToggle: (row: AutomationRow, next: boolean) => void;
  onEstimate: (row: AutomationRow) => void;
}) {
  const columns: Column<AutomationRow>[] = [
    {
      key: 'name',
      header: 'اتوماسیون',
      cell: (r) => {
        const state = stateOf(r);
        return (
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                to={`/admin/push-campaigns/automations/${r.key}`}
                className="truncate text-sm font-extrabold text-text hover:text-primary hover:underline"
              >
                {r.name}
              </Link>
              <Chip tone={state.tone} hint={state.hint}>
                {state.label}
              </Chip>
              {r.optInOnly && (
                <Chip tone="neutral" hint="فقط برای کاربرانی که در پروفایل فعالش کرده‌اند">
                  با انتخاب کاربر
                </Chip>
              )}
              {r.requiresFeature && (
                <Chip tone="neutral" hint={r.requiresFeature}>
                  <Lock className="size-3" aria-hidden />
                  نسخه ۲
                </Chip>
              )}
            </div>
            <p className="line-clamp-2 text-xs leading-6 text-text-secondary">{r.description}</p>
          </div>
        );
      },
      sortValue: (r) => r.name,
    },
    {
      key: 'when',
      header: 'چه‌زمانی',
      hideOnMobile: true,
      cell: (r) => (
        <div className="flex flex-col gap-1 text-xs text-text-secondary">
          <span className="font-bold text-text">
            {r.timeLabel === 'اتفاق' ? r.triggerLabel : `${r.triggerLabel} · ساعت ${r.timeLabel}`}
          </span>
          <span>{r.audienceLabel}</span>
          <span className="flex flex-wrap items-center gap-1">
            <Chip tone={PRIORITY_META[r.priority]?.tone ?? 'neutral'}>
              اولویت {PRIORITY_META[r.priority]?.label ?? r.priority}
            </Chip>
            {!r.push && <Chip tone="neutral">بدون پوش</Chip>}
            {r.dueNow && <Chip tone="info">الان در پنجره</Chip>}
          </span>
        </div>
      ),
      sortValue: (r) => (r.dueNow ? 0 : 1),
    },
    {
      key: 'stats',
      header: '۷ روز اخیر',
      hideOnMobile: true,
      className: 'w-36',
      cell: (r) => (
        <div className="flex flex-col gap-1 text-xs text-text-secondary">
          <span>
            ارسال: <b className="text-text">{faNum(r.sent7d)}</b> · رد: {faNum(r.skipped7d)}
          </span>
          <span>
            {r.lastRunAt ? `آخرین اجرا: ${faTehranDateTime(r.lastRunAt)}` : 'هنوز اجرا نشده'}
          </span>
          <span className="text-[11px]">نسخه {faNum(r.version)}</span>
        </div>
      ),
      sortValue: (r) => r.sent7d,
    },
    {
      key: 'actions',
      header: 'وضعیت',
      className: 'w-56',
      cell: (r) => (
        <div className="flex flex-wrap items-center gap-2">
          <AutomationSwitch
            row={r}
            disabled={!!r.requiresFeature}
            pending={busy === r.key}
            onChange={(next) => onToggle(r, next)}
          />
          <Button
            variant="ghost"
            loading={estimating === r.key}
            onClick={() => onEstimate(r)}
            data-testid="estimate-btn"
          >
            چند نفر مشمول؟
          </Button>
        </div>
      ),
    },
  ];
  return (
    <DataTable rows={rows} columns={columns} rowKey={(r) => r.key} caption="اتوماسیون‌های اعلان" />
  );
}

export function AutomationSwitch({
  row,
  disabled,
  pending,
  onChange,
}: {
  row: AutomationRow;
  disabled: boolean;
  pending: boolean;
  onChange: (next: boolean) => void;
}) {
  const on = row.enabled;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={`وضعیت «${row.name}»`}
      disabled={disabled}
      onClick={() => onChange(!on)}
      aria-busy={pending}
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-bold transition-colors focus-visible:outline-none',
        on
          ? 'border-success/40 bg-success-light text-success-fg'
          : 'border-border bg-background text-text-secondary',
        disabled ? 'cursor-not-allowed opacity-60' : 'hover:border-primary/40',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'flex size-4 items-center justify-center rounded-full border text-[10px] font-black',
          on ? 'border-success bg-success text-on-primary' : 'border-border bg-surface',
        )}
      >
        {on ? '✓' : ''}
      </span>
      {pending ? 'در حال ذخیره…' : on ? 'روشن' : 'خاموش'}
      {disabled && row.requiresFeature ? <Lock className="size-3" aria-hidden /> : null}
    </button>
  );
}

export function EstimateDialog({
  row,
  dry,
  chip,
  onClose,
}: {
  row: AutomationRow;
  dry: DryRunResult;
  chip: string;
  onClose: () => void;
}) {
  return (
    <Modal open onClose={onClose} title={`برآورد «${row.name}»`} size="lg">
      <div className="flex flex-col gap-3">
        <p className="text-sm leading-7 text-text">{estimateSentence(dry)}</p>
        <p className="text-xs text-muted-fg">
          این برآورد با همان کد اجرا محاسبه شده و هیچ اعلانی نمی‌سازد، هیچ شمارنده‌ای را پر نمی‌کند
          و هیچ درخواستی به سرویس ارسال نمی‌فرستد. بازه: {dry.windowKey}
        </p>
        {dry.note && (
          <Card className="border-warning/30 bg-warning-light">
            <p className="text-xs font-bold text-warning-fg">{dry.note}</p>
          </Card>
        )}
        <p className="inline-flex w-fit items-center gap-1 rounded-full border border-success/30 bg-success-light px-2.5 py-0.5 text-xs font-bold text-success-fg">
          {chip}
        </p>
        {dry.sample.length > 0 && (
          <div className="flex flex-col gap-2">
            <h4 className="text-sm font-extrabold text-text">
              نمونه متن (با داده واقعی همین کاربران)
            </h4>
            <ul className="flex flex-col gap-2">
              {dry.sample.map((s) => (
                <li key={s.userId} className="rounded-card border border-border bg-background p-3">
                  <p className="text-sm font-bold text-text">{s.title}</p>
                  <p className="mt-0.5 text-xs leading-6 text-text-secondary">{s.body}</p>
                  <p className="mt-1 text-[11px] text-muted-fg">
                    {s.name} · {s.reason === 'sent' ? 'مشمول ارسال' : s.reason}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}
        {dry.explain && dry.explain.length > 0 && (
          <div className="flex flex-col gap-1">
            <h4 className="text-sm font-extrabold text-text">
              «چرا»ی خودِ شرط‌ها (همان چیزی که اجرا می‌خواند)
            </h4>
            <ul className="flex flex-col gap-2 text-xs">
              {dry.explain.map((x) => (
                <li key={x.userId} className="rounded-card border border-border bg-background p-2">
                  <p className="font-bold text-text">
                    {x.name} —{' '}
                    {x.ok ? (
                      <span className="text-success-fg">مشمول</span>
                    ) : (
                      <span className="text-danger-fg">{x.why ?? 'رد شد'}</span>
                    )}
                    {x.truncated ? (
                      <span className="text-warning-fg">· ارزیابی کامل نشد (سقف گره)</span>
                    ) : null}
                  </p>
                  {x.lines.length > 0 && (
                    <ul className="mt-1 flex flex-col gap-0.5 text-text-secondary">
                      {x.lines.map((line, i) => (
                        <li key={`${x.userId}:${i}`}>{`· ${line}`}</li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        {dry.skippedLabels.length > 0 && (
          <div className="flex flex-col gap-1">
            <h4 className="text-sm font-extrabold text-text">چرا بقیه نگرفتند؟</h4>
            <ul className="flex flex-col gap-1 text-xs text-text-secondary">
              {dry.skippedLabels.map((s) => (
                <li key={s.reason} className="flex items-center justify-between gap-2">
                  <span>{s.label}</span>
                  <b className="text-text">{faNum(s.count)}</b>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}

function CapsDialog({
  list,
  onClose,
  onSaved,
}: {
  list: AutomationList;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [draft, setDraft] = useState<CapDraft>(() => draftFromSettings(list.settings));
  const [errors, setErrors] = useState<Partial<Record<keyof CapDraft, string>>>({});
  const save = useMutation({
    mutationFn: (next: AutomationList['settings']) =>
      api.put('/admin/push-automations/settings', {
        paused: next.paused,
        maxPerUserPerDay: next.maxPerUserPerDay,
        maxPerUserPerWeek: next.maxPerUserPerWeek,
        minGapMs: next.minGapMs,
        defaultHourTehran: next.defaultHourTehran,
        decisionTtlDays: next.decisionTtlDays,
        failureAlertPct: next.failureAlertPct,
      }),
    onSuccess: () => {
      toast.show({ type: 'success', message: 'سقف‌ها ذخیره شد؛ از اجرای بعدی اعمال می‌شود.' });
      onSaved();
    },
    onError: (e) => toast.show({ type: 'error', message: errMsg(e) }),
  });
  const set = (k: keyof CapDraft) => (e: ChangeEvent<HTMLInputElement>) =>
    setDraft((d) => ({ ...d, [k]: e.target.value }));
  const field = (k: keyof CapDraft, label: string, hint: string) => (
    <Input
      label={label}
      value={draft[k]}
      onChange={set(k)}
      error={errors[k]}
      hint={hint}
      inputMode="numeric"
      ltr
    />
  );

  return (
    <Modal
      open
      onClose={onClose}
      title="سقف‌ها و تنظیمات کلی اتوماسیون"
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            انصراف
          </Button>
          <Button
            loading={save.isPending}
            icon={<Save className="size-4" aria-hidden />}
            onClick={() => {
              const found = validateCaps(draft);
              setErrors(found);
              if (Object.keys(found).length) return;
              save.mutate(settingsFromDraft(draft, list.settings));
            }}
          >
            ذخیره
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-xs leading-6 text-text-secondary">
          این عدد‌ها برای همه قانون‌ها یکجا اعمال می‌شوند و حتی اگر یک اتوماسیون سقف بالاتری بخواهد،
          همین‌ها سقف نهایی‌اند. عدد ۰ یعنی «هیچ پوشی از این راه نرود».
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {field('maxPerUserPerDay', 'حداکثر پوش روزانه هر کاربر', 'پیش‌فرض ۲')}
          {field('maxPerUserPerWeek', 'حداکثر پوش هفتگی هر کاربر', 'پیش‌فرض ۱۰')}
          {field(
            'gapMinutes',
            'حداقل فاصله بین دو پوش (دقیقه)',
            'پیش‌فرض ۲۴۰؛ اولویت فوری معاف است',
          )}
          {field(
            'defaultHourTehran',
            'ساعت پیش‌فرض پنجره (تهران)',
            'برای قانون‌هایی که ساعت را انتخاب نکرده‌اید',
          )}
          {field('decisionTtlDays', 'مدت نگه‌داشتن دلایل رد (روز)', 'پیش‌فرض ۳۰')}
          {field('failureAlertPct', 'آستانه هشدار نرخ شکست (٪)', 'پیش‌فرض ۲۰')}
        </div>
      </div>
    </Modal>
  );
}

function PanelSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-12" />
      <Skeleton className="h-64" />
    </div>
  );
}
