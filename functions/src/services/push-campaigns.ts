import { z } from 'zod';
import { ApiError } from '../http/errors';
import { paginate, text } from '../http/validate';
import { ids } from '../lib/ids';
import type { Doc, Where } from '../store/types';
import { StoreConflictError } from '../store/types';
import type {
  DeviceToken,
  Notification,
  PushBatchStatus,
  PushCampaign,
  PushCampaignAudience,
  PushCampaignBatch,
  PushCampaignStatus,
  PushCampaignSummary,
  User,
} from '../domain/types';
import { sendToDevices } from '../push/dispatch';
import { audit, track, type Actor, type Deps } from './context';

/**
 * Admin push campaigns (studio). Storage: the generic document store (`push_campaigns`,
 * `push_campaign_batches`, `push_campaign_claims`) — no SQL migration is required.
 *
 * Delivery model:
 *  • A campaign is *started* exactly once: a claim document `push_campaign_claims/<id>__start` is
 *    created with the store's atomic `create`; a second start gets a CONFLICT (idempotency).
 *  • Starting snapshots the audience into batches of BATCH_USERS users. Each batch is processed
 *    by one claim per attempt (`<batchId>__<attempt>`), so overlapping runs never send twice.
 *  • An admin's immediate send processes INLINE_BATCHES batches inside the request; the rest (and
 *    every scheduled campaign) is processed by the 15-minute cron job `push-campaigns`, under a
 *    per-run budget of MAX_BATCHES_PER_RUN batches (Cloudflare subrequest limits).
 *  • A batch is retried only when it failed BEFORE any provider request was made. A batch whose
 *    previous run crashed while sending is marked `interrupted` and is never re-sent.
 */

export const BATCH_USERS = 25;
export const INLINE_BATCHES = 2;
export const MAX_BATCHES_PER_RUN = 8;
export const MAX_BATCH_ATTEMPTS = 3;
export const STALE_BATCH_MS = 10 * 60_000;
export const MAX_SCHEDULED_STARTS_PER_RUN = 5;
const BATCH_DETAIL_LIMIT = 200;

const CAMPAIGNS = 'push_campaigns';
const BATCHES = 'push_campaign_batches';
const CLAIMS = 'push_campaign_claims';

const EDITABLE: PushCampaignStatus[] = ['draft', 'scheduled'];
const ACTIVE: PushCampaignStatus[] = ['queued', 'sending'];
const ARCHIVABLE: PushCampaignStatus[] = [
  'draft',
  'cancelled',
  'sent',
  'sent_with_errors',
  'failed',
];
const ROLES = ['marketer', 'manager', 'admin', 'superadmin'] as const;

/** Internal app routes a push may open. Anything else (external URLs, javascript:, data:) is refused. */
const ALLOWED_ROUTE_PREFIXES = [
  '/learn',
  '/packages',
  '/sections',
  '/quiz',
  '/messages',
  '/cards',
  '/mentor',
  '/profile',
];

export function isSafeInternalPath(value: string): boolean {
  if (value.length > 300) return false;
  // Only a plain path with an optional query string: no scheme, no protocol-relative `//`,
  // no backslash, no whitespace, no traversal.
  if (!/^\/[A-Za-z0-9\-_/.]*(\?[A-Za-z0-9=&_\-.%]*)?$/.test(value)) return false;
  if (value.includes('//') || value.includes('..')) return false;
  const path = value.split('?')[0] ?? '/';
  if (path === '/') return true;
  return ALLOWED_ROUTE_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

export function isSafeImageUrl(value: string): boolean {
  if (value.length > 2048 || /\s/.test(value)) return false;
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:' || u.username || u.password) return false;
  const host = u.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host.endsWith('.local') ||
    /^[\d.]+$/.test(host) ||
    host.includes(':')
  )
    return false;
  return true;
}

