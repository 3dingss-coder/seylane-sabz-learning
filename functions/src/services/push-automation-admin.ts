import { z } from 'zod';
import { DAY, dayKey } from '../lib/time';
import type { Doc } from '../store/types';
import type {
  NotificationPrefs,
  PushAutomation,
  PushAutomationRun,
  PushAutomationSettings,
  RuleNode,
  User,
} from '../domain/types';
import { allFields, fieldById } from './automation/fields';
import {
  countLeaves,
  countNodes,
  describeExpr,
  leavesOf,
  maxDepth,
  RULE_LIMITS,
  validateRuleExpr,
} from './automation/expr';
import {
  conditionsToExpr,
  deadConditions,
  usesInheritedPolicy,
  withDefaults,
} from './automation/migrate';
import { allOperators } from './automation/operators';
import { POLICY_LIMITS, validateRepeatPolicy } from './automation/repeat';
import {
  STEP_LIMITS,
  describeSteps,
  stepDefs,
  needsFlowEngine,
  stepIds,
  stepLabel,
  unknownStepPolicyKeys,
  validateSteps,
} from './automation/steps';
import { audienceAllows, evaluateFor, explainFor, firstFailure } from './automation/rule';
import {
  CATEGORY_HINTS,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  PROTECTED_CATEGORIES,
  type NotificationCategory,
} from '../domain/notification-categories';
import { ApiError } from '../http/errors';
import { parse, text } from '../http/validate';
import { audit, getPolicy, SYSTEM, type Actor, type Deps } from './context';
import { DEFAULT_TEMPLATES, getTemplates, render } from './notify';
import { PRODUCED_EVENTS, unproducedEvents } from './push-automation-events';
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
  isAudienceCandidate,
  sendAutomation,
  resolveVars,
  listPendingSteps,
  stampFlowCancel,
  sweepUsers,
  type SweepExplain,
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

/**
 * One node of a v2 rule tree, as *input shape* only. What a leaf may point at (a known field, a known
 * operator, a value of the right type, a tree within budget) is decided by
 * `services/automation/expr.ts#validateRuleExpr`, which the semantics check below calls — zod draws the
 * outline, the registry decides the meaning. There is no code path in this shape by construction: a
 * rule is data, and nothing a rule carries is ever executed.
 */
const ruleLeafSchema = z.object({
  type: z.literal('leaf'),
  field: z.string().trim().min(1).max(60),
  operator: z.string().trim().min(1).max(40),
  value: z.union([z.number(), z.string().max(80), z.boolean(), z.null()]),
  value2: z.union([z.number(), z.string().max(80), z.boolean(), z.null()]).optional(),
});

export const ruleExprSchema: z.ZodType<RuleNode> = z.lazy(() =>
  z.union([
    ruleLeafSchema,
    z.object({
      type: z.literal('group'),
      op: z.enum(['and', 'or', 'not']),
      children: z.array(ruleExprSchema).max(RULE_LIMITS.maxChildren),
    }),
  ]),
) as z.ZodType<RuleNode>;

const repeatPolicySchema = z.object({
  minIntervalMs: z
    .number()
    .int()
    .min(0)
    .max(180 * DAY)
    .default(0),
  perDay: z.number().int().min(0).max(POLICY_LIMITS.maxPerDay).default(0),
  perWeek: z.number().int().min(0).max(POLICY_LIMITS.maxPerWeek).default(0),
  perMonth: z.number().int().min(0).max(POLICY_LIMITS.maxPerMonth).default(0),
  oncePerEventInstance: z.boolean().default(true),
  allowSameDayMultiple: z.boolean().default(true),
  onceInLivespan: z.boolean().default(false),
  perRule: z
    .object({
      maxPerDay: z.number().int().min(0).max(POLICY_LIMITS.maxPerDay).optional(),
      minIntervalMs: z
        .number()
        .int()
        .min(0)
        .max(180 * DAY)
        .optional(),
    })
    .optional(),
  perStep: z
    .record(
      z.string().trim().min(1).max(64),
      z.object({
        minIntervalMs: z
          .number()
          .int()
          .min(0)
          .max(180 * DAY)
          .optional(),
        maxPerDay: z.number().int().min(0).max(POLICY_LIMITS.maxPerDay).optional(),
      }),
    )
    .optional(),
  respectQuietHoursAlways: z.boolean().optional(),
});

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
  /**
   * The v1 flat list. Its `.max(6)` is a *legacy shape* guard — a v1 row on the store must keep parsing
   * and old exports must keep importing. It is NOT the condition limit of the engine any more: a v2
   * rule carries its tree in `when`, where the only limits are the evaluation budgets.
   */
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
  /** v2: an extra AND/OR tree over the user row, re-checked at the moment of sending. */
  filter: ruleExprSchema.nullish(),
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
  /** Absent or `1` keeps the flat `trigger.conditions`; `2` switches the rule to the tree below. */
  schemaVersion: z.union([z.literal(1), z.literal(2)]).nullish(),
  when: ruleExprSchema.nullish(),
  repeatPolicy: repeatPolicySchema.nullish(),
  /**
   * The workflow (§2.2). The `type`/id/budget/condition checks are `validateSteps`' job — it answers in
   * Persian with a path — but the message inside a step goes through the same schema as the rule's own
   * message, so a step can never skip a length or an `actionRef` safety check.
   */
  steps: z
    .array(
      z.discriminatedUnion('type', [
        z.object({
          type: z.literal('notify'),
          id: z.string().trim().min(1).max(40),
          message: automationMessageSchema,
          channel: z.enum(['any', 'web', 'android']).nullish(),
          when: ruleExprSchema.nullish(),
        }),
        z.object({
          type: z.literal('wait'),
          id: z.string().trim().min(1).max(40),
          minutes: z.number().int().min(1).max(43_200),
          recheckWhen: ruleExprSchema.nullish(),
        }),
        z.object({
          type: z.literal('stop'),
          id: z.string().trim().min(1).max(40),
          when: ruleExprSchema,
          reason: z.string().trim().min(2).max(200),
        }),
      ]),
    )
    .max(8)
    .nullish(),
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

/**
 * The two fields that steer the *write* rather than the *rule*. `validate` has to merge a patch the same
 * way `update` does — a validation the save does not respect is not a validation — so the split lives here
 * instead of inside one caller.
 */
function splitPatch(patch: z.infer<typeof automationPatchSchema>): {
  body: Partial<PushAutomation>;
  audienceIn?: z.infer<typeof audienceSchema>;
} {
  const body = { ...patch } as Record<string, unknown> & Partial<PushAutomation>;
  delete body.confirmCritical;
  delete body.expectedVersion;
  const audienceIn = body.audience;
  delete body.audience;
  return { body, audienceIn };
}

/** The document a create would write. Reads nothing, writes nothing. */
function createdDoc(
  input: z.infer<typeof automationSchema>,
  at: string,
  actor: Actor,
): PushAutomation {
  return {
    ...input,
    audience: normAudience(input.audience),
    isSystem: false,
    templateKey: null,
    requiresFeature: null,
    category: input.category,
    version: 1,
    createdAt: at,
    updatedAt: at,
    createdBy: actor.id,
    updatedBy: actor.id,
    stats: null,
  };
}

