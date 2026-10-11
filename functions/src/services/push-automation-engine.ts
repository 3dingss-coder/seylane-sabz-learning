import { DAY, dayKey } from '../lib/time';
import type { Doc } from '../store/types';
import type {
  AutomationCondition,
  DeviceToken,
  PushAutomationSettings,
  NotificationPrefs,
  PushAutomation,
  PushAutomationDecisionItem,
  PushAutomationRun,
  SectionProgress,
  User,
} from '../domain/types';
import type { NextItem, PackageView } from './learning-state';
import { computeNextItem, loadLearningForUsers, loadShared } from './learning-state';
import { annotateActivity, computeSignals } from './behavior';
import { deadlineLabel } from './assignments';
import { notifyUsers, render, type NotifyOptions } from './notify';
import { getPolicy, track, type Deps } from './context';
import { systemHealth } from './system-health';
import { isSafeAutomationPath } from './push-automation-governor';
import { AUTOMATION_VAR_NAMES, TRIGGER_KIND_LABELS } from './push-automation-catalog';
import {
  audienceAllows,
  evaluateFor,
  explainFor,
  firstFailure,
  type RuleData,
} from './automation/rule';
import {
  addSkip,
  advanceCounter,
  CLAIMS,
  DECISIONS,
  QUEUE,
  gate,
  isSystemGate,
  loadAutomations,
  loadCounterIndex,
  loadRunnable,
  logDecision,
  readSettings,
  PREFS,
  readCounter,
  readPrefs,
  RUNS,
  SKIP_LABELS,
  windowReached,
  writeCounter,
  type GateResult,
  type SkipReason,
  type UserCounter,
} from './push-automation-governor';

/**
 * The automation engine: turns (a rule + live data) into at most one send per (rule, user, window).
 *
 * Two layers, one cron job (`push-automations`, every 15 minutes):
 *  • Tier 1 — drain `push_automation_queue/<day>` (`event_delay` rules) and prune expired shards.
 *    No user scan at all, so an idle day costs a handful of reads.
 *  • Tier 2 — inside the rule's own Tehran window only, evaluate `inactivity` / `schedule_*` /
 *    `condition` rules over a bulk context: five queries for the whole population, never per user.
 *
 * Delivery always goes through `notifyUsers`, so quiet hours, deferral, invalid-token cleanup, prefs
 * and `pushStatus` behave exactly like every other notification in the product. Every refusal is
 * written to the user's decision log, which is what makes «چرا پوش نگرفتم؟» answerable later.
 */

/** Users one sweep evaluates before the rest waits for the next cron run. */
export const SWEEP_USERS_PER_RUN = 250;
/** Queue items processed per run (each can cost one provider call). */
export const QUEUE_ITEMS_PER_RUN = 60;
/** Documents the pruning step may delete per run — bounded so the cron never blows its write budget. */
export const PRUNE_DOCS_PER_RUN = 220;
/** How long a claim/queue shard survives after its day (they are tiny, and TTL is generous). */
export const CLAIM_RETENTION_DAYS = 2;

export type Facts = Record<string, number | boolean>;

export interface SweepContext {
  now: Date;
  timezone: string;
  users: Array<Doc<User>>;
  packagesByUser: Map<string, PackageView[]>;
  nextByUser: Map<string, NextItem | null>;
  counters: Map<string, UserCounter>;
  prefs: Map<string, NotificationPrefs>;
  tokens: Map<string, DeviceToken[]>;
  facts: Map<string, Facts>;
  /** Only loaded when a health-category rule is due; `null` means "not needed". */
  health: { failureRatePct: number; cronStalenessMin: number } | null;
}

export type DeliveryOutcome =
  { sent: true; windowKey: string } | { sent: false; reason: SkipReason };

const num = (v: unknown, fallback = 0): number =>
  typeof v === 'number' ? v : typeof v === 'boolean' ? (v ? 1 : 0) : fallback;

// ─── Facts: the only data a condition may look at ────────────────────────────

/**
 * One flat record per user, derived from data the sweep already holds in memory. Every field must be
 * computable from `PackageView[]` + the user row — that rule is what keeps a sweep at five queries.
 */
export function factsFor(user: Doc<User>, packages: PackageView[], now: Date): Facts {
  const active = packages.filter(
    (p) => p.status !== 'completed' && p.packageStatus === 'published',
  );
  const last = user.lastActiveAt ? Date.parse(user.lastActiveAt) : 0;
  const inactiveDays = user.lastActiveAt
    ? Math.max(0, Math.floor((now.getTime() - last) / DAY))
    : null;
  const signals = annotateActivity(
    computeSignals(packages, [], now, inactiveDays === null ? {} : { inactiveDays }),
    packages,
    now,
  );
  const today = dayKey(now, 'Asia/Tehran');
  return {
    progress: active.length ? Math.max(...active.map((p) => p.percent)) : 100,
    activePackages: active.length,
    overduePackages: active.filter((p) => p.overdue).length,
    stalledSections: active.reduce(
      (n, p) => n + p.sections.filter((s) => s.state === 'in_progress' && s.percent < 25).length,
      0,
    ),
    streakDays: signals.streakDays,
    // A user who never logged in is `9999`, i.e. «beyond every ladder step»: only `never_started`
    // (a condition rule on `startedEver`) speaks to them, so nobody gets a five-day-old ping.
    inactiveDays: inactiveDays ?? 9999,
    completedLast7d: packages.filter(
      (p) => p.completedAt && now.getTime() - Date.parse(p.completedAt) <= 7 * DAY,
    ).length,
    startedEver: packages.some((p) => p.status !== 'new'),
    accountAgeDays: Math.max(0, Math.floor((now.getTime() - Date.parse(user.createdAt)) / DAY)),
    todayActive: !!user.lastActiveAt && dayKey(new Date(last), 'Asia/Tehran') === today,
    hasDeadlineSoon: active.some(
      (p) =>
        p.deadlineAt &&
        Date.parse(p.deadlineAt) > now.getTime() &&
        Date.parse(p.deadlineAt) - now.getTime() <= 72 * 3600_000,
    ),
  };
}