const audienceSchema = z
  .object({
    type: z.enum(['all', 'team', 'role', 'user'], {
      errorMap: () => ({ message: 'نوع مخاطب معتبر نیست.' }),
    }),
    targetId: z.string().trim().max(80).nullable().optional(),
    channel: z.enum(['any', 'web', 'android']).default('any'),
  })
  .transform((a) => ({
    type: a.type,
    targetId: a.type === 'all' ? null : (a.targetId ?? null),
    channel: a.channel,
  }))
  .refine((a) => a.type === 'all' || !!a.targetId, {
    message: 'مخاطب را انتخاب کنید.',
    path: ['targetId'],
  })
  .refine((a) => a.type !== 'role' || (ROLES as readonly string[]).includes(a.targetId ?? ''), {
    message: 'نقش انتخاب‌شده معتبر نیست.',
    path: ['targetId'],
  });

export const campaignSchema = z.object({
  name: text(2, 80, 'نام داخلی کمپین'),
  title: text(2, 80, 'عنوان اعلان'),
  body: text(2, 300, 'متن اعلان'),
  imageUrl: z
    .string()
    .trim()
    .max(2048)
    .nullable()
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || isSafeImageUrl(v), {
      message: 'آدرس تصویر باید یک لینک عمومی و معتبر با HTTPS باشد.',
    }),
  actionRef: z
    .string()
    .trim()
    .max(300)
    .nullable()
    .optional()
    .transform((v) => v || '/messages')
    .refine(isSafeInternalPath, {
      message: 'مقصد باید یک مسیر داخلی معتبر اپلیکیشن باشد؛ مثل /messages یا /learn.',
    }),
  audience: audienceSchema,
  scheduledAt: z
    .string()
    .trim()
    .nullable()
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || !Number.isNaN(Date.parse(v)), {
      message: 'زمان ارسال معتبر نیست.',
    })
    .transform((v) => (v ? new Date(v).toISOString() : null)),
});

export const campaignUpdateSchema = campaignSchema.extend({
  version: z.number({ required_error: 'نسخه کمپین مشخص نیست.' }).int().min(1),
});

export const audiencePreviewSchema = z.object({ audience: audienceSchema });

export type CampaignInput = z.infer<typeof campaignSchema>;

function emptySummary(batchesTotal = 0): PushCampaignSummary {
  return {
    batchesTotal,
    batchesDone: 0,
    users: 0,
    attempted: 0,
    accepted: 0,
    failed: 0,
    invalid: 0,
    noDevice: 0,
    interrupted: 0,
  };
}

/** Removes anything that looks like a device token or secret before it is stored or shown. */
export function sanitizeError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  return raw.replace(/[A-Za-z0-9_\-:.]{40,}/g, '[hidden]').slice(0, 200);
}

function view(c: Doc<PushCampaign>) {
  const { sendRequestId: _omit, ...rest } = c;
  void _omit;
  return { ...rest, id: c.id };
}

function batchId(campaignId: string, index: number): string {
  return `${campaignId}-${String(index).padStart(5, '0')}`;
}

function notificationIdFor(campaignId: string, userId: string): string {
  return `cmp_${ids.hash(`${campaignId}|${userId}`)}`;
}

function invalidate(field: string, message: string): never {
  throw new ApiError('VALIDATION', message, [{ field, message }]);
}

async function getCampaignOrThrow(d: Deps, id: string): Promise<Doc<PushCampaign>> {
  const c = await d.store.get<PushCampaign>(`${CAMPAIGNS}/${id}`);
  if (!c || c.archivedAt) throw new ApiError('NOT_FOUND', 'کمپین پیدا نشد.');
  return c;
}

// ─── Read model ───────────────────────────────────────────────────────────────

export interface CampaignListQuery {
  limit: number;
  cursor?: string;
  status?: PushCampaignStatus;
  includeArchived?: boolean;
}

export async function listCampaigns(d: Deps, q: CampaignListQuery) {
  const rows = await d.store.query<PushCampaign>({
    collection: CAMPAIGNS,
    orderBy: [['createdAt', 'desc']],
  });
  const filtered = rows.filter(
    (c) => (q.includeArchived || !c.archivedAt) && (!q.status || c.status === q.status),
  );
  const page = paginate(filtered, q.limit, q.cursor);
  return { items: page.items.map(view), nextCursor: page.nextCursor, total: page.total };
}

