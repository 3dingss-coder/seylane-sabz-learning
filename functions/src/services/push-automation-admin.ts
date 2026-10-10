import { z } from 'zod';
import { DAY, dayKey } from '../lib/time';
import type { Doc } from '../store/types';
import type {
  NotificationPrefs,
  PushAutomation,
  PushAutomationRun,
  PushAutomationSettings,
  User,
} from '../domain/types';
import {
  CATEGORY_HINTS,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  PROTECTED_CATEGORIES,
  type NotificationCategory,
} from '../domain/notification-categories';
import { ApiError } from '../http/errors';
import { text } from '../http/validate';
import { audit, getPolicy, SYSTEM, type Actor, type Deps } from './context';
import { DEFAULT_TEMPLATES, getTemplates, render } from './notify';
import {
  AUTOMATION_DESTINATIONS,
  CATALOG_KEYS,
  EVENT_LABELS,
  WEEKDAYS,
  CRITICAL_AUTOMATION_KEYS,
  FACT_FIELDS,
  PUSH_AUTOMATION_CATALOG,
  TRIGGER_KIND_LABELS,
  VARIABLE_PALETTE,
  type CatalogEntry,
} from './push-automation-catalog';
import {
  AUTOMATIONS,
  automationMessageSchema,
  isSafePathTemplate,
  isSystemGate,
  loadAutomations,
  readCounter,
  readPrefs,
  readSettings,
  recentDecisions,
  settingsSchema,
  RUNS,
  SETTINGS,
  skipLabel,
  TEXT_REVISIONS,
  windowReached,
  writeSettings,
  type SkipReason,
} from './push-automation-governor';
import { AUTOMATION_PATH_VARS, AUTOMATION_VAR_NAMES } from './push-automation-catalog';
import {
  buildSweepContext,
  evaluateSweep,
  eventVars,
  factsForRule,
  sendAutomation,
  resolveVars,
  sweepUsers,
} from './push-automation-engine';

/**
 * Admin/CRUD side of the automation panel: the catalogue is data, this file is the shape the panel
 * reads and writes. Kept apart from the governor so «what decides a send» and «what an admin edits»
 * stay two different questions — and so the engine never has to import HTTP validation.
 *
 * Every write here is audited (`audit(...)`) and bumps `version`, which is what makes an accidental
 * double-click visible in the history instead of silently overwriting a text.
 */

// ─── Validation ──────────────────────────────────────────────────────────────

export const AUTOMATION_KEY = /^[a-z0-9][a-z0-9_]{2,39}$/;

const triggerSchema = z.object({
  kind: z.enum([
    'event',
    'event_delay',
    'inactivity',
    'schedule_daily',
    'schedule_weekly',
    'condition',
  ]),
  event: z.string().trim().max(60).nullish(),
  delayMinutes: z
    .number()
    .int()
    .min(1)
    .max(7 * 24 * 60)
    .nullish(),
  inactivityDays: z.number().int().min(1).max(60).nullish(),
  ladderGroup: z.string().trim().max(30).nullish(),
  time: z
    .string()
    .trim()
    .regex(/^([01]?\d|2[0-3]):[0-5]\d$/, 'ساعت را به قالب HH:mm بنویسید.')
    .nullish(),
  weekday: z.number().int().min(0).max(6).nullish(),
  conditions: z
    .array(
      z.object({
        field: z.string().trim().max(40),
        op: z.enum(['gte', 'lte', 'eq', 'neq']),
        value: z.union([z.number(), z.string().max(40), z.boolean()]),
      }),
    )
    .max(6)
    .nullish(),
});

const audienceSchema = z.object({
  type: z.enum(['all', 'team', 'role', 'user']),
  targetId: z.string().trim().max(60).nullish(),
  channel: z.enum(['any', 'web', 'android']).default('any'),
});

const deliverySchema = z.object({
  priority: z.enum(['urgent', 'high', 'normal', 'low']),
  push: z.boolean(),
  inApp: z.boolean(),
  respectQuietHours: z.boolean(),
  cooldownMs: z
    .number()
    .int()
    .min(0)
    .max(180 * DAY),
  maxPerUserPerDay: z.number().int().min(0).max(20).nullish(),
  sendOnce: z.boolean().nullish(),
  aggregateForManager: z.boolean().nullish(),
});