/** `progress >= 80 AND todayActive == false` … evaluated against the in-memory fact record. */
export function matchConditions(
  facts: Facts,
  conditions: AutomationCondition[] | null | undefined,
) {
  for (const c of conditions ?? []) {
    const v = facts[c.field];
    if (v === undefined) return false;
    if (c.op === 'gte' && !(num(v) >= num(c.value))) return false;
    if (c.op === 'lte' && !(num(v) <= num(c.value))) return false;
    if (c.op === 'eq' && String(v) !== String(c.value)) return false;
    if (c.op === 'neq' && String(v) === String(c.value)) return false;
  }
  return true;
}

/** Does the user match the rule's trigger right now? (Also what the panel's dry-run reports.) */
export function matchesTrigger(a: PushAutomation, facts: Facts): boolean {
  const t = a.trigger;
  switch (t.kind) {
    case 'inactivity': {
      const days = t.inactivityDays ?? 1;
      const inactive = num(facts.inactiveDays, 9999);
      if (inactive >= 9999) return false; // never active → `never_started_24h` owns that person
      if (inactive < days) return false;
      // A finished learner with nothing open must not be nagged.
      return num(facts.activePackages) > 0 || num(facts.overduePackages) > 0;
    }
    case 'condition':
      return matchConditions(facts, t.conditions);
    default:
      return true;
  }
}

/**
 * Everything a rule must answer yes to for one user, and *why*. The three parts stay separate on
 * purpose: the trigger kind (an event, a window, a ladder step, the legacy flat condition list), the
 * v2 `when` tree, and the audience filter — an admin reading a decision log has to be able to tell
 * «the window had not opened» from «your condition said no».
 */
export interface RuleMatch {
  ok: boolean;
  /** The one sentence for the decision log: the first condition that refused. */
  why: string | null;
  /** Every evaluated condition, as ✓/✗ lines with the value the rule actually saw. */
  lines: string[];
  /** A budget stopped the evaluation, so `ok: false` here is not a real refusal. */
  truncated: boolean;
}

export function ruleMatch(a: PushAutomation, data: RuleData): RuleMatch {
  const now = data.now ?? new Date();
  const facts = data.facts ?? {};
  const lines: string[] = [];
  let why: string | null = null;
  let truncated = false;
  let ok = true;

  if (!matchesTrigger(a, facts)) {
    ok = false;
    why = triggerWhy(a, facts);
    lines.push(`✗ ${why ?? 'ماشین‌روشن‌کننده‌ی این قاعده الان برقرار نیست'}`);
  } else {
    const kindLine = TRIGGER_KIND_LABELS[a.trigger.kind] ?? a.trigger.kind;
    lines.push(`✓ ${kindLine}`);
  }

  // The v2 tree. A v1 row has no `when` (its flat conditions were just evaluated by `matchesTrigger`),
  // so the two shapes never double-report and a migrated row cannot start meaning something else.
  const when = evaluateFor(a.when ?? null, data, now);
  truncated = truncated || when.truncated;
  if (when.nodes > 0) {
    lines.push(...explainFor(when));
    if (!when.ok) {
      ok = false;
      why = why ?? firstFailure(when) ?? 'شرط قاعده برقرار نبود';
    }
  }
  if (when.truncated) {
    ok = false;
    why = 'بودجه‌ی ارزیابی قاعده تمام شد؛ برای روشن‌شدن این قاعده را ساده‌تر کنید.';
  }

  if (a.audience.filter && data.user) {
    const aud = evaluateFor(a.audience.filter, { ...data, now }, now);
    lines.push(...explainFor(aud));
    if (!aud.ok) {
      ok = false;
      why = why ?? firstFailure(aud) ?? 'فیلتر مخاطب این کاربر را راه نداد';
    }
    truncated = truncated || aud.truncated;
  }
  return { ok, why, lines, truncated };
}

/** Why the *trigger* itself refused — the part no `when` tree can speak about. */
function triggerWhy(a: PushAutomation, facts: Facts): string | null {
  const t = a.trigger;
  if (t.kind === 'inactivity') {
    const days = t.inactivityDays ?? 1;
    const inactive = num(facts.inactiveDays, 9999);
    if (inactive >= 9999)
      return 'این کاربر هرگز وارد نشده است (قاعده‌های بی‌فعالیتی با او کار ندارند)';
    if (inactive < days)
      return `${new Intl.NumberFormat('fa-IR').format(inactive)} روز بی‌فعالیتی، لازم ${new Intl.NumberFormat('fa-IR').format(days)} روز`;
    if (num(facts.activePackages) === 0 && num(facts.overduePackages) === 0)
      return 'چیزی باز ندارد؛ برای یک آموزش‌دیده پوش فرستاده نمی‌شود';
    return null;
  }
  if (t.kind === 'condition') return 'شرط‌های وضعیتی این قاعده برقرار نیست';
  return null;
}

// ─── Message variables ───────────────────────────────────────────────────────

const faNum = (n: number): string => new Intl.NumberFormat('fa-IR').format(n);

/** These arrive as words/dates/ids; only the remaining variables are numbers to localise. */
const TEXT_ONLY = new Set(['name', 'title', 'section', 'sectionId', 'packageId', 'deadline']);

function usedVars(a: PushAutomation): string[] {
  const text = `${a.message.title} ${a.message.body} ${a.message.actionRef}`;
  return [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1] as string);
}

