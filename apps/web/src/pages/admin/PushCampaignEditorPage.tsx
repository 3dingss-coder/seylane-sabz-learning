import { userOptionLabel } from '@/lib/digits';
import { useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Archive, CalendarClock, Save, Send, XCircle } from 'lucide-react';
import { Button, Card, Input, Skeleton, useToast } from '@/components/ui';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { PushNotificationPreview } from '@/components/admin/PushNotificationPreview';
import { JalaliDateField } from '@/components/common/JalaliDateField';
import { Select, Textarea } from '@/components/common/Field';
import { PageHeader } from '@/components/common/PageHeader';
import { QueryState } from '@/components/common/QueryState';
import { ApiError, api } from '@/lib/api';
import { errMsg } from '@/lib/errors';
import { faNumber } from '@/lib/format';
import { useTeams, useUsers } from './adminQueries';
import { CampaignStatusBadge } from './PushCampaignsPage';
import {
  AUDIENCE_TYPE_LABEL,
  CHANNEL_LABEL,
  DESTINATIONS,
  EMPTY_FORM,
  faTehranDateTime,
  formFromCampaign,
  isEditable,
  payloadFromForm,
  validateForm,
  type AudiencePreview,
  type CampaignDetail,
  type CampaignForm,
  type PushCampaign,
} from './pushCampaignModel';

const ROLE_OPTIONS = ['marketer', 'manager', 'admin', 'superadmin'] as const;
const ROLE_NAME: Record<string, string> = {
  marketer: 'بازاریاب',
  manager: 'مدیر تیم',
  admin: 'ادمین',
  superadmin: 'سوپرادمین',
};

const qk = (id: string | undefined) => ['admin', 'push-campaign', id ?? 'new'] as const;

export function PushCampaignEditorPage() {
  const { id } = useParams();
  const isNew = !id;
  const detail = useQuery({
    queryKey: qk(id),
    queryFn: ({ signal }) => api.get<CampaignDetail>(`/admin/push-campaigns/${id}`, signal),
    enabled: !isNew,
  });

  return (
    <div className="flex flex-col gap-4">
      {isNew ? (
        <PageHeader title="کمپین جدید اعلان" back="/admin/push-campaigns" />
      ) : (
        <QueryState query={detail} loading={<Skeleton className="h-24" />} empty={null}>
          {(d) => (
            <PageHeader
              title={d.campaign.name}
              back="/admin/push-campaigns"
              subtitle={<CampaignStatusBadge status={d.campaign.status} />}
            />
          )}
        </QueryState>
      )}
      {isNew ? (
        <Editor key="new" campaign={null} />
      ) : (
        <QueryState query={detail} loading={<Skeleton className="h-96" />}>
          {(d) =>
            isEditable(d.campaign.status) ? (
              <Editor key={`${d.campaign.id}-${d.campaign.version}`} campaign={d.campaign} />
            ) : (
              <ReadOnlyResults detail={d} />
            )
          }
        </QueryState>
      )}
    </div>
  );
}

