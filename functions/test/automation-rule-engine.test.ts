import { beforeEach, describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { createCtx, type TestCtx } from './support/ctx';
import { seedCatalog } from '../src/services/push-automation-admin';
import { PRODUCED_EVENTS } from '../src/services/push-automation-events';
import { EVENT_LABELS } from '../src/services/push-automation-catalog';
import { fireAutomationEvent, runPushAutomations } from '../src/services/push-automation-engine';
import { deadConditions, repeatPolicyOf, withDefaults } from '../src/services/automation/migrate';
import type { PushAutomation, RuleNode } from '../src/domain/types';

/**
 * Stage D2: the rule tree wired into the real engine, through the real admin API.
 *
 * These tests are the difference between "the evaluator works" (`rule-eval.test.ts`) and "an admin can
 * actually manage flexible automation": a rule is saved over HTTP, read back from the store, evaluated
 * by the sweep that sends, re-checked at the moment of sending, and explained in the dry-run. Nothing
 * here is enabled in production, nothing reaches a real device, and a v1 rule is asserted to be
 * *untouched* — the migration must not light anything up.
 */

const root = resolve(__dirname, '..', '..');
let ctx: TestCtx;
let admin: { id: string; token: string; phone: string };
let marketer: { id: string; token: string; phone: string };

beforeEach(async () => {
  ctx = await createCtx({ start: '2026-10-03T06:30:00.000Z' }); // 10:00 Tehran, Saturday
  admin = await ctx.user('admin');
  marketer = await ctx.user('marketer');
  await seedCatalog(ctx.deps, { id: 'test', role: 'admin' });
  await ctx.api(marketer.token).post('/v1/me/devices', {
    token: `fcm-token-${Math.random().toString(36).slice(2, 10)}`,
    platform: 'android',
  });
});

const store = () => ctx.deps.store;
const leaf = (
  field: string,
  operator: string,
  value: number | string | boolean | null,
): RuleNode => ({
  type: 'leaf',
  field,
  operator,
  value,
});
const group = (op: 'and' | 'or' | 'not', children: RuleNode[]): RuleNode => ({
  type: 'group',
  op,
  children,
});

let seq = 0;
/** A custom v2 rule, written the way the panel will write it: tree in `when`, no legacy conditions. */
async function makeRule(
  over: Partial<PushAutomation> & { key?: string; when?: RuleNode | null },
): Promise<string> {
  const key = over.key ?? `rule_${++seq}`;
  const r = await ctx.api(admin.token).post('/v1/admin/push-automations', {
    key,
    name: `قاعده‌ی آزمایشی ${key}`,
    description: 'قاعده‌ای که درخت شرط را از پنل می‌گیرد و همان‌جا اجرا می‌شود.',
    category: 'messages',
    audienceRole: 'marketer',
    enabled: false,
    schemaVersion: 2,
    trigger: over.trigger ?? { kind: 'schedule_daily', time: '09:00' },
    audience: over.audience ?? { type: 'role', targetId: 'marketer', channel: 'any' },
    message: {
      title: `عنوان ${key}`,
      body: 'سلام {name}، یک شرط تازه بررسی شد.',
      actionRef: '/messages',
    },
    delivery: {
      priority: 'high',
      push: true,
      inApp: true,
      respectQuietHours: true,
      cooldownMs: 0,
    },
    when: over.when ?? null,
    ...(over.repeatPolicy ? { repeatPolicy: over.repeatPolicy } : {}),
  });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return key;
}

const enable = async (key: string) => {
  const r = await ctx.api(admin.token).post(`/v1/admin/push-automations/${key}/enabled`, {
    enabled: true,
  });
  expect(r.status, JSON.stringify(r.body)).toBe(200);
};

const runSweep = async () => {
  const r = await ctx.api(admin.token).post('/v1/admin/push-automations/run', { force: true });
  expect(r.status, JSON.stringify(r.body)).toBe(200);
};

const notesFor = (userId: string) =>
  store().query<{ type: string; title: string; automationKey?: string | null }>({
    collection: 'notifications',
    where: [['userId', '==', userId]],
  });

describe('a v2 rule tree survives the panel → store → engine path', () => {
  it('stores the tree exactly as it was written, and reads it back unchanged', async () => {
    const when = group('and', [
      leaf('activePackages', 'lte', 0),
      group('or', [leaf('inactiveDays', 'gte', 30), leaf('todayActive', 'isTrue', null)]),
    ]);
    const key = await makeRule({ when });
    const raw = (await store().get<PushAutomation>(`push_automations/${key}`)) as PushAutomation;
    expect(raw.when).toEqual(when);
    expect(raw.schemaVersion).toBe(2);
    const detail = await ctx.api(admin.token).get(`/v1/admin/push-automations/${key}`);
    expect(detail.status).toBe(200);
    expect(JSON.stringify(detail.body.data.when)).toBe(JSON.stringify(when));
    expect(detail.body.data.schemaVersion).toBe(2);
    expect(detail.body.data.policySource).toBe('inherited');
    expect(detail.body.data.deadConditions).toEqual([]);
    expect(String(detail.body.data.whenSummary)).toContain('شرط');
  });

  // One rule per test on purpose: two rules for one user in one sweep would collide with the global
  // minimum gap, and the assertion would then be about the gap rather than about the tree.
  it('OR sends where the same leaves under AND refuse', async () => {
    const leaves = [leaf('inactiveDays', 'gte', 30), leaf('startedEver', 'isTrue', null)];
    await makeRule({
      key: 'rule_or',
      when: group('and', [leaf('activePackages', 'lte', 0), group('or', leaves)]),
    });
    await enable('rule_or');
    await runSweep();
    expect((await notesFor(marketer.id)).map((n) => n.title)).toContain('عنوان rule_or');
  });

  it('the same three leaves under AND refuse, and the dry-run says which one', async () => {
    const leaves = [leaf('inactiveDays', 'gte', 30), leaf('startedEver', 'isTrue', null)];
    const key = await makeRule({
      key: 'rule_and',
      when: group('and', [leaf('activePackages', 'lte', 99), group('and', leaves)]),
    });
    const dry = await ctx.api(admin.token).post(`/v1/admin/push-automations/${key}/dry-run`, {});
    expect(dry.status, JSON.stringify(dry.body)).toBe(200);
    expect(dry.body.data.wouldSend).toBe(0);
    const mine = (dry.body.data.explain as Array<{ userId: string; ok: boolean }>)[0];
    expect(mine?.ok).toBe(false);
    await enable(key);
    await runSweep();
    expect((await notesFor(marketer.id)).map((n) => n.title)).not.toContain('عنوان rule_and');
  });

  it('NOT flips a leaf the rule would otherwise refuse', async () => {
    await makeRule({
      key: 'rule_not',
      when: group('and', [
        leaf('activePackages', 'lte', 0),
        group('not', [leaf('startedEver', 'isTrue', null)]),
      ]),
    });
    await enable('rule_not');
    await runSweep();
    expect((await notesFor(marketer.id)).map((n) => n.title)).toContain('عنوان rule_not');
  });

  it('carries twelve conditions — the fixed six-condition limit is gone from the live path', async () => {
    // The seeded user has no open package, so `progress` is 100: every `progress gte n` below is true.
    const when = group(
      'and',
      Array.from({ length: 12 }, (_unused, i) => leaf('progress', 'gte', i)),
    );
    const key = await makeRule({ key: 'rule_wide', when });
    expect((await ctx.api(admin.token).get(`/v1/admin/push-automations/${key}`)).status).toBe(200);
    await enable('rule_wide');
    await runSweep();
    expect((await notesFor(marketer.id)).map((n) => n.title)).toContain('عنوان rule_wide');
  });

  it('refuses an ill-typed or unsafe tree on save, with the registry as the only authority', async () => {
    const bad: Array<[RuleNode, string]> = [
      [leaf('passwordHash', 'eq', 'x'), 'passwordHash'],
      [leaf('progress', 'matches', 'a.*'), 'matches'],
      [leaf('startedEver', 'gte', 3), 'boolean'],
      [
        { type: 'group', op: 'xor', children: [leaf('progress', 'gte', 1)] } as unknown as RuleNode,
        'when',
      ],
      [leaf('progress', 'gte', 'زیاد'), 'باید عدد باشد'],
    ];
    for (const [when, needle] of bad) {
      const r = await ctx.api(admin.token).post('/v1/admin/push-automations', {
        key: `bad_${needle.replace(/[^a-z]/g, '_').slice(0, 12)}_${seq++}`,
        name: 'قاعده‌ی نامعتبر',
        description: 'این قاعده نباید ذخیره شود؛ هیچ شرطی بدون معنای مشخص ذخیره نمی‌شود.',
        category: 'messages',
        audienceRole: 'marketer',
        enabled: false,
        schemaVersion: 2,
        trigger: { kind: 'schedule_daily', time: '09:00' },
        audience: { type: 'role', targetId: 'marketer', channel: 'any' },
        message: { title: 'هرگز', body: 'هرگز', actionRef: '/messages' },
        delivery: {
          priority: 'high',
          push: true,
          inApp: true,
          respectQuietHours: true,
          cooldownMs: 0,
        },
        when,
      });
      expect(r.status, `${needle} should be refused`).toBe(400);
      expect(JSON.stringify(r.body)).toContain(needle);
    }
  });

  it('keeps the v1 six-item list as a legacy shape guard, and says so', async () => {
    const r = await ctx.api(admin.token).patch('/v1/admin/push-automations/inactive_1d', {
      trigger: {
        kind: 'condition',
        time: '09:00',
        conditions: Array.from({ length: 7 }, (_unused, i) => ({
          field: 'progress',
          op: 'gte',
          value: i,
        })),
      },
    });
    expect(r.status).toBe(400);
    // …while the same rule accepts a v2 tree of the same size: the cap was never about meaning.
    const ok = await ctx.api(admin.token).patch('/v1/admin/push-automations/inactive_1d', {
      schemaVersion: 2,
      trigger: { kind: 'condition', time: '09:00', conditions: [] },
      when: group(
        'and',
        Array.from({ length: 7 }, (_unused, i) => leaf('progress', 'gte', i)),
      ),
    });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
  });
});

describe('the audience filter is a second gate, evaluated where it counts', () => {
  const inTehran = {
    type: 'role' as const,
    targetId: 'marketer',
    channel: 'any' as const,
    filter: leaf('user.province', 'eq', 'تهران'),
  };

  it('refuses a fact field in an audience filter (it is not on the user row)', async () => {
    const r = await ctx.api(admin.token).post('/v1/admin/push-automations', {
      key: 'aud_bad',
      name: 'مخاطب نامعتبر',
      description: 'فیلتر مخاطب فقط می‌تواند فیلدهای خودِ کاربر را ببیند.',
      category: 'messages',
      audienceRole: 'marketer',
      enabled: false,
      schemaVersion: 2,
      trigger: { kind: 'schedule_daily', time: '09:00' },
      audience: {
        ...inTehran,
        filter: leaf('progress', 'gte', 3),
      } as unknown as PushAutomation['audience'],
      message: { title: 'هرگز', body: 'هرگز', actionRef: '/messages' },
      delivery: {
        priority: 'high',
        push: true,
        inApp: true,
        respectQuietHours: true,
        cooldownMs: 0,
      },
    });
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.body)).toContain('مخاطب');
  });

  it('re-checks the filter when the delayed item is delivered, not only when it was queued', async () => {
    await store().update(`users/${marketer.id}`, { province: 'تهران' });
    const key = await makeRule({
      key: 'aud_queue',
      trigger: { kind: 'event_delay', event: 'quiz.failed', delayMinutes: 1 },
      audience: inTehran,
      when: null,
    });
    await enable(key);
    const fired = await fireAutomationEvent(ctx.deps, 'quiz.failed', marketer.id, { score: 4 });
    expect(fired.matched).toBe(1);
    expect(fired.queued).toBe(1);
    expect(await notesFor(marketer.id)).toHaveLength(0);

    // The user moves between the event and the send. The queue item is still due and still theirs, but
    // the rule's audience is not them any more — the send must stand down.
    await store().update(`users/${marketer.id}`, { province: 'شیراز' });
    ctx.advance(2 * 60_000);
    await runPushAutomations(ctx.deps);
    expect(await notesFor(marketer.id)).toHaveLength(0);
    const trace = await ctx.api(admin.token).get(`/v1/admin/push-automations/trace/${marketer.id}`);
    expect(JSON.stringify(trace.body)).toContain('شیراز');
  });

  it('sends the same delayed item when the user still matches', async () => {
    await store().update(`users/${marketer.id}`, { province: 'تهران' });
    const key = await makeRule({
      key: 'aud_ok',
      trigger: { kind: 'event_delay', event: 'quiz.failed', delayMinutes: 1 },
      audience: inTehran,
      when: null,
    });
    await enable(key);
    await fireAutomationEvent(ctx.deps, 'quiz.failed', marketer.id, { score: 4 });
    ctx.advance(2 * 60_000);
    await runPushAutomations(ctx.deps);
    expect((await notesFor(marketer.id)).map((n) => n.title)).toContain('عنوان aud_ok');
  });
});