export async function campaignDetail(d: Deps, id: string) {
  const c = await getCampaignOrThrow(d, id);
  const batches = await d.store.query<PushCampaignBatch>({
    collection: BATCHES,
    where: [['campaignId', '==', id]],
  });
  const sorted = batches.sort((a, b) => a.index - b.index);
  return {
    campaign: view(c),
    batches: sorted.slice(0, BATCH_DETAIL_LIMIT).map((b) => ({
      index: b.index,
      status: b.status,
      users: b.userIds.length,
      attempts: b.attempts,
      attempted: b.attempted,
      accepted: b.accepted,
      failed: b.failed,
      invalid: b.invalid,
      noDevice: b.noDevice,
      lastError: b.lastError,
      startedAt: b.startedAt,
      finishedAt: b.finishedAt,
    })),
    batchesTruncated: sorted.length > BATCH_DETAIL_LIMIT,
  };
}

export async function dashboard(d: Deps) {
  const all = await d.store.query<PushCampaign>({
    collection: CAMPAIGNS,
    orderBy: [['createdAt', 'desc']],
  });
  const live = all.filter((c) => !c.archivedAt);
  const count = (...s: PushCampaignStatus[]) => live.filter((c) => s.includes(c.status)).length;
  const totals = live.reduce(
    (acc, c) => ({
      attempted: acc.attempted + (c.summary?.attempted ?? 0),
      accepted: acc.accepted + (c.summary?.accepted ?? 0),
      failed: acc.failed + (c.summary?.failed ?? 0),
      invalid: acc.invalid + (c.summary?.invalid ?? 0),
    }),
    { attempted: 0, accepted: 0, failed: 0, invalid: 0 },
  );
  return {
    counts: {
      total: live.length,
      draft: count('draft'),
      scheduled: count('scheduled'),
      inProgress: count('queued', 'sending'),
      sent: count('sent', 'sent_with_errors'),
      failed: count('failed'),
      cancelled: count('cancelled'),
    },
    providerRequests: totals,
    recent: live.slice(0, 5).map(view),
  };
}

// ─── Audience ─────────────────────────────────────────────────────────────────

async function tokenIndex(d: Deps): Promise<Map<string, DeviceToken[]>> {
  const rows = await d.store.query<DeviceToken>({ collection: 'device_tokens' });
  const map = new Map<string, DeviceToken[]>();
  for (const t of rows) {
    const list = map.get(t.userId) ?? [];
    list.push(t);
    map.set(t.userId, list);
  }
  return map;
}

/** Resolves the audience from live data. `reachable` = users with a token for the channel. */
async function resolveAudience(
  d: Deps,
  aud: PushCampaignAudience,
  tokens: Map<string, DeviceToken[]>,
): Promise<{ userIds: string[]; reachable: number; webDevices: number; androidDevices: number }> {
  const where: Where[] = [['status', '==', 'active']];
  if (aud.type === 'team') where.push(['teamId', '==', aud.targetId]);
  if (aud.type === 'role') where.push(['role', '==', aud.targetId]);
  let users = await d.store.query<User>({ collection: 'users', where });
  if (aud.type === 'user') users = users.filter((u) => u.id === aud.targetId);
  const platform = aud.channel === 'any' ? null : aud.channel;
  const userIds: string[] = [];
  let reachable = 0;
  let webDevices = 0;
  let androidDevices = 0;
  for (const u of users) {
    const devices = tokens.get(u.id) ?? [];
    for (const t of devices) {
      if (t.platform === 'web') webDevices++;
      else androidDevices++;
    }
    const matching = platform ? devices.filter((t) => t.platform === platform) : devices;
    if (platform && matching.length === 0) continue;
    userIds.push(u.id);
    if (matching.length) reachable++;
  }
  return { userIds: userIds.sort(), reachable, webDevices, androidDevices };
}

export async function audiencePreview(d: Deps, audience: PushCampaignAudience) {
  const tokens = await tokenIndex(d);
  const r = await resolveAudience(d, audience, tokens);
  return {
    users: r.userIds.length,
    withPushDevice: r.reachable,
    webDevices: r.webDevices,
    androidDevices: r.androidDevices,
    note: 'این عدد تقریبی است و در لحظه ارسال دوباره محاسبه می‌شود.',
  };
}

// ─── Write operations ─────────────────────────────────────────────────────────

const MIN_LEAD_MS = 60_000;