/**
 * Builds the variables for one user. A variable the message uses but cannot fill must block the send
 * (see `sendAutomation`), so the values are never silently dropped from the sentence.
 */
export function resolveVars(
  user: Doc<User>,
  packages: PackageView[],
  next: NextItem | null,
  facts: Facts,
  extra: Record<string, string | number> = {},
): Record<string, string | number> {
  const active = packages.filter(
    (p) => p.status !== 'completed' && p.packageStatus === 'published',
  );
  const best =
    active.find((p) => p.id === next?.packageId) ??
    [...active].sort((x, y) => y.percent - x.percent)[0] ??
    packages[0];
  const deadlineMs = best?.deadlineAt ? Date.parse(best.deadlineAt) : null;
  const nowMs = Date.now();
  const firstName = (user.name ?? '').trim().split(/\s+/)[0] ?? '';
  const candidate: Record<string, string | number | null> = {
    name: firstName || null,
    title: best?.title ?? null,
    section: next?.sectionTitle ?? null,
    sectionId: next?.sectionId ?? null,
    packageId: best?.id ?? next?.packageId ?? null,
    percent: best ? Math.round(best.percent) : null,
    left: best ? 100 - Math.round(best.percent) : null,
    days: num(facts.inactiveDays, 0) >= 9999 ? null : num(facts.inactiveDays),
    hours:
      deadlineMs && deadlineMs > nowMs
        ? Math.max(1, Math.round((deadlineMs - nowMs) / 3600_000))
        : null,
    deadline: best
      ? deadlineLabel({ deadlineAt: best.deadlineAt, deadlineHours: best.deadlineWindowHours })
      : null,
    n: active.length,
    count: null,
    score: null,
    ...extra,
  };
  const vars: Record<string, string | number> = {};
  for (const name of AUTOMATION_VAR_NAMES) {
    const v = candidate[name];
    if (v === null || v === undefined || v === '') continue;
    // Every number a marketer reads is Persian (۱۲٪, not 12%) — the same rule the rest of the app follows.
    vars[name] = typeof v === 'number' && !TEXT_ONLY.has(name) ? faNum(v) : v;
  }
  return vars;
}

/** The variables this particular message needs and that are not available. */
export function missingVars(a: PushAutomation, vars: Record<string, string | number>): string[] {
  return usedVars(a).filter((v) => vars[v] === undefined);
}

// ─── The one send path ───────────────────────────────────────────────────────

export interface SendCtx {
  settings?: PushAutomationSettings;
  /** Shared token index for sweeps; `undefined` lets `notifyUsers` do its own per-user lookup. */
  tokens?: Map<string, DeviceToken[]>;
  counters?: Map<string, UserCounter>;
  prefs?: Map<string, NotificationPrefs>;
  /** Panel «ارسال آزمایشی»: caps, cooldown, windows and claims are all bypassed. */
  test?: boolean;
  dry?: boolean;
  kind?: PushAutomationRun['kind'];
}

/**
 * Renders → gates → delivers one message to one user, then records what happened. `dry`/`test` never
 * claim and never count, so a dry-run cannot consume a user's daily quota.
 */
