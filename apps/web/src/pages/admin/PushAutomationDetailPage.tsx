import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, FlaskConical, History, Pencil, Save, Trash2, Wand2 } from 'lucide-react';
import { Button, Card, Input, Skeleton, useToast } from '@/components/ui';
import { Select, Tabs, Textarea } from '@/components/common/Field';
import { PageHeader } from '@/components/common/PageHeader';
import { QueryState } from '@/components/common/QueryState';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { PushNotificationPreview } from '@/components/admin/PushNotificationPreview';
import { ApiError, api } from '@/lib/api';
import { errMsg } from '@/lib/errors';
import { cn } from '@/lib/cn';
import {
  AUDIENCE_TYPE_LABELS,
  CONDITION_OPS,
  TRIGGER_FIELDS,
  WIZARD_STEPS,
  allErrors,
  createBody,
  deliverySummary,
  draftFromDetail,
  emptyDraft,
  incompleteSteps,
  patchFromDraft,
  previewOf,
  toFa,
  triggerSentence,
  validateStep,
  varLabel,
  type CatalogMeta,
  type DetailMeta,
  type RunRow,
  type TestSendResult,
  type TextRevision,
  type WizardDraft,
  type WizardErrors,
  type WizardStepId,
} from './automationWizardModel';
import { Chip, EstimateDialog } from './PushAutomationsPanel';
import { RUN_KIND_LABELS, skippedSentence } from './pushAutomationRunModel';
import {
  estimateChip,
  stateOf,
  type AutomationRow,
  type DryRunResult,
} from './pushAutomationModel';
import { useTeams, useUsers } from './adminQueries';

/**
 * One automation, in full: what it does, who it reaches, the exact wording, its runs and its archived
 * texts — plus the four-step wizard that writes it back through `PATCH /admin/push-automations/:key`
 * with `expectedVersion`.
 *
 * Nothing here decides a send. The preview is rendered with the engine's own variable resolution (via
 * `dry-run`), and every field the wizard hides is hidden because the server ignores it for that trigger
 * kind — not because the panel knows better.
 */
export function PushAutomationDetailPage() {
  const { key = '' } = useParams();
  const meta = useQuery({
    queryKey: ['admin', 'push-automations', 'catalog'],
    queryFn: ({ signal }) => api.get<CatalogMeta>('/admin/push-automations/catalog', signal),
    staleTime: 300_000,
  });
  const detail = useQuery({
    queryKey: ['admin', 'push-automations', 'detail', key],
    queryFn: ({ signal }) => api.get<DetailMeta>(`/admin/push-automations/${key}`, signal),
  });

  return (
    <QueryState query={detail} loading={<Skeleton className="h-40" />}>
      {(det) => <Existing key={det.key} det={det} meta={meta.data ?? null} />}
    </QueryState>
  );
}

/** `push-campaigns/automations/new` — the same wizard, no stored rule behind it yet. */
export function PushAutomationNewPage() {
  const meta = useQuery({
    queryKey: ['admin', 'push-automations', 'catalog'],
    queryFn: ({ signal }) => api.get<CatalogMeta>('/admin/push-automations/catalog', signal),
    staleTime: 300_000,
  });
  return <NewAutomationPage meta={meta.data ?? null} loading={meta.isPending} />;
}