export const automationSchema = z.object({
  key: z
    .string()
    .trim()
    .regex(AUTOMATION_KEY, 'کلید باید کوچک، لاتین و یکتا باشد؛ مثل inactive_1d.'),
  name: text(2, 60, 'نام'),
  description: text(2, 300, 'توضیح'),
  category: z.enum(CATEGORY_ORDER as [NotificationCategory, ...NotificationCategory[]]),
  audienceRole: z.enum(['marketer', 'manager', 'admin', 'all']),
  enabled: z.boolean().default(false),
  trigger: triggerSchema,
  audience: audienceSchema,
  message: automationMessageSchema,
  delivery: deliverySchema,
  supersedes: z.array(z.string().max(40)).max(8).nullish(),
  optInOnly: z.boolean().nullish(),
});

export const automationPatchSchema = automationSchema
  .omit({ key: true })
  .partial()
  .extend({
    /** Required to switch a deadline-critical automation off (spec: no silent loss of coverage). */
    confirmCritical: z.boolean().optional(),
    /** Optimistic concurrency: the version the admin opened in the wizard. */
    expectedVersion: z.number().int().min(1).optional(),
  });

/** The store keeps `null`, not `undefined`, so optional inputs are normalised once here. */
function normAudience(aud: z.infer<typeof audienceSchema>): PushAutomation['audience'] {
  return { type: aud.type, targetId: aud.targetId ?? null, channel: aud.channel ?? 'any' };
}

/** Cross-field rules a plain object schema cannot express. */
function validateSemantics(input: {
  trigger: PushAutomation['trigger'];
  audience: { type: string; targetId?: string | null };
  message: PushAutomation['message'];
}): void {
  const t = input.trigger;
  const bad = (msg: string): never => {
    throw new ApiError('VALIDATION', msg);
  };
  if ((t.kind === 'event' || t.kind === 'event_delay') && !t.event)
    bad('برای.trigger از نوع اتفاق، نام اتفاق لازم است.');
  if (t.kind === 'event_delay' && !t.delayMinutes)
    bad('برای اتفاق با تأخیر، تعداد دقیقه لازم است.');
  if (t.kind === 'inactivity' && !t.inactivityDays) bad('برای بی‌فعالیتی، تعداد روز لازم است.');
  if (t.kind === 'condition' && !(t.conditions ?? []).length)
    bad('حداقل یک شرط لازم است؛ مثلاً پیشرفت کمتر از ۸۰.');
  if (t.kind === 'condition') {
    const known = new Set(FACT_FIELDS.map((f) => f.field));
    for (const c of t.conditions ?? [])
      if (!known.has(c.field)) bad(`شرط «${c.field}» در فهرست داده‌های قابل محاسبه نیست.`);
  }
  if (t.kind === 'schedule_weekly' && (t.weekday ?? null) === null)
    bad('برای برنامه هفتگی، روز هفته لازم است.');
  if (input.audience.type !== 'all' && !input.audience.targetId)
    bad('برای مخاطب تیمی/نقشی/فردی، شناسه هدف لازم است.');
  const used = [...`${input.message.title} ${input.message.body}`.matchAll(/\{(\w+)\}/g)].map(
    (m) => m[1] as string,
  );
  for (const v of used)
    if (!AUTOMATION_VAR_NAMES.includes(v)) bad(`متغیر «{${v}}» شناخته‌شده نیست.`);
}

// ─── Catalogue seeding ───────────────────────────────────────────────────────

function toAutomation(entry: CatalogEntry, actor: Actor, now: string): PushAutomation {
  return {
    ...entry,
    // A gate in front of an existing template is seeded ON: switching it off would remove behaviour
    // the product has today, which the enable-everything-disabled rule must never do.
    ...(entry.templateKey ? { enabled: true } : {}),
    audience: { type: 'role', targetId: entry.audienceRole, channel: 'any' },
    version: 1,
    createdAt: now,
    updatedAt: now,
    createdBy: actor.id,
    updatedBy: actor.id,
    stats: null,
  } as PushAutomation;
}

/**
 * Creates the catalogue documents that do not exist yet — never touches an existing one, so a
 * re-deploy cannot undo an admin's edit. Everything arrives `enabled: false` (spec §4.1). Idempotent.
 */