export async function sendAutomation(
  d: Deps,
  a: PushAutomation,
  user: Doc<User>,
  vars: Record<string, string | number>,
  ctx: SendCtx,
  windowKeyOverride?: string,
): Promise<DeliveryOutcome> {
  const settings = ctx.settings ?? (await readSettings(d));
  const skip = async (reason: SkipReason, detail?: string): Promise<DeliveryOutcome> => {
    if (!ctx.dry && !ctx.test) await noteSkip(d, a.key, user.id, reason, detail);
    return { sent: false, reason };
  };

  // The kill-switch is not one of the send rules a caller may opt out of — it is the absence of the
  // engine — so it is checked BEFORE the `test`/`dry` bypass below. `gate()` puts it first for the
  // same reason; here it also covers «ارسال آزمایشی», which is the only path that reaches this
  // function with the bypass on (spec §4.1: nothing is sent while paused, not even a test).
  // A skip is not written to the decision log while paused, on purpose: the pause is global, and
  // 141 rows of «paused» would bury the per-user decisions an operator is looking for.
  // `dry` is exempt because a preview delivers nothing at all and the wizard's report is the
  // membership estimate (`dryRun`'s `note` says so out loud when the engine is stopped).
  if (settings.paused && !ctx.dry) return await skip('paused');

  // Re-evaluated here, at the action: a rule that parked this user in the queue three days ago, or
  // picked them in an earlier window, must not reach someone whose team/role/status changed since.
  // A test send is exempt (the admin is naming the recipient on purpose); a dry-run is NOT, or the
  // preview would promise a send reality refuses.
  if (!ctx.test) {
    const aud = audienceAllows(a, user);
    if (!aud.ok) return await skip('audience', firstFailure(aud) ?? undefined);
  }

  const title = render(a.message.title, vars);
  const body = render(a.message.body, vars);
  const actionRef = render(a.message.actionRef, vars);
  const missing = missingVars(a, vars);
  // Re-validate after substitution: a variable must never be able to turn a safe template into
  // another host (`sanitize`-style checks at render time are the campaign rule, kept here too).
  const unsafe = missing.length === 0 && !isSafeAutomationPath(actionRef);
  if (missing.length) return await skip('missingVariable', missing.join(','));
  if (unsafe) return await skip('missingVariable', 'actionRef');

  const counter: UserCounter = ctx.counters?.get(user.id) ?? (await readCounter(d, user.id));
  const prefs = ctx.prefs?.get(user.id) ?? (await readPrefs(d, user.id)) ?? null;
  const tokens = ctx.tokens;

  const decision: GateResult =
    ctx.test || ctx.dry
      ? { ok: true, windowKey: windowKeyOverride ?? 'preview' }
      : await gate(d, {
          automation: a,
          user,
          prefs,
          counter,
          settings,
          missingVariables: [],
          hasDevice: hasDeviceFor(a, user, tokens),
          ignoreGap: a.delivery.priority === 'urgent',
        });
  if (!decision.ok) return await skip(decision.reason, decision.detail);
  if (ctx.dry) return { sent: true, windowKey: 'preview' };

  const opts: NotifyOptions = {
    actionRef,
    imageUrl: a.message.imageUrl ?? null,
    push: a.delivery.push,
    // `urgent` is the ONLY thing that may cross quiet hours (spec §4.4) — and it has to arrive as the
    // pair `notifyUsers` defines (`priority: 'high'` + `urgent`, notify.ts:294), which is also what
    // `jobs.ts` passes for a deadline under 24h. `delivery.respectQuietHours` is NOT a second way in:
    // switching it off used to forge that pair here, which turned "this rule ignores the quiet-hours
    // setting" into "this rule is an emergency". A normal reminder now defers either way, and the
    // write path refuses the combination so the panel cannot offer a switch that does nothing.
    ...(a.delivery.priority === 'urgent'
      ? { priority: 'high' as const, urgent: true }
      : { priority: a.delivery.priority, urgent: false }),
    ...(a.delivery.cooldownMs > 0 && !ctx.test
      ? { throttleKey: `auto_${a.key}`, throttleMs: Math.max(60_000, a.delivery.cooldownMs) }
      : {}),
    automationKey: a.key,
    category: a.category,
    ...(ctx.test ? { isTest: true } : {}),
    ...(tokens ? { tokenIndex: tokens } : {}),
  };
  const created = await notifyUsers(d, [user.id], 'automation', { title, body }, opts);
  if (created === 0) return await skip('cooldown', 'notification_log');

  if (!ctx.test) {
    const now = d.clock().toISOString();
    const next = advanceCounter(counter, a.key, true, counter.day, counter.week, now);
    // Both, on purpose. The in-memory map keeps *this* run consistent (a second rule in the same sweep
    // must see the send the first one just did); the write is what makes the *next* run see it. Without
    // the write a scheduled rule's day counters only ever bound a single run, so a per-rule repeat
    // policy — or the inherited cap — could not be enforced across the windows of a day.
    if (ctx.counters) ctx.counters.set(user.id, next);
    await writeCounter(d, user.id, next);
    await track(d, 'automation_sent', user.id, { key: a.key, kind: ctx.kind ?? 'sweep' });
  }
  await logDecision(d, user.id, {
    at: d.clock().toISOString(),
    key: a.key,
    reason: 'sent',
    detail: ctx.test ? 'آزمایشی' : decision.windowKey,
  });
  return { sent: true, windowKey: decision.windowKey };
}

function hasDeviceFor(
  a: PushAutomation,
  user: Doc<User>,
  tokens?: Map<string, DeviceToken[]>,
): boolean | undefined {
  if (!tokens) return undefined; // unknown → notifyUsers/`pushStatus` will report 'skipped'
  const list = tokens.get(user.id) ?? [];
  const usable =
    a.audience.channel === 'any' ? list : list.filter((t) => t.platform === a.audience.channel);
  return usable.length > 0;
}

async function noteSkip(
  d: Deps,
  key: string,
  userId: string,
  reason: SkipReason,
  detail?: string,
): Promise<void> {
  const item: PushAutomationDecisionItem = {
    at: d.clock().toISOString(),
    key,
    reason,
    ...(detail ? { detail: `${SKIP_LABELS[reason] ?? reason} (${detail})` } : {}),
  };
  await logDecision(d, userId, item);
}

// ─── Bulk context (constant number of queries) ───────────────────────────────

export async function buildSweepContext(
  d: Deps,
  users: Array<Doc<User>>,
  opts: { health?: boolean } = {},
): Promise<SweepContext> {
  const policy = await getPolicy(d);
  const now = d.clock();
  const [shared, learning, counters, prefs, tokenRows] = await Promise.all([
    loadShared(d),
    loadLearningForUsers(d, users, undefined),
    loadCounterIndex(d),
    d.store.query<NotificationPrefs>({ collection: PREFS }),
    d.store.query<DeviceToken>({ collection: 'device_tokens' }),
  ]);
  void shared;
  const tokens = new Map<string, DeviceToken[]>();
  for (const t of tokenRows) {
    const list = tokens.get(t.userId) ?? [];
    list.push(t);
    tokens.set(t.userId, list);
  }
  const packagesByUser = new Map<string, PackageView[]>();
  const nextByUser = new Map<string, NextItem | null>();
  const facts = new Map<string, Facts>();
  for (const u of users) {
    const packages = learning.get(u.id)?.packages ?? [];
    packagesByUser.set(u.id, packages);
    nextByUser.set(u.id, computeNextItem(packages));
    facts.set(u.id, factsFor(u, packages, now));
  }
  let health: SweepContext['health'] = null;
  if (opts.health) {
    const h = await systemHealth(d);
    health = {
      failureRatePct: h.push.failureRate === null ? 0 : Math.round(h.push.failureRate * 100),
      cronStalenessMin: h.cron.minutesSinceLastRun ?? 9999,
    };
  }
  return {
    now,
    timezone: policy.timezone,
    users,
    packagesByUser,
    nextByUser,
    counters,
    prefs: new Map(prefs.map((p) => [p.id, p])),
    tokens,
    facts,
    health,
  };
}

/** The population the engine may consider: active accounts only (spec §4.9). */
export async function sweepUsers(d: Deps): Promise<Array<Doc<User>>> {
  const rows = await d.store.query<User>({
    collection: 'users',
    where: [['status', '==', 'active']],
  });
  return rows.filter((u) => u.role === 'marketer' || u.role === 'manager' || u.role === 'admin');
}