function checkSchedule(d: Deps, scheduledAt: string | null) {
  if (scheduledAt && Date.parse(scheduledAt) < d.clock().getTime() + MIN_LEAD_MS)
    invalidate('scheduledAt', 'زمان ارسال باید حداقل ۱ دقیقه در آینده باشد.');
}

export async function createCampaign(d: Deps, actor: Actor, input: CampaignInput) {
  checkSchedule(d, input.scheduledAt);
  const now = d.clock().toISOString();
  const id = d.store.newId();
  const doc: PushCampaign = {
    name: input.name,
    title: input.title,
    body: input.body,
    imageUrl: input.imageUrl,
    actionRef: input.actionRef,
    audience: input.audience,
    status: input.scheduledAt ? 'scheduled' : 'draft',
    scheduledAt: input.scheduledAt,
    targetCount: null,
    pushReachable: null,
    version: 1,
    createdAt: now,
    updatedAt: now,
    createdBy: actor.id,
    updatedBy: actor.id,
    sendRequestId: null,
    startedAt: null,
    finishedAt: null,
    summary: emptySummary(),
    lastError: null,
    archivedAt: null,
  };
  await d.store.create(`${CAMPAIGNS}/${id}`, doc);
  await audit(d, actor, 'push_campaign.created', CAMPAIGNS, id, null, auditView(doc));
  return campaignDetail(d, id);
}

/** Audit trail never stores tokens (they are not part of a campaign) and keeps content only. */
function auditView(c: Partial<PushCampaign>) {
  return {
    name: c.name,
    title: c.title,
    body: c.body,
    imageUrl: c.imageUrl,
    actionRef: c.actionRef,
    audience: c.audience,
    status: c.status,
    scheduledAt: c.scheduledAt,
  };
}

export async function updateCampaign(
  d: Deps,
  actor: Actor,
  id: string,
  input: z.infer<typeof campaignUpdateSchema>,
) {
  const c = await getCampaignOrThrow(d, id);
  if (!EDITABLE.includes(c.status))
    throw new ApiError(
      'CONFLICT',
      'این کمپین در صف ارسال است یا ارسال شده و دیگر قابل ویرایش نیست.',
    );
  if (input.version !== c.version)
    throw new ApiError(
      'CONFLICT',
      'این کمپین هم‌زمان توسط شخص دیگری تغییر کرده است. صفحه را بازخوانی کنید.',
    );
  checkSchedule(d, input.scheduledAt);
  const now = d.clock().toISOString();
  const patch = {
    name: input.name,
    title: input.title,
    body: input.body,
    imageUrl: input.imageUrl,
    actionRef: input.actionRef,
    audience: input.audience,
    scheduledAt: input.scheduledAt,
    status: (input.scheduledAt ? 'scheduled' : 'draft') as PushCampaignStatus,
    version: c.version + 1,
    updatedAt: now,
    updatedBy: actor.id,
  };
  await d.store.update(`${CAMPAIGNS}/${id}`, patch);
  await audit(d, actor, 'push_campaign.updated', CAMPAIGNS, id, auditView(c), auditView(patch));
  return campaignDetail(d, id);
}

export async function cancelCampaign(d: Deps, actor: Actor, id: string) {
  const c = await getCampaignOrThrow(d, id);
  if (!['draft', 'scheduled'].includes(c.status))
    throw new ApiError('CONFLICT', 'فقط کمپین پیش‌نویس یا زمان‌بندی‌شده را می‌توان لغو کرد.');
  const now = d.clock().toISOString();
  await d.store.update(`${CAMPAIGNS}/${id}`, {
    status: 'cancelled',
    scheduledAt: null,
    version: c.version + 1,
    updatedAt: now,
    updatedBy: actor.id,
    finishedAt: now,
  });
  await audit(
    d,
    actor,
    'push_campaign.cancelled',
    CAMPAIGNS,
    id,
    { status: c.status },
    { status: 'cancelled' },
  );
  return campaignDetail(d, id);
}