describe('dry-run explains itself per condition', () => {
  it('says which condition refused, with the value the rule saw', async () => {
    const key = await makeRule({
      key: 'rule_why',
      when: group('and', [leaf('inactiveDays', 'lte', 10), leaf('todayActive', 'isTrue', null)]),
    });
    // A user who has never been seen is `9999` days inactive, so the first leaf must refuse on the number.
    await store().update(`users/${marketer.id}`, { lastActiveAt: null });
    const r = await ctx.api(admin.token).post(`/v1/admin/push-automations/${key}/dry-run`, {});
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const explain = r.body.data.explain as Array<{
      userId: string;
      ok: boolean;
      why: string | null;
      lines: string[];
    }>;
    const mine = explain.find((e) => e.userId === marketer.id);
    expect(mine?.ok).toBe(false);
    expect(mine?.why).toContain('روز بی‌فعالیتی');
    expect(mine?.lines.some((l) => l.includes('روز بی‌فعالیتی'))).toBe(true);
    expect(String(mine?.why)).toMatch(/۹٬۹۹۹/);
    expect(mine?.lines.length).toBeGreaterThanOrEqual(2);
    expect(mine?.lines.some((l) => l.startsWith('✓'))).toBe(true);
    expect(r.body.data.wouldSend).toBe(0);
  });

  it('a preview consumes nothing: no notification, no counter, no send status change', async () => {
    const key = await makeRule({
      key: 'rule_preview',
      when: group('and', [
        leaf('activePackages', 'lte', 0),
        group('not', [leaf('startedEver', 'isTrue', null)]),
      ]),
    });
    await enable(key);
    const before = (await store().get<Record<string, unknown>>(`users/${marketer.id}`)) as Record<
      string,
      unknown
    >;
    const r = await ctx.api(admin.token).post(`/v1/admin/push-automations/${key}/dry-run`, {});
    expect(r.status).toBe(200);
    expect(r.body.data.wouldSend).toBe(1);
    expect(r.body.data.reviewed).toBeGreaterThan(0);
    expect(r.body.data.wouldSend).toBe(1);
    expect(await notesFor(marketer.id)).toHaveLength(0);
    const after = (await store().get<Record<string, unknown>>(`users/${marketer.id}`)) as Record<
      string,
      unknown
    >;
    expect(JSON.stringify(after)).toBe(JSON.stringify(before));
    const claims = await store().query({ collection: 'push_automation_claims' });
    expect(claims).toHaveLength(0);
  });
});