export async function seedCatalog(
  d: Deps,
  actor: Actor,
): Promise<{ created: string[]; existing: number; total: number }> {
  const now = d.clock().toISOString();
  const existing = new Set((await loadAutomations(d)).map((a) => a.id));
  const created: string[] = [];
  const items: Array<{ path: string; data: Record<string, unknown> }> = [];
  for (const entry of PUSH_AUTOMATION_CATALOG) {
    if (existing.has(entry.key)) continue;
    items.push({
      path: `${AUTOMATIONS}/${entry.key}`,
      data: toAutomation(entry, actor, now) as unknown as Record<string, unknown>,
    });
    created.push(entry.key);
  }
  if (items.length) await d.store.batchSet(items);
  if (created.length)
    await audit(d, actor, 'push_automation.seeded', SETTINGS, 'global', null, { created });
  return { created, existing: existing.size, total: CATALOG_KEYS.length };
}

// ─── Reads ───────────────────────────────────────────────────────────────────

export interface AutomationRow {
  key: string;
  name: string;
  description: string;
  category: NotificationCategory;
  categoryLabel: string;
  triggerKind: string;
  triggerLabel: string;
  enabled: boolean;
  isSystem: boolean;
  isGate: boolean;
  templateKey: string | null;
  requiresFeature: string | null;
  optInOnly: boolean;
  priority: string;
  push: boolean;
  audienceLabel: string;
  timeLabel: string;
  dueNow: boolean;
  lastRunAt: string | null;
  sent7d: number;
  skipped7d: number;
  version: number;
}

export interface AutomationList {
  rows: AutomationRow[];
  paused: boolean;
  settings: PushAutomationSettings;
  counts: { total: number; enabled: number; gates: number; v2: number };
  today: { sent: number; skipped: Record<string, number> };
}

/**
 * Small request schemas the panel posts. Kept next to the service so the route file stays a list of
 * «what is callable», exactly like the campaign studio does it.
 */
export const pauseSchema = z.object({ paused: z.boolean() });
export const runNowSchema = z.object({ force: z.boolean().default(true) });
export const enabledSchema = z.object({
  enabled: z.boolean(),
  confirmCritical: z.boolean().optional(),
});
export const testSendSchema = z.object({ userId: text(3, 60, 'کاربر') });
export const runsQuery = z.object({
  key: z.string().trim().max(40).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(30),
});

export async function listAutomations(d: Deps): Promise<AutomationList> {
  const settings = await readSettings(d);
  let all = await loadAutomations(d);
  if (!all.length) {
    // First opening of the panel after a deploy: the catalogue arrives with it. Nothing is ever
    // overwritten afterwards, so an admin's edits survive the next deployment.
    await seedCatalog(d, SYSTEM);
    all = await loadAutomations(d);
  }
  const policy = await getPolicy(d);
  const today = dayKey(d.clock(), policy.timezone);
  const rows: AutomationRow[] = [];
  const runAgg: Record<string, number> = {};
  let sentToday = 0;
  for (const r of await recentRuns(d, { limit: 80 })) {
    if (!r.startedAt.startsWith(today)) continue;
    sentToday += r.sent;
    for (const [k, v] of Object.entries(r.skipped ?? {})) runAgg[k] = (runAgg[k] ?? 0) + v;
  }
  let enabled = 0;
  let gates = 0;
  let v2 = 0;
  for (const a of all) {
    const gate = isSystemGate(a);
    if (a.enabled) enabled++;
    if (gate) gates++;
    if (a.requiresFeature) v2++;
    rows.push({
      key: a.key,
      name: a.name,
      description: a.description,
      category: a.category as NotificationCategory,
      categoryLabel: CATEGORY_LABELS[a.category as NotificationCategory] ?? a.category,
      triggerKind: a.trigger.kind,
      triggerLabel: TRIGGER_KIND_LABELS[a.trigger.kind] ?? a.trigger.kind,
      enabled: a.enabled,
      isSystem: a.isSystem,
      isGate: gate,
      templateKey: a.templateKey ?? null,
      requiresFeature: a.requiresFeature ?? null,
      optInOnly: !!a.optInOnly,
      priority: a.delivery.priority,
      push: a.delivery.push,
      audienceLabel: audienceLabel(a),
      timeLabel: timeLabel(a),
      dueNow: a.enabled && !a.requiresFeature ? await windowReached(d, a) : false,
      lastRunAt: a.stats?.lastRunAt ?? null,
      sent7d: a.stats?.sent7d ?? 0,
      skipped7d: a.stats?.skipped7d ?? 0,
      version: a.version,
    });
  }
  rows.sort((x, y) => rank(x) - rank(y) || x.key.localeCompare(y.key));
  return {
    rows,
    paused: settings.paused,
    settings,
    counts: { total: all.length, enabled, gates, v2 },
    today: { sent: sentToday, skipped: runAgg },
  };
}