export async function archiveCampaign(d: Deps, actor: Actor, id: string) {
  const c = await getCampaignOrThrow(d, id);
  if (!ARCHIVABLE.includes(c.status))
    throw new ApiError(
      'CONFLICT',
      c.status === 'scheduled'
        ? 'کمپین زمان‌بندی‌شده را ابتدا لغو کنید، سپس آرشیو کنید.'
        : 'کمپینی که در صف یا در حال ارسال است قابل آرشیو نیست.',
    );
  const now = d.clock().toISOString();
  await d.store.update(`${CAMPAIGNS}/${id}`, {
    archivedAt: now,
    updatedAt: now,
    updatedBy: actor.id,
  });
  await audit(d, actor, 'push_campaign.archived', CAMPAIGNS, id, { status: c.status }, null);
  return { id, archived: true };
}

/**
 * Atomically claims the start of a campaign, snapshots its audience into batches and moves it to
 * `queued`. A second caller gets CONFLICT because the claim document already exists.
 */
async function startCampaign(
  d: Deps,
  c: Doc<PushCampaign>,
  mode: 'immediate' | 'scheduled',
  requestId: string | null,
  actor: Actor | null,
): Promise<void> {
  const claimPath = `${CLAIMS}/${c.id}__start`;
  const now = d.clock().toISOString();
  try {
    await d.store.create(claimPath, { campaignId: c.id, mode, requestId, createdAt: now });
  } catch (e) {
    if (e instanceof StoreConflictError)
      throw new ApiError('CONFLICT', 'این کمپین قبلاً در صف ارسال قرار گرفته است.');
    throw e;
  }
  try {
    const tokens = await tokenIndex(d);
    const audience = await resolveAudience(d, c.audience, tokens);
    if (!audience.userIds.length) {
      if (mode === 'immediate')
        throw new ApiError('VALIDATION', 'هیچ کاربری در این مخاطب نیست.', [
          { field: 'audience', message: 'هیچ کاربری در این مخاطب نیست.' },
        ]);
      // Scheduled runs must not retry forever on an empty audience: fail once, keep the claim.
      await d.store.update(`${CAMPAIGNS}/${c.id}`, {
        status: 'failed',
        lastError: 'در لحظه اجرا هیچ کاربری در این مخاطب نبود.',
        finishedAt: now,
        updatedAt: now,
      });
      return;
    }
    const chunks: string[][] = [];
    for (let i = 0; i < audience.userIds.length; i += BATCH_USERS)
      chunks.push(audience.userIds.slice(i, i + BATCH_USERS));
    await d.store.batchSet(
      chunks.map((userIds, index) => ({
        path: `${BATCHES}/${batchId(c.id, index)}`,
        data: {
          campaignId: c.id,
          index,
          userIds,
          status: 'pending' satisfies PushBatchStatus,
          attempts: 0,
          attempted: 0,
          accepted: 0,
          failed: 0,
          invalid: 0,
          noDevice: 0,
          lastError: null,
          startedAt: null,
          finishedAt: null,
        } satisfies PushCampaignBatch,
      })),
    );
    await d.store.update(`${CAMPAIGNS}/${c.id}`, {
      status: 'queued',
      targetCount: audience.userIds.length,
      pushReachable: audience.reachable,
      startedAt: now,
      sendRequestId: requestId,
      summary: emptySummary(chunks.length),
      lastError: null,
      version: c.version + 1,
      updatedAt: now,
      ...(actor ? { updatedBy: actor.id } : {}),
    });
  } catch (e) {
    // Nothing was sent yet, so releasing the claim lets an admin (or the next cron) try again.
    await d.store.delete(claimPath);
    throw e;
  }
}

/** Admin "send now". Idempotent per `requestId`: a replay returns the current state, no new send. */
export async function sendCampaignNow(d: Deps, actor: Actor, id: string, requestId: string) {
  const c = await getCampaignOrThrow(d, id);
  if (c.sendRequestId === requestId) return campaignDetail(d, id);
  if (!EDITABLE.includes(c.status))
    throw new ApiError('CONFLICT', 'این کمپین قبلاً در صف ارسال قرار گرفته یا ارسال شده است.');
  try {
    await startCampaign(d, c, 'immediate', requestId, actor);
  } catch (e) {
    if (e instanceof ApiError && e.code === 'CONFLICT') {
      const latest = await getCampaignOrThrow(d, id);
      if (latest.sendRequestId === requestId) return campaignDetail(d, id);
    }
    throw e;
  }
  await audit(d, actor, 'push_campaign.send_started', CAMPAIGNS, id, null, { requestId });
  await track(d, 'admin_push_campaign_started', actor.id, { mode: 'immediate' });
  await advanceCampaign(d, id, INLINE_BATCHES);
  return campaignDetail(d, id);
}