/** The document a patch would write, before the enable/confirm checks are allowed to object. */
function patchedDoc(
  cur: Doc<PushAutomation>,
  body: Partial<PushAutomation>,
  audienceIn: z.infer<typeof audienceSchema> | undefined,
  actor: Actor,
  at: string,
): PushAutomation {
  return {
    ...cur,
    ...body,
    ...(audienceIn ? { audience: normAudience(audienceIn) } : {}),
    // Fields a custom automation may never gain, and gates keep their identity.
    key: cur.key,
    isSystem: cur.isSystem,
    templateKey: cur.templateKey ?? null,
    requiresFeature: cur.requiresFeature ?? null,
    version: cur.version + 1,
    updatedAt: at,
    updatedBy: actor.id,
  };
}

/** The store keeps `null`, not `undefined`, so optional inputs are normalised once here. */
function normAudience(aud: z.infer<typeof audienceSchema>): PushAutomation['audience'] {
  return {
    type: aud.type,
    targetId: aud.targetId ?? null,
    channel: aud.channel ?? 'any',
    filter: aud.filter ?? null,
  };
}

/** Cross-field rules a plain object schema cannot express. */
export function validateSemantics(input: {
  trigger: PushAutomation['trigger'];
  /** The normalised row *and* the raw wizard/import input, which may still omit the optional bits. */
  audience: { type: string; targetId?: string | null; filter?: RuleNode | null };
  message: PushAutomation['message'];
  delivery?: PushAutomation['delivery'];
  schemaVersion?: 1 | 2 | null;
  when?: PushAutomation['when'];
  repeatPolicy?: PushAutomation['repeatPolicy'];
  steps?: PushAutomation['steps'];
}): void {
  const t = input.trigger;
  const bad = (msg: string): never => {
    throw new ApiError('VALIDATION', msg);
  };
  if ((t.kind === 'event' || t.kind === 'event_delay') && !t.event)
    bad('برای trigger از نوع اتفاق، نام اتفاق لازم است.');
  if (t.kind === 'event_delay' && !t.delayMinutes)
    bad('برای اتفاق با تأخیر، تعداد دقیقه لازم است.');
  if (t.kind === 'inactivity' && !t.inactivityDays) bad('برای بی‌فعالیتی، تعداد روز لازم است.');
  if (
    t.kind === 'condition' &&
    input.schemaVersion !== 2 &&
    !(t.conditions ?? []).length &&
    !input.when
  )
    bad('حداقل یک شرط لازم است؛ مثلاً پیشرفت کمتر از ۸۰.');
  if (t.kind === 'condition') {
    const known = new Set(FACT_FIELDS.map((f) => f.field));
    for (const c of t.conditions ?? [])
      if (!known.has(c.field)) bad(`شرط «${c.field}» در فهرست داده‌های قابل محاسبه نیست.`);
  }
  if (t.kind === 'schedule_weekly' && (t.weekday ?? null) === null)
    bad('برای برنامه هفتگی، روز هفته لازم است.');

  // The rule engine: every tree is checked against the field/operator registries, not against a list
  // this file keeps. An ill-typed or over-budget tree is refused on save, so the panel never shows a
  // rule that the sender would have to guess about.
  const trees: Array<[RuleNode | null | undefined, 'trigger' | 'audience']> = [
    [input.when ?? null, 'trigger'],
    [input.audience?.filter ?? null, 'audience'],
  ];
  for (const [tree, scope] of trees) {
    const v = validateRuleExpr(tree, { scope });
    if (!v.ok) bad(v.issues.map((i) => `${i.path}: ${i.message}`).join(' | '));
  }
  if (input.schemaVersion === 2 && (t.conditions ?? []).length)
    bad('قاعده‌ی نسخه ۲ شرطش را در «when» نگه می‌دارد؛ فهرست شرط‌های قدیمی را خالی بگذارید.');
  // The workflow is also the only door through which a rule may park something in the queue, so what a
  // `wait` may look like is decided here and not at drain time.
  for (const issue of validateSteps(input.steps)) bad(`${issue.path}: ${issue.message}`);
  const ghostKeys = unknownStepPolicyKeys({ steps: input.steps, repeatPolicy: input.repeatPolicy });
  if (ghostKeys.length)
    bad(`سیاست تکرار برای گام‌هایی نوشته شده که در این قاعده نیستند: ${ghostKeys.join('، ')}.`);
  if (input.repeatPolicy) {
    const policyBad = validateRepeatPolicy(input.repeatPolicy);
    if (policyBad.length) bad(policyBad.join(' | '));
  }
  if (input.audience.type !== 'all' && !input.audience.targetId)
    bad('برای مخاطب تیمی/نقشی/فردی، شناسه هدف لازم است.');
  const used = [...`${input.message.title} ${input.message.body}`.matchAll(/\{(\w+)\}/g)].map(
    (m) => m[1] as string,
  );
  for (const v of used)
    if (!AUTOMATION_VAR_NAMES.includes(v)) bad(`متغیر «{${v}}» شناخته‌شده نیست.`);
  // Spec §4.4: quiet hours are crossed by priority `urgent` and by nothing else, and the engine maps
  // exactly that to the `priority: 'high'` + `urgent` pair `notifyUsers` reserves for emergencies
  // (a deadline under 24h in `jobs.ts`). So `respectQuietHours: false` on a normal-priority rule is a
  // switch that cannot be honoured — refusing it here beats saving a promise the sender will break.
  if (input.delivery && !input.delivery.respectQuietHours && input.delivery.priority !== 'urgent')
    bad(
      'ساعت سکوت فقط با اولویت «فوری» رد می‌شود؛ این گزینه را روشن بگذارید یا اولویت را «فوری» کنید.',
    );
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
 * Creates the catalogue documents that do not exist yet — never touches an existing one, so a re-deploy
 * cannot undo an admin's edit. Idempotent.
 *
 * What arrives switched on, in words rather than by accident: **everything is seeded off except the
 * system gates** — the entries that carry a `templateKey` (`toAutomation` above). That is not an
 * exception to spec §4.1 («nothing starts sending because something was deployed»); it is the same rule
 * seen from the user's side, because a gate only decides whether a notification the product sends *today*
 * keeps being sent. Turning one off at seeding would silently delete a behaviour that exists right now,
 * which is a larger change than deploying a panel. No scenario message, no cron rule and no v2 rule ever
 * switches itself on here — see `test/push-automation.test.ts` › «catalogue seeding», which pins the exact
 * key set so a new gate has to be a decision and not a side effect.
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

// ─── Export / import (transfer between environments) ──────────────────────────

/**
 * What a transfer file carries: exactly the fields an admin can edit, and nothing this environment
 * computes for itself (`version`, `stats`, `id`, timestamps). `enabled` is exported so a snapshot says
 * what the source looked like, and is deliberately **ignored** on import — turning a send on is the
 * operator's click, not a file's (§4.1). Names and message text only: no phone, no token, no key.
 */
const EXPORT_FIELDS = [
  'key',
  'name',
  'description',
  'category',
  'audienceRole',
  'enabled',
  'trigger',
  'audience',
  'message',
  'delivery',
  'supersedes',
  'optInOnly',
  'schemaVersion',
  'when',
  'repeatPolicy',
  'steps',
] as const;

export const AUTOMATION_EXPORT_FORMAT = 'seylane.push-automation/3';
/** Above this an "import" is a data pipeline, not a deliberate transfer between two environments. */
export const IMPORT_MAX_ROWS = 100;

export type AutomationExportRow = Pick<PushAutomation, (typeof EXPORT_FIELDS)[number]>;

export interface AutomationExport {
  format: string;
  exportedAt: string;
  timezone: string;
  count: number;
  rows: AutomationExportRow[];
}

export const exportQuery = z.object({
  /** `?keys=inactive_1d,quiz_abandoned`; absent means every non-gate row of this environment. */
  keys: z.string().max(2000).optional(),
  /** Gate rows (`templateKey`) are left out unless asked for: they own no text of their own. */
  gates: z
    .enum(['0', '1'])
    .optional()
    .transform((v) => v === '1'),
});

/** `q` is `exportQuery`'s parsed shape, typed structurally so callers (and tests) need no zod. */
export async function exportAutomations(
  d: Deps,
  q: { keys?: string; gates?: boolean },
): Promise<AutomationExport> {
  const wanted = (q.keys ?? '')
    .split(',')
    .map((k) => k.trim().slice(0, 40))
    .filter(Boolean);
  const only = wanted.length ? new Set(wanted) : null;
  const rows: AutomationExportRow[] = [];
  for (const a of await loadAutomations(d)) {
    if (only && !only.has(a.key)) continue;
    if (!q.gates && a.templateKey) continue;
    const picked: Record<string, unknown> = {};
    for (const field of EXPORT_FIELDS) picked[field] = a[field] ?? null;
    rows.push(picked as unknown as AutomationExportRow);
  }
  rows.sort((x, y) => x.key.localeCompare(y.key));
  return {
    format: AUTOMATION_EXPORT_FORMAT,
    exportedAt: d.clock().toISOString(),
    timezone: (await getPolicy(d)).timezone,
    count: rows.length,
    rows,
  };
}

export const importSchema = z.object({
  rows: z.array(z.record(z.unknown())).min(1).max(IMPORT_MAX_ROWS),
  /** Every check runs and nothing is written — the way to review a file before it meets production. */
  dryRun: z.boolean().optional(),
  /**
   * Gate rows are refused unless you say you mean it: a gate owns no wording of its own (§۵), and even
   * with this flag its `message` is not transferred — only caps, priority and window.
   */
  allowGates: z.boolean().optional(),
});

export interface ImportRowResult {
  key: string;
  /** In `dryRun` this is the action the import *would* take. */
  action: 'created' | 'updated' | 'skipped';
  message?: string;
}

export interface AutomationImportReport {
  dryRun: boolean;
  checked: number;
  /** Rows actually written — always 0 in a dry run. */
  created: number;
  updated: number;
  skipped: number;
  results: ImportRowResult[];
}

/**
 * Create-or-update by `key`, through the same two functions the panel calls, so an import inherits the
 * identical validation, the same Persian error messages, a text revision for every row it overwrites
 * (§6.6) and one audit record per row. A bad row is reported and does not stop the rest: a transfer of
 * 30 rules must not fail on row 4 and leave the operator guessing what happened to rows 1-3.
 */
export async function importAutomations(
  d: Deps,
  actor: Actor,
  input: z.infer<typeof importSchema>,
): Promise<AutomationImportReport> {
  const report: AutomationImportReport = {
    dryRun: !!input.dryRun,
    checked: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    results: [],
  };
  const existing = new Map((await loadAutomations(d)).map((a) => [a.key, a] as const));
  const skip = (key: string, message: string) => {
    report.skipped++;
    report.results.push({ key, action: 'skipped', message });
  };

  for (const raw of input.rows) {
    report.checked++;
    const rawKey = typeof raw.key === 'string' ? raw.key.slice(0, 40) : '';
    let parsed: z.infer<typeof automationSchema>;
    try {
      parsed = parse(automationSchema, raw);
    } catch (e) {
      failOrSkip(rawKey, e, skip);
      continue;
    }
    const cur = existing.get(parsed.key);
    if (cur?.templateKey && !input.allowGates) {
      skip(parsed.key, 'این سطر دروازه‌ی یک قالب است؛ متنش در «قالب‌های اعلان» ویرایش می‌شود.');
      continue;
    }
    if (!cur && CATALOG_KEYS.includes(parsed.key)) {
      skip(parsed.key, 'این کلید کاتالوگ است ولی هنوز ساخته نشده؛ اول `POST …/seed` را بزنید.');
      continue;
    }
    try {
      if (input.dryRun) {
        // The same cross-field rules the write path applies; the write counters stay at zero on
        // purpose, and `action` reports what the import would do.
        validateSemantics({
          trigger: parsed.trigger,
          audience: parsed.audience,
          message: parsed.message,
          delivery: parsed.delivery,
          schemaVersion: parsed.schemaVersion,
          when: parsed.when,
          repeatPolicy: parsed.repeatPolicy,
          steps: parsed.steps,
        });
      } else if (cur) {
        const patch: Record<string, unknown> = { ...parsed };
        // The key identifies the row and `enabled` is never a file's decision.
        delete patch.key;
        delete patch.enabled;
        // A gate borrows its wording from the template editor; letting a file rewrite the gate's copy
        // would create text the product never sends. The rest of the row (caps, priority, window) is
        // exactly what a transfer should carry for a gate.
        if (cur.templateKey) delete patch.message;
        await updateAutomation(d, actor, cur.id, patch as z.infer<typeof automationPatchSchema>);
      } else {
        await createAutomation(d, actor, { ...parsed, enabled: false });
      }
      if (!input.dryRun) {
        if (cur) report.updated++;
        else report.created++;
      }
      report.results.push({ key: parsed.key, action: cur ? 'updated' : 'created' });
    } catch (e) {
      // Both write paths validate before they touch the store, so a rejected row leaves no half
      // document behind — which is what makes reporting-and-continuing safe here.
      failOrSkip(parsed.key, e, skip);
    }
  }

  if (!input.dryRun && report.created + report.updated > 0)
    await audit(d, actor, 'push_automation.imported', AUTOMATIONS, 'import', null, {
      created: report.created,
      updated: report.updated,
      skipped: report.skipped,
    });
  return report;
}

/** A zod or cross-field failure becomes the row's Persian message; an empty key still needs reporting. */
function failOrSkip(key: string, e: unknown, skip: (key: string, message: string) => void): void {
  const message = (e as { message?: string }).message ?? 'سطر نامعتبر است.';
  skip(key || '(بی‌کلید)', message);
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
  /** Out of service (`archivedAt`): never runnable, and shown apart from a merely disabled rule. */
  archived: boolean;
}

export interface AutomationList {
  rows: AutomationRow[];
  paused: boolean;
  settings: PushAutomationSettings;
  counts: {
    total: number;
    enabled: number;
    gates: number;
    /** Rules written in the v2 shape (`schemaVersion: 2`). */
    v2: number;
    /** Rules still carrying flat `trigger.conditions` that their trigger kind actually reads. */
    legacy: number;
    archived: number;
  };
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
  let legacy = 0;
  let archived = 0;
  for (const a of all) {
    const gate = isSystemGate(a);
    if (a.enabled) enabled++;
    if (gate) gates++;
    if (a.schemaVersion === 2) v2++;
    if (
      a.schemaVersion !== 2 &&
      a.trigger.kind === 'condition' &&
      (a.trigger.conditions ?? []).length
    )
      legacy++;
    if (a.archivedAt) archived++;
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
      archived: !!a.archivedAt,
    });
  }
  rows.sort((x, y) => rank(x) - rank(y) || x.key.localeCompare(y.key));
  return {
    rows,
    paused: settings.paused,
    settings,
    counts: { total: all.length, enabled, gates, v2, legacy, archived },
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
  /** Which shape this row is stored in: `2` owns a tree, `1` still means the flat legacy list. */
  schemaVersion: 1 | 2;
  /** The rule's own condition tree (`null` on a v1 row, whose conditions sit in `trigger`). */
  when: PushAutomation['when'];
  /** The stored workflow and its one-sentence Persian reading for the read-only card. */
  steps: PushAutomation['steps'];
  stepsSummary: string | null;
  /** False for `steps: [notify]`: that rule still runs the legacy single-send path. */
  usesFlow: boolean;
  /** Its own cadence policy, or `null` when no rule-specific cadence policy is configured. */
  repeatPolicy: PushAutomation['repeatPolicy'];
  /** Where the cadence comes from — the list row and the editor must not imply a rule owns one it does not. */
  policySource: 'rule' | 'inherited';
  /** A short Persian reading of the tree, for the read-only summary beside the builder. */
  whenSummary: string;
  /** Conditions the row carries but its trigger kind never evaluates — reported, never silently obeyed. */
  deadConditions: NonNullable<PushAutomation['trigger']['conditions']>;
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
    schemaVersion: (a.schemaVersion ?? 1) as 1 | 2,
    steps: a.steps ?? null,
    stepsSummary: describeSteps(a.steps),
    usesFlow: needsFlowEngine(a),
    when: a.when ?? null,
    repeatPolicy: a.repeatPolicy ?? null,
    policySource: usesInheritedPolicy(a) ? 'inherited' : 'rule',
    whenSummary: describeExpr(a.when ?? null),
    deadConditions: deadConditions(withDefaults(a)) ?? [],
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
  const doc = createdDoc(input, d.clock().toISOString(), actor);
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
  const { confirmCritical, expectedVersion } = patch;
  const { body, audienceIn } = splitPatch(patch);
  if (expectedVersion !== undefined && expectedVersion !== cur.version)
    throw new ApiError('CONFLICT', 'این اتوماسیون هم‌زمان ویرایش شده است؛ صفحه را بازخوانی کنید.');
  const next = patchedDoc(cur, body, audienceIn, actor, d.clock().toISOString());
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
  if (next.enabled && cur.archivedAt)
    throw new ApiError(
      'VALIDATION',
      'قاعده بایگانی‌شده روشن نمی‌شود؛ اگر لازم دارید اول آن را از بایگانی خارج کنید.',
    );
  // A pending step is a promise about the future that an older definition made. When the part of the rule
  // that promise rested on moves, the promise is cancelled rather than re-interpreted; a wording-only fix
  // does not void it, so correcting a typo does not silently eat three days of follow-ups.
  const structural = STRUCTURAL_FIELDS;
  const touched =
    audienceIn !== undefined ||
    structural.some((f) => (body as Record<string, unknown>)[f] !== undefined) ||
    (cur.audience ?? null) !== (next.audience ?? null);
  if (touched || (cur.enabled && !next.enabled)) await stampFlowCancel(d, key);
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
  if (body.steps) parts.push('گام‌های گردش‌کار');
  if (body.delivery) parts.push('نحوه ارسال');
  if (body.trigger) parts.push('زمان‌بندی');
  if (body.when) parts.push('شرط‌ها');
  if (body.audience) parts.push('مخاطب');
  if (body.repeatPolicy) parts.push('سیاست تکرار');
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
  // The row is gone, so nothing may keep running in its name — pending steps included.
  await stampFlowCancel(d, key);
  await d.store.delete(`${AUTOMATIONS}/${key}`);
  await audit(d, actor, 'push_automation.deleted', AUTOMATIONS, key, cur, null);
  return { deleted: true };
}