const rank = (r: AutomationRow): number =>
  r.requiresFeature ? 3 : !r.enabled ? 1 : r.dueNow ? 0 : 2;

function audienceLabel(a: PushAutomation): string {
  const aud = a.audience;
  if (aud.type === 'team') return `تیم ${aud.targetId ?? ''}`.trim();
  if (aud.type === 'user') return `فرد ${aud.targetId ?? ''}`.trim();
  if (aud.type === 'role') return ROLE_LABELS[aud.targetId ?? ''] ?? `نقش ${aud.targetId ?? ''}`;
  return ROLE_LABELS[a.audienceRole] ?? 'همه';
}

const ROLE_LABELS: Record<string, string> = {
  marketer: 'بازاریاب‌ها',
  manager: 'مدیران',
  admin: 'ادمین‌ها',
  all: 'همه کاربران',
};

function timeLabel(a: PushAutomation): string {
  const t = a.trigger;
  if (t.kind === 'event') return 'اتفاق';
  if (t.kind === 'event_delay') return `+${t.delayMinutes ?? 0} دقیقه`;
  return t.time ?? '—';
}

export interface AutomationDetail extends AutomationRow {
  trigger: PushAutomation['trigger'];
  audience: PushAutomation['audience'];
  message: PushAutomation['message'];
  delivery: PushAutomation['delivery'];
  supersedes: string[];
  /** For a system gate: the text the template editor owns, shown read-only here. */
  effectiveMessage: { title: string; body: string; source: 'template' | 'automation' } | null;
  variables: typeof VARIABLE_PALETTE;
  destinations: typeof AUTOMATION_DESTINATIONS;
  updatedAt: string;
  updatedBy: string | null;
  createdBy: string;
  canDelete: boolean;
  needsCriticalConfirm: boolean;
  /** The population the sweep walks while `audience.type === 'all'` — the editor round-trips it. */
  audienceRole: PushAutomation['audienceRole'];
}

export async function automationDetail(d: Deps, key: string): Promise<AutomationDetail> {
  const a = await mustGet(d, key);
  const list = await listAutomations(d);
  const row = list.rows.find((r) => r.key === key);
  let effectiveMessage: AutomationDetail['effectiveMessage'] = null;
  if (a.templateKey && DEFAULT_TEMPLATES[a.templateKey as keyof typeof DEFAULT_TEMPLATES]) {
    const templates = await getTemplates(d);
    const tpl = templates.find((t) => t.key === a.templateKey);
    effectiveMessage = {
      title: tpl?.title ?? DEFAULT_TEMPLATES[a.templateKey as keyof typeof DEFAULT_TEMPLATES].title,
      body: tpl?.body ?? DEFAULT_TEMPLATES[a.templateKey as keyof typeof DEFAULT_TEMPLATES].body,
      source: 'template',
    };
  }
  return {
    ...(row ?? ({} as AutomationRow)),
    key: a.key,
    name: a.name,
    description: a.description,
    category: a.category as NotificationCategory,
    categoryLabel: CATEGORY_LABELS[a.category as NotificationCategory] ?? a.category,
    triggerKind: a.trigger.kind,
    triggerLabel: TRIGGER_KIND_LABELS[a.trigger.kind] ?? a.trigger.kind,
    enabled: a.enabled,
    isSystem: a.isSystem,
    isGate: isSystemGate(a),
    templateKey: a.templateKey ?? null,
    requiresFeature: a.requiresFeature ?? null,
    optInOnly: !!a.optInOnly,
    priority: a.delivery.priority,
    push: a.delivery.push,
    audienceLabel: audienceLabel(a),
    timeLabel: timeLabel(a),
    dueNow: row?.dueNow ?? false,
    lastRunAt: a.stats?.lastRunAt ?? null,
    sent7d: a.stats?.sent7d ?? 0,
    skipped7d: a.stats?.skipped7d ?? 0,
    version: a.version,
    trigger: a.trigger,
    audience: a.audience,
    message: a.message,
    delivery: a.delivery,
    supersedes: a.supersedes ?? [],
    effectiveMessage,
    variables: VARIABLE_PALETTE,
    destinations: AUTOMATION_DESTINATIONS,
    updatedAt: a.updatedAt,
    updatedBy: a.updatedBy ?? null,
    createdBy: a.createdBy,
    canDelete: !a.isSystem,
    needsCriticalConfirm: CRITICAL_AUTOMATION_KEYS.includes(a.key),
    audienceRole: a.audienceRole,
  };
}