function Editor({ campaign }: { campaign: PushCampaign | null }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const teams = useTeams();
  const users = useUsers();
  const [form, setForm] = useState<CampaignForm>(() =>
    campaign ? formFromCampaign(campaign) : EMPTY_FORM,
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [version, setVersion] = useState<number | null>(campaign?.version ?? null);
  const [savedId, setSavedId] = useState<string | null>(campaign?.id ?? null);
  const [sendOpen, setSendOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  // One key per send attempt: a network retry reuses it, so the server never starts two sends.
  const sendKeyRef = useRef<string | null>(null);

  const set =
    <K extends keyof CampaignForm>(k: K) =>
    (v: CampaignForm[K]) => {
      setForm((f) => ({ ...f, [k]: v }));
      setErrors((e) => {
        if (!e[k as string]) return e;
        const { [k as string]: _gone, ...rest } = e;
        void _gone;
        return rest;
      });
    };

  const invalidate = (detailId: string) => {
    void qc.invalidateQueries({ queryKey: ['admin', 'push-campaigns'] });
    void qc.invalidateQueries({ queryKey: qk(detailId) });
  };

  /** Creates or updates the draft/scheduled campaign. `schedule` = use the date/time in the form. */
  const save = async (schedule: boolean): Promise<CampaignDetail> => {
    const body = payloadFromForm(form, schedule);
    const r = savedId
      ? await api.patch<CampaignDetail>(`/admin/push-campaigns/${savedId}`, {
          ...body,
          version,
        })
      : await api.post<CampaignDetail>('/admin/push-campaigns', body);
    setSavedId(r.campaign.id);
    setVersion(r.campaign.version);
    invalidate(r.campaign.id);
    return r;
  };

  const apply = (e: unknown) => {
    if (e instanceof ApiError && Object.keys(e.fields).length) setErrors(e.fields);
  };

  const draft = useMutation({
    mutationFn: () => save(false),
    onSuccess: (r) => {
      toast.show({
        type: 'success',
        message: 'پیش‌نویس ذخیره شد. هنوز هیچ اعلانی ارسال نشده است.',
      });
      if (!campaign) navigate(`/admin/push-campaigns/${r.campaign.id}`, { replace: true });
    },
    onError: (e) => {
      apply(e);
      toast.show({ type: 'error', message: errMsg(e) });
    },
  });

  const scheduleMut = useMutation({
    mutationFn: () => save(true),
    onSuccess: (r) => {
      setScheduleOpen(false);
      toast.show({
        type: 'success',
        message: `کمپین برای ${faTehranDateTime(r.campaign.scheduledAt)} زمان‌بندی شد.`,
      });
      navigate(`/admin/push-campaigns/${r.campaign.id}`, { replace: true });
    },
    onError: (e) => {
      setScheduleOpen(false);
      apply(e);
      toast.show({ type: 'error', message: errMsg(e) });
    },
  });

  const sendMut = useMutation({
    mutationFn: async () => {
      if (!sendKeyRef.current) sendKeyRef.current = crypto.randomUUID();
      const saved = await save(false);
      return api.post<CampaignDetail>(
        `/admin/push-campaigns/${saved.campaign.id}/send`,
        {},
        { 'Idempotency-Key': sendKeyRef.current },
      );
    },
    onSuccess: (r) => {
      sendKeyRef.current = null;
      setSendOpen(false);
      const s = r.campaign.summary;
      const message =
        r.campaign.status === 'sending' || r.campaign.status === 'queued'
          ? 'ارسال شروع شد. بخشی از مخاطبان در نوبت‌های بعدی ارسال می‌شود؛ وضعیت را در تاریخچه دنبال کنید.'
          : `نتیجه: ${faNumber(s.accepted)} درخواست پذیرفته شد، ${faNumber(s.failed)} ناموفق.`;
      toast.show({ type: r.campaign.status === 'failed' ? 'error' : 'success', message });
      navigate(`/admin/push-campaigns/${r.campaign.id}`, { replace: true });
    },
    onError: (e) => {
      // Keep the key so a retry is safe; close the dialog so the error is readable.
      setSendOpen(false);
      apply(e);
      toast.show({ type: 'error', message: errMsg(e, 'ارسال انجام نشد. دوباره تلاش کنید.') });
    },
  });

  const cancelMut = useMutation({
    mutationFn: () => api.post<CampaignDetail>(`/admin/push-campaigns/${savedId}/cancel`, {}),
    onSuccess: (r) => {
      setCancelOpen(false);
      invalidate(r.campaign.id);
      toast.show({ type: 'success', message: 'زمان‌بندی لغو شد؛ این کمپین اجرا نخواهد شد.' });
      navigate(`/admin/push-campaigns/${r.campaign.id}`, { replace: true });
    },
    onError: (e) => {
      setCancelOpen(false);
      toast.show({ type: 'error', message: errMsg(e) });
    },
  });

  const archiveMut = useMutation({
    mutationFn: () => api.del(`/admin/push-campaigns/${savedId}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'push-campaigns'] });
      toast.show({ type: 'success', message: 'کمپین آرشیو شد.' });
      navigate('/admin/push-campaigns', { replace: true });
    },
    onError: (e) => {
      setArchiveOpen(false);
      toast.show({ type: 'error', message: errMsg(e) });
    },
  });

  const busy = draft.isPending || scheduleMut.isPending || sendMut.isPending;
  const targetOptions = useMemo(() => {
    if (form.audienceType === 'team')
      return (teams.data ?? []).map((t) => ({ value: t.id, label: t.name }));
    if (form.audienceType === 'role')
      return ROLE_OPTIONS.map((r) => ({ value: r, label: ROLE_NAME[r] ?? r }));
    if (form.audienceType === 'user')
      return (users.data ?? [])
        .filter((u) => u.status === 'active')
        .map((u) => ({ value: u.id, label: userOptionLabel(u) }));
    return [];
  }, [form.audienceType, teams.data, users.data]);
  const targetName = targetOptions.find((o) => o.value === form.targetId)?.label ?? null;

  const audienceEnabled = form.audienceType === 'all' || !!form.targetId;
  const preview = useQuery({
    queryKey: [
      'admin',
      'push-campaigns',
      'audience',
      form.audienceType,
      form.targetId,
      form.channel,
    ],
    queryFn: () =>
      api.post<AudiencePreview>('/admin/push-campaigns/audience-preview', {
        audience: {
          type: form.audienceType,
          targetId: form.audienceType === 'all' ? null : form.targetId,
          channel: form.channel,
        },
      }),
    enabled: audienceEnabled,
    staleTime: 15_000,
  });

  const submitCheck = (schedule: boolean) => {
    const e = validateForm(form);
    if (!schedule) delete e.scheduleDate;
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const openSend = () => {
    if (!submitCheck(false)) return;
    sendKeyRef.current = null;
    setSendOpen(true);
  };

  const sendable = form.title.trim().length >= 2 && form.body.trim().length >= 2;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
      <div className="flex flex-col gap-4">
        <Card className="flex flex-col gap-4" aria-label="اطلاعات کمپین">
          <h2 className="text-base font-extrabold text-text">۱. اطلاعات کمپین</h2>
          <Input
            label="نام داخلی کمپین"
            hint="فقط برای شناسایی در پنل است و کاربران آن را نمی‌بینند."
            value={form.name}
            maxLength={80}
            onChange={(e) => set('name')(e.target.value)}
            error={errors.name}
          />
          <Select
            label="مخاطبان هدف"
            value={form.audienceType}
            onChange={(e) => {
              set('audienceType')(e.target.value as CampaignForm['audienceType']);
              set('targetId')('');
            }}
          >
            {(Object.keys(AUDIENCE_TYPE_LABEL) as Array<keyof typeof AUDIENCE_TYPE_LABEL>).map(
              (k) => (
                <option key={k} value={k}>
                  {AUDIENCE_TYPE_LABEL[k]}
                </option>
              ),
            )}
          </Select>
          {form.audienceType !== 'all' && (
            <Select
              label={
                form.audienceType === 'team'
                  ? 'تیم'
                  : form.audienceType === 'role'
                    ? 'نقش'
                    : 'کاربر'
              }
              value={form.targetId}
              onChange={(e) => set('targetId')(e.target.value)}
              error={errors.targetId}
            >
              <option value="">انتخاب کنید</option>
              {targetOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          )}
          <Select
            label="نوع دستگاه"
            value={form.channel}
            onChange={(e) => set('channel')(e.target.value as CampaignForm['channel'])}
            hint="فقط کاربرانی ارسال می‌شود که دستگاه فعال از این نوع دارند."
          >
            {(Object.keys(CHANNEL_LABEL) as Array<keyof typeof CHANNEL_LABEL>).map((k) => (
              <option key={k} value={k}>
                {CHANNEL_LABEL[k]}
              </option>
            ))}
          </Select>
          <AudienceEstimate preview={preview} enabled={audienceEnabled} />
        </Card>

        <Card className="flex flex-col gap-4" aria-label="محتوای اعلان">
          <h2 className="text-base font-extrabold text-text">۲. محتوای اعلان</h2>
          <Input
            label="عنوان اعلان"
            value={form.title}
            maxLength={80}
            onChange={(e) => set('title')(e.target.value)}
            error={errors.title}
            hint={`${faNumber(form.title.length)} / ۸۰`}
          />
          <Textarea
            label="متن اعلان"
            value={form.body}
            maxLength={300}
            onChange={(e) => set('body')(e.target.value)}
            error={errors.body}
            hint={`${faNumber(form.body.length)} / ۳۰۰`}
          />
          <Input
            label="آدرس تصویر (اختیاری)"
            value={form.imageUrl}
            maxLength={2048}
            ltr
            placeholder="https://…"
            onChange={(e) => set('imageUrl')(e.target.value)}
            error={errors.imageUrl}
            hint="لینک عمومی و HTTPS. نمایش تصویر به سیستم‌عامل و مرورگر بستگی دارد."
          />
          <Select
            label="مقصد پس از کلیک"
            value={form.actionRef}
            onChange={(e) => set('actionRef')(e.target.value)}
            error={errors.actionRef}
            hint="فقط صفحات داخلی اپلیکیشن قابل انتخاب‌اند."
          >
            {DESTINATIONS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label} ({d.value})
              </option>
            ))}
          </Select>
        </Card>

        <Card className="flex flex-col gap-4" aria-label="زمان ارسال">
          <h2 className="text-base font-extrabold text-text">۳. زمان ارسال</h2>
          <p className="text-xs text-text-secondary">
            زمان به وقت تهران (UTC+۳:۳۰) ثبت می‌شود. زمان‌بندی روی سرور انجام می‌شود؛ بستن مرورگر یا
            این صفحه روی اجرای آن اثری ندارد. سرور هر ۱۵ دقیقه کمپین‌های سررسیده را بررسی می‌کند.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <JalaliDateField
              label="تاریخ ارسال"
              mode="date"
              value={form.scheduleDate}
              onChange={set('scheduleDate')}
              error={errors.scheduleDate}
            />
            <Input
              label="ساعت ارسال (تهران)"
              type="time"
              value={form.scheduleTime}
              onChange={(e) => set('scheduleTime')(e.target.value)}
            />
          </div>
        </Card>

        <div className="sticky bottom-2 z-10 flex flex-col gap-2 rounded-card border border-border bg-surface/95 p-3 shadow-md backdrop-blur sm:flex-row sm:flex-wrap">
          <Button
            variant="secondary"
            icon={<Save className="size-4" aria-hidden />}
            loading={draft.isPending}
            disabled={busy}
            onClick={() => submitCheck(false) && draft.mutate()}
          >
            ذخیره پیش‌نویس
          </Button>
          <Button
            variant="secondary"
            icon={<CalendarClock className="size-4" aria-hidden />}
            loading={scheduleMut.isPending}
            disabled={busy || !form.scheduleDate || !form.scheduleTime}
            onClick={() => submitCheck(true) && setScheduleOpen(true)}
          >
            زمان‌بندی ارسال
          </Button>
          <Button
            icon={<Send className="size-4" aria-hidden />}
            disabled={busy || !sendable}
            onClick={openSend}
          >
            ارسال فوری
          </Button>
          {campaign && (
            <Button
              variant="ghost"
              icon={<Archive className="size-4" aria-hidden />}
              onClick={() => setArchiveOpen(true)}
              disabled={busy}
            >
              آرشیو
            </Button>
          )}
          {campaign?.status === 'scheduled' && (
            <Button
              variant="ghost"
              icon={<XCircle className="size-4" aria-hidden />}
              onClick={() => setCancelOpen(true)}
              disabled={busy}
            >
              لغو زمان‌بندی
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-4 lg:sticky lg:top-4">
        <Card aria-label="پیش‌نمایش">
          <h2 className="mb-3 text-base font-extrabold text-text">پیش‌نمایش زنده</h2>
          <PushNotificationPreview
            title={form.title}
            body={form.body}
            imageUrl={form.imageUrl}
            actionRef={form.actionRef}
          />
        </Card>
      </div>

      <SendConfirm
        open={sendOpen}
        form={form}
        targetName={targetName}
        estimate={preview.data ?? null}
        loading={sendMut.isPending}
        onClose={() => setSendOpen(false)}
        onConfirm={() => sendMut.mutate()}
      />
      <ConfirmDialog
        open={scheduleOpen}
        title="زمان‌بندی کمپین؟"
        confirmText="زمان‌بندی"
        loading={scheduleMut.isPending}
        onClose={() => setScheduleOpen(false)}
        onConfirm={() => scheduleMut.mutate()}
      >
        کمپین «{form.name || 'بدون نام'}» در {faTehranDateTime(scheduleIso(form))} ارسال شود. تا آن
        زمان می‌توانید آن را لغو کنید.
      </ConfirmDialog>
      <ConfirmDialog
        open={cancelOpen}
        title="لغو زمان‌بندی؟"
        danger
        confirmText="لغو کمپین"
        loading={cancelMut.isPending}
        onClose={() => setCancelOpen(false)}
        onConfirm={() => cancelMut.mutate()}
      >
        این کمپین دیگر اجرا نمی‌شود و به حالت لغوشده می‌رود.
      </ConfirmDialog>
      <ConfirmDialog
        open={archiveOpen}
        title="آرشیو کمپین؟"
        danger
        confirmText="آرشیو"
        loading={archiveMut.isPending}
        onClose={() => setArchiveOpen(false)}
        onConfirm={() => archiveMut.mutate()}
      >
        کمپین از فهرست اصلی پنهان می‌شود. گزارش‌ها و سوابق ارسال حذف نمی‌شوند.
      </ConfirmDialog>
    </div>
  );
}

function scheduleIso(f: CampaignForm): string | null {
  return payloadFromForm(f, true).scheduledAt;
}

function AudienceEstimate({
  preview,
  enabled,
}: {
  preview: { data?: AudiencePreview; isPending: boolean; isError: boolean };
  enabled: boolean;
}) {
  if (!enabled) return <p className="text-xs text-text-secondary">ابتدا مخاطب را انتخاب کنید.</p>;
  if (preview.isPending)
    return (
      <p className="text-xs text-text-secondary" aria-live="polite">
        در حال محاسبه تعداد مخاطبان…
      </p>
    );
  if (preview.isError || !preview.data)
    return <p className="text-xs text-danger-fg">تعداد مخاطبان محاسبه نشد. دوباره تلاش کنید.</p>;
  return (
    <p
      className="rounded-input bg-info-light px-3 py-2 text-xs font-medium text-info-fg"
      aria-live="polite"
    >
      حدود {faNumber(preview.data.users)} کاربر در این مخاطب؛ حدود{' '}
      {faNumber(preview.data.withPushDevice)} نفر دستگاه فعال دارند. {preview.data.note}
    </p>
  );
}

function SendConfirm({
  open,
  form,
  targetName,
  estimate,
  loading,
  onClose,
  onConfirm,
}: {
  open: boolean;
  form: CampaignForm;
  targetName: string | null;
  estimate: AudiencePreview | null;
  loading: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const dest = DESTINATIONS.find((d) => d.value === form.actionRef)?.label ?? form.actionRef;
  const audience =
    form.audienceType === 'all'
      ? AUDIENCE_TYPE_LABEL.all
      : `${AUDIENCE_TYPE_LABEL[form.audienceType]}${targetName ? `: ${targetName}` : ''}`;
  return (
    <ConfirmDialog
      open={open}
      title="تأیید ارسال فوری"
      confirmText="ارسال اعلان"
      loading={loading}
      onClose={onClose}
      onConfirm={onConfirm}
    >
      <div className="flex flex-col gap-3 text-sm">
        <Detail label="عنوان" value={form.title} />
        <Detail label="متن" value={form.body} />
        <Detail label="تصویر" value={form.imageUrl.trim() || 'بدون تصویر'} ltr />
        <Detail label="مقصد" value={`${dest} (${form.actionRef})`} />
        <Detail label="مخاطبان" value={`${audience} · ${CHANNEL_LABEL[form.channel]}`} />
        <Detail
          label="تعداد تقریبی"
          value={estimate ? `حدود ${faNumber(estimate.users)} کاربر` : 'در حال محاسبه…'}
        />
        <p className="flex items-start gap-2 rounded-input bg-danger-light p-3 text-xs font-medium text-danger-fg">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          پس از شروع ارسال، اعلان‌ها به دستگاه‌ها فرستاده می‌شوند و امکان بازگرداندن آن‌ها وجود
          ندارد. ارسال یک‌بار انجام می‌شود و دکمه تا پایان درخواست غیرفعال است.
        </p>
      </div>
    </ConfirmDialog>
  );
}

function Detail({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2">
      <span className="text-text-secondary">{label}</span>
      <span className="break-words font-semibold text-text" dir={ltr ? 'ltr' : undefined}>
        {value}
      </span>
    </div>
  );
}

function ReadOnlyResults({ detail }: { detail: CampaignDetail }) {
  const { campaign: c, batches } = detail;
  const s = c.summary;
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
      <Card className="flex flex-col gap-4" aria-label="نتیجه ارسال">
        <h2 className="text-base font-extrabold text-text">گزارش ارسال</h2>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <Stat label="مخاطبان (تعداد در لحظه شروع)" value={c.targetCount ?? 0} />
          <Stat label="دستگاه فعال تقریبی" value={c.pushReachable ?? 0} />
          <Stat label="درخواست‌های ارسال‌شده به سرویس" value={s.attempted} />
          <Stat label="پذیرفته‌شده توسط سرویس" value={s.accepted} />
          <Stat label="ناموفق" value={s.failed} tone={s.failed ? 'danger' : undefined} />
          <Stat label="توکن نامعتبر (حذف‌شده)" value={s.invalid} />
          <Stat label="کاربر بدون دستگاه (فقط داخل برنامه)" value={s.noDevice} />
          <Stat
            label="بخش‌های پردازش‌شده"
            value={`${faNumber(s.batchesDone)} از ${faNumber(s.batchesTotal)}`}
          />
        </div>
        <p className="text-xs leading-6 text-muted-fg">
          «پذیرفته‌شده» یعنی سرویس ارسال اعلان درخواست را دریافت کرده است. تحویل قطعی به دستگاه یا
          دیده‌شدن اعلان توسط کاربر در این سیستم اندازه‌گیری نمی‌شود.
        </p>
        <Detail label="شروع" value={faTehranDateTime(c.startedAt)} />
        <Detail label="پایان" value={faTehranDateTime(c.finishedAt)} />
        {c.lastError && (
          <p className="flex items-start gap-2 rounded-input bg-warning-light p-3 text-xs font-medium text-warning-fg">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {c.lastError}
          </p>
        )}
      </Card>
      <Card className="flex flex-col gap-3" aria-label="محتوای ارسال‌شده">
        <h2 className="text-base font-extrabold text-text">محتوای نهایی</h2>
        <PushNotificationPreview
          title={c.title}
          body={c.body}
          imageUrl={c.imageUrl ?? ''}
          actionRef={c.actionRef}
        />
      </Card>
      <Card className="flex flex-col gap-3 lg:col-span-2" aria-label="بخش‌های ارسال">
        <h2 className="text-base font-extrabold text-text">جزئیات بخش‌های ارسال</h2>
        {batches.length === 0 ? (
          <p className="text-sm text-text-secondary">هنوز بخشی برای این کمپین ساخته نشده است.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm">
              <thead>
                <tr className="border-b border-border text-start text-xs text-text-secondary">
                  <th className="p-2 text-start">بخش</th>
                  <th className="p-2 text-start">وضعیت</th>
                  <th className="p-2 text-start">کاربران</th>
                  <th className="p-2 text-start">تلاش</th>
                  <th className="p-2 text-start">پذیرفته</th>
                  <th className="p-2 text-start">ناموفق</th>
                  <th className="p-2 text-start">خطا</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.index} className="border-b border-border/60 align-top">
                    <td className="p-2">{faNumber(b.index + 1)}</td>
                    <td className="p-2">{b.status}</td>
                    <td className="p-2">{faNumber(b.users)}</td>
                    <td className="p-2">{faNumber(b.attempts)}</td>
                    <td className="p-2">{faNumber(b.accepted)}</td>
                    <td className="p-2">{faNumber(b.failed)}</td>
                    <td className="max-w-[18rem] p-2 text-xs text-danger-fg">
                      {b.lastError ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {detail.batchesTruncated && (
              <p className="mt-2 text-xs text-text-secondary">
                فقط ۲۰۰ بخش اول نمایش داده شده است.
              </p>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: 'danger' }) {
  const shown = typeof value === 'number' ? faNumber(value) : value;
  return (
    <div className="rounded-input border border-border bg-background p-3">
      <p className="text-xs text-text-secondary">{label}</p>
      <p
        className={
          tone === 'danger'
            ? 'mt-1 text-lg font-extrabold text-danger-fg'
            : 'mt-1 text-lg font-extrabold text-text'
        }
      >
        {shown}
      </p>
    </div>
  );
}