function isCandidate(a: PushAutomation, u: Doc<User>): boolean {
  const aud = a.audience;
  switch (aud.type) {
    case 'team':
      return !!aud.targetId && u.teamId === aud.targetId;
    case 'role':
      return u.role === (aud.targetId ?? u.role);
    case 'user':
      return u.id === aud.targetId;
    default:
      return a.audienceRole === 'all' || u.role === a.audienceRole;
  }
}

// ─── Sweeps (tier 2) ─────────────────────────────────────────────────────────

export interface SweepExplain {
  userId: string;
  name: string;
  ok: boolean;
  why: string | null;
  lines: string[];
  truncated?: boolean;
}

export interface SweepResult {
  evaluated: number;
  sent: number;
  skipped: Record<string, number>;
  failed: number;
  error: string | null;
  matched: Array<{ userId: string; name: string; reason: string }>;
  /**
   * How many users the rule was evaluated against at all (`evaluated` counts the ones it got to).
   * A preview that says «۰ بررسی شد» while the rule walked 120 users would be a lie about cost.
   */
  reviewed: number;
  /** Filled only when the caller asked for it (dry-run / trace page): why each user passed or failed. */
  explain: SweepExplain[];
}

const emptySweep = (): SweepResult => ({
  evaluated: 0,
  sent: 0,
  skipped: {},
  failed: 0,
  error: null,
  matched: [],
  reviewed: 0,
  explain: [],
});

/** How many users a dry-run explanation is built for: enough to spot a wrong rule, bounded per tick. */
const EXPLAIN_USERS_PER_RUN = 120;

/**
 * Evaluates one rule over the population. `dry` means "report, do not touch anything" — the same code
 * path the panel uses for «چند نفر الان مشمول می‌شوند؟», which is why the estimate cannot drift from
 * reality.
 */
export async function evaluateSweep(
  d: Deps,
  a: PushAutomation,
  ctx: SweepContext,
  opts: {
    dry?: boolean;
    test?: boolean;
    /** Per-user ✓/✗ report for the preview panel. Costs nothing but memory; the data is already here. */
    explain?: boolean;
    settings?: Awaited<ReturnType<typeof readSettings>>;
  } = {},
): Promise<SweepResult> {
  const out = emptySweep();
  const settings = opts.settings ?? (await readSettings(d));
  // A manager summary is not «does this manager match the rule» but «how many of their team do».
  const aggregate = !!a.delivery.aggregateForManager && a.trigger.kind === 'inactivity';
  const inAudience = ctx.users.filter((u) => isCandidate(a, u));
  out.reviewed = inAudience.length;
  if (opts.explain) {
    for (const u of inAudience.slice(0, EXPLAIN_USERS_PER_RUN)) {
      const m = ruleMatch(a, { facts: factsForRule(a, ctx, u), user: u, now: ctx.now });
      out.explain.push({
        userId: u.id,
        name: u.name,
        ok: m.ok,
        why: m.why,
        lines: m.lines,
        truncated: m.truncated,
      });
    }
  }
  const candidates = inAudience
    .filter((u) =>
      aggregate
        ? u.role === 'manager'
        : ruleMatch(a, { facts: factsForRule(a, ctx, u), user: u, now: ctx.now }).ok,
    )
    .slice(0, SWEEP_USERS_PER_RUN);
  out.evaluated = candidates.length;
  const ladder = await ladderFilter(d, a, candidates, ctx);
  const sendCtx: SendCtx = {
    settings,
    tokens: ctx.tokens,
    counters: ctx.counters,
    prefs: ctx.prefs,
    dry: opts.dry,
    test: opts.test,
    kind: 'sweep',
  };
  for (const u of candidates) {
    const facts = ctx.facts.get(u.id) ?? {};
    if (aggregate) {
      const days = a.trigger.inactivityDays ?? 7;
      const flagged = ctx.users.filter(
        (m) =>
          m.role !== 'manager' &&
          !!u.teamId &&
          m.teamId === u.teamId &&
          num(ctx.facts.get(m.id)?.inactiveDays, 9999) >= days,
      ).length;
      if (!flagged) {
        addSkip(out.skipped, 'audience');
        continue;
      }
      const r = await sendAutomation(d, a, u, { count: flagged }, sendCtx);
      if (r.sent) {
        out.sent++;
        out.matched.push({ userId: u.id, name: u.name, reason: 'sent' });
      } else addSkip(out.skipped, r.reason);
      continue;
    }
    if (!ladder.allow(u.id)) {
      addSkip(out.skipped, 'ladder');
      out.matched.push({ userId: u.id, name: u.name, reason: 'ladder' });
      continue;
    }
    try {
      const vars = resolveVars(
        u,
        ctx.packagesByUser.get(u.id) ?? [],
        ctx.nextByUser.get(u.id) ?? null,
        facts,
        extrasFor(a, ctx),
      );
      const r = await sendAutomation(d, a, u, vars, sendCtx);
      if (r.sent) {
        out.sent++;
        out.matched.push({ userId: u.id, name: u.name, reason: 'sent' });
      } else {
        addSkip(out.skipped, r.reason);
        out.matched.push({ userId: u.id, name: u.name, reason: r.reason });
      }
    } catch (e) {
      out.failed++;
      addSkip(out.skipped, 'error');
      out.error = (e as Error).message?.slice(0, 200) ?? 'failed';
    }
  }
  return out;
}

/**
 * Which facts a rule is evaluated against. Health rules look at the two global numbers (failure rate,
 * cron staleness) instead of per-user learning facts, which keeps them inside the same pipeline:
 * caps, claims, decisions and the run log all work for an alert about the engine itself.
 */