async function mustGet(d: Deps, key: string): Promise<Doc<PushAutomation>> {
  if (!AUTOMATION_KEY.test(key)) throw new ApiError('NOT_FOUND', 'اتوماسیون پیدا نشد.');
  const doc = await d.store.get<PushAutomation>(`${AUTOMATIONS}/${key}`);
  if (!doc) throw new ApiError('NOT_FOUND', 'اتوماسیون پیدا نشد.');
  return { ...doc, id: key } as Doc<PushAutomation>;
}

// ─── Writes ──────────────────────────────────────────────────────────────────

export async function createAutomation(
  d: Deps,
  actor: Actor,
  input: z.infer<typeof automationSchema>,
): Promise<Doc<PushAutomation>> {
  validateSemantics(input);
  if (CATALOG_KEYS.includes(input.key))
    throw new ApiError('CONFLICT', 'این کلید در کاتالوگ سیستمی وجود دارد؛ آن را ویرایش کنید.');
  const existing = await d.store.get(`${AUTOMATIONS}/${input.key}`);
  if (existing) throw new ApiError('CONFLICT', 'اتوماسیونی با همین کلید وجود دارد.');
  const now = d.clock().toISOString();
  const doc: PushAutomation = {
    ...input,
    audience: normAudience(input.audience),
    isSystem: false,
    templateKey: null,
    requiresFeature: null,
    category: input.category,
    version: 1,
    createdAt: now,
    updatedAt: now,
    createdBy: actor.id,
    updatedBy: actor.id,
    stats: null,
  };
  await d.store.set(`${AUTOMATIONS}/${input.key}`, doc as unknown as Record<string, unknown>);
  await audit(d, actor, 'push_automation.created', AUTOMATIONS, input.key, null, input);
  return { ...doc, id: input.key } as Doc<PushAutomation>;
}

/**
 * Applies a patch. A disabled→enabled flip of a critical automation (or switching it off) needs
 * `confirmCritical`; the old document is kept as `push_automation_text_revs/<key>/<version>` so a
 * wording change can always be read back (spec §6.6).
 */
export async function updateAutomation(
  d: Deps,
  actor: Actor,
  key: string,
  patch: z.infer<typeof automationPatchSchema>,
): Promise<Doc<PushAutomation>> {
  const cur = await mustGet(d, key);
  const { confirmCritical, expectedVersion, audience: audienceIn, ...body } = patch;
  if (expectedVersion !== undefined && expectedVersion !== cur.version)
    throw new ApiError('CONFLICT', 'این اتوماسیون هم‌زمان ویرایش شده است؛ صفحه را بازخوانی کنید.');
  const next: PushAutomation = {
    ...cur,
    ...body,
    ...(audienceIn ? { audience: normAudience(audienceIn) } : {}),
    // Fields a custom automation may never gain, and gates keep their identity.
    key: cur.key,
    isSystem: cur.isSystem,
    templateKey: cur.templateKey ?? null,
    requiresFeature: cur.requiresFeature ?? null,
    version: cur.version + 1,
    updatedAt: d.clock().toISOString(),
    updatedBy: actor.id,
  };
  validateSemantics(next);
  if (next.enabled !== cur.enabled && CRITICAL_AUTOMATION_KEYS.includes(key) && !confirmCritical)
    throw new ApiError(
      'CONFLICT',
      next.enabled
        ? 'روشن‌کردن این اتوماسیون رفتار یادآوری‌های مهلت را تغییر می‌دهد؛ تأیید کنید.'
        : 'خاموش‌کردن این اتوماسیون زنجیره پیگیری مهلت را می‌شکند؛ تأیید کنید.',
    );
  if (next.enabled && next.requiresFeature)
    throw new ApiError('VALIDATION', 'این سناریو نیازمند داده‌ای است که هنوز محاسبه نمی‌شود.');
  await d.store.set(`${AUTOMATIONS}/${key}`, next as unknown as Record<string, unknown>);
  await d.store.set(`${TEXT_REVISIONS}/${key}/${cur.version}`, {
    key,
    version: cur.version,
    at: d.clock().toISOString(),
    by: actor.id,
    message: cur.message,
    delivery: cur.delivery,
    note: describeChange(body),
    expireAt: new Date(d.clock().getTime() + 180 * DAY).toISOString(),
  });
  await audit(d, actor, 'push_automation.updated', AUTOMATIONS, key, cur, diff(cur, next));
  return { ...next, id: key } as Doc<PushAutomation>;
}

