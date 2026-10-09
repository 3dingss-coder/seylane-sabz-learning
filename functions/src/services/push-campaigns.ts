import { z } from 'zod';
import { ApiError } from '../http/errors';
import { text, } from '../http/validate';
import type { User } from '../domain/types';
import { StoreConflictError } from '../store/types';
import { audit, type Actor, type Deps } from './context';
import { notifyUsers } from './notify';

const campaignStatuses = ['draft', 'scheduled', 'sending', 'sent', 'partial', 'failed', 'cancelled'] as const;
type CampaignStatus = (typeof campaignStatuses)[number];
type Audience = 'all' | 'team' | 'user' | 'role';

interface Campaign {
  name: string;
  title: string;
  body: string;
  imageUrl: string | null;
  actionRef: string;
  audience: Audience;
  targetId: string | null;
  status: CampaignStatus;
  scheduledAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  startedAt: string | null;
  finishedAt: string | null;
  targetCount: number | null;
  createdNotifications: number;
  pushSent: number | null;
  pushFailed: number | null;
  pushSkipped: number | null;
  pushDeferred: number | null;
  lastError: string | null;
}

const internalPath = z.string().trim().max(500).refine(
  (v) => v.startsWith('/') && !v.startsWith('//') && !v.startsWith('/\\'),
  'مقصد باید یک مسیر داخلی معتبر باشد.',
);
const imageUrl = z.string().trim().url().max(2048)
  .refine((v) => v.startsWith('https://'), 'آدرس تصویر باید HTTPS باشد.')
  .nullable().optional();

export const campaignInputSchema = z.object({
  name: text(2, 100, 'نام کمپین'),
  title: text(2, 80, 'عنوان اعلان'),
  body: text(2, 300, 'متن اعلان'),
  imageUrl,
  actionRef: internalPath,
  audience: z.enum(['all', 'team', 'user', 'role']),
  targetId: z.string().trim().max(80).nullable().optional(),
  scheduledAt: z.string().datetime().nullable().optional(),
}).refine((v) => v.audience === 'all' || Boolean(v.targetId), {
  message: 'مخاطب هدف را انتخاب کنید.',
  path: ['targetId'],
});

function publicCampaign(id: string, c: Campaign) {
  return { id, ...c };
}

async function resolveUsers(d: Deps, audience: Audience, targetId: string | null) {
  const where: Array<[string, '==', unknown]> = [['status', '==', 'active']];
  if (audience === 'team') where.push(['teamId', '==', targetId]);
  if (audience === 'role') where.push(['role', '==', targetId]);
  let users = await d.store.query<User>({ collection: 'users', where });
  if (audience === 'user') users = users.filter((u) => u.id === targetId);
  if (!users.length) throw new ApiError('VALIDATION', 'برای این مخاطب کاربر فعالی پیدا نشد.');
  return users;
}

export async function listCampaigns(d: Deps) {
  const docs = await d.store.query<Campaign>({
    collection: 'push_campaigns',
    orderBy: [['updatedAt', 'desc']],
    limit: 200,
  });
  const items = docs.map((c) => publicCampaign(c.id, c));
  return {
    items,
    stats: {
      total: items.length,
      draft: items.filter((c) => c.status === 'draft').length,
      scheduled: items.filter((c) => c.status === 'scheduled').length,
      sent: items.filter((c) => c.status === 'sent').length,
      failed: items.filter((c) => c.status === 'failed' || c.status === 'partial').length,
    },
  };
}

export async function saveCampaign(
  d: Deps,
  actor: Actor,
  input: z.infer<typeof campaignInputSchema>,
  id?: string,
) {
  const now = d.clock().toISOString();
  if (input.scheduledAt && Date.parse(input.scheduledAt) <= Date.parse(now)) {
    throw new ApiError('VALIDATION', 'زمان‌بندی باید در آینده باشد.');
  }
  const path = id ? `push_campaigns/${id}` : `push_campaigns/${d.store.newId()}`;
  const before = id ? await d.store.get<Campaign>(path) : null;
  if (id && !before) throw new ApiError('NOT_FOUND', 'کمپین پیدا نشد.');
  if (before && !['draft', 'scheduled'].includes(before.status)) {
    throw new ApiError('CONFLICT', 'کمپین پس از شروع ارسال قابل ویرایش نیست.');
  }
  const next: Campaign = {
    name: input.name,
    title: input.title,
    body: input.body,
    imageUrl: input.imageUrl ?? null,
    actionRef: input.actionRef,
    audience: input.audience,
    targetId: input.audience === 'all' ? null : input.targetId ?? null,
    status: input.scheduledAt ? 'scheduled' : 'draft',
    scheduledAt: input.scheduledAt ?? null,
    createdAt: before?.createdAt ?? now,
    updatedAt: now,
    createdBy: before?.createdBy ?? actor.id,
    startedAt: null,
    finishedAt: null,
    targetCount: null,
    createdNotifications: 0,
    pushSent: null,
    pushFailed: null,
    pushSkipped: null,
    pushDeferred: null,
    lastError: null,
  };
  await d.store.set(path, next as unknown as Record<string, unknown>);
  await audit(d, actor, before ? 'push_campaign.updated' : 'push_campaign.created', 'push_campaigns', path.split('/')[1]!, before, next);
  return publicCampaign(path.split('/')[1]!, next);
}

export async function sendCampaign(d: Deps, actor: Actor, id: string) {
  return executeCampaign(d, id, actor);
}

