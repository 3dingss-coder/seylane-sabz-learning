import { z } from 'zod';
import { ApiError } from '../http/errors';
import { text } from '../http/validate';
import { ids } from '../lib/ids';
import { DAY, inQuietHours, quietHoursEnd } from '../lib/time';
import type { Doc } from '../store/types';
import type {
  DeviceToken,
  Notification,
  NotificationTemplate,
  NotificationType,
  User,
} from '../domain/types';
import { audit, getPolicy, track, type Actor, type Deps } from './context';

/** Persian templates (spec §26). Variables in {braces}. Editable by admin. */
export const DEFAULT_TEMPLATES: Record<
  NotificationType,
  { title: string; body: string; push: boolean; vars: string[] }
> = {
  welcome: {
    title: 'به آکادمی سیلانه خوش آمدی!',
    body: 'سلام {name}! آموزش‌هایت در صفحه خانه منتظرت هستند. از «کار بعدی» شروع کن.',
    push: false,
    vars: ['name'],
  },
  new_assignment: {
    title: 'آموزش جدید: {title}',
    body: 'یک آموزش جدید برایت فعال شد. مهلت: {deadline}',
    push: true,
    vars: ['title', 'deadline'],
  },
  reminder: {
    title: 'ادامه بده!',
    body: '{percent}٪ از «{title}» را رفتی — ادامه بده.',
    push: true,
    vars: ['title', 'percent'],
  },
  deadline_warning: {
    title: '{hours} ساعت تا پایان مهلت',
    body: 'مهلت «{title}» نزدیک است. همین حالا ادامه بده.',
    push: true,
    vars: ['title', 'hours'],
  },
  deadline_passed: {
    title: 'مهلت تمام شد',
    body: 'مهلت «{title}» تمام شد و به مدیرت اطلاع داده شد. هنوز می‌توانی آن را کامل کنی.',
    push: true,
    vars: ['title'],
  },
  quiz_failed: {
    title: 'نتیجه آزمون',
    body: 'در آزمون «{title}» قبول نشدی. قسمت را مرور کن و دوباره تلاش کن.',
    push: false,
    vars: ['title'],
  },
  quiz_passed: {
    title: 'قبول شدی 🎉',
    body: 'آزمون «{title}» را با نمره {score}٪ قبول شدی.',
    push: false,
    vars: ['title', 'score'],
  },
  retake_request: {
    title: 'درخواست تلاش مجدد',
    body: '{name} برای آزمون «{title}» درخواست تلاش مجدد دارد.',
    push: true,
    vars: ['name', 'title'],
  },
  retake_reviewed: {
    title: 'نتیجه درخواست تلاش مجدد',
    body: 'درخواست تلاش مجدد شما برای «{title}» {result} شد.',
    push: false,
    vars: ['title', 'result'],
  },
  manager_message: {
    title: 'پیام از {manager}',
    body: '{snippet}',
    push: true,
    vars: ['manager', 'snippet'],
  },
  mentor_nudge: { title: 'منتور', body: '{message}', push: false, vars: ['message'] },
  weekly_digest: {
    title: 'گزارش هفتگی تیم',
    body: '{count} نفر از تیم شما عقب‌اند. برای پیگیری وارد پنل شوید.',
    push: true,
    vars: ['count'],
  },
  badge_earned: {
    title: 'نشان جدید!',
    body: 'نشان «{title}» را گرفتی!',
    push: false,
    vars: ['title'],
  },
  escalation: { title: 'نیاز به بررسی', body: '{body}', push: true, vars: ['body'] },
  manual: { title: '{title}', body: '{body}', push: true, vars: ['title', 'body'] },
};

/** Push bodies never carry message contents (spec §26: no sensitive data in Push). */
const GENERIC_PUSH: Partial<Record<NotificationType, { title: string; body: string }>> = {
  manager_message: { title: 'پیام جدید', body: 'مدیرت برایت پیام فرستاد.' },
  retake_request: { title: 'درخواست تلاش مجدد', body: 'یک درخواست تلاش مجدد منتظر بررسی است.' },
};