/** One-line Persian summary of what changed, shown in the version history. */
function describeChange(body: Record<string, unknown>): string {
  const parts: string[] = [];
  if (body.message) parts.push('متن');
  if (body.delivery) parts.push('نحوه ارسال');
  if (body.trigger) parts.push('زمان‌بندی');
  if (body.audience) parts.push('مخاطب');
  if (body.name) parts.push('نام');
  if (body.enabled !== undefined) parts.push(body.enabled ? 'روشن' : 'خاموش');
  return parts.length ? `ویرایش: ${parts.join('، ')}` : 'ویرایش';
}

function diff(cur: PushAutomation, next: PushAutomation): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(next) as (keyof PushAutomation)[]) {
    if (k === 'version' || k === 'updatedAt' || k === 'updatedBy' || k === 'stats') continue;
    if (JSON.stringify(cur[k]) !== JSON.stringify(next[k])) out[k as string] = next[k];
  }
  return out;
}

/** Small standalone switch for the list view (no wizard, no full patch). */
export async function setAutomationEnabled(
  d: Deps,
  actor: Actor,
  key: string,
  enabled: boolean,
  confirmCritical = false,
): Promise<Doc<PushAutomation>> {
  return updateAutomation(d, actor, key, {
    enabled,
    ...(confirmCritical ? { confirmCritical: true } : {}),
  });
}

/** Only custom automations can be deleted; a catalogue entry is disabled instead (spec §6.1). */
export async function deleteAutomation(
  d: Deps,
  actor: Actor,
  key: string,
): Promise<{ deleted: true }> {
  const cur = await mustGet(d, key);
  if (cur.isSystem)
    throw new ApiError('CONFLICT', 'سناریوی کاتالوگ حذف نمی‌شود؛ آن را خاموش کنید.');
  await d.store.delete(`${AUTOMATIONS}/${key}`);
  await audit(d, actor, 'push_automation.deleted', AUTOMATIONS, key, cur, null);
  return { deleted: true };
}

export async function setPaused(
  d: Deps,
  actor: Actor,
  paused: boolean,
): Promise<{ paused: boolean }> {
  const settings = await readSettings(d);
  await writeSettings(d, actor, {
    ...settings,
    paused,
  });
  await audit(
    d,
    actor,
    paused ? 'push_automation.paused' : 'push_automation.resumed',
    SETTINGS,
    'global',
    null,
    {
      paused,
    },
  );
  return { paused };
}

export async function updateGlobalSettings(
  d: Deps,
  actor: Actor,
  input: z.infer<typeof settingsSchema>,
): Promise<PushAutomationSettings> {
  return writeSettings(d, actor, input);
}

// ─── Dry-run, test send, runs, trace ─────────────────────────────────────────

export interface DryRunResult {
  key: string;
  windowKey: string;
  evaluated: number;
  wouldSend: number;
  skipped: Record<string, number>;
  skippedLabels: Array<{ reason: string; count: number; label: string }>;
  sample: Array<{ userId: string; name: string; title: string; body: string; reason: string }>;
  note: string | null;
}

/**
 * «چهsomething اتفاقی می‌افتد؟» without touching anything: same evaluation path as the real sweep,
 * with `dry: true`, so no claim, no counter and no provider call. This is what the wizard's last step shows.
 */
export async function dryRun(d: Deps, key: string): Promise<DryRunResult> {
  const a = await mustGet(d, key);
  const settings = await readSettings(d);
  const policy = await getPolicy(d);
  const users = await sweepUsers(d);
  const ctx = await buildSweepContext(d, users, { health: a.category === 'health' });
  const sweep = await evaluateSweep(d, { ...a, enabled: true }, ctx, { dry: true, settings });
  const sample: DryRunResult['sample'] = [];
  for (const m of sweep.matched.slice(0, 12)) {
    const u = users.find((x) => x.id === m.userId);
    if (!u) continue;
    const vars = resolveVars(
      u,
      ctx.packagesByUser.get(u.id) ?? [],
      ctx.nextByUser.get(u.id) ?? null,
      factsForRule({ ...a, enabled: true }, ctx, u),
    );
    sample.push({
      userId: u.id,
      name: u.name,
      title: render(a.message.title, vars),
      body: render(a.message.body, vars),
      reason: m.reason,
    });
  }
  return {
    key,
    windowKey: dayKey(d.clock(), policy.timezone),
    evaluated: sweep.evaluated,
    wouldSend: sweep.sent,
    skipped: sweep.skipped,
    skippedLabels: Object.entries(sweep.skipped)
      .map(([reason, count]) => ({ reason, count, label: skipLabel(reason) }))
      .sort((x, y) => y.count - x.count),
    sample,
    note: a.requiresFeature
      ? 'این سناریو هنوز اجرا نمی‌شود: داده‌ی لازم محاسبه نمی‌شود.'
      : !a.enabled
        ? 'اتوماسیون خاموش است؛ این فقط برآورد مشمولان است.'
        : null,
  };
}

