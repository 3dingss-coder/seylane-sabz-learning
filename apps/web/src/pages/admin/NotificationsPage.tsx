import { userOptionLabel } from '@/lib/digits';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Pencil, Send } from 'lucide-react';
import { Button, Card, EmptyState, Input, Modal, TableSkeleton, useToast } from '@/components/ui';
import { Select, Tabs, Textarea } from '@/components/common/Field';
import { PageHeader } from '@/components/common/PageHeader';
import { QueryState } from '@/components/common/QueryState';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { ApiError, api } from '@/lib/api';
import { toPersianDigits } from '@/lib/digits';
import { errMsg } from '@/lib/errors';
import { faRelative } from '@/lib/format';
import { ROLE_LABEL } from '@/lib/format';
import { useNotifications } from '@/lib/queries';
import { cn } from '@/lib/cn';
import type { NotificationTemplate } from '@/lib/types';
import { useTeams, useUsers } from './adminQueries';

const KEY_LABEL: Record<string, string> = {
  welcome: 'خوش‌آمد ثبت‌نام',
  quiz_passed: 'قبولی در آزمون',
  new_assignment: 'آموزش جدید',
  reminder: 'یادآوری عدم فعالیت',
  deadline_warning: 'هشدار مهلت',
  deadline_passed: 'پایان مهلت',
  quiz_failed: 'رد شدن در آزمون',
  retake_request: 'درخواست آزمون مجدد',
  retake_reviewed: 'نتیجه درخواست آزمون مجدد',
  manager_message: 'پیام مدیر',
  mentor_nudge: 'پیشنهاد منتور',
  weekly_digest: 'خلاصه هفتگی مدیر',
  badge_earned: 'نشان جدید',
  escalation: 'گزارش تأخیر به مدیر',
  manual: 'اعلان دستی',
};

/** A7 — اعلان‌ها: editable templates + manual broadcast. */
export function NotificationsPage() {
  const [tab, setTab] = useState<'inbox' | 'templates' | 'send'>('inbox');
  const inbox = useNotifications();
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="اعلان‌ها" />
      <Tabs
        label="بخش"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'inbox', label: 'صندوق من', count: inbox.data?.unread },
          { value: 'templates', label: 'قالب‌ها' },
          { value: 'send', label: 'ارسال دستی' },
        ]}
      />
      {tab === 'inbox' ? <Inbox /> : tab === 'templates' ? <Templates /> : <ManualSend />}
    </div>
  );
}

/**
 * The admin/manager inbox: escalations, weekly digests and the «ارسال دستی» broadcast all land on
 * these users, and until now nothing in the admin panel listed them.
 */