const STRUCTURAL_FIELDS = ['steps', 'when', 'trigger', 'delivery', 'repeatPolicy'] as const;

// ─── Lifecycle: validate without saving, duplicate, per-user preview ───────
//
// The three operations an operator needs around a rule that is not yet trusted: ask the server whether the
// draft is *saveable* (with the same validator a save runs, so the answer cannot drift), copy a working rule
// to start from, and read one rule against named users without sending anything. None of them touches a
// counter, a claim, a queue row or a notification.

export interface VerdictIssue {
  /** Where the panel can hang the message; `''` when the check is about the rule as a whole. */
  path: string;
  message: string;
}

export interface AutomationVerdict {
  /** `true` only when every check a save would run has passed. Not a promise that the rule will send. */
  ok: boolean;
  errors: VerdictIssue[];
  warnings: VerdictIssue[];
  /** The canonical shape the save would store, for the parts the logic card owns. `null` if unreadable. */
  normalized: {
    schemaVersion: 1 | 2 | null;
    when: PushAutomation['when'];
    audience: PushAutomation['audience'];
    repeatPolicy: PushAutomation['repeatPolicy'];
    steps: PushAutomation['steps'];
  } | null;
  review: {
    key: string;
    isGate: boolean;
    enabled: boolean;
    triggerKind: PushAutomation['trigger']['kind'];
    event: string | null;
    /** `when` for a v2 rule; `trigger.conditions` re-expressed for a v1 one; `null` when there is neither. */
    treeSource: 'when' | 'legacy_conditions' | null;
    treeSummary: string | null;
    /** What the tree costs the engine, measured by the same walkers the engine enforces with. */
    budget: { nodes: number; leaves: number; depth: number } | null;
    limits: typeof RULE_LIMITS;
    usesFlow: boolean;
    stepIds: string[];
    /** Flat conditions the trigger kind of this rule never evaluates. */
    deadConditions: string[];
    /** `false` = the event this rule waits for is registered but no code emits it. `null` = no event. */
    eventProduced: boolean | null;
    /** Flow steps already parked for this rule, which a structural change would cancel. */
    pendingSteps: number;
    runNote: string | null;
  } | null;
}