// ─── Processing (shared by the admin request and the cron job) ───────────────

async function runBatch(
  d: Deps,
  c: Doc<PushCampaign>,
  b: Doc<PushCampaignBatch>,
  tokens: Map<string, DeviceToken[]>,
): Promise<void> {
  const attempt = b.attempts + 1;
  const claimPath = `${CLAIMS}/${b.id}__${attempt}`;
  const batchPath = `${BATCHES}/${b.id}`;
  const claimed = await tryClaim(d, claimPath, { campaignId: c.id, batch: b.index, attempt });
  if (!claimed) {
    // A claim left behind by a crash *before* the batch was marked `sending` is safe to reclaim:
    // no provider request can have happened yet.
    const old = await d.store.get<{ createdAt: string }>(claimPath);
    const stale = old && d.clock().getTime() - Date.parse(old.createdAt) > STALE_BATCH_MS;
    if (!stale || b.status !== 'pending') return;
    await d.store.delete(claimPath);
    if (!(await tryClaim(d, claimPath, { campaignId: c.id, batch: b.index, attempt }))) return;
  }

  const startedAt = d.clock().toISOString();
  await d.store.update(batchPath, {
    status: 'sending',
    attempts: attempt,
    startedAt,
    finishedAt: null,
    lastError: null,
  });

  const counts = { attempted: 0, accepted: 0, failed: 0, invalid: 0, noDevice: 0 };
  let providerCalled = false;
  let lastError: string | null = null;
  const imageUrl = c.imageUrl ?? undefined;
  try {
    for (const userId of b.userIds) {
      const notifId = notificationIdFor(c.id, userId);
      await createInAppOnce(d, c, userId, notifId, startedAt);
      const devices = (tokens.get(userId) ?? []).filter(
        (t) => c.audience.channel === 'any' || t.platform === c.audience.channel,
      );
      if (!devices.length) {
        counts.noDevice++;
        await d.store.update(`notifications/${notifId}`, { pushStatus: 'skipped' });
        continue;
      }
      providerCalled = true;
      try {
        const res = await sendToDevices(
          d.push,
          devices.map((t) => ({ token: t.token, platform: t.platform })),
          {
            title: c.title,
            body: c.body,
            ...(imageUrl ? { imageUrl } : {}),
            data: {
              notificationId: notifId,
              link: c.actionRef,
              type: 'manual',
              campaignId: c.id,
              ...(imageUrl ? { imageUrl } : {}),
            },
          },
        );
        counts.attempted += devices.length;
        counts.accepted += res.sent;
        counts.failed += Math.max(0, devices.length - res.sent);
        counts.invalid += res.invalidTokens.length;
        for (const bad of res.invalidTokens) await d.store.delete(`device_tokens/${ids.hash(bad)}`);
        await d.store.update(`notifications/${notifId}`, {
          pushStatus: res.sent > 0 ? 'sent' : 'failed',
        });
      } catch (e) {
        counts.attempted += devices.length;
        counts.failed += devices.length;
        lastError = sanitizeError(e);
        await d.store.update(`notifications/${notifId}`, { pushStatus: 'failed' });
      }
    }
    // A batch with no eligible device tokens did not send a Push, even though its
    // in-app notification records were created. Do not report that as a successful Push batch.
    const batchHasErrors = counts.failed > 0 || counts.noDevice > 0;
    const batchStatus: PushBatchStatus = batchHasErrors
      ? counts.accepted === 0
        ? 'failed'
        : 'sent_with_errors'
      : 'sent';
    if (counts.failed > 0 && !lastError)
      lastError = 'بخشی از درخواست‌ها توسط سرویس ارسال پذیرفته نشد.';
    await d.store.update(batchPath, {
      status: batchStatus,
      ...counts,
      lastError,
      finishedAt: d.clock().toISOString(),
    });
  } catch (e) {
    // Retry only when nothing reached the provider; otherwise a retry could send twice.
    const canRetry = !providerCalled && attempt < MAX_BATCH_ATTEMPTS;
    await d.store.update(batchPath, {
      status: canRetry ? 'pending' : 'failed',
      ...counts,
      lastError: sanitizeError(e),
      finishedAt: d.clock().toISOString(),
    });
  }
}