export function factsForRule(a: PushAutomation, ctx: SweepContext, user: Doc<User>): Facts {
  if (a.category === 'health') return ctx.health ? { ...ctx.health } : {};
  void user;
  return ctx.facts.get(user.id) ?? {};
}

/** The `{n}` of a health alert is the number that tripped it, not the user's package count. */
function extrasFor(a: PushAutomation, ctx: SweepContext): Record<string, string | number> {
  if (a.category !== 'health' || !ctx.health) return {};
  const value =
    a.key === 'push_cron_stalled' ? ctx.health.cronStalenessMin : ctx.health.failureRatePct;
  return { n: value };
}

/**
 * The inactivity ladder: inside one episode (identified by `lastActiveAt`) only the highest matched
 * step may send, so someone away for four days is not pinged for one, two and three.
 */
async function ladderFilter(
  d: Deps,
  a: PushAutomation,
  candidates: Array<Doc<User>>,
  ctx: SweepContext,
): Promise<{ allow(userId: string): boolean }> {
  const group = a.trigger.ladderGroup;
  if (!group) return { allow: () => true };
  const all = await loadAutomations(d);
  const steps = all
    .filter((x) => x.enabled && x.trigger.ladderGroup === group)
    .map((x) => x.trigger.inactivityDays ?? 0)
    .sort((x, y) => x - y);
  const mine = a.trigger.inactivityDays ?? 0;
  const allowed = new Set<string>();
  for (const u of candidates) {
    const inactive = num(ctx.facts.get(u.id)?.inactiveDays, 9999);
    const top = steps.filter((s) => s <= inactive).pop() ?? 0;
    if (top === mine) allowed.add(u.id);
  }
  return { allow: (id: string) => allowed.has(id) };
}

// ─── Events (`fireAutomationEvent`) ─────────────────────────────────────────

export interface EventResult {
  matched: number;
  sent: number;
  queued: number;
  skipped: number;
}