export function render(tpl: string, vars: Record<string, string | number>): string {
  return tpl.replace(/\{(\w+)\}/g, (_m, k: string) =>
    vars[k] !== undefined ? String(vars[k]) : '',
  );
}

export async function getTemplates(d: Deps) {
  const stored = await d.store.query<NotificationTemplate>({
    collection: 'notification_templates',
  });
  const byKey = new Map(stored.map((s) => [s.id, s]));
  return (Object.keys(DEFAULT_TEMPLATES) as NotificationType[]).map((key) => {
    const def = DEFAULT_TEMPLATES[key];
    const s = byKey.get(key);
    return {
      key,
      title: s?.title ?? def.title,
      body: s?.body ?? def.body,
      variables: def.vars,
      push: def.push,
      customized: !!s,
      updatedAt: s?.updatedAt ?? null,
    };
  });
}

export const templateSchema = z.object({ title: text(2, 80, 'عنوان'), body: text(2, 300, 'متن') });

export async function updateTemplate(
  d: Deps,
  actor: Actor,
  key: string,
  input: z.infer<typeof templateSchema>,
) {
  const def = DEFAULT_TEMPLATES[key as NotificationType];
  if (!def) throw new ApiError('NOT_FOUND', 'قالب پیدا نشد.');
  const used = [...`${input.title} ${input.body}`.matchAll(/\{(\w+)\}/g)].map((m) => m[1] ?? '');
  const unknown = used.filter((v) => !def.vars.includes(v));
  if (unknown.length)
    throw new ApiError(
      'VALIDATION',
      `متغیر نامعتبر: ${unknown.join('، ')}. متغیرهای مجاز: ${def.vars.join('، ')}`,
    );
  const before = await d.store.get(`notification_templates/${key}`);
  await d.store.set(`notification_templates/${key}`, {
    ...input,
    updatedAt: d.clock().toISOString(),
  });
  await audit(
    d,
    actor,
    'notification_template.updated',
    'notification_templates',
    key,
    before,
    input,
  );
  return { key, ...input };
}

export interface NotifyOptions {
  actionRef?: string | null;
  priority?: 'high' | 'normal' | 'low';
  /** High priority + deadline < 24h may break quiet hours (spec §26). */
  urgent?: boolean;
  /** Throttle key per user; with throttleMs → at most once per window. */
  throttleKey?: string;
  throttleMs?: number;
  push?: boolean;
  imageUrl?: string | null;
  campaignId?: string | null;
}

async function throttled(d: Deps, userId: string, key: string, windowMs: number): Promise<boolean> {
  const path = `notification_log/${ids.hash(`${userId}|${key}`)}`;
  const now = d.clock();
  return d.store.runTransaction(async (tx) => {
    const log = await tx.get<{ sentAt: string }>(path);
    if (log && now.getTime() - Date.parse(log.sentAt) < windowMs) return true;
    tx.set(path, {
      userId,
      key,
      channel: 'in_app',
      sentAt: now.toISOString(),
      expireAt: new Date(now.getTime() + 180 * DAY),
    });
    return false;
  });
}

async function sendPush(
  d: Deps,
  n: Doc<Notification>,
  type: NotificationType,
): Promise<Notification['pushStatus']> {
  const tokens = await d.store.query<DeviceToken>({
    collection: 'device_tokens',
    where: [['userId', '==', n.userId]],
  });
  if (!tokens.length) return 'skipped';
  const g = GENERIC_PUSH[type];
  try {
    const res = await d.push.send(
      tokens.map((t) => t.token),
      {
        title: type === 'manual' ? n.title : g?.title ?? n.title,
        body: type === 'manual' ? n.body : g?.body ?? n.body,
        data: {
          notificationId: n.id,
          link: n.actionRef ?? '/messages',
          type,
          ...(n.imageUrl ? { imageUrl: n.imageUrl } : {}),
        },
        imageUrl: n.imageUrl ?? undefined,
      },
    );
    for (const bad of res.invalidTokens) await d.store.delete(`device_tokens/${ids.hash(bad)}`);
    return res.sent > 0 ? 'sent' : 'failed';
  } catch (e) {
    console.warn('push failed', (e as Error).message);
    return 'failed'; // In-App remains (fallback) and deferred retry picks up 'failed' once.
  }
}