function Existing({ det, meta }: { det: DetailMeta; meta: CatalogMeta | null }) {
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<WizardDraft | null>(null);
  const [errors, setErrors] = useState<WizardErrors>({});
  const [step, setStep] = useState<WizardStepId>('what');
  const [dry, setDry] = useState<DryRunResult | null>(null);
  const [askDelete, setAskDelete] = useState(false);
  const [testUserId, setTestUserId] = useState('');
  const users = useUsers();
  const teams = useTeams();

  const runs = useQuery({
    queryKey: ['admin', 'push-automations', 'runs', det.key],
    queryFn: ({ signal }) =>
      api.get<RunRow[]>(
        `/admin/push-automations/runs?key=${encodeURIComponent(det.key)}&limit=12`,
        signal,
      ),
  });
  const revisions = useQuery({
    queryKey: ['admin', 'push-automations', 'revisions', det.key],
    queryFn: ({ signal }) =>
      api.get<TextRevision[]>(`/admin/push-automations/${det.key}/revisions`, signal),
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['admin', 'push-automations'] });
    void qc.invalidateQueries({ queryKey: ['admin', 'system-health'] });
  };
  /** A zod 400 arrives as `{field: Persian message}` — it belongs on the input, not only in a toast. */
  const applyFieldErrors = (e: unknown) => {
    if (e instanceof ApiError && Object.keys(e.fields).length)
      setErrors((x) => ({ ...x, ...e.fields }));
  };

  const save = useMutation({
    mutationFn: (body: ReturnType<typeof patchFromDraft>) =>
      api.patch(`/admin/push-automations/${det.key}`, { ...body, expectedVersion: det.version }),
    onSuccess: () => {
      setEditing(false);
      setDraft(null);
      setErrors({});
      refresh();
      toast.show({
        type: 'success',
        message: 'ذخیره شد؛ از پنجره زمانی بعدی با همین متن اجرا می‌شود.',
      });
    },
    onError: (e) => {
      applyFieldErrors(e);
      toast.show({ type: 'error', message: errMsg(e, 'ذخیره نشد.') });
    },
  });

  const toggle = useMutation({
    mutationFn: (v: { enabled: boolean; confirmCritical?: boolean }) =>
      api.post(`/admin/push-automations/${det.key}/enabled`, {
        enabled: v.enabled,
        ...(v.confirmCritical ? { confirmCritical: true } : {}),
      }),
    onSuccess: (_r, v) => {
      refresh();
      toast.show({
        type: 'success',
        message: v.enabled ? 'روشن شد.' : 'خاموش شد؛ از این پس اعلانی ساخته نمی‌شود.',
      });
    },
    onError: (e) => {
      refresh();
      toast.show({ type: 'error', message: errMsg(e) });
    },
  });

  const dryRun = useMutation({
    mutationFn: () => api.post<DryRunResult>(`/admin/push-automations/${det.key}/dry-run`),
    onSuccess: setDry,
    onError: (e) => toast.show({ type: 'error', message: errMsg(e, 'برآورد انجام نشد.') }),
  });

  const testSend = useMutation({
    mutationFn: (userId: string) =>
      api.post<TestSendResult>(`/admin/push-automations/${det.key}/test-send`, { userId }),
    onSuccess: (r) =>
      toast.show({
        type: r.sent ? 'success' : 'warning',
        message: r.sent
          ? 'اعلان آزمایشی برای همان کاربر ساخته و ارسال شد.'
          : `ارسال نشد: ${r.label ?? r.reason ?? 'دلیل نامعلوم'}`,
        durationMs: 8000,
      }),
    onError: (e) => toast.show({ type: 'error', message: errMsg(e) }),
  });

  const remove = useMutation({
    mutationFn: () => api.del(`/admin/push-automations/${det.key}`),
    onSuccess: () => {
      refresh();
      toast.show({ type: 'success', message: 'اتوماسیون حذف شد.' });
      navigate('/admin/push-campaigns/automations');
    },
    onError: (e) => toast.show({ type: 'error', message: errMsg(e) }),
  });

  const state = stateOf(det as AutomationRow);
  const conflict = save.error instanceof ApiError && save.error.status === 409;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={det.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Chip tone={state.tone} hint={state.hint}>
              {state.label}
            </Chip>
            <span className="text-xs text-text-secondary">
              نسخه {toFa(det.version)} · {det.description}
            </span>
            {det.dueNow && <Chip tone="info">الان در پنجره زمانی</Chip>}
          </span>
        }
        back="/admin/push-campaigns/automations"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              loading={dryRun.isPending}
              icon={<Wand2 className="size-4" aria-hidden />}
              onClick={() => dryRun.mutate()}
            >
              چند نفر مشمول؟
            </Button>
            {!det.isGate &&
              (editing ? (
                <Button variant="ghost" onClick={() => setEditing(false)}>
                  انصراف از ویرایش
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  icon={<Pencil className="size-4" aria-hidden />}
                  onClick={() => {
                    setDraft(draftFromDetail(det));
                    setErrors({});
                    setStep('what');
                    setEditing(true);
                  }}
                >
                  ویرایش با ویزارد
                </Button>
              ))}
          </div>
        }
      />

      {det.requiresFeature && (
        <Card className="border-warning/30 bg-warning-light">
          <p className="text-sm leading-7 text-warning-fg">
            این سناریو به داده‌ای نیاز دارد که هنوز محاسبه نمی‌شود (
            <span className="font-mono text-xs">{det.requiresFeature}</span>)؛ قواعدش قابل ویرایش
            است ولی تا ساخته‌شدن آن داده، روشن نمی‌شود.
          </p>
        </Card>
      )}

      {det.isGate && (
        <Card className="border-info/30 bg-info-light">
          <p className="text-sm leading-7 text-info-fg">
            این ردیف درگاهِ قالب <span className="font-mono text-xs">{det.templateKey}</span> است:
            متن و مقصدش را «قالب‌های اعلان» می‌نویسد و اینجا فقط روشن/خاموش و سقف‌ها دست شماست.
          </p>
        </Card>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-4">
          {editing && draft ? (
            <Wizard
              draft={draft}
              setDraft={(fn) => setDraft((cur) => (cur ? fn(cur) : cur))}
              errors={errors}
              setErrors={setErrors}
              step={step}
              setStep={setStep}
              meta={meta}
              gate={det.isGate}
              busy={save.isPending}
              conflict={conflict}
              onReload={() => {
                refresh();
                setDraft(draftFromDetail(det));
              }}
              onCancel={() => {
                setEditing(false);
                setDraft(null);
                setErrors({});
              }}
              onSubmit={(d) => save.mutate(patchFromDraft(d))}
              teams={teams.data ?? []}
              users={users.data ?? []}
            />
          ) : (
            <Definition det={det} meta={meta} />
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            <RunsCard runs={runs.data} loading={runs.isPending} ruleKey={det.key} />
            <RevisionsCard
              revisions={revisions.data}
              loading={revisions.isPending}
              current={det.message}
            />
          </div>
        </div>

        <aside className="flex flex-col gap-4">
          <Card className="flex flex-col gap-3">
            <h2 className="text-sm font-extrabold text-text">وضعیت اجرا</h2>
            <dl className="flex flex-col gap-1 text-xs text-text-secondary">
              <div className="flex items-center justify-between gap-2">
                <dt>۷ روز اخیر</dt>
                <dd className="font-bold text-text">
                  {toFa(det.sent7d)} ارسال · {toFa(det.skipped7d)} رد
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt>آخرین اجرا</dt>
                <dd className="font-bold text-text">{det.lastRunAt ?? 'هنوز اجرا نشده'}</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt>به‌روزرسانی</dt>
                <dd className="font-bold text-text">{det.updatedAt || '—'}</dd>
              </div>
            </dl>
            <AutomationSwitchButton
              enabled={det.enabled}
              needsConfirm={det.needsCriticalConfirm}
              blocked={!!det.requiresFeature}
              busy={toggle.isPending}
              onToggle={(next, confirm) =>
                toggle.mutate({ enabled: next, ...(confirm ? { confirmCritical: true } : {}) })
              }
            />
            <p className="text-[11px] leading-6 text-muted-fg">
              روشن/خاموش کردن، نوشته‌ها را پاک نمی‌کند: فقط از اجراي بعدی، اعلانی از این قانون ساخته
              نمی‌شود.
            </p>
          </Card>

          <TestSendCard
            users={users.data ?? []}
            value={testUserId}
            onChange={setTestUserId}
            busy={testSend.isPending}
            disabled={det.isGate}
            onSend={() => testSend.mutate(testUserId)}
            result={testSend.data}
          />

          {det.canDelete && (
            <Card className="border-danger/30">
              <p className="text-xs leading-6 text-text-secondary">
                حذف فقط برای اتوماسیون‌های دست‌ساز است؛ سناریوهای کاتالوگ با خاموش‌کردن کنار گذاشته
                می‌شوند تا تاریخچه‌شان نمانَد.
              </p>
              <Button
                variant="danger"
                className="mt-2 w-full"
                icon={<Trash2 className="size-4" aria-hidden />}
                onClick={() => setAskDelete(true)}
              >
                حذف این اتوماسیون
              </Button>
            </Card>
          )}
        </aside>
      </div>

      {askDelete && (
        <ConfirmDialog
          open
          danger
          title="حذف این اتوماسیون؟"
          confirmText="حذف کن"
          loading={remove.isPending}
          onClose={() => setAskDelete(false)}
          onConfirm={() => remove.mutate()}
        >
          سند تعریف حذف می‌شود. اعلان‌ها و پوش‌های فرستاده‌شده پاک نمی‌شوند و دلایل ردِ امروز تا
          پایان بازه‌شان در تاریخچه می‌مانند.
        </ConfirmDialog>
      )}

      {dry && (
        <EstimateDialog
          row={det as AutomationRow}
          dry={dry}
          chip={estimateChip(dry)}
          onClose={() => setDry(null)}
        />
      )}
    </div>
  );
}

// ─── Read-only definition ────────────────────────────────────────────────────

function Definition({ det, meta }: { det: DetailMeta; meta: CatalogMeta | null }) {
  const draft = draftFromDetail(det);
  const fields = TRIGGER_FIELDS[draft.triggerKind] ?? [];
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="flex flex-col gap-2">
        <h2 className="text-sm font-extrabold text-text">۱) چیست</h2>
        <p className="text-sm leading-7 text-text-secondary">{det.description}</p>
        <dl className="grid grid-cols-2 gap-2 text-xs">
          <KV label="کلید" value={det.key} mono />
          <KV label="دسته" value={det.categoryLabel} />
          <KV
            label="نوع"
            value={det.isGate ? 'درگاهِ یک قالب سیستمی' : det.isSystem ? 'کاتالوگ' : 'دست‌ساز'}
          />
          {det.templateKey && <KV label="قالب" value={det.templateKey} mono />}
        </dl>
      </Card>

      <Card className="flex flex-col gap-2">
        <h2 className="text-sm font-extrabold text-text">۲) چه‌زمانی</h2>
        <p className="text-sm leading-7 text-text">{triggerSentence(draft, meta)}</p>
        {fields.includes('time') && (
          <p className="text-xs leading-6 text-muted-fg">
            ساعت پنجره: {draft.time.trim() || 'پیش‌فرض تنظیمات کلی'} — در همان بازه ۹۰ دقیقه‌ایِ
            تهران بررسی می‌شود.
          </p>
        )}
        {draft.ladderGroup.trim() && (
          <p className="text-xs leading-6 text-muted-fg">
            پله‌های یک گروه («{draft.ladderGroup}»): فقط بالاترین پله‌ی تازه فرستاده می‌شود.
          </p>
        )}
        {det.effectiveMessage?.source === 'template' && (
          <p className="rounded-card border border-info/30 bg-info-light p-2 text-xs leading-6 text-info-fg">
            متنی که کاربر می‌بیند از قالب می‌آید، نه از این سند.
          </p>
        )}
      </Card>

      <Card className="flex flex-col gap-2">
        <h2 className="text-sm font-extrabold text-text">۳) برای چه‌کسی</h2>
        <dl className="grid grid-cols-2 gap-2 text-xs">
          <KV label="جمعیت" value={det.audienceLabel} />
          <KV
            label="هدف"
            value={
              draft.audienceType === 'all'
                ? 'بدون محدودیت اضافه'
                : `${AUDIENCE_TYPE_LABELS[draft.audienceType]}: ${
                    draft.audienceType === 'role' ? draft.roleTarget : draft.audienceTargetId
                  }`
            }
          />
          <KV label="کانال" value={draft.channel === 'any' ? 'همه دستگاه‌ها' : draft.channel} />
          {draft.optInOnly && (
            <KV label="با انتخاب کاربر" value="فقط افرادِ روشن‌کرده در پروفایل" />
          )}
        </dl>
        {det.supersedes.length > 0 && (
          <p className="text-xs leading-6 text-muted-fg">
            وقتی این قانون روشن است، پوشِ قالب‌های{' '}
            <span className="font-mono">{det.supersedes.join('، ')}</span> برای همان کاربر رد می‌شود
            (کارت داخل اپ می‌ماند).
          </p>
        )}
      </Card>

      <Card className="flex flex-col gap-2">
        <h2 className="text-sm font-extrabold text-text">۴) متن و ارسال</h2>
        {det.message.title ? (
          <div className="rounded-card border border-border bg-background p-3">
            <p className="text-sm font-bold text-text">{det.message.title}</p>
            <p className="mt-1 text-xs leading-6 text-text-secondary">{det.message.body}</p>
            <p className="mt-2 text-[11px] text-muted-fg">
              مقصد:{' '}
              {meta?.destinations.find((x) => x.value === det.message.actionRef)?.label ??
                det.message.actionRef}
              {det.message.imageUrl ? ' · با تصویر' : ' · بدون تصویر'}
            </p>
          </div>
        ) : (
          <p className="text-xs text-muted-fg">این ردیف متنِ خودش را ندارد؛ قالب آن را می‌نویسد.</p>
        )}
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
          {deliverySummary(draft, meta).map((r) => (
            <KV key={r.label} label={r.label} value={r.value} hint={r.hint} />
          ))}
        </dl>
      </Card>
    </div>
  );
}