/**
 * Turns a thrown validation error into per-field rows. The zod path comes through `details`; the
 * cross-field messages come from `validateSemantics`, which prefixes them with `path: ` and joins several
 * with ` | ` because the import report has one string per row — so the same split recovers the path here
 * instead of a second validator that could drift away from the first.
 */
function issuesFrom(e: unknown): VerdictIssue[] {
  const details = (e as { details?: unknown }).details;
  if (Array.isArray(details) && details.length > 0)
    return (details as Array<{ field?: unknown; message?: unknown }>).map((x) => ({
      path: typeof x.field === 'string' ? x.field : '',
      message: String(x.message ?? ''),
    }));
  const message = (e as { message?: string }).message ?? 'ساختار قاعده نامعتبر است.';
  return message.split(' | ').map((part) => {
    const m = /^([a-zA-Z][\w.[\]-]*): ([\s\S]*)$/.exec(part.trim());
    return m ? { path: m[1] ?? '', message: m[2] ?? '' } : { path: '', message: part };
  });
}

export const validateDraftSchema = z.object({
  /** Present = validate this patch *on top of* the stored rule; absent = a rule that does not exist yet. */
  patch: z.record(z.unknown()).optional(),
});

/**
 * The check a save would run, without saving. One path builds the candidate document for both cases —
 * create (`key` absent from the store) and edit (a patch merged over the stored row) — and runs it through
 * `parse` + `validateSemantics`, the very functions the writers call. So «valid» here means exactly
 * «acceptable to the save endpoint», nothing more and nothing less.
 */