async function tryClaim(d: Deps, path: string, data: Record<string, unknown>): Promise<boolean> {
  try {
    await d.store.create(path, { ...data, createdAt: d.clock().toISOString() });
    return true;
  } catch (e) {
    if (e instanceof StoreConflictError) return false;
    throw e;
  }
}

async function createInAppOnce(
  d: Deps,
  c: Doc<PushCampaign>,
  userId: string,
  notifId: string,
  now: string,
): Promise<void> {
  const n: Notification = {
    userId,
    type: 'manual',
    title: c.title,
    body: c.body,
    actionRef: c.actionRef,
    imageUrl: c.imageUrl,
    campaignId: c.id,
    readAt: null,
    pushStatus: 'none',
    deliverAfter: null,
    createdAt: now,
  };
  try {
    await d.store.create(`notifications/${notifId}`, n as unknown as Record<string, unknown>);
  } catch (e) {
    if (!(e instanceof StoreConflictError)) throw e;
  }
}

/** Recomputes the campaign summary from its batches and sets the final status once nothing is open. */
async function finalize(d: Deps, id: string): Promise<void> {
  const c = await d.store.get<PushCampaign>(`${CAMPAIGNS}/${id}`);
  if (!c) return;
  const batches = await d.store.query<PushCampaignBatch>({
    collection: BATCHES,
    where: [['campaignId', '==', id]],
  });
  const summary = emptySummary(batches.length);
  let failingBatches = 0;
  let open = false;
  for (const b of batches) {
    summary.attempted += b.attempted;
    summary.accepted += b.accepted;
    summary.failed += b.failed;
    summary.invalid += b.invalid;
    summary.noDevice += b.noDevice;
    summary.users += b.userIds.length;
    if (b.status === 'interrupted') summary.interrupted++;
    if (b.status === 'failed' || b.status === 'interrupted') failingBatches++;
    if (b.status === 'pending' || b.status === 'sending') open = true;
    else summary.batchesDone++;
  }
  const now = d.clock().toISOString();
  if (open) {
    await d.store.update(`${CAMPAIGNS}/${id}`, { status: 'sending', summary, updatedAt: now });
    return;
  }
  // Provider rejected every request → failed. Anything partial, failed or interrupted → with errors.
  const nothingAccepted = summary.accepted === 0;
  const hasErrors =
    summary.failed > 0 || summary.noDevice > 0 || failingBatches > 0 || summary.interrupted > 0;
  const shouldFail =
    nothingAccepted &&
    !summary.interrupted &&
    (summary.attempted > 0 || failingBatches > 0 || summary.noDevice > 0);
  const status: PushCampaignStatus = shouldFail
    ? 'failed'
    : hasErrors
      ? 'sent_with_errors'
      : 'sent';
  const hasFailure = status !== 'sent';
  const errorBatch = batches.find((b) => b.lastError);
  await d.store.update(`${CAMPAIGNS}/${id}`, {
    status,
    summary,
    finishedAt: now,
    updatedAt: now,
    lastError: hasFailure ? (errorBatch?.lastError ?? 'بخشی از ارسال ناموفق بود.') : null,
  });
}

/**
 * Processes up to `budget` pending batches of one campaign. Safe to call repeatedly and from
 * several isolates: each batch attempt is guarded by a claim document.
 */