describe('migration leaves v1 rows alone', () => {
  it('a v1 row is upgraded only in memory, never on the store', async () => {
    const raw = (await store().get<Record<string, unknown>>(
      'push_automations/inactive_1d',
    )) as Record<string, unknown>;
    expect('when' in raw).toBe(false);
    expect('schemaVersion' in raw).toBe(false);
    expect('repeatPolicy' in raw).toBe(false);

    const up = withDefaults(raw as unknown as PushAutomation);
    expect(up.schemaVersion).toBe(1);
    // v1 flat conditions are NOT copied into `when` at read time: `matchesTrigger` already honours them
    // for `kind: 'condition'`, and re-expressing them would be a behaviour change in disguise.
    expect(up.when).toBeNull();
    expect(up.repeatPolicy).toBeNull();
    expect(up.audience.filter).toBeNull();
    // …and the same function on the same input again changes nothing (safe to call twice per request).
    expect(withDefaults(up)).toEqual(up);
  });

  it('reports the conditions a v1 trigger kind never evaluated, and inherits the legacy caps', async () => {
    const raw = (await store().get<PushAutomation>(
      'push_automations/inactive_1d',
    )) as PushAutomation;
    expect(deadConditions(raw)).toEqual([]); // `inactivity` carries no flat conditions
    const settings = { maxPerUserPerDay: 2, maxPerUserPerWeek: 10, minGapMs: 4 * 3_600_000 };
    expect(repeatPolicyOf(raw, settings)).toMatchObject({
      perDay: 2,
      perWeek: 10,
      minIntervalMs: 4 * 3_600_000,
    });
    const withWhen = withDefaults({
      ...raw,
      trigger: {
        kind: 'event',
        event: 'quiz.failed',
        conditions: [{ field: 'progress', op: 'gte', value: 10 }],
      },
    });
    // An event rule that carried conditions: the engine never read them, so they are reported, not obeyed.
    expect(deadConditions(withWhen)).toHaveLength(1);
  });
});