export async function validateDraft(
  d: Deps,
  actor: Actor,
  key: string | null,
  raw: unknown,
): Promise<AutomationVerdict> {
  const at = d.clock().toISOString();
  const errors: VerdictIssue[] = [];
  const warnings: VerdictIssue[] = [];
  let doc: PushAutomation | null = null;
  let parked = 0;

  if (key === null) {
    try {
      const input = parse(automationSchema, raw);
      if (CATALOG_KEYS.includes(input.key))
        errors.push({
          path: 'key',
          message: 'این کلید در کاتالوگ سیستمی وجود دارد؛ همان را ویرایش کنید.',
        });
      else if (await d.store.get(`${AUTOMATIONS}/${input.key}`))
        errors.push({
          path: 'key',
          message: 'اتوماسیونی با همین کلید وجود دارد؛ برای ویرایش به همان بروید.',
        });
      doc = createdDoc(input, at, actor);
    } catch (e) {
      return { ok: false, errors: issuesFrom(e), warnings, normalized: null, review: null };
    }
  } else {
    let patch: z.infer<typeof automationPatchSchema>;
    try {
      patch = parse(automationPatchSchema, raw);
    } catch (e) {
      return { ok: false, errors: issuesFrom(e), warnings, normalized: null, review: null };
    }
    const cur = await mustGet(d, key);
    const { body, audienceIn } = splitPatch(patch);
    doc = patchedDoc(cur, body, audienceIn, actor, at);
    if (
      audienceIn !== undefined ||
      STRUCTURAL_FIELDS.some((f) => (body as Record<string, unknown>)[f] !== undefined)
    ) {
      parked = (await listPendingSteps(d, key, { limit: 50 })).items.length;
      if (parked)
        warnings.push({
          path: 'steps',
          message: `ذخیرهٔ این تغییر ${parked} گام در انتظارِ این قاعده را لغو می‌کند.`,
        });
    }
  }
  const built = doc;

  try {
    validateSemantics(built);
  } catch (e) {
    errors.push(...issuesFrom(e));
  }
  if (built.enabled && built.requiresFeature)
    errors.push({
      path: 'enabled',
      message: 'این سناریو نیازمند داده‌ای است که هنوز محاسبه نمی‌شود؛ روشن شدنی نیست.',
    });
  if (built.enabled && isSystemGate(built))
    errors.push({
      path: 'enabled',
      message: 'ردیف قالب به‌تنهایی ارسال نمی‌کند؛ روشن‌کردنش معنی ندارد.',
    });
  if (CRITICAL_AUTOMATION_KEYS.includes(built.key) && built.enabled)
    warnings.push({
      path: 'enabled',
      message: 'این قاعده در فهرست حساس است؛ روشن/خاموش‌کردنش در ذخیره تأیید جدا می‌خواهد.',
    });

  const tree = built.when ?? conditionsToExpr(built.trigger.conditions ?? []);
  const seen = new Set<string>();
  const warn = (path: string, message: string): void => {
    if (seen.has(message)) return;
    seen.add(message);
    warnings.push({ path, message });
  };
  if (tree) {
    for (const leaf of leavesOf(tree)) {
      const field = fieldById(leaf.field);
      // An unknown field, an ill-typed operator or an over-budget tree is already an *error* the
      // validator raises, so it never reaches here. What that check cannot know is the trigger kind: a
      // field no scheduled sweep computes resolves to «no data», which every operator answers by rejecting.
      if (field && !field.sweep && !built.trigger.kind.startsWith('event'))
        warn(
          'when',
          `«${field.label}» در بررسی زمان‌بندی‌شده محاسبه نمی‌شود؛ این شرط همیشه رد می‌شود.`,
        );
    }
  } else if (built.trigger.kind === 'event' || built.trigger.kind === 'event_delay') {
    warn(
      'when',
      'هیچ شرطی نگذاشته‌اید؛ هر رویدادِ این نوع، قاعده را فعال می‌کند و سقف‌ها/ترجیحات تنها بازدارنده‌اند.',
    );
  }
  const event0 = built.trigger.event ?? null;
  if (built.trigger.kind.startsWith('event') && event0 && !PRODUCED_EVENTS.includes(event0))
    warn(
      'trigger.event',
      `اتفاق «${event0}» را هنوز هیچ کدی نمی‌فرستد؛ این قاعده حتی اگر روشن باشد اجرا نمی‌شود.`,
    );
  const dead = deadConditions(built);
  if (dead.length)
    warn(
      'trigger.conditions',
      `${dead.length} شرط قدیمی است که این نوع فعال‌سازی آن‌ها را نمی‌خواند؛ در «منطق قاعده» بازنویسی‌شان کنید.`,
    );
  if (needsFlowEngine(built))
    warn(
      'steps',
      'این قاعده با موتور گردش‌کار اجرا می‌شود: گام‌های «صبر» در صف می‌نشینند و در صفحهٔ گام‌ها دیده می‌شوند.',
    );
  const ghost = unknownStepPolicyKeys(built);
  for (const g of ghost)
    warn('repeatPolicy.perStep', `سیاست گام «${g}» گامی با این شناسه ندارد؛ نادیده گرفته می‌شود.`);

  const event = built.trigger.kind.startsWith('event') ? (built.trigger.event ?? null) : null;
  const settings = await readSettings(d);
  const runNote = built.requiresFeature
    ? 'این سناریو داده‌ای می‌خواهد که هنوز محاسبه نمی‌شود؛ حتی اگر روشن شود اجرا نمی‌شود.'
    : !built.enabled
      ? 'قاعده خاموش است؛ «معتبر است» یعنی «ذخیره شدنی است»، نه «ارسال می‌شود».'
      : settings.paused
        ? 'کلید توقف کلی فعال است؛ هیچ قاعده‌ای ارسال نمی‌کند.'
        : null;

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    normalized: {
      schemaVersion: built.schemaVersion ?? null,
      when: built.when ?? null,
      audience: built.audience,
      repeatPolicy: built.repeatPolicy ?? null,
      steps: built.steps ?? null,
    },
    review: {
      key: built.key,
      isGate: isSystemGate(built),
      enabled: !!built.enabled,
      triggerKind: built.trigger.kind,
      event,
      treeSource: built.when ? 'when' : tree ? 'legacy_conditions' : null,
      treeSummary: tree ? describeExpr(tree) : null,
      budget: tree
        ? { nodes: countNodes(tree), leaves: countLeaves(tree), depth: maxDepth(tree) }
        : null,
      limits: RULE_LIMITS,
      usesFlow: needsFlowEngine(built),
      stepIds: stepIds(built.steps),
      deadConditions: dead.map((c) => c.field),
      eventProduced: event === null ? null : PRODUCED_EVENTS.includes(event),
      pendingSteps: parked,
      runNote,
    },
  };
}

export const duplicateSchema = z.object({
  key: z
    .string()
    .trim()
    .regex(AUTOMATION_KEY, 'کلید باید کوچک، لاتین و یکتا باشد؛ مثل welcome_followup_copy.'),
  name: z.string().trim().min(2).max(60).optional(),
});