/** «ارسال آزمایشی» for one user: bypasses caps/cooldown, never counted, always audited. */
export async function testSend(
  d: Deps,
  actor: Actor,
  key: string,
  userId: string,
): Promise<{
  sent: boolean;
  reason?: SkipReason;
  label?: string;
  preview: { title: string; body: string };
}> {
  const a = await mustGet(d, key);
  const user = await d.store.get<User>(`users/${userId}`);
  if (!user) throw new ApiError('NOT_FOUND', 'کاربر پیدا نشد.');
  const vars = await testVars(d, a, user as Doc<User>);
  const preview = { title: render(a.message.title, vars), body: render(a.message.body, vars) };
  const settings = await readSettings(d);
  const r = await sendAutomation(d, { ...a, enabled: true }, user as Doc<User>, vars, {
    settings,
    test: true,
    kind: 'manual',
  });
  await audit(d, actor, 'push_automation.test_sent', AUTOMATIONS, key, null, {
    userId,
    sent: r.sent,
    ...(r.sent ? {} : { reason: r.reason }),
  });
  return {
    sent: r.sent,
    ...(r.sent ? {} : { reason: r.reason, label: skipLabel(r.reason) }),
    preview,
  };
}

/** Test sends use real data when the engine can supply it, so what you see is what would be sent. */
async function testVars(
  d: Deps,
  a: PushAutomation,
  user: Doc<User>,
): Promise<Record<string, string | number>> {
  return eventVars(d, user, a);
}

export interface RunRow extends PushAutomationRun {
  id: string;
  label: string;
  /** The Persian wording of each skip reason, from `skipLabel()` — the panel renders, it does not translate. */
  skippedLabels: Array<{ reason: string; count: number; label: string }>;
}

export async function recentRuns(
  d: Deps,
  q: { key?: string | null; limit?: number } = {},
): Promise<RunRow[]> {
  const rows = await d.store.query<PushAutomationRun>({ collection: RUNS });
  const all = rows
    .filter((r) => (q.key ? r.key === q.key : true))
    .sort((x, y) => y.startedAt.localeCompare(x.startedAt))
    .slice(0, Math.max(1, Math.min(200, q.limit ?? 30)));
  const automations = q.key ? [] : await loadAutomations(d);
  const nameOf = (key: string) =>
    automations.find((a) => a.key === key)?.name ??
    PUSH_AUTOMATION_CATALOG.find((c) => c.key === key)?.name ??
    key;
  return all.map((r) => ({
    ...r,
    id: r.id,
    label: nameOf(r.key),
    // Same shape as `dryRun().skippedLabels`: the run row stores the raw reason codes, and the only
    // reader of that list is a person, so it is translated here (prompt §7: the panel explains).
    skippedLabels: Object.entries(r.skipped ?? {})
      .map(([reason, count]) => ({ reason, count, label: skipLabel(reason) }))
      .sort((x, y) => y.count - x.count),
  }));
}

/** One archived wording of an automation (`push_automation_text_revs/<key>/<version>`). */
export interface AutomationTextRevision {
  version: number;
  at: string;
  by: string | null;
  note: string;
  message: PushAutomation['message'];
  delivery: PushAutomation['delivery'];
}

/**
 * «نسخه‌بندی متن»: every write archives the text it replaced, so an admin can read what the sentence
 * used to be and who changed it. Newest first, capped — the archive itself is kept for 180 days
 * (`updateAutomation`) and the panel never needs more than a screenful.
 */