/** A rule only pays for variable resolution if its wording actually contains a `{placeholder}`. */
function usesVariables(a: PushAutomation): boolean {
  return /\{[a-zA-Z]/.test(`${a.message.title} ${a.message.body}`);
}

/**
 * The variables an event handler cannot know: package title, next item, streak. A hook site passes
 * only what it alone has seen (a score, a section id) and the engine fills the rest from the
 * learner's own state — otherwise every new hook would need to import `learning-state`.
 */
export async function eventVars(
  d: Deps,
  user: Doc<User>,
  a?: PushAutomation,
): Promise<Record<string, string | number>> {
  try {
    const ctx = await buildSweepContext(d, [user], { health: a?.category === 'health' });
    return resolveVars(
      user,
      ctx.packagesByUser.get(user.id) ?? [],
      ctx.nextByUser.get(user.id) ?? null,
      a ? factsForRule(a, ctx, user) : (ctx.facts.get(user.id) ?? {}),
    );
  } catch {
    return {};
  }
}

/**
 * The one entry point for code-side events (quiz submit, package publish, …). Cheap by construction:
 * two reads (settings + catalogue), then at most one write per matching rule; `event_delay` rules only
 * park a queue document. It never throws into the caller — a broken automation must not break a quiz
 * submission — and failures land in the cron health doc instead.
 */
export async function fireAutomationEvent(
  d: Deps,
  event: string,
  userId: string,
  vars: Record<string, string | number> = {},
): Promise<EventResult> {
  const out: EventResult = { matched: 0, sent: 0, queued: 0, skipped: 0 };
  try {
    const settings = await readSettings(d);
    if (settings.paused) return out;
    const { automations } = await loadRunnable(d);
    const nowMs = d.clock().getTime();
    const day = dayKey(new Date(nowMs), (await getPolicy(d)).timezone);
    const matching = automations.filter((a) => a.trigger.event === event && !isSystemGate(a));
    if (!matching.length) return out;
    const user = await d.store.get<User>(`users/${userId}`);
    if (!user) {
      out.skipped += matching.length; // a deleted account is not an error, and not a send
      return out;
    }
    // Resolved once per event, not per rule: the learner's state is the same for all of them, and a
    // delayed rule needs the values inside its queue document (see `drainQueue`).
    const base = matching.some(usesVariables) ? await eventVars(d, user as Doc<User>) : {};
    const allVars = { ...base, ...vars };
    for (const a of matching) {
      const t = a.trigger;
      if (t.kind === 'event') {
        out.matched++;
        const r = await sendAutomation(d, a, user as Doc<User>, allVars, {
          settings,
          kind: 'event',
        });
        if (r.sent) out.sent++;
        else out.skipped++;
      } else if (t.kind === 'event_delay') {
        out.matched++;
        out.queued++;
        const delay = Math.max(0, t.delayMinutes ?? 0) * 60_000;
        const dueAt = nowMs + delay;
        await d.store.set(`${QUEUE}/${day}/${a.key}__${userId}`, {
          key: a.key,
          userId,
          event,
          vars: allVars,
          dueAt: new Date(dueAt).toISOString(),
          createdAt: new Date(nowMs).toISOString(),
          status: 'pending',
          expireAt: new Date(dueAt + 7 * DAY).toISOString(),
        });
      }
    }
  } catch (e) {
    console.warn(`[automations] event ${event} failed`, (e as Error).message);
  }
  return out;
}

// ─── Delayed events (tier 1) ─────────────────────────────────────────────────

interface QueueItem {
  id: string;
  key: string;
  userId: string;
  event: string;
  vars: Record<string, string | number>;
  dueAt: string;
  status: string;
}

/** Processes the due part of today's queue, re-checking that the reason for the nudge still holds. */
export async function drainQueue(
  d: Deps,
  settings: Awaited<ReturnType<typeof readSettings>>,
  budgetMs: number | null = null,
): Promise<{ scanned: number; sent: number; closed: number }> {
  const day = dayKey(d.clock(), (await getPolicy(d)).timezone);
  // A paused engine must leave the queue alone: items stay `pending` and are delivered after the
  // pause is lifted. Closing them here would silently delete follow-ups scheduled during an outage.
  if (settings.paused) return { scanned: 0, sent: 0, closed: 0 };
  const rows = await d.store.query<QueueItem>({
    collection: `${QUEUE}/${day}`,
    where: [['status', '==', 'pending']],
  });
  const nowMs = d.clock().getTime();
  const due = rows.filter((r) => Date.parse(r.dueAt) <= nowMs).slice(0, QUEUE_ITEMS_PER_RUN);
  const res = { scanned: due.length, sent: 0, closed: 0 };
  if (!due.length) return res;
  const { automations } = await loadRunnable(d);
  const byKey = new Map(automations.map((a) => [a.key, a]));
  const users = new Map<string, Doc<User> | null>();
  for (const item of due) {
    if (budgetMs !== null && Date.now() > budgetMs) break;
    const a = byKey.get(item.key);
    if (!a) {
      await closeQueueItem(d, day, item.id, 'disabled');
      res.closed++;
      continue;
    }
    if (!users.has(item.userId))
      users.set(
        item.userId,
        ((await d.store.get<User>(`users/${item.userId}`)) as Doc<User>) ?? null,
      );
    const user = users.get(item.userId);
    if (!user) {
      await closeQueueItem(d, day, item.id, 'audience');
      res.closed++;
      continue;
    }
    if (!(await stillValid(d, a, user, item.vars))) {
      await closeQueueItem(d, day, item.id, 'duplicate');
      await noteSkip(d, a.key, user.id, 'duplicate', 'resolved');
      res.closed++;
      continue;
    }
    const r = await sendAutomation(d, a, user, item.vars ?? {}, { settings, kind: 'queue' });
    await closeQueueItem(d, day, item.id, r.sent ? 'sent' : r.reason);
    res.closed++;
    if (r.sent) res.sent++;
  }
  return res;
}

/** Did the user already do the thing the nudge was about? Stale reminders must never fire. */
export async function stillValid(
  d: Deps,
  a: PushAutomation,
  user: Doc<User>,
  vars: Record<string, string | number> = {},
): Promise<boolean> {
  if (user.status !== 'active') return false;
  switch (a.trigger.event) {
    case 'attempt.started': {
      // `quiz_abandoned`: still true only while an attempt is open.
      const open = await d.store.query<{ id: string }>({
        collection: 'attempts',
        where: [
          ['userId', '==', user.id],
          ['status', '==', 'in_progress'],
        ],
        limit: 1,
      });
      return open.length > 0;
    }
    case 'quiz.failed': {
      const latest = await d.store.query<{ passed: boolean | null }>({
        collection: 'attempts',
        where: [['userId', '==', user.id]],
        limit: 5,
      });
      return !latest.some((x) => x.passed === true);
    }
    case 'section.completed': {
      const sectionId = String(vars.sectionId ?? '');
      if (!sectionId) return true;
      const rows = await d.store.query<SectionProgress>({
        collection: 'section_progress',
        where: [
          ['userId', '==', user.id],
          ['sectionId', '==', sectionId],
        ],
        limit: 1,
      });
      return !rows.some((r) => r.quizPassed);
    }
    default:
      return true;
  }
}

async function closeQueueItem(d: Deps, day: string, id: string, status: string): Promise<void> {
  await d.store
    .update(`${QUEUE}/${day}/${id}`, { status, closedAt: d.clock().toISOString() })
    .catch(() => undefined);
}

// ─── Shard pruning (D1 has no TTL) ───────────────────────────────────────────

const PRUNE_STATE = 'push_automation_prune/global';

interface PruneState {
  /** Newest shard already emptied, per group. */
  transient: string | null;
  decisions: string | null;
}

/** One shard per group per run, oldest first, at most `PRUNE_DOCS_PER_RUN` deletes. */
async function pruneGroup(
  d: Deps,
  cols: string[],
  from: string | null,
  until: string,
  tz: string,
): Promise<{ removed: number; day: string }> {
  let day = from ?? until;
  if (day > until) return { removed: 0, day };
  // A long outage must not turn into a month of deletes: at most 8 shards behind.
  const floor = dayKey(new Date(Date.parse(`${until}T12:00:00Z`) - 7 * DAY), tz);
  if (day < floor) day = floor;
  let removed = 0;
  for (const col of cols) {
    const rows = await d.store.query<{ id: string }>({ collection: `${col}/${day}` });
    for (const r of rows.slice(0, Math.max(0, PRUNE_DOCS_PER_RUN - removed))) {
      await d.store.delete(`${col}/${day}/${r.id}`);
      if (++removed >= PRUNE_DOCS_PER_RUN) return { removed, day };
    }
  }
  return { removed, day };
}

/**
 * Drops expired day-shards (D1 has no TTL). Shard names are derived from the clock, so no index
 * document is needed: claims and queue items are short-lived, decision logs live `decisionTtlDays`.
 * Anything a run could not delete (more than the per-run budget in one shard) stays as a tombstone;
 * a leftover claim can only ever *prevent* a send, never cause one.
 */
export async function pruneExpiredShards(d: Deps): Promise<number> {
  const policy = await getPolicy(d);
  const settings = await readSettings(d);
  const tz = policy.timezone;
  const now = d.clock();
  const state = (await d.store.get<PruneState>(PRUNE_STATE)) ?? {
    transient: null,
    decisions: null,
  };
  const shift = (ttl: number) => dayKey(new Date(now.getTime() - (ttl + 1) * DAY), tz);
  const nextDay = (day: string) => dayKey(new Date(Date.parse(`${day}T12:00:00Z`) + DAY), tz);
  const targets: Array<{ key: keyof PruneState; cols: string[]; until: string }> = [
    { key: 'transient', cols: [CLAIMS, QUEUE], until: shift(CLAIM_RETENTION_DAYS) },
    { key: 'decisions', cols: [DECISIONS], until: shift(settings.decisionTtlDays) },
  ];
  const next: PruneState = { ...state };
  let removed = 0;
  for (const t of targets) {
    const res = await pruneGroup(d, t.cols, state[t.key], t.until, tz);
    removed += res.removed;
    // Only advance when the shard was fully swept, otherwise the next run finishes it.
    next[t.key] = res.removed > 0 || res.day < t.until ? nextDay(res.day) : state[t.key];
  }
  await d.store.set(PRUNE_STATE, next as unknown as Record<string, unknown>);
  return removed;
}

// ─── The cron entry point ────────────────────────────────────────────────────

export interface AutomationRunResult {
  runId: string | null;
  queue: { scanned: number; sent: number; closed: number } | null;
  pruned: number;
  sweeps: Array<{
    key: string;
    name: string;
    windowKey: string;
    evaluated: number;
    sent: number;
    skipped: number;
    failed: number;
    error: string | null;
  }>;
  skippedTotals: Record<string, number>;
  paused: boolean;
}

const SCHEDULED_KINDS = ['inactivity', 'condition', 'schedule_daily', 'schedule_weekly'];

/**
 * Cron entry point, also the panel's «اجرای الان» (`force: true`) and «آزمایش بدون ارسال»
 * (`dryRun: true`). The job order in `services/cron.ts` runs this *before* `flush-push`, so a push
 * deferred by quiet hours today is picked up by the same run's flush.
 */
export async function runPushAutomations(
  d: Deps,
  opts: {
    force?: boolean;
    onlyKey?: string | null;
    dryRun?: boolean;
    deadlineAtMs?: number | null;
  } = {},
): Promise<AutomationRunResult> {
  const settings = await readSettings(d);
  const result: AutomationRunResult = {
    runId: null,
    queue: null,
    pruned: 0,
    sweeps: [],
    skippedTotals: {},
    paused: settings.paused,
  };
  // The kill-switch is not bypassable — `force` only skips the time window, never the pause. A manual
  // «اجرای الان» while paused must still send nothing.
  if (settings.paused) {
    result.pruned = await pruneExpiredShards(d);
    return result;
  }
  result.queue = await drainQueue(d, settings, opts.deadlineAtMs ?? null);

  const { automations } = await loadRunnable(d);
  const due: PushAutomation[] = [];
  for (const a of automations) {
    if (!SCHEDULED_KINDS.includes(a.trigger.kind ?? '')) continue;
    if (opts.onlyKey && a.key !== opts.onlyKey) continue;
    if (!opts.force && !(await windowReached(d, a))) continue;
    due.push(a);
  }
  if (due.length) {
    const needsHealth = due.some((a) => a.category === 'health');
    const users = await sweepUsers(d);
    const ctx = await buildSweepContext(d, users, { health: needsHealth });
    for (const a of due) {
      if (opts.deadlineAtMs !== null && Date.now() > (opts.deadlineAtMs ?? Infinity)) break;
      const runId = d.store.newId();
      const windowKey = dayKey(d.clock(), ctx.timezone);
      const started: PushAutomationRun = {
        key: a.key,
        kind: opts.dryRun ? 'manual' : 'sweep',
        windowKey,
        startedAt: d.clock().toISOString(),
        finishedAt: null,
        evaluated: 0,
        matched: 0,
        sent: 0,
        skipped: {},
        failed: 0,
        error: null,
      };
      result.runId = runId;
      if (!opts.dryRun)
        await d.store.set(`${RUNS}/${runId}`, started as unknown as Record<string, unknown>);
      const sweep = await evaluateSweep(d, a, ctx, { dry: opts.dryRun, settings });
      const skipped = Object.values(sweep.skipped).reduce((x, y) => x + y, 0);
      for (const [k, v] of Object.entries(sweep.skipped))
        result.skippedTotals[k] = (result.skippedTotals[k] ?? 0) + v;
      if (!opts.dryRun) {
        await d.store.update(`${RUNS}/${runId}`, {
          finishedAt: d.clock().toISOString(),
          evaluated: sweep.evaluated,
          matched: sweep.sent,
          sent: sweep.sent,
          skipped: sweep.skipped,
          failed: sweep.failed,
          error: sanitizeRunError(sweep.error),
        });
        await bumpAutomationStats(d, a, sweep.sent, skipped);
      }
      result.sweeps.push({
        key: a.key,
        name: a.name,
        windowKey,
        evaluated: sweep.evaluated,
        sent: sweep.sent,
        skipped,
        failed: sweep.failed,
        error: sanitizeRunError(sweep.error),
      });
    }
  }
  if (!opts.dryRun) result.pruned = await pruneExpiredShards(d);
  return result;
}

/** Never let a raw driver message (which can carry a URL or token) reach the run log. */
function sanitizeRunError(raw: string | null): string | null {
  if (!raw) return null;
  return raw.replace(/[A-Za-z0-9_\-:.]{40,}/g, '[hidden]').slice(0, 200);
}

async function bumpAutomationStats(
  d: Deps,
  a: PushAutomation,
  sent: number,
  skipped: number,
): Promise<void> {
  const prev = a.stats ?? { lastRunAt: null, sent7d: 0, accepted7d: 0, skipped7d: 0 };
  await d.store.update(`push_automations/${a.key}`, {
    stats: {
      lastRunAt: d.clock().toISOString(),
      sent7d: prev.sent7d + sent,
      accepted7d: prev.accepted7d + sent,
      skipped7d: prev.skipped7d + skipped,
    },
  });
}