/**
 * A copy is a *new, switched-off* rule. Everything the operator wrote comes along — text, delivery,
 * trigger, audience, tree, steps, cadence; everything that is history or a promise about the future does
 * not: `enabled`, `stats`, `version`, `createdAt`, and above all the pending steps parked under the source
 * key, which keep belonging to the source.
 */
export async function duplicateAutomation(
  d: Deps,
  actor: Actor,
  fromKey: string,
  input: z.infer<typeof duplicateSchema>,
): Promise<Doc<PushAutomation>> {
  const src = await mustGet(d, fromKey);
  if (isSystemGate(src))
    throw new ApiError(
      'CONFLICT',
      'ردیف قالب پیام خودش را ندارد؛ تکثیرش معنی ندارد. یک اتوماسیون تازه بسازید و متن را در آن بنویسید.',
    );
  const shaped = parse(automationSchema, {
    key: input.key,
    name: input.name?.trim() || `${src.name} (کپی)`,
    description: src.description,
    category: src.category,
    audienceRole: src.audienceRole,
    enabled: false,
    trigger: src.trigger,
    audience: src.audience,
    message: src.message,
    delivery: src.delivery,
    supersedes: src.supersedes ?? null,
    optInOnly: src.optInOnly ?? null,
    schemaVersion: src.schemaVersion ?? null,
    when: src.when ?? null,
    repeatPolicy: src.repeatPolicy ?? null,
    steps: src.steps ?? null,
  });
  if (CATALOG_KEYS.includes(shaped.key))
    throw new ApiError('CONFLICT', 'این کلید در کاتالوگ سیستمی وجود دارد؛ کلید تازه‌ای بگذارید.');
  if (await d.store.get(`${AUTOMATIONS}/${shaped.key}`))
    throw new ApiError('CONFLICT', 'اتوماسیونی با همین کلید وجود دارد.');
  validateSemantics(shaped);
  const doc = createdDoc(shaped, d.clock().toISOString(), actor);
  await d.store.set(`${AUTOMATIONS}/${shaped.key}`, doc as unknown as Record<string, unknown>);
  await audit(d, actor, 'push_automation.duplicated', AUTOMATIONS, shaped.key, null, {
    from: fromKey,
    key: shaped.key,
    name: doc.name,
    enabled: false,
    copied: ['message', 'delivery', 'trigger', 'audience', 'when', 'steps', 'repeatPolicy'].filter(
      (f) => (shaped as unknown as Record<string, unknown>)[f] !== undefined,
    ),
  });
  return { ...doc, id: shaped.key } as Doc<PushAutomation>;
}

export const previewQuerySchema = z.object({
  /** Comma-separated (Persian comma accepted too), one to ten users — a test group, not an audience. */
  userIds: z.string().min(1).max(400),
});

export interface AutomationPreviewRow {
  userId: string;
  name: string | null;
  /** False when the id matches no user row. */
  exists: boolean;
  /** The population half (`audience.type`) and the filter half, reported apart because they fail apart. */
  inPopulation: boolean;
  inFilter: boolean;
  /** Which of the two said no, in Persian — `null` when the audience accepts this user. */
  audienceWhy: string | null;
  /** The rule's own condition tree — the part an operator usually means by «does it match». */
  matched: boolean;
  whyNot: string | null;
  truncated: boolean;
  explain: string[];
  /** The text as it would go out, variables filled from this user. */
  title: string | null;
  body: string | null;
  steps: Array<{ id: string; type: string; label: string }>;
}

export interface AutomationPreviewResult {
  key: string;
  evaluatedAt: string;
  paused: boolean;
  enabled: boolean;
  rows: AutomationPreviewRow[];
  note: string;
}

/**
 * One rule read against named users. This is the answer to «چرا برای این کاربر چیزی نگفت؟» and to testing a
 * rule on a small group before trusting it: the audience, the trigger's own tree and the rendered text, per
 * user. It reads only — no send, no counter, no claim, no queue row — and it deliberately does not consult
 * caps, the gate or the user's devices: those are the sweep's business and `/dry-run` reports them for the
 * whole audience in one pass.
 */

export const archiveSchema = z.object({
  /** `true` puts the rule out of service; `false` takes it back out of the archive, still switched off. */
  archived: z.boolean().default(true),
});

/**
 * Archive is the non-destructive end of a rule's life: catalogue rows cannot be deleted at all, and a
 * custom row that produced pushes has a history worth keeping. `enabled` is forced off, `loadRunnable`
 * skips the row (so a parked flow step is not resumed either), and the pending steps are cancelled because
 * a retirement — unlike a pause — is not supposed to be resumed on old promises.
 *
 * Un-archiving deliberately does **not** re-enable — and while a row is archived the switch is refused
 * outright (see `updateAutomation`), so `enabled: true` can never quietly mean «ready to fire the moment
 * the archive is lifted». Bringing a retired rule back is two deliberate acts, not one plus a surprise.
 */
export async function archiveAutomation(
  d: Deps,
  actor: Actor,
  key: string,
  archived: boolean,
): Promise<Doc<PushAutomation>> {
  const cur = await mustGet(d, key);
  const at = d.clock().toISOString();
  const next: PushAutomation = {
    ...cur,
    archivedAt: archived ? at : null,
    archivedBy: archived ? actor.id : null,
    // Off in both directions: archiving retires the rule, and lifting the archive hands it back disabled.
    enabled: false,
    version: (cur.version ?? 1) + 1,
    updatedAt: at,
    updatedBy: actor.id,
  };
  if (archived) await stampFlowCancel(d, key);
  await d.store.set(`${AUTOMATIONS}/${key}`, next as unknown as Record<string, unknown>);
  await audit(
    d,
    actor,
    archived ? 'push_automation.archived' : 'push_automation.unarchived',
    AUTOMATIONS,
    key,
    { enabled: cur.enabled, archivedAt: cur.archivedAt ?? null },
    { enabled: next.enabled, archivedAt: next.archivedAt ?? null },
  );
  return { ...next, id: key } as Doc<PushAutomation>;
}

export const migrateSchema = z.object({
  /** Without a list, every rule the engine can still read in its old shape is considered. */
  keys: z.array(z.string().max(40)).max(50).optional(),
  /** The default is the safe one: a migration is *reported* before it is done. */
  dryRun: z.boolean().default(true),
  /**
   * A live rule's conversion is the one case where «same answer from the engine» is not enough — the
   * operator has to ask for it explicitly, because the rule keeps sending while its definition moves.
   */
  includeEnabled: z.boolean().default(false),
});

export interface MigrateRowResult {
  key: string;
  action: 'would-migrate' | 'migrated' | 'skipped';
  /** What moved, in the field names the panel can show next to the rule. */
  fields: string[];
  message: string | null;
}

export interface MigrateReport {
  dryRun: boolean;
  checked: number;
  migrated: number;
  wouldMigrate: number;
  skipped: number;
  results: MigrateRowResult[];
  note: string;
}

/**
 * The explicit v1 → v2 conversion (`conditionsToExpr`), rule by rule, with a report. This is the only place
 * the flat list is *rewritten*; `withDefaults()` at read time stays the invisible compatibility layer, so
 * an operator can move a rule over when they choose to and see exactly what changed.
 *
 * Three promises, each with a test: nothing is enabled by a migration (`enabled` is never touched), a rule
 * whose legacy list the engine would read differently is skipped instead of guessed, and a dry run writes
 * no document, no revision and no audit row.
 */