export async function advanceCampaign(d: Deps, id: string, budget: number): Promise<number> {
  const c = await d.store.get<PushCampaign>(`${CAMPAIGNS}/${id}`);
  if (!c || !ACTIVE.includes(c.status)) return 0;
  const batches = await d.store.query<PushCampaignBatch>({
    collection: BATCHES,
    where: [['campaignId', '==', id]],
  });
  const now = d.clock().getTime();
  for (const b of batches) {
    if (b.status === 'sending' && b.startedAt && now - Date.parse(b.startedAt) > STALE_BATCH_MS) {
      // The previous run died after a provider request may have started. Never re-send: mark it.
      await d.store.update(`${BATCHES}/${b.id}`, {
        status: 'interrupted',
        finishedAt: new Date(now).toISOString(),
        lastError: 'اجرای قبلی این بخش کامل نشد؛ برای جلوگیری از ارسال تکراری، دوباره ارسال نشد.',
      });
      b.status = 'interrupted';
    }
  }
  const pending = batches
    .filter((b) => b.status === 'pending')
    .sort((a, b) => a.index - b.index)
    .slice(0, Math.max(0, budget));
  if (pending.length && c.status === 'queued') {
    await d.store.update(`${CAMPAIGNS}/${id}`, {
      status: 'sending',
      updatedAt: d.clock().toISOString(),
    });
  }
  if (pending.length) {
    const tokens = await tokenIndex(d);
    for (const b of pending) await runBatch(d, c, b, tokens);
  }
  await finalize(d, id);
  return pending.length;
}

/** Cron entry point (`push-campaigns`, every 15 min): starts due campaigns and drains active ones. */
export async function runPushCampaigns(d: Deps): Promise<{ started: number; batches: number }> {
  const nowIso = d.clock().toISOString();
  const scheduled = await d.store.query<PushCampaign>({
    collection: CAMPAIGNS,
    where: [['status', '==', 'scheduled']],
  });
  let started = 0;
  for (const c of scheduled
    .filter((x) => !x.archivedAt && x.scheduledAt && x.scheduledAt <= nowIso)
    .sort((a, b) => (a.scheduledAt ?? '').localeCompare(b.scheduledAt ?? ''))
    .slice(0, MAX_SCHEDULED_STARTS_PER_RUN)) {
    try {
      await startCampaign(d, c, 'scheduled', null, null);
      started++;
    } catch (e) {
      if (!(e instanceof ApiError && e.code === 'CONFLICT'))
        console.error('[push-campaigns] start failed', sanitizeError(e));
    }
  }
  let budget = MAX_BATCHES_PER_RUN;
  let batches = 0;
  const active = (
    await d.store.query<PushCampaign>({ collection: CAMPAIGNS, orderBy: [['createdAt', 'asc']] })
  ).filter((c) => !c.archivedAt && ACTIVE.includes(c.status));
  for (const c of active) {
    if (budget <= 0) break;
    const done = await advanceCampaign(d, c.id, budget);
    batches += done;
    budget -= done;
  }
  return { started, batches };
}

export const selfTestSchema = z.object({
  title: z.string().trim().min(1).max(65),
  body: z.string().trim().min(1).max(240),
  imageUrl: z
    .string()
    .trim()
    .max(2048)
    .optional()
    .refine((v) => !v || isSafeImageUrl(v), 'آدرس تصویر باید HTTPS معتبر باشد.'),
  actionRef: z
    .string()
    .trim()
    .max(300)
    .optional()
    .refine((v) => !v || isSafeInternalPath(v), 'مقصد باید یک مسیر داخلی باشد.'),
});

/** Sends the draft's notification only to the calling admin's own devices and reports each outcome. */
export async function sendSelfTest(d: Deps, actor: Actor, input: z.infer<typeof selfTestSchema>) {
  const devices = await d.store.query<{ token: string; platform: 'web' | 'android' }>({
    collection: 'device_tokens',
    where: [['userId', '==', actor.id]],
  });
  if (!devices.length) return { devices: 0, accepted: 0, results: [] as unknown[] };
  const res = await sendToDevices(
    d.push,
    devices.map((t) => ({ token: t.token, platform: t.platform })),
    {
      title: input.title,
      body: input.body,
      ...(input.imageUrl ? { imageUrl: input.imageUrl } : {}),
      data: {
        notificationId: `selftest_${d.clock().getTime()}`,
        link: input.actionRef || '/messages',
        type: 'manual',
      },
    },
  );
  for (const bad of res.invalidTokens) await d.store.delete(`device_tokens/${ids.hash(bad)}`);
  return { devices: devices.length, accepted: res.sent, results: res.details };
}