async function executeCampaign(d: Deps, id: string, actor?: Actor) {
  const path = `push_campaigns/${id}`;
  const now = d.clock().toISOString();
  const current = await d.store.get<Campaign>(path);
  if (!current) throw new ApiError('NOT_FOUND', 'کمپین پیدا نشد.');
  if (!['draft', 'scheduled'].includes(current.status)) {
    throw new ApiError('CONFLICT', 'این کمپین قبلاً شروع شده یا وضعیت آن اجازه ارسال نمی‌دهد.');
  }
  if (current.scheduledAt && Date.parse(current.scheduledAt) > Date.parse(now)) {
    throw new ApiError('VALIDATION', 'زمان ارسال این کمپین هنوز نرسیده است.');
  }
  // A unique persistent claim is safe across separate Worker isolates; DocStore transactions
  // are not guaranteed to be cross-isolate atomic on every adapter.
  try {
    await d.store.create(`push_campaign_claims/${id}`, {
      claimedAt: now,
      actorId: actor?.id ?? null,
    });
  } catch (error) {
    if (error instanceof StoreConflictError) {
      throw new ApiError('CONFLICT', 'ارسال این کمپین قبلاً آغاز شده است.');
    }
    throw error;
  }
  await d.store.update(path, { status: 'sending', startedAt: now, updatedAt: now, lastError: null });
  const claimed = current;
  try {
    const users = await resolveUsers(d, claimed.audience, claimed.targetId);
    const createdNotifications = await notifyUsers(
      d,
      users.map((u) => u.id),
      'manual',
      { title: claimed.title, body: claimed.body },
      { push: true, imageUrl: claimed.imageUrl, actionRef: claimed.actionRef, campaignId: id },
    );
    const rows = await d.store.query<{ campaignId?: string; pushStatus?: string }>({
      collection: 'notifications',
      where: [['campaignId', '==', id]],
      limit: Math.max(100, users.length + 10),
    });
    const pushSent = rows.filter((n) => n.pushStatus === 'sent').length;
    const pushFailed = rows.filter((n) => n.pushStatus === 'failed').length;
    const pushSkipped = rows.filter((n) => n.pushStatus === 'skipped').length;
    const pushDeferred = rows.filter((n) => n.pushStatus === 'deferred').length;
    const status: CampaignStatus = pushSent > 0 && (pushFailed > 0 || pushSkipped > 0) ? 'partial'
      : pushSent > 0 || (pushDeferred > 0 && pushFailed === 0 && pushSkipped === 0) ? 'sent' : 'failed';
    const finishedAt = d.clock().toISOString();
    await d.store.update(path, {
      status, targetCount: users.length, createdNotifications, pushSent, pushFailed, pushSkipped,
      finishedAt, updatedAt: finishedAt, lastError: null, pushDeferred,
    });
    if (actor) await audit(d, actor, 'push_campaign.sent', 'push_campaigns', id, claimed, { status, targetCount: users.length, createdNotifications, pushSent, pushFailed, pushSkipped, pushDeferred });
    return { id, status, targetCount: users.length, createdNotifications, pushSent, pushFailed, pushSkipped, pushDeferred };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 400) : 'ارسال کمپین ناموفق بود.';
    await d.store.update(path, { status: 'failed', finishedAt: d.clock().toISOString(), updatedAt: d.clock().toISOString(), lastError: message });
    throw error;
  }
}

export async function cancelCampaign(d: Deps, actor: Actor, id: string) {
  const path = `push_campaigns/${id}`;
  const current = await d.store.get<Campaign>(path);
  if (!current) throw new ApiError('NOT_FOUND', 'کمپین پیدا نشد.');
  if (current.status !== 'scheduled' && current.status !== 'draft') {
    throw new ApiError('CONFLICT', 'فقط پیش‌نویس یا کمپین زمان‌بندی‌شده قابل لغو است.');
  }
  const now = d.clock().toISOString();
  // Share the one-time claim namespace with sending so cancel/send races have one winner.
  try {
    await d.store.create(`push_campaign_claims/${id}`, {
      claimedAt: now,
      actorId: actor.id,
      action: 'cancel',
    });
  } catch (error) {
    if (error instanceof StoreConflictError) {
      throw new ApiError('CONFLICT', 'ارسال یا لغو این کمپین قبلاً آغاز شده است.');
    }
    throw error;
  }
  await d.store.update(path, { status: 'cancelled', updatedAt: now });
  await audit(d, actor, 'push_campaign.cancelled', 'push_campaigns', id, current, { status: 'cancelled' });
  return { id, status: 'cancelled' as const };
}

/** Invoked by the existing 15-minute Worker cron. Transactional claim prevents duplicate sends. */
export async function runScheduledCampaigns(d: Deps) {
  const due = await d.store.query<Campaign>({
    collection: 'push_campaigns',
    where: [['status', '==', 'scheduled'], ['scheduledAt', '<=', d.clock().toISOString()]],
    orderBy: [['scheduledAt', 'asc']],
    limit: 20,
  });
  const results: Array<{ id: string; ok: boolean; error?: string }> = [];
  for (const campaign of due) {
    try {
      await executeCampaign(d, campaign.id);
      results.push({ id: campaign.id, ok: true });
    } catch (error) {
      results.push({ id: campaign.id, ok: false, error: error instanceof Error ? error.message.slice(0, 200) : 'failed' });
    }
  }
  return results;
}