function KV({
  label,
  value,
  hint,
  mono,
}: {
  label: string;
  value: string;
  hint?: string;
  mono?: boolean;
}) {
  return (
    <div title={hint} className="flex flex-col gap-0.5">
      <dt className="text-muted-fg">{label}</dt>
      <dd className={cn('font-bold text-text', mono && 'font-mono text-[11px]')}>{value}</dd>
    </div>
  );
}

// ─── The four-step wizard ────────────────────────────────────────────────────

function Wizard({
  draft,
  setDraft,
  errors,
  setErrors,
  step,
  setStep,
  meta,
  gate,
  busy,
  conflict,
  onReload,
  onCancel,
  onSubmit,
  teams,
  users,
  createMode,
}: {
  draft: WizardDraft;
  setDraft: (fn: (d: WizardDraft) => WizardDraft) => void;
  errors: WizardErrors;
  setErrors: (e: WizardErrors) => void;
  step: WizardStepId;
  setStep: (s: WizardStepId) => void;
  meta: CatalogMeta | null;
  gate: boolean;
  busy: boolean;
  conflict?: boolean;
  onReload?: () => void;
  onCancel: () => void;
  onSubmit: (d: WizardDraft) => void;
  teams: Array<{ id: string; name: string }>;
  users: Array<{ id: string; name: string }>;
  createMode?: boolean;
}) {
  const [previewSample, setPreviewSample] = useState<Record<string, string | number> | null>(null);
  const show = (f: string) => (TRIGGER_FIELDS[draft.triggerKind] ?? []).includes(f);
  const err = (k: string) => errors[k];
  const set =
    <K extends keyof WizardDraft>(k: K) =>
    (v: WizardDraft[K]) =>
      setDraft((d) => ({ ...d, [k]: v }));
  const setCond = (i: number, k: 'field' | 'op' | 'value', v: string) =>
    setDraft((d) => ({
      ...d,
      conditions: d.conditions.map((c, j) => (i === j ? { ...c, [k]: v } : c)),
    }));
  const broken = incompleteSteps(draft, meta);
  const preview = previewOf(draft, previewSample);
  const idx = WIZARD_STEPS.findIndex((s) => s.id === step);

  return (
    <Card className="flex flex-col gap-4">
      <Tabs
        label="مراحل ویزارد اتوماسیون"
        value={step}
        onChange={setStep}
        items={WIZARD_STEPS.map((s) => ({
          value: s.id,
          label: broken.includes(s.id) ? `${s.label} — ناقص` : s.label,
        }))}
      />

      {step === 'what' && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="کلید (لاتین، یکتا)"
            value={draft.key}
            onChange={(e) => set('key')(e.target.value)}
            error={err('key')}
            hint="بعد از ساخت عوض نمی‌شود؛ مثل inactive_1d"
            disabled={!createMode}
            ltr
          />
          <Select
            label="دسته"
            value={draft.category}
            onChange={(e) => set('category')(e.target.value)}
            error={err('category')}
            hint="دسته‌های «مهلت» و «سلامت» را کاربر نمی‌تواند خاموش کند"
          >
            {(meta?.categories ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </Select>
          <Input
            label="نام (فقط برای پنل)"
            value={draft.name}
            onChange={(e) => set('name')(e.target.value)}
            error={err('name')}
          />
          <Textarea
            label="توضیح: این قانون چه کاری می‌کند"
            rows={3}
            value={draft.description}
            onChange={(e) => set('description')(e.target.value)}
            error={err('description')}
            hint="این متن را مدیر دیگری می‌خواند، نه کاربر"
          />
        </div>
      )}

      {step === 'when' && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Select
            label="نوع تریگر"
            value={draft.triggerKind}
            onChange={(e) => set('triggerKind')(e.target.value as WizardDraft['triggerKind'])}
            hint="«اتفاق» با hookهای سامانه فعال می‌شود؛ بقیه در اجرای زمان‌بندی‌شده بررسی می‌شوند"
          >
            {Object.entries(meta?.triggerKinds ?? {}).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </Select>
          {show('time') && (
            <Input
              label="ساعت پنجره (تهران)"
              value={draft.time}
              onChange={(e) => set('time')(e.target.value)}
              error={err('time')}
              hint="خالی = ساعت پیش‌فرضِ تنظیمات کلی"
              placeholder="10:00"
              ltr
            />
          )}
          {show('event') && (
            <Select
              label="اتفاق"
              value={draft.event}
              onChange={(e) => set('event')(e.target.value)}
              error={err('event')}
              hint="فقط اتفاق‌هایی که سامانه واقعاً منتشر می‌کند"
            >
              <option value="">— انتخاب کنید —</option>
              {Object.entries(meta?.events ?? {}).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </Select>
          )}
          {show('delayMinutes') && (
            <Input
              label="چند دقیقه بعد؟"
              value={draft.delayMinutes}
              onChange={(e) => set('delayMinutes')(e.target.value)}
              error={err('delayMinutes')}
              hint="۱ تا ۱۰۰۸۰ دقیقه؛ در صف می‌ماند و پیش از ارسال دوباره بررسی می‌شود"
              inputMode="numeric"
            />
          )}
          {show('inactivityDays') && (
            <Input
              label="چند روز بی‌فعالیتی؟"
              value={draft.inactivityDays}
              onChange={(e) => set('inactivityDays')(e.target.value)}
              error={err('inactivityDays')}
              hint="۱ تا ۶۰ روز"
              inputMode="numeric"
            />
          )}
          {show('weekday') && (
            <Select
              label="روز هفته"
              value={draft.weekday}
              onChange={(e) => set('weekday')(e.target.value)}
              error={err('weekday')}
            >
              <option value="">— انتخاب کنید —</option>
              {(meta?.weekdays ?? []).map((w, i) => (
                <option key={w} value={String(i)}>
                  {w}
                </option>
              ))}
            </Select>
          )}
          {show('conditions') && (
            <div className="flex flex-col gap-2 sm:col-span-2">
              <p className="text-sm font-semibold text-text">شرط‌ها (همه باید برقرار باشند)</p>
              {draft.conditions.map((c, i) => (
                <div key={i} className="grid items-end gap-2 sm:grid-cols-[1fr_10rem_1fr_auto]">
                  <Select
                    label={`داده ${toFa(i + 1)}`}
                    value={c.field}
                    onChange={(e) => setCond(i, 'field', e.target.value)}
                    error={err(`conditions.${i}.field`)}
                  >
                    {(meta?.facts ?? []).map((f) => (
                      <option key={f.field} value={f.field}>
                        {f.label}
                      </option>
                    ))}
                  </Select>
                  <Select
                    label="رابطه"
                    value={c.op}
                    onChange={(e) => setCond(i, 'op', e.target.value)}
                  >
                    {CONDITION_OPS.map((o) => (
                      <option key={o.op} value={o.op}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                  <ConditionValue
                    meta={meta}
                    field={c.field}
                    value={c.value}
                    error={err(`conditions.${i}.value`)}
                    onChange={(v) => setCond(i, 'value', v)}
                  />
                  <Button
                    variant="ghost"
                    onClick={() =>
                      setDraft((d) => ({
                        ...d,
                        conditions: d.conditions.filter((_, j) => j !== i),
                      }))
                    }
                  >
                    حذف
                  </Button>
                </div>
              ))}
              {!!errors.conditions && (
                <p className="text-xs font-medium text-danger-fg">{errors.conditions}</p>
              )}
              <Button
                variant="secondary"
                onClick={() =>
                  setDraft((d) => ({
                    ...d,
                    conditions: [...d.conditions, { field: 'progress', op: 'gte', value: '50' }],
                  }))
                }
              >
                + یک شرط دیگر
              </Button>
            </div>
          )}
        </div>
      )}

      {step === 'who' && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Select
            label="مخاطب"
            value={draft.audienceType}
            onChange={(e) => set('audienceType')(e.target.value as WizardDraft['audienceType'])}
          >
            {Object.entries(AUDIENCE_TYPE_LABELS).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </Select>
          {draft.audienceType === 'all' && (
            <Select
              label="نقش‌هایی که موتور بررسی می‌کند"
              value={draft.audienceRole}
              onChange={(e) => set('audienceRole')(e.target.value as WizardDraft['audienceRole'])}
              hint="کاربران غیرفعال هیچ‌وقت بررسی نمی‌شوند"
            >
              <option value="all">همه نقش‌ها</option>
              <option value="marketer">بازاریاب‌ها</option>
              <option value="manager">مدیران</option>
              <option value="admin">ادمین‌ها</option>
            </Select>
          )}
          {draft.audienceType === 'role' && (
            <Select
              label="کدام نقش"
              value={draft.roleTarget}
              onChange={(e) => set('roleTarget')(e.target.value as WizardDraft['roleTarget'])}
            >
              <option value="marketer">بازاریاب‌ها</option>
              <option value="manager">مدیران</option>
              <option value="admin">ادمین‌ها</option>
            </Select>
          )}
          {draft.audienceType === 'team' && (
            <Select
              label="تیم"
              value={draft.audienceTargetId}
              onChange={(e) => set('audienceTargetId')(e.target.value)}
              error={err('audienceTargetId')}
            >
              <option value="">— انتخاب کنید —</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          )}
          {draft.audienceType === 'user' && (
            <Select
              label="کاربر"
              value={draft.audienceTargetId}
              onChange={(e) => set('audienceTargetId')(e.target.value)}
              error={err('audienceTargetId')}
            >
              <option value="">— انتخاب کنید —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          )}
          <Select
            label="کانال دستگاه"
            value={draft.channel}
            onChange={(e) => set('channel')(e.target.value as WizardDraft['channel'])}
          >
            <option value="any">همه دستگاه‌ها</option>
            <option value="web">فقط وب</option>
            <option value="android">فقط اندروید</option>
          </Select>
          <label className="flex min-h-12 items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              className="size-5 accent-primary"
              checked={draft.optInOnly}
              onChange={(e) => set('optInOnly')(e.target.checked)}
            />
            فقط برای کاربرانی که این را در «تنظیمات اعلان» پروفایلشان روشن کرده‌اند
          </label>
        </div>
      )}

      {step === 'wording' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-3">
            <Textarea
              label="عنوان اعلان"
              rows={2}
              value={draft.title}
              onChange={(e) => set('title')(e.target.value)}
              error={err('title')}
              disabled={gate}
              hint={
                gate
                  ? 'متن این ردیف را ویرایشگر قالب می‌نویسد'
                  : `حداکثر ${toFa(meta?.limits.titleMax ?? 80)} نویسه`
              }
            />
            <Textarea
              label="متن اعلان"
              rows={4}
              value={draft.body}
              onChange={(e) => set('body')(e.target.value)}
              error={err('body')}
              disabled={gate}
              hint={gate ? undefined : `حداکثر ${toFa(meta?.limits.bodyMax ?? 300)} نویسه`}
            />
            {!!errors.variables && (
              <p className="text-xs font-medium text-danger-fg">{errors.variables}</p>
            )}
            <div className="flex flex-wrap gap-1.5">
              {(meta?.variables ?? []).map((v) => (
                <button
                  key={v.token}
                  type="button"
                  title={`${v.label} — با داده همان کاربر پر می‌شود`}
                  disabled={gate}
                  onClick={() =>
                    setDraft((d) =>
                      d.title.length + v.token.length <= (meta?.limits.titleMax ?? 80)
                        ? { ...d, title: d.title + v.token }
                        : { ...d, body: d.body + v.token },
                    )
                  }
                  className="rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-bold text-text-secondary hover:border-primary/40 hover:text-primary disabled:opacity-40"
                >
                  {v.token}
                </button>
              ))}
            </div>
            <Select
              label="مقصد (فقط مسیرهای داخلی مجاز)"
              value={draft.actionRef}
              onChange={(e) => set('actionRef')(e.target.value)}
              error={err('actionRef')}
              disabled={gate}
              hint="مسیر دلخواه نمی‌توانید بنویسید؛ همین فهرست را سرور می‌پذیرد"
            >
              {destinationOptions(meta, draft.actionRef).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
            <Input
              label="تصویر (اختیاری، فقط HTTPS عمومی)"
              value={draft.imageUrl}
              onChange={(e) => set('imageUrl')(e.target.value)}
              error={err('imageUrl')}
              disabled={gate}
              ltr
            />
          </div>

          <div className="flex min-w-0 flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Select
                label="اولویت"
                value={draft.priority}
                onChange={(e) => set('priority')(e.target.value as WizardDraft['priority'])}
                hint="فقط «فوری» از ساعت سکوت رد می‌شود"
              >
                <option value="urgent">فوری</option>
                <option value="high">بالا</option>
                <option value="normal">عادی</option>
                <option value="low">پایین</option>
              </Select>
              <Input
                label="سردکردن هر کاربر (ساعت)"
                value={draft.cooldownHours}
                onChange={(e) => set('cooldownHours')(e.target.value)}
                error={err('cooldownHours')}
                hint="خالی = بدون سقف مخصوص این قانون"
                inputMode="numeric"
              />
              <Input
                label="سقف روزانه همین قانون"
                value={draft.maxPerUserPerDay}
                onChange={(e) => set('maxPerUserPerDay')(e.target.value)}
                error={err('maxPerUserPerDay')}
                hint="خالی = سقف سراسریِ تنظیمات کلی"
                inputMode="numeric"
              />
              <Input
                label="قالب‌هایی که این قانون جایگزینشان می‌شود"
                value={draft.supersedes}
                onChange={(e) => set('supersedes')(e.target.value)}
                hint="با ویرگول؛ مثلاً reminder،deadline_warning"
                ltr
              />
            </div>
            <div className="grid gap-1 sm:grid-cols-2">
              <Bool label="پوش ارسال شود" checked={draft.push} onChange={set('push')} />
              <Bool
                label="کارت داخل اپ ساخته شود"
                checked={draft.inApp}
                onChange={set('inApp')}
                hint="اگر پوش هم خاموش باشد، هیچ اعلانی نمی‌ماند"
              />
              <Bool
                label="ساعت سکوت رعایت شود"
                checked={draft.respectQuietHours}
                onChange={set('respectQuietHours')}
                hint="خاموش‌کردنش فقط با اولویت «فوری» مجاز است؛ موتور برای بقیه ارسال را به آخر ساعت سکوت موکول می‌کند"
              />
              <Bool
                label="یک‌بار در هر بازه (روز/هفته)"
                checked={draft.sendOnce}
                onChange={set('sendOnce')}
              />
              <Bool
                label="جمع‌بندی برای مدیر"
                checked={draft.aggregateForManager}
                onChange={set('aggregateForManager')}
                hint="پیام کاربر + یک کارت برای مدیر، به‌جای پیام‌های جدا"
              />
            </div>
            <div className="flex flex-col gap-2 rounded-card border border-border bg-background p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold text-text-secondary">پیش‌نمایش</p>
                <Button
                  variant="ghost"
                  onClick={() =>
                    setPreviewSample((s) =>
                      s ? null : { name: 'سارا', title: 'آموزش کرم', section: 'مرحله ۴' },
                    )
                  }
                >
                  {previewSample ? 'حذف داده نمونه' : 'با داده نمونه'}
                </Button>
              </div>
              <PushNotificationPreview
                title={preview.title}
                body={preview.body}
                imageUrl={draft.imageUrl}
                actionRef={draft.actionRef}
              />
              {preview.missing.length > 0 && (
                <p className="text-xs leading-6 text-warning-fg">
                  این متغیرها پر نمی‌شوند:{' '}
                  {preview.missing.map((v) => varLabel(meta, v)).join('، ')} — موتور در این حالت
                  ارسال نمی‌کند.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {conflict && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-warning/30 bg-warning-light p-3">
          <p className="text-xs font-bold text-warning-fg">
            این اتوماسیون هم‌زمان عوض شده است؛ ذخیره دوباره، ویرایش نفر دوم را از بین می‌برد.
          </p>
          <Button variant="secondary" onClick={() => onReload?.()}>
            بازخوانی نسخه ذخیره‌شده
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <p className="text-xs text-muted-fg">{WIZARD_STEPS[idx]?.hint}</p>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={onCancel}>
            انصراف
          </Button>
          {idx > 0 && (
            <Button
              variant="secondary"
              onClick={() => setStep(WIZARD_STEPS[Math.max(0, idx - 1)]?.id ?? 'what')}
            >
              قبلی
            </Button>
          )}
          {step !== 'wording' ? (
            <Button
              onClick={() => {
                const found = validateStep(step, draft, meta);
                // merge, so an older server field error stays visible while the admin fixes this step
                setErrors({ ...errors, ...found });
                if (Object.keys(found).length) return;
                setStep(WIZARD_STEPS[Math.min(WIZARD_STEPS.length - 1, idx + 1)]?.id ?? 'wording');
              }}
            >
              ادامه
            </Button>
          ) : (
            <Button
              loading={busy}
              icon={<Save className="size-4" aria-hidden />}
              onClick={() => {
                const found = allErrors(draft, meta);
                setErrors(found);
                if (Object.keys(found).length) {
                  const first = WIZARD_STEPS.find((s) => broken.includes(s.id));
                  if (first) setStep(first.id);
                  return;
                }
                onSubmit(draft);
              }}
            >
              {createMode ? 'ساخت اتوماسیون (خاموش)' : 'ذخیره تغییرات'}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

function ConditionValue({
  meta,
  field,
  value,
  error,
  onChange,
}: {
  meta: CatalogMeta | null;
  field: string;
  value: string;
  error?: string;
  onChange: (v: string) => void;
}) {
  const kind = meta?.facts.find((f) => f.field === field)?.kind;
  if (kind === 'boolean')
    return (
      <Select label="مقدار" value={value} onChange={(e) => onChange(e.target.value)} error={error}>
        <option value="true">بله</option>
        <option value="false">خیر</option>
      </Select>
    );
  return (
    <Input
      label="مقدار"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      error={error}
      inputMode={kind === 'number' ? 'numeric' : 'text'}
    />
  );
}

function Bool({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
}) {
  return (
    <label className="flex min-h-11 items-start gap-2 text-sm" title={hint}>
      <input
        type="checkbox"
        className="mt-1 size-5 accent-primary"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="leading-6">
        {label}
        {!!hint && <span className="block text-[11px] text-muted-fg">{hint}</span>}
      </span>
    </label>
  );
}

function destinationOptions(meta: CatalogMeta | null, current: string) {
  const list = meta?.destinations ?? [];
  return list.some((x) => x.value === current) || !current
    ? list
    : [{ value: current, label: `${current} (خارج از فهرست پیشنهادی)` }, ...list];
}

/** The panel's switch, in its confirm-on-critical-keys form, for the detail page's sidebar. */
function AutomationSwitchButton({
  enabled,
  needsConfirm,
  blocked,
  busy,
  onToggle,
}: {
  enabled: boolean;
  needsConfirm: boolean;
  blocked: boolean;
  busy: boolean;
  onToggle: (next: boolean, confirm: boolean) => void;
}) {
  const [ask, setAsk] = useState(false);
  return (
    <>
      <Button
        variant={enabled ? 'danger' : 'primary'}
        block
        loading={busy}
        disabled={blocked}
        onClick={() => (needsConfirm ? setAsk(true) : onToggle(!enabled, false))}
      >
        {blocked
          ? 'قابل روشن‌کردن نیست (نیازمند داده)'
          : enabled
            ? 'خاموش‌کردن این اتوماسیون'
            : 'روشن‌کردن این اتوماسیون'}
      </Button>
      {ask && (
        <ConfirmDialog
          open
          danger={enabled}
          title={enabled ? 'خاموش‌کردن این اتوماسیون' : 'روشن‌کردن این اتوماسیون'}
          confirmText="تأیید می‌کنم"
          loading={busy}
          onClose={() => setAsk(false)}
          onConfirm={() => {
            onToggle(!enabled, true);
            setAsk(false);
          }}
        >
          این اتوماسیون بخشی از زنجیره پیگیری مهلت است.{' '}
          {enabled
            ? 'با خاموش‌کردنش کاربرانی که مهلتشان گذشته پیامی دریافت نمی‌کنند و مدیر هم از این طریق باخبر نمی‌شود.'
            : 'با روشن‌کردنش ممکن است یادآوری تکراری برای کاربر حذف یا جابه‌جا شود (قانون جایگزین‌شدن).'}
        </ConfirmDialog>
      )}
    </>
  );
}

// ─── Create ──────────────────────────────────────────────────────────────────

function NewAutomationPage({ meta, loading }: { meta: CatalogMeta | null; loading: boolean }) {
  const toast = useToast();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<WizardDraft>(() => emptyDraft(meta));
  const [errors, setErrors] = useState<WizardErrors>({});
  const [step, setStep] = useState<WizardStepId>('what');
  const create = useMutation({
    mutationFn: (body: ReturnType<typeof createBody>) => api.post('/admin/push-automations', body),
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: ['admin', 'push-automations'] });
      toast.show({
        type: 'success',
        message: 'اتوماسیون ساخته شد و خاموش ماند؛ با سوییچِ لیست روشنش کنید.',
      });
      navigate(`/admin/push-campaigns/automations/${(data as { key?: string }).key ?? ''}`);
    },
    onError: (e) => {
      if (e instanceof ApiError && Object.keys(e.fields).length)
        setErrors((x) => ({ ...x, ...e.fields }));
      toast.show({ type: 'error', message: errMsg(e, 'ساخته نشد.') });
    },
  });
  if (loading) return <Skeleton className="h-64" />;
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="اتوماسیون دست‌ساز"
        subtitle="اگر سناریویی در کاتالوگ نیست، همین‌جا ساخته می‌شود — و خاموش می‌ماند"
        back="/admin/push-campaigns/automations"
      />
      <Wizard
        draft={draft}
        setDraft={setDraft}
        errors={errors}
        setErrors={setErrors}
        step={step}
        setStep={setStep}
        meta={meta}
        gate={false}
        busy={create.isPending}
        onCancel={() => navigate('/admin/push-campaigns/automations')}
        onSubmit={(d) => create.mutate(createBody(d))}
        teams={[]}
        users={[]}
        createMode
      />
      <p className="text-xs leading-6 text-muted-fg">
        ساخته‌شدن یعنی «می‌تواند اجرا شود»، نه «اجرا می‌شود»: هیچ اتوماسیون تازه‌ای روشن فعال
        نمی‌شود و تا وقتی سوییچ را روشن نکنید، هیچ کاربری پیامی نمی‌گیرد.
      </p>
    </div>
  );
}

// ─── History, revisions, test send ───────────────────────────────────────────

function RunsCard({
  runs,
  loading,
  ruleKey,
}: {
  runs: RunRow[] | undefined;
  loading: boolean;
  ruleKey: string;
}) {
  return (
    <Card className="flex flex-col gap-2">
      <h2 className="flex items-center gap-2 text-sm font-extrabold text-text">
        <Activity className="size-4" aria-hidden />
        اجراهای این قانون
        <Link
          to={`/admin/push-campaigns/automations/runs?key=${encodeURIComponent(ruleKey)}`}
          className="ms-auto text-[11px] font-bold text-primary hover:underline"
        >
          تاریخچه کامل
        </Link>
      </h2>
      {loading && <Skeleton className="h-24" />}
      {!loading && !runs?.length && (
        <p className="text-xs leading-6 text-muted-fg">
          هنوز اجرایی ثبت نشده. هر اجرا در پنجره زمانی خودش (یا با «اجرای الان») یک سطر تاریخچه
          می‌سازد.
        </p>
      )}
      {!!runs?.length && (
        <ul className="flex flex-col gap-2">
          {runs.map((r) => (
            <li key={r.id} className="rounded-card border border-border bg-background p-2 text-xs">
              <p className="font-bold text-text">
                {RUN_KIND_LABELS[r.kind] ?? r.kind} · {toFa(r.sent)} ارسال از {toFa(r.evaluated)}{' '}
                کاربر
              </p>
              <p className="mt-0.5 text-muted-fg">
                بازه {r.windowKey} ·{' '}
                {r.error
                  ? r.error
                  : r.skippedLabels?.length
                    ? skippedSentence(r)
                    : `رد: ${toFa(Object.values(r.skipped).reduce((a, b) => a + b, 0))}`}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function RevisionsCard({
  revisions,
  loading,
  current,
}: {
  revisions: TextRevision[] | undefined;
  loading: boolean;
  current: DetailMeta['message'];
}) {
  const [open, setOpen] = useState(false);
  return (
    <Card className="flex flex-col gap-2">
      <h2 className="flex items-center justify-between gap-2 text-sm font-extrabold text-text">
        <span className="flex items-center gap-2">
          <History className="size-4" aria-hidden />
          نسخه‌های متن
        </span>
        {!!revisions?.length && (
          <Button variant="ghost" onClick={() => setOpen((v) => !v)}>
            {open ? 'بستن' : `نمایش ${toFa(revisions.length)}`}
          </Button>
        )}
      </h2>
      {loading && <Skeleton className="h-16" />}
      {!loading && !revisions?.length && (
        <p className="text-xs leading-6 text-muted-fg">
          هنوز متن این اتوماسیون ویرایش نشده است. هر ویرایش، متنی که جایش می‌آید را نگه می‌دارد.
        </p>
      )}
      {!loading && open && (
        <ul className="flex flex-col gap-2">
          <li className="rounded-card border border-primary/30 bg-soft-brand p-2 text-xs">
            <p className="font-bold text-text">نسخه فعلی</p>
            <p className="mt-0.5 text-text-secondary">{current.title}</p>
            <p className="text-[11px] leading-6 text-muted-fg">{current.body}</p>
          </li>
          {revisions?.map((r) => (
            <li
              key={r.version}
              className="rounded-card border border-border bg-background p-2 text-xs"
            >
              <p className="font-bold text-text">
                نسخه {toFa(r.version)} · {r.note}
              </p>
              <p className="mt-0.5 text-text-secondary">{r.message.title}</p>
              <p className="text-[11px] leading-6 text-muted-fg">{r.message.body}</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function TestSendCard({
  users,
  value,
  onChange,
  busy,
  disabled,
  onSend,
  result,
}: {
  users: Array<{ id: string; name: string; role: string }>;
  value: string;
  onChange: (v: string) => void;
  busy: boolean;
  disabled: boolean;
  onSend: () => void;
  result: TestSendResult | undefined;
}) {
  return (
    <Card className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 text-sm font-extrabold text-text">
        <FlaskConical className="size-4" aria-hidden />
        ارسال آزمایشی
      </h2>
      <p className="text-xs leading-6 text-text-secondary">
        با داده واقعی همان کاربر رندر می‌شود و خارج از سقف‌ها و «یک‌بار در هر بازه» است — ولی ساعت
        سکوت و دستگاه معتبر همچنان بررسی می‌شوند. در تاریخچه «دستی» ثبت می‌شود و آمار را عوض
        نمی‌کند.
      </p>
      <Select
        label="کاربر"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        hint={disabled ? 'درگاه‌های قالب پیامِ خودش را ندارند' : `${toFa(users.length)} کاربر`}
      >
        <option value="">— انتخاب کنید —</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name} · {u.role}
          </option>
        ))}
      </Select>
      <Button variant="secondary" loading={busy} disabled={!value || disabled} onClick={onSend}>
        ارسال آزمایشی
      </Button>
      {result && (
        <p
          className={cn(
            'rounded-card border p-2 text-xs',
            result.sent
              ? 'border-success/30 bg-success-light text-success-fg'
              : 'border-warning/30 bg-warning-light text-warning-fg',
          )}
        >
          <b className="font-bold">{result.sent ? 'ارسال شد' : 'ارسال نشد'}</b>
          {result.sent ? '' : `: ${result.label ?? result.reason ?? 'دلیل نامعلوم'}`}
          <span className="mt-1 block leading-6">
            {result.preview.title} — {result.preview.body}
          </span>
        </p>
      )}
    </Card>
  );
}