/** Creates In-App notifications (always) and Push (per type, quiet-hours aware). Batched. */
export async function notifyUsers(
  d: Deps,
  userIds: string[],
  type: NotificationType,
  content: { title: string; body: string },
  opts: NotifyOptions = {},
): Promise<number> {
  const policy = await getPolicy(d);
  const def = DEFAULT_TEMPLATES[type];
  const wantPush = opts.push ?? def.push;
  const now = d.clock();
  const quiet = inQuietHours(now, policy.quietHours, policy.timezone);
  const bypassQuiet = opts.priority === 'high' && !!opts.urgent;
  let created = 0;
  const uniq = [...new Set(userIds)];
  for (let i = 0; i < uniq.length; i += 50) {
    await Promise.all(
      uniq.slice(i, i + 50).map(async (userId) => {
        if (
          opts.throttleKey &&
          (await throttled(d, userId, opts.throttleKey, opts.throttleMs ?? DAY))
        )
          return;
        const id = d.store.newId();
        const deferred = wantPush && quiet && !bypassQuiet;
        const n: Notification = {
          userId,
          type,
          title: content.title,
          body: content.body,
          actionRef: opts.actionRef ?? null,
          imageUrl: opts.imageUrl ?? null,
          campaignId: opts.campaignId ?? null,
          readAt: null,
          pushStatus: wantPush ? (deferred ? 'deferred' : 'none') : 'none',
          deliverAfter: deferred
            ? quietHoursEnd(now, policy.quietHours, policy.timezone).toISOString()
            : null,
          createdAt: now.toISOString(),
        };
        await d.store.set(`notifications/${id}`, n as unknown as Record<string, unknown>);
        created++;
        if (wantPush && !deferred) {
          const status = await sendPush(d, { ...n, id }, type);
          await d.store.update(`notifications/${id}`, { pushStatus: status });
        }
      }),
    );
  }
  return created;
}

export async function notifyTemplate(
  d: Deps,
  userIds: string[],
  type: NotificationType,
  vars: Record<string, string | number>,
  opts: NotifyOptions = {},
) {
  if (!userIds.length) return 0;
  const stored = await d.store.get<NotificationTemplate>(`notification_templates/${type}`);
  const def = DEFAULT_TEMPLATES[type];
  return notifyUsers(
    d,
    userIds,
    type,
    {
      title: render(stored?.title ?? def.title, vars),
      body: render(stored?.body ?? def.body, vars),
    },
    opts,
  );
}

/** Scheduled (every 15 min): deliver pushes deferred by quiet hours. */
export async function flushDeferredPush(d: Deps): Promise<number> {
  const due = await d.store.query<Notification>({
    collection: 'notifications',
    where: [
      ['pushStatus', '==', 'deferred'],
      ['deliverAfter', '<=', d.clock().toISOString()],
    ],
    limit: 500,
  });
  for (const n of due) {
    const status = await sendPush(d, n, n.type);
    await d.store.update(`notifications/${n.id}`, { pushStatus: status });
  }
  return due.length;
}

// ─── Marketer inbox ─────────────────────────────────────────────────────────
export async function myNotifications(d: Deps, userId: string) {
  const list = await d.store.query<Notification>({
    collection: 'notifications',
    where: [['userId', '==', userId]],
    orderBy: [['createdAt', 'desc']],
    limit: 50,
  });
  return {
    unread: list.filter((n) => !n.readAt).length,
    items: list.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      actionRef: n.actionRef,
      readAt: n.readAt,
      createdAt: n.createdAt,
    })),
  };
}