export async function migrateRules(
  d: Deps,
  actor: Actor,
  input: z.infer<typeof migrateSchema>,
): Promise<MigrateReport> {
  const dryRun = input.dryRun !== false;
  const wanted = input.keys?.length ? new Set(input.keys) : null;
  const at = d.clock().toISOString();
  const report: MigrateReport = {
    dryRun,
    checked: 0,
    migrated: 0,
    wouldMigrate: 0,
    skipped: 0,
    results: [],
    note: dryRun
      ? 'این فقط گزارش است: هیچ سندی نوشته نشد. برای اجرای واقعی، dryRun را خاموش کنید.'
      : 'هر قاعده با همان اعتبارسنجی ذخیره تبدیل شد؛ هیچ قاعده‌ای روشن یا خاموش نشد.',
  };
  for (const a of await loadAutomations(d)) {
    if (wanted && !wanted.has(a.key)) continue;
    report.checked++;
    const fields: string[] = [];
    if (a.schemaVersion === 2) {
      report.skipped++;
      report.results.push({
        key: a.key,
        action: 'skipped',
        fields,
        message: 'از قبل نسخه ۲ است.',
      });
      continue;
    }
    if (a.enabled && !input.includeEnabled) {
      report.skipped++;
      report.results.push({
        key: a.key,
        action: 'skipped',
        fields,
        message:
          'روشن است؛ برای تبدیلِ یک قاعدهٔ روشن، includeEnabled را بفرستید (همان اول dryRun را بزنید).',
      });
      continue;
    }
    const tree = conditionsToExpr(a.trigger.conditions ?? []);
    if (!tree) {
      report.skipped++;
      report.results.push({
        key: a.key,
        action: 'skipped',
        fields,
        message: (a.trigger.conditions ?? []).length
          ? 'شرط‌های این قاعده برای نوع فعال‌سازی‌اش خوانده نمی‌شود؛ چیزی برای تبدیل نیست.'
          : 'شرطی ندارد که تبدیل شود.',
      });
      continue;
    }
    const next: PushAutomation = {
      ...a,
      schemaVersion: 2,
      when: tree,
      // The flat list goes away in the same write the tree arrives, so no rule can ever be read twice —
      // that is what «the same answer» means here, and `validateSemantics` refuses a v2 row that keeps it.
      trigger: { ...a.trigger, conditions: [] },
      version: (a.version ?? 1) + 1,
      updatedAt: at,
      updatedBy: actor.id,
    };
    try {
      validateSemantics(next);
    } catch (e) {
      report.skipped++;
      report.results.push({
        key: a.key,
        action: 'skipped',
        fields,
        message: issuesFrom(e)
          .map((i) => i.message)
          .join(' | '),
      });
      continue;
    }
    fields.push('schemaVersion', 'when', 'trigger.conditions');
    if (dryRun) {
      report.wouldMigrate++;
      report.results.push({ key: a.key, action: 'would-migrate', fields, message: null });
      continue;
    }
    await d.store.set(`${AUTOMATIONS}/${a.key}`, next as unknown as Record<string, unknown>);
    await audit(
      d,
      actor,
      'push_automation.migrated',
      AUTOMATIONS,
      a.key,
      {
        schemaVersion: a.schemaVersion ?? 1,
        conditions: a.trigger.conditions ?? [],
      },
      { schemaVersion: 2, when: tree },
    );
    report.migrated++;
    report.results.push({ key: a.key, action: 'migrated', fields, message: null });
  }
  return report;
}

/** The `:version` path param, kept as a schema so the route file stays a list of «what is callable». */
export const revisionParamSchema = z.object({
  version: z.coerce.number().int().min(1).max(100_000),
});

export const restoreSchema = z.object({
  /** The version the panel has open, so a rollback cannot overwrite an edit made meanwhile. */
  expectedVersion: z.number().int().min(1).optional(),
});

/**
 * Back to an older text: the stored revision of `/:key` is written forward through `updateAutomation`,
 * which means a rollback is itself a versioned, audited, validated edit — and is itself reversible.
 *
 * The scope is honest: a text revision keeps `message` and `delivery` only. Logic (`when`, `steps`,
 * `audience.filter`, `repeatPolicy`) is not in the revision store, so it is not restored; and because
 * `delivery` counts as a structural field, a rollback that changes it cancels the rule's parked steps.
 */
export async function restoreRevision(
  d: Deps,
  actor: Actor,
  key: string,
  version: number,
  expectedVersion?: number,
): Promise<Doc<PushAutomation>> {
  await mustGet(d, key);
  const row = await d.store.get<{
    message?: PushAutomation['message'];
    delivery?: PushAutomation['delivery'];
  }>(`${TEXT_REVISIONS}/${key}/${version}`);
  if (!row?.message)
    throw new ApiError('NOT_FOUND', 'این نسخه در تاریخچهٔ متن این قاعده نیست (یا پاک شده است).');
  return updateAutomation(d, actor, key, {
    message: row.message,
    ...(row.delivery ? { delivery: { ...row.delivery } } : {}),
    ...(expectedVersion !== undefined ? { expectedVersion } : {}),
  });
}
export async function previewForUsers(
  d: Deps,
  key: string,
  userIds: string,
): Promise<AutomationPreviewResult> {
  const a = withDefaults(await mustGet(d, key));
  const ids = Array.from(
    new Set(
      userIds
        .split(/[\s,،]+/)
        .map((x) => x.trim())
        .filter(Boolean),
    ),
  ).slice(0, 10);
  if (!ids.length) throw new ApiError('VALIDATION', 'حداقل یک شناسهٔ کاربر لازم است.');
  const settings = await readSettings(d);
  const now = d.clock();
  const found = await Promise.all(
    ids.map(async (id) => ({ id, user: await d.store.get<User>(`users/${id}`) })),
  );
  const users = found.map((f) => f.user).filter((u): u is Doc<User> => !!u);
  const ctx = users.length
    ? await buildSweepContext(d, users, { health: a.category === 'health' })
    : null;
  const tree = a.when ?? conditionsToExpr(a.trigger.conditions ?? []);
  const rows: AutomationPreviewRow[] = [];
  for (const { id, user } of found) {
    if (!user) {
      rows.push({
        userId: id,
        name: null,
        exists: false,
        inPopulation: false,
        inFilter: false,
        audienceWhy: 'کاربری با این شناسه وجود ندارد.',
        matched: false,
        whyNot: null,
        truncated: false,
        explain: [],
        title: null,
        body: null,
        steps: [],
      });
      continue;
    }
    const inPopulation = isAudienceCandidate(a, user);
    const aud = audienceAllows(a, user, now);
    const facts = ctx ? factsForRule(a, ctx, user) : {};
    const res = evaluateFor(tree, { facts, user, now });
    const vars = ctx
      ? resolveVars(
          user,
          ctx.packagesByUser.get(user.id) ?? [],
          ctx.nextByUser.get(user.id) ?? null,
          facts,
        )
      : {};
    rows.push({
      userId: user.id,
      name: user.name ?? null,
      exists: true,
      inPopulation,
      inFilter: aud.ok,
      audienceWhy: !inPopulation
        ? 'خارج از مخاطب انتخابی این قاعده است؛ پیش‌نمایش شرط را هم برای او خوانده است.'
        : aud.ok
          ? null
          : (firstFailure(aud) ?? 'فیلتر مخاطب این کاربر را رد کرد.'),
      matched: res.ok && !res.truncated,
      whyNot: res.ok ? null : (firstFailure(res) ?? 'شرط قاعده رد شد.'),
      truncated: res.truncated,
      explain: explainFor(res),
      title: render(a.message.title, vars),
      body: render(a.message.body, vars),
      steps: (a.steps ?? []).map((step) => ({
        id: step.id,
        type: step.type,
        label: stepLabel(step),
      })),
    });
  }
  return {
    key: a.key,
    evaluatedAt: now.toISOString(),
    paused: !!settings.paused,
    enabled: !!a.enabled,
    rows,
    note: 'این پیش‌نمایش مخاطب، شرط و متن را می‌گوید؛ سقف‌ها، دروازه و دستگاه‌های کاربر را نه — برای آن‌ها «برآورد مشمولان» را ببینید. هیچ اعلانی ساخته نمی‌شود.',
  };
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
  /** Users the rule was evaluated against — never 0 just because none of them matched. */
  reviewed: number;
  sample: Array<{ userId: string; name: string; title: string; body: string; reason: string }>;
  /**
   * Per-user verdict of the rule's own evaluation — the same `ruleMatch` the sender calls, so an
   * explanation cannot drift from a send. `why` is the first condition that refused; `lines` is every
   * condition with the value it saw. This is what makes «چرا این کاربر مشمول نشد؟» a panel answer
   * instead of a code reading exercise.
   */
  explain: SweepExplain[];
  note: string | null;
}