function Inbox() {
  const q = useNotifications();
  const qc = useQueryClient();
  const nav = useNavigate();
  const readOne = useMutation({
    mutationFn: (id: string) => api.post(`/me/notifications/${id}/read`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['me', 'notifications'] }),
  });
  const readAll = useMutation({
    mutationFn: () => api.post('/me/notifications/read-all'),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['me', 'notifications'] }),
  });
  return (
    <div className="flex flex-col gap-3">
      {(q.data?.unread ?? 0) > 0 && (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            loading={readAll.isPending}
            icon={<Bell className="size-4" aria-hidden />}
            onClick={() => readAll.mutate()}
          >
            همه خوانده شد
          </Button>
        </div>
      )}
      <QueryState
        query={q}
        loading={<TableSkeleton rows={5} />}
        isEmpty={(d) => d.items.length === 0}
        empty={<EmptyState title="اعلانی نداری" icon={<Bell className="size-8" />} />}
      >
        {(d) => (
          <ul className="flex flex-col gap-2">
            {d.items.map((it) => (
              <li key={it.id}>
                <button
                  type="button"
                  onClick={() => {
                    if (!it.readAt) readOne.mutate(it.id);
                    if (it.actionRef) nav(it.actionRef);
                  }}
                  className={cn(
                    'flex min-h-12 w-full items-start gap-3 rounded-card border p-3 text-start',
                    it.readAt ? 'border-border bg-surface' : 'border-primary/30 bg-primary-light',
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-text">{it.title}</p>
                    <p className="text-sm leading-6 text-text-secondary">{it.body}</p>
                    <p className="mt-1 text-xs text-muted-fg">
                      {faRelative(it.createdAt)}
                      {it.actionRef ? ' • با کلیک باز می‌شود' : ''}
                    </p>
                  </div>
                  {!it.readAt && (
                    <span
                      className="mt-2 size-2 shrink-0 rounded-full bg-primary"
                      aria-label="خوانده نشده"
                    />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </QueryState>
    </div>
  );
}

function Templates() {
  const q = useQuery({
    queryKey: ['admin', 'templates'],
    queryFn: ({ signal }) =>
      api.get<NotificationTemplate[]>('/admin/notification-templates', signal),
  });
  const [edit, setEdit] = useState<NotificationTemplate | null>(null);
  return (
    <>
      <QueryState query={q} loading={<TableSkeleton rows={6} />}>
        {(list) => (
          <ul className="grid gap-2 md:grid-cols-2">
            {list.map((t) => (
              <li key={t.key}>
                <Card className="flex h-full flex-col gap-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-bold text-primary">
                      {KEY_LABEL[t.key] ?? t.key}
                      {t.customized && <span className="ms-2 text-warning-fg">(سفارشی)</span>}
                    </p>
                    <Button
                      variant="ghost"
                      className="px-2"
                      aria-label={`ویرایش ${KEY_LABEL[t.key] ?? t.key}`}
                      icon={<Pencil className="size-4" />}
                      onClick={() => setEdit(t)}
                    />
                  </div>
                  <p className="font-bold">{t.title}</p>
                  <p className="text-sm text-text-secondary">{t.body}</p>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </QueryState>
      {edit && <TemplateDialog t={edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function TemplateDialog({ t, onClose }: { t: NotificationTemplate; onClose: () => void }) {
  const [title, setTitle] = useState(t.title);
  const [body, setBody] = useState(t.body);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const qc = useQueryClient();
  const toast = useToast();
  const m = useMutation({
    mutationFn: () =>
      api.put(`/admin/notification-templates/${t.key}`, { title: title.trim(), body: body.trim() }),
    onSuccess: () => {
      toast.show({ type: 'success', message: 'قالب ذخیره شد.' });
      void qc.invalidateQueries({ queryKey: ['admin', 'templates'] });
      onClose();
    },
    onError: (e) =>
      e instanceof ApiError && Object.keys(e.fields).length
        ? setErrors(e.fields)
        : toast.show({ type: 'error', message: errMsg(e) }),
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={`قالب «${KEY_LABEL[t.key] ?? t.key}»`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            انصراف
          </Button>
          <Button loading={m.isPending} onClick={() => m.mutate()}>
            ذخیره
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Input
          label="عنوان"
          value={title}
          maxLength={80}
          onChange={(e) => setTitle(e.target.value)}
          error={errors.title}
        />
        <Textarea
          label="متن"
          value={body}
          maxLength={300}
          onChange={(e) => setBody(e.target.value)}
          error={errors.body}
        />
        {t.variables.length > 0 && (
          <div className="text-xs text-text-secondary">
            متغیرهای قابل استفاده:{' '}
            {t.variables.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setBody((b) => `${b}{${v}}`)}
                className="ms-1 inline-flex min-h-8 items-center rounded-full bg-background px-2 font-mono"
                dir="ltr"
              >
                {`{${v}}`}
              </button>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

function ManualSend() {
  const navigate = useNavigate();
  const teams = useTeams();
  const users = useUsers();
  const [audience, setAudience] = useState<'all' | 'team' | 'user' | 'role'>('all');
  const [targetId, setTargetId] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [actionRef, setActionRef] = useState('/messages');
  const [confirm, setConfirm] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const toast = useToast();
  const m = useMutation({
    mutationFn: () =>
      api.post<{ count: number }>('/admin/notifications/send', {
        audience,
        targetId: audience === 'all' ? null : targetId,
        title: title.trim(),
        body: body.trim(),
        imageUrl: imageUrl.trim() || null,
        actionRef: actionRef.trim() || '/messages',
      }),
    onSuccess: (r) => {
      setConfirm(false);
      const count = r.count ?? 0;
      toast.show({
        type: count ? 'success' : 'warning',
        message: count
          ? `برای ${toPersianDigits(count)} نفر ارسال شد.`
          : 'اعلانی ارسال نشد؛ مخاطبی با این انتخاب پیدا نشد.',
      });
      setTitle('');
      setBody('');
      setImageUrl('');
      setActionRef('/messages');
    },
    onError: (e) => {
      setConfirm(false);
      if (e instanceof ApiError && Object.keys(e.fields).length) setErrors(e.fields);
      else toast.show({ type: 'error', message: errMsg(e) });
    },
  });
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <Card className="flex flex-col gap-2 border-info/30 bg-info-light/40">
        <p className="text-sm font-semibold text-text">
          برای ساخت پیش‌نویس، زمان‌بندی، پیش‌نمایش کامل و گزارش نتیجه ارسال، از کمپین‌های Push
          استفاده کنید.
        </p>
        <div>
          <Button variant="secondary" onClick={() => navigate('/admin/push-campaigns/new')}>
            ساخت کمپین Push
          </Button>
        </div>
      </Card>
      <Card className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Select
            label="مخاطب"
            value={audience}
            onChange={(e) => {
              setAudience(e.target.value as typeof audience);
              setTargetId('');
            }}
          >
            <option value="all">همه کاربران فعال</option>
            <option value="role">یک نقش</option>
            <option value="team">یک تیم</option>
            <option value="user">یک فرد</option>
          </Select>
          {audience !== 'all' && (
            <Select
              label="انتخاب"
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              error={errors.targetId}
            >
              <option value="">انتخاب کنید</option>
              {audience === 'role' &&
                ['marketer', 'manager', 'admin', 'superadmin'].map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              {audience === 'team' &&
                (teams.data ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              {audience === 'user' &&
                (users.data ?? [])
                  .filter((u) => u.status === 'active')
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {userOptionLabel(u)}
                    </option>
                  ))}
            </Select>
          )}
        </div>
        <Input
          label="عنوان"
          value={title}
          maxLength={80}
          onChange={(e) => setTitle(e.target.value)}
          error={errors.title}
        />
        <Textarea
          label="متن"
          value={body}
          maxLength={300}
          onChange={(e) => setBody(e.target.value)}
          error={errors.body}
          hint={`${toPersianDigits(body.length)} / ۳۰۰`}
        />
        <Input
          label="آدرس تصویر اعلان (اختیاری)"
          value={imageUrl}
          maxLength={2048}
          onChange={(e) => setImageUrl(e.target.value)}
          error={errors.imageUrl}
          hint="لینک مستقیم تصویر عمومی با HTTPS؛ نمایش تصویر به سیستم‌عامل و مرورگر بستگی دارد."
        />
        <Input
          label="مسیر مقصد پس از کلیک"
          value={actionRef}
          maxLength={500}
          onChange={(e) => setActionRef(e.target.value)}
          error={errors.actionRef}
          hint="مسیر داخلی مثل /home یا /messages"
        />
        <div className="rounded-card border border-border bg-background p-4" dir="rtl">
          <p className="mb-3 text-xs font-bold text-text-secondary">پیش‌نمایش اعلان</p>
          <div className="flex items-start gap-3 rounded-xl border border-border bg-surface p-3 shadow-sm">
            <img src="/icons/icon-192.png" alt="" className="size-9 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-text">{title.trim() || 'عنوان اعلان شما'}</p>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm text-text-secondary">
                {body.trim() || 'متن اعلان اینجا نمایش داده می‌شود.'}
              </p>
            </div>
          </div>
          {imageUrl.trim() && /^https:\/\//i.test(imageUrl.trim()) && (
            <img
              src={imageUrl.trim()}
              alt="پیش‌نمایش تصویر اعلان"
              className="mt-3 max-h-48 w-full rounded-lg border border-border object-cover"
            />
          )}
        </div>
        <Button
          icon={<Send className="size-4" aria-hidden />}
          disabled={
            title.trim().length < 2 || body.trim().length < 2 || (audience !== 'all' && !targetId)
          }
          onClick={() => setConfirm(true)}
        >
          ارسال
        </Button>
        <ConfirmDialog
          open={confirm}
          title="ارسال اعلان؟"
          loading={m.isPending}
          onClose={() => setConfirm(false)}
          onConfirm={() => m.mutate()}
          confirmText="ارسال"
        >
          اعلان «{title}» ارسال شود؟ این کار قابل بازگشت نیست.
        </ConfirmDialog>
      </Card>
    </div>
  );
}