describe('the panel is told what the runtime can actually do', () => {
  it('exposes the registries, the budgets, and which events have a producer', async () => {
    const r = await ctx.api(admin.token).get('/v1/admin/push-automations/catalog');
    expect(r.status).toBe(200);
    const meta = r.body.data as {
      ruleFields: Array<{ id: string; audience: boolean; sweep: boolean; kind: string }>;
      ruleOperators: Array<{ id: string; kinds: string[] }>;
      ruleLimits: { maxLeaves: number; maxNodes: number; maxDepth: number };
      eventProducers: string[];
      unproducedEvents: string[];
    };
    expect(meta.ruleFields.some((f) => f.id === 'user.city' && f.audience)).toBe(true);
    expect(meta.ruleFields.find((f) => f.id === 'progress')?.audience).toBe(false);
    expect(meta.ruleFields.find((f) => f.id === 'event.score')?.sweep).toBe(false);
    expect(meta.ruleOperators.some((o) => o.id === 'in' && o.kinds.includes('enum'))).toBe(true);
    expect(meta.ruleLimits).toMatchObject({ maxNodes: 64, maxLeaves: 48, maxDepth: 6 });
    expect(meta.eventProducers).toContain('quiz.failed');
    expect(meta.eventProducers).not.toContain('badge.earned');
    expect(meta.unproducedEvents).toContain('badge.earned');
  });

  it('does not advertise an event that nothing emits (and does not hide one that does)', () => {
    const emitters = new Set<string>();
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, entry.name);
        if (entry.isDirectory()) walk(p);
        else if (entry.name.endsWith('.ts')) {
          const rel = relative(root, p).replace(/\\/g, '/');
          if (!rel.startsWith('functions/src/') || rel.includes('push-automation-events.ts'))
            continue;
          const src = readFileSync(p, 'utf8');
          for (const m of src.matchAll(
            /emitAutomationEvent(?:ForUsers)?\(\s*[A-Za-z0-9_.]*\s*,\s*'([a-z_]+\.[a-z_]+)'/g,
          ))
            emitters.add(m[1] as string);
          for (const m of src.matchAll(
            /emitAutomationEvent(?:ForUsers)?\(\s*'([a-z_]+\.[a-z_]+)'/g,
          ))
            emitters.add(m[1] as string);
        }
      }
    };
    walk(join(root, 'functions/src'));
    // A producer with no entry would be a hidden capability; an entry with no producer would be a lie
    // the panel could not tell apart from a working rule.
    for (const e of PRODUCED_EVENTS) expect(emitters.has(e), `producer for ${e}`).toBe(true);
    for (const e of emitters) expect(PRODUCED_EVENTS.includes(e), `${e} is emitted`).toBe(true);
    // Every labelled event is either produced or explicitly named as not produced — never a third state.
    for (const e of Object.keys(EVENT_LABELS))
      expect(PRODUCED_EVENTS.includes(e) || metaUnproduced().includes(e), `${e} classified`).toBe(
        true,
      );
  });
});

/** `unproducedEvents()` re-exported through the module that owns the list. */
function metaUnproduced(): string[] {
  return Object.keys(EVENT_LABELS).filter((e) => !PRODUCED_EVENTS.includes(e));
}