export async function markNotificationRead(d: Deps, userId: string, id: string) {
  const n = await d.store.get<Notification>(`notifications/${id}`);
  if (!n || n.userId !== userId) throw new ApiError('NOT_FOUND');
  if (!n.readAt) {
    await d.store.update(`notifications/${id}`, { readAt: d.clock().toISOString() });
    await track(d, 'notification_opened', userId, { type: n.type });
  }
  return { id, readAt: n.readAt ?? d.clock().toISOString() };
}

export async function markAllRead(d: Deps, userId: string) {
  const list = await d.store.query<Notification>({
    collection: 'notifications',
    where: [
      ['userId', '==', userId],
      ['readAt', '==', null],
    ],
  });
  const at = d.clock().toISOString();
  await d.store.batchSet(
    list.map((n) => ({ path: `notifications/${n.id}`, data: { readAt: at }, merge: true })),
  );
  return { count: list.length };
}

export const deviceSchema = z.object({
  token: z.string().min(10).max(4096),
  platform: z.enum(['web', 'android']),
});

export async function registerDevice(d: Deps, userId: string, input: z.infer<typeof deviceSchema>) {
  await d.store.set(`device_tokens/${ids.hash(input.token)}`, {
    userId,
    token: input.token,
    platform: input.platform,
    lastSeenAt: d.clock().toISOString(),
  });
  return { ok: true };
}
export async function unregisterDevice(d: Deps, userId: string, token: string) {
  const path = `device_tokens/${ids.hash(token)}`;
  const t = await d.store.get<DeviceToken>(path);
  if (t && t.userId === userId) await d.store.delete(path);
}

// ─── Admin manual send (rate-limited in route) ─────────────────────────────
export const manualSendSchema = z
  .object({
    audience: z.enum(['all', 'team', 'user', 'role']),
    targetId: z.string().max(80).nullable().optional(),
    title: text(2, 80, 'عنوان'),
    body: text(2, 300, 'متن'),
    imageUrl: z
      .string()
      .trim()
      .url()
      .max(2048)
      .refine((v) => v.startsWith('https://'), 'آدرس تصویر باید HTTPS باشد.')
      .nullable()
      .optional(),
    actionRef: z
      .string()
      .trim()
      .max(500)
      .refine((v) => v.startsWith('/') && !v.startsWith('//'), 'لینک باید مسیر داخلی سایت باشد.')
      .nullable()
      .optional(),
  })
  .refine((v) => v.audience === 'all' || !!v.targetId, {
    message: 'مخاطب را انتخاب کنید.',
    path: ['targetId'],
  });

export async function manualSend(d: Deps, actor: Actor, input: z.infer<typeof manualSendSchema>) {
  const where: Array<[string, '==', unknown]> = [['status', '==', 'active']];
  if (input.audience === 'team') where.push(['teamId', '==', input.targetId]);
  if (input.audience === 'role') where.push(['role', '==', input.targetId]);
  let users = await d.store.query<User>({ collection: 'users', where });
  if (input.audience === 'user') users = users.filter((u) => u.id === input.targetId);
  if (!users.length) throw new ApiError('VALIDATION', 'هیچ کاربری در این مخاطب نیست.');
  const count = await notifyUsers(
    d,
    users.map((u) => u.id),
    'manual',
    { title: input.title, body: input.body },
    {
      priority: 'normal',
      imageUrl: input.imageUrl ?? null,
      actionRef: input.actionRef ?? '/home',
    },
  );
  await audit(d, actor, 'notification.manual_sent', 'notifications', input.audience, null, {
    ...input,
    count,
  });
  await track(d, 'admin_notification_sent', actor.id, { audience: input.audience, count });
  return { count };
}