/**
 * «چه اتفاقی می‌افتد؟» without touching anything: same evaluation path as the real sweep, with
 * `dry: true`, so no claim, no counter and no provider call. This is what the wizard's last step shows.
 */
export interface PendingStepsResult {
  /** A parked row plus `suppressed`: rows the rule's cancel stamp already retired are pending in the
   * store and dead in practice, and the panel must say which of the two the operator is looking at. */
  items: Array<Record<string, unknown>>;
  /** How many day shards were read; a `wait` longer than that is reported as `truncated`. */
  shards: number;
  truncated: boolean;
  /** When the rule was last cancelled, or null if it never was — the line rows are compared against. */
  cancelledAt: string | null;
  note: string;
}

/**
 * «اقدام‌های معلق» of a rule: the `wait` steps parked for real users. Read-only, bounded by day shards —
 * the store cannot query a prefix, so the answer is always «what is pending in the next N days», never a
 * claim that nothing is pending anywhere.
 */
export async function pendingSteps(
  d: Deps,
  key: string,
  q: { days?: string; userId?: string; limit?: string } = {},
): Promise<PendingStepsResult> {
  await mustGet(d, key);
  const days = Math.max(1, Math.min(31, Number(q.days ?? 8) || 8));
  const res = await listPendingSteps(d, key, {
    days,
    limit: Math.max(1, Math.min(500, Number(q.limit ?? 100) || 100)),
    ...(q.userId ? { userId: String(q.userId) } : {}),
  });
  return {
    ...res,
    // No digits in the sentence: the panel formats `shards`/`items.length` itself, and a Latin «8»
    // inside a Persian line is exactly the kind of thing users screenshot.
    note:
      (res.truncated
        ? 'سقف سطرهای بازگشت‌شده پر شد؛ ممکن است بیشتر از این باشد.'
        : 'فقط شارد‌های روزهای پیشِ رو خوانده شد (شماره‌ی روز در نام شارد است)؛ پس «خالی» یعنی «در این روزها چیزی نیست».') +
      (res.items.some((i) => i.suppressed === true)
        ? ' بعضی سطرها پس از لغوِ قاعده پارک شده‌اند: در فهرست «معلق»‌اند اما اجرا نمی‌شوند.'
        : ''),
  };
}

/**
 * Cancel every parked step of a rule right now, without touching the rule itself. The stamp is what does
 * it — one write, no scan — and it stays in force until the rule runs again, so a drain that happens
 * between the two cannot deliver the dead promise.
 */
export async function cancelPendingSteps(
  d: Deps,
  actor: Actor,
  key: string,
): Promise<{ cancelled: true; cancelBefore: string }> {
  await mustGet(d, key);
  await stampFlowCancel(d, key);
  await audit(d, actor, 'push_automation.pending_cancelled', AUTOMATIONS, key, null, {
    cancelBefore: d.clock().toISOString(),
  });
  return { cancelled: true, cancelBefore: d.clock().toISOString() };
}

export async function dryRun(d: Deps, key: string): Promise<DryRunResult> {
  const a = await mustGet(d, key);
  const settings = await readSettings(d);
  const policy = await getPolicy(d);
  const users = await sweepUsers(d);
  const ctx = await buildSweepContext(d, users, { health: a.category === 'health' });
  const sweep = await evaluateSweep(d, { ...a, enabled: true }, ctx, {
    dry: true,
    settings,
    explain: true,
  });
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
    reviewed: sweep.reviewed,
    wouldSend: sweep.sent,
    skipped: sweep.skipped,
    skippedLabels: Object.entries(sweep.skipped)
      .map(([reason, count]) => ({ reason, count, label: skipLabel(reason) }))
      .sort((x, y) => y.count - x.count),
    sample,
    explain: sweep.explain,
    note: a.requiresFeature
      ? 'این سناریو هنوز اجرا نمی‌شود: داده‌ی لازم محاسبه نمی‌شود.'
      : a.archivedAt
        ? 'این قاعده بایگانی شده است؛ تا از بایگانی بیرون نیاید اجرا نمی‌شود. این فقط برآورد مشمولان است.'
        : !a.enabled || settings.paused
          ? `اتوماسیون ${a.enabled ? 'زیر کلید توقف کلی' : 'خاموش'} است؛ این فقط برآورد مشمولان است، نه قولِ ارسال.`
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
    /**
     * What the builder may offer and what the runtime can actually do, as two separate answers.
     * `ruleFields`/`ruleOperators` are the live registries (the evaluator keeps no private list of its
     * own); `eventProducers` names the events a hook really emits, so a rule on any other event may be
     * saved as a draft but must be labelled «تولیدکننده‌اش هنوز نوشته نشده» instead of pretending.
     */
    ruleFields: allFields().map((f) => ({
      id: f.id,
      label: f.label,
      kind: f.kind,
      group: f.group,
      source: f.source,
      sweep: f.sweep,
      audience: f.audience,
      hint: f.hint ?? null,
      min: f.min ?? null,
      max: f.max ?? null,
      options: f.options ?? [],
    })),
    ruleOperators: allOperators().map((o) => ({
      id: o.id,
      label: o.label,
      kinds: o.kinds,
      arity: o.arity,
    })),
    ruleLimits: RULE_LIMITS,
    repeatLimits: POLICY_LIMITS,
    /** The step registry, so the workflow builder offers the actions the runner can actually perform. */
    stepDefs: stepDefs(),
    stepLimits: STEP_LIMITS,
    eventProducers: PRODUCED_EVENTS,
    unproducedEvents: unproducedEvents(),
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