export async function listTextRevisions(
  d: Deps,
  key: string,
  limit = 20,
): Promise<AutomationTextRevision[]> {
  await mustGet(d, key); // unknown or malformed key → the same 404 the detail page gives
  const rows = await d.store.query<{
    version?: number;
    at?: string;
    by?: string | null;
    note?: string;
    message?: PushAutomation['message'];
    delivery?: PushAutomation['delivery'];
  }>({ collection: `${TEXT_REVISIONS}/${key}` });
  return rows
    .filter((r) => r.message && r.delivery)
    .map((r) => ({
      version: r.version ?? 0,
      at: r.at ?? '',
      by: r.by ?? null,
      note: r.note ?? '',
      message: r.message as PushAutomation['message'],
      delivery: r.delivery as PushAutomation['delivery'],
    }))
    .sort((x, y) => y.version - x.version)
    .slice(0, Math.max(1, Math.min(50, limit)));
}

export interface TraceResult {
  userId: string;
  name: string;
  prefs: NotificationPrefs | null;
  counter: Awaited<ReturnType<typeof readCounter>>;
  decisions: Array<{
    at: string;
    key: string;
    reason: string;
    label: string;
    detail: string | null;
  }>;
  notifications: Array<{
    at: string;
    title: string;
    body: string;
    key: string | null;
    pushStatus: string;
  }>;
}

/** «این کاربر دقیقاً چرا پوش گرفت/نگرفت؟» — the decision log next to what actually arrived. */
export async function traceUser(d: Deps, userId: string, limit = 40): Promise<TraceResult> {
  const [user, prefs, counter, decisions, notes] = await Promise.all([
    d.store.get<User>(`users/${userId}`),
    readPrefs(d, userId),
    readCounter(d, userId),
    recentDecisions(d, userId, limit),
    d.store.query<{
      title: string;
      body: string;
      automationKey?: string | null;
      createdAt: string;
      pushStatus: string;
      type: string;
    }>({
      collection: 'notifications',
      where: [['userId', '==', userId]],
    }),
  ]);
  return {
    userId,
    name: user?.name ?? userId,
    prefs,
    counter,
    decisions: decisions.map((x) => ({
      at: x.at,
      key: x.key,
      reason: x.reason,
      label: skipLabel(x.reason),
      detail: x.detail ?? null,
    })),
    notifications: (notes ?? [])
      .filter((n) => n.type === 'automation' || n.automationKey)
      .sort((x, y) => y.createdAt.localeCompare(x.createdAt))
      .slice(0, 20)
      .map((n) => ({
        at: n.createdAt,
        title: n.title,
        body: n.body,
        key: n.automationKey ?? null,
        pushStatus: n.pushStatus,
      })),
  };
}

/** Used by the wizard's preview step: renders with the first matching user's real numbers. */
export function previewText(a: PushAutomation): { title: string; body: string } {
  const vars = {
    name: 'سارا',
    title: 'مبانی بازاریابی دیجیتال',
    section: 'قیف و سرنخ',
    percent: 45,
    left: 55,
    days: 2,
    hours: 26,
    deadline: '۱۴۰۴/۰۷/۲۰',
    n: 3,
    count: 4,
    score: 70,
    sectionId: 'sec_1',
    packageId: 'pkg_1',
  };
  return { title: render(a.message.title, vars), body: render(a.message.body, vars) };
}

/** Guard used by the panel tests: the destination of a stored automation must stay safe. */
export function assertSafeDestination(actionRef: string): void {
  if (!isSafePathTemplate(actionRef, AUTOMATION_PATH_VARS))
    throw new ApiError('VALIDATION', 'مقصد پیام امن نیست.');
}

/** Everything the wizard needs to draw its options — one request, no per-field lookups. */
export function catalogMeta() {
  return {
    entries: PUSH_AUTOMATION_CATALOG.map((c) => ({
      key: c.key,
      name: c.name,
      category: c.category,
      description: c.description,
      trigger: c.trigger,
      isGate: !!c.templateKey,
      requiresFeature: c.requiresFeature ?? null,
    })),
    variables: VARIABLE_PALETTE,
    destinations: AUTOMATION_DESTINATIONS,
    categories: CATEGORY_META,
    triggerKinds: TRIGGER_KIND_LABELS,
    facts: FACT_FIELDS,
    events: EVENT_LABELS,
    weekdays: WEEKDAYS,
    limits: { titleMax: 80, bodyMax: 300 },
  };
}

export const CATEGORY_META = CATEGORY_ORDER.map((c) => ({
  id: c,
  label: CATEGORY_LABELS[c],
  hint: CATEGORY_HINTS[c],
  protected: (PROTECTED_CATEGORIES as readonly string[]).includes(c),
}));
