import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { dayKey } from '../src/lib/time';
import { runJob } from '../src/services/cron';
import { runPushAutomations } from '../src/services/push-automation-engine';
import { register, adminUpdateUser } from '../src/services/users';
import {
  AUTOMATION_ADMIN_EVENT_PATH,
  AUTOMATION_EVENT_PATH,
  EVENTS_PER_USER_RUN,
  drainAutomationEvents,
  emitAutomationEvent,
  emitAutomationEventForUsers,
  isListening,
  listeningEvents,
  packageLearnerIds,
  type AutomationEvent,
} from '../src/services/push-automation-events';
import {
  seedCatalog,
  setAutomationEnabled,
  setPaused,
  traceUser,
} from '../src/services/push-automation-admin';
import { buildFixture, createCtx, type TestCtx } from './support/ctx';
import type { Doc } from '../src/store/types';

/**
 * The event pipeline of prompt §5.2: business code records what happened, the engine decides whether
 * anything is worth sending. What these tests pin down:
 *
 *  • a request that triggers an event writes **at most one row**, and **no row at all** while no
 *    automation listens for that event (the cost rule of prompt §4.9);
 *  • the same person and event on the same day cannot be queued twice (prompt §4.2);
 *  • a row is consumed exactly once — a documented skip is final, not something to retry for hours;
 *  • variables come from the learner's own state, so a hook site stays one line and still renders
 *    «آموزش کرم مرطوب کننده» instead of a literal `{title}`.
 */

let ctx: TestCtx;
const ACTOR = { id: 'test', role: 'admin' } as const;

beforeEach(async () => {
  ctx = await createCtx({ start: '2026-10-03T06:30:00.000Z' }); // 10:00 Tehran, Saturday
  await seedCatalog(ctx.deps, ACTOR);
});

const store = () => ctx.deps.store;
const shard = () => `push_automation_events/${dayKey(ctx.deps.clock(), 'Asia/Tehran')}`;
const rows = async (): Promise<Array<Doc<AutomationEvent>>> =>
  await store().query<AutomationEvent>({ collection: shard() });
const rawRow = (event: string, userId: string, id: string) =>
  store().set(`${shard()}/${id}`, {
    event,
    userId,
    vars: {},
    at: ctx.deps.clock().toISOString(),
    expireAt: new Date(ctx.deps.clock().getTime() + 3_600_000).toISOString(),
  });

const enable = (key: string) => setAutomationEnabled(ctx.deps, ACTOR, key, true);
/** A push can only reach a registered device. */
const device = (token: string) =>
  ctx.api(token).post('/v1/me/devices', {
    token: `fcm-${Math.random().toString(36).slice(2, 12)}`,
    platform: 'android',
  });

describe('who is listening', () => {
  it('knows only enabled, non-gate automations', async () => {
    // The seeded `quiz_failed` row is a gate: it mirrors today's template, it consumes no events.
    expect(await isListening(ctx.deps, 'quiz.failed')).toBe(false);
    expect(await isListening(ctx.deps, 'quiz.failed_twice')).toBe(false); // scenario switched off
    await enable('two_fails_mentor');
    ctx.advance(60_000); // the listener set is cached for 30s, so an admin toggle needs a new read
    expect(await isListening(ctx.deps, 'quiz.failed_twice')).toBe(true);
    const events = await listeningEvents(ctx.deps);
    expect(events.has('quiz.failed_twice')).toBe(true);
    expect(events.has('quiz.passed')).toBe(false); // gate only
    expect(events.has('deadline.warning')).toBe(false); // gate only
  });

  it('treats a paused engine as unattended, so nothing queues up for later', async () => {
    await enable('two_fails_mentor');
    await setPaused(ctx.deps, ACTOR, true);
    ctx.advance(60_000); // past the cache horizon, so the pause is seen
    expect(await listeningEvents(ctx.deps)).toEqual(new Set<string>());
    expect(await emitAutomationEvent(ctx.deps, 'quiz.failed_twice', 'u1')).toBe(false);
    expect(await rows()).toHaveLength(0);
  });
});

describe('emit', () => {
  it('writes nothing while no automation listens for the event', async () => {
    const m = await ctx.user('marketer');
    expect(
      await emitAutomationEvent(ctx.deps, 'section.completed', m.id, { sectionId: 's1' }),
    ).toBe(false);
    expect(await rows()).toHaveLength(0);
  });

  it('queues one row per person and event, and drops the duplicate of the same day', async () => {
    await enable('two_fails_mentor');
    expect(await emitAutomationEvent(ctx.deps, 'quiz.failed_twice', 'u1', { score: 40 })).toBe(
      true,
    );
    expect(await emitAutomationEvent(ctx.deps, 'quiz.failed_twice', 'u1', { score: 55 })).toBe(
      false,
    );
    const queued = await rows();
    expect(queued).toHaveLength(1);
    expect(queued[0]?.userId).toBe('u1');
    expect(queued[0]?.vars).toEqual({ score: 40 }); // the first one wins, like an idempotency key
    expect(Date.parse(queued[0]?.expireAt ?? '')).toBeGreaterThan(ctx.deps.clock().getTime());
  });

  it('shards by day, so yesterday never deduplicates against today', async () => {
    await enable('two_fails_mentor');
    expect(await emitAutomationEvent(ctx.deps, 'quiz.failed_twice', 'u1')).toBe(true);
    ctx.advance(25 * 3_600_000);
    expect(await emitAutomationEvent(ctx.deps, 'quiz.failed_twice', 'u1')).toBe(true);
  });

  it('fans a broadcast out over the caller’s own recipient list only', async () => {
    await enable('package_updated');
    expect(await emitAutomationEventForUsers(ctx.deps, 'package.updated', ['u1', 'u2', 'u1'])).toBe(
      2, // the duplicate of `u1` is not queued twice
    );
    expect((await rows()).map((r) => r.userId).sort()).toEqual(['u1', 'u2']);
    // …and while nobody listens, the same call is free.
    await setAutomationEnabled(ctx.deps, ACTOR, 'package_updated', false);
    ctx.advance(60_000);
    expect(await emitAutomationEventForUsers(ctx.deps, 'package.updated', ['u3', 'u4'])).toBe(0);
  });

  it('lists the learners of a package, once each', async () => {
    const fx = await buildFixture(ctx);
    const m = await ctx.user('marketer');
    for (const [id, sectionId, packageId] of [
      ['a', fx.sections[0]?.id, fx.packageId],
      ['b', fx.sections[1]?.id, fx.packageId],
      ['c', 'x', 'another-package'],
    ] as Array<[string, string, string]>)
      await store().set(`section_progress/${m.id}_${id}`, {
        userId: id === 'c' ? 'other' : m.id,
        sectionId,
        packageId,
        percent: 40,
      });
    expect(await packageLearnerIds(ctx.deps, fx.packageId)).toEqual([m.id]);
  });
});

describe('drain', () => {
  it('turns a queued event into one push and consumes the row', async () => {
    const m = await ctx.user('marketer');
    await buildFixture(ctx);
    await device(m.token);
    await enable('two_fails_mentor');
    await emitAutomationEvent(ctx.deps, 'quiz.failed_twice', m.id, {});
    expect(ctx.deps.push.sent).toHaveLength(0); // nothing is sent inside the request
    expect(await drainAutomationEvents(ctx.deps)).toMatchObject({ scanned: 1, sent: 1, failed: 0 });
    expect(ctx.deps.push.sent).toHaveLength(1);
    expect(ctx.deps.push.sent[0]?.msg.title).toContain('منتور');
    expect(ctx.deps.push.sent[0]?.msg.data?.link).toBe('/mentor');
    expect(await rows()).toHaveLength(0);
    expect(await drainAutomationEvents(ctx.deps)).toMatchObject({ scanned: 0, sent: 0 });
  });

  it('consumes a row even when it only produced a documented skip', async () => {
    const m = await ctx.user('marketer');
    await buildFixture(ctx);
    await device(m.token);
    await enable('two_fails_mentor');
    await store().update(`users/${m.id}`, { status: 'inactive' }); // §4.8: no push to a closed account
    await emitAutomationEvent(ctx.deps, 'quiz.failed_twice', m.id, {});
    expect(await drainAutomationEvents(ctx.deps)).toMatchObject({ scanned: 1, sent: 0 });
    expect(ctx.deps.push.sent).toHaveLength(0);
    expect(await rows()).toHaveLength(0); // consumed, not retried in the next tick
    const trace = await traceUser(ctx.deps, m.id);
    expect(trace.decisions[0]).toMatchObject({ key: 'two_fails_mentor', reason: 'inactiveUser' });
  });

  it('drops a stale event instead of sending it late', async () => {
    await enable('two_fails_mentor');
    await emitAutomationEvent(ctx.deps, 'quiz.failed_twice', 'u1', {});
    ctx.advance(7 * 3_600_000); // past the six-hour horizon
    // `scanned` counts rows handed to the engine; a stale row is dropped before that.
    expect(await drainAutomationEvents(ctx.deps)).toMatchObject({ scanned: 0, dropped: 1 });
    expect(await rows()).toHaveLength(0);
  });

  it('limits one drain and leaves the rest for the next tick', async () => {
    await enable('two_fails_mentor');
    const many = Array.from({ length: 10 }, (_, i) => `u${i}`);
    expect(await emitAutomationEventForUsers(ctx.deps, 'quiz.failed_twice', many)).toBe(10);
    expect(await drainAutomationEvents(ctx.deps, { limit: 3 })).toMatchObject({ scanned: 3 });
    expect(await rows()).toHaveLength(7);
    expect(await drainAutomationEvents(ctx.deps, { limit: 20 })).toMatchObject({ scanned: 7 });
    expect(await rows()).toHaveLength(0);
  });

  it('does not let the fan-out of one user monopolise a drain', async () => {
    await enable('two_fails_mentor');
    for (let i = 0; i < EVENTS_PER_USER_RUN + 2; i++)
      await rawRow('quiz.failed_twice', 'u1', `x${i}`);
    const out = await drainAutomationEvents(ctx.deps);
    expect(out.scanned).toBe(EVENTS_PER_USER_RUN);
    expect(await rows()).toHaveLength(2);
  });

  it('never throws when the store is unhappy', async () => {
    const broken = {
      ...ctx.deps,
      store: {
        ...ctx.deps.store,
        query: async () => {
          throw new Error('d1 busy');
        },
      },
    };
    expect(await drainAutomationEvents(broken)).toEqual({
      scanned: 0,
      sent: 0,
      dropped: 0,
      failed: 0,
    });
  });
});

describe('the cron and the Worker share the load', () => {
  it('the push-automations job drains the outbox before the sweeps', async () => {
    const m = await ctx.user('marketer');
    await enable('two_fails_mentor');
    await emitAutomationEvent(ctx.deps, 'quiz.failed_twice', m.id, {});
    const res = (await runJob(ctx.deps, 'push-automations')) as {
      events: { scanned: number; sent: number };
    };
    expect(res.events.scanned).toBe(1);
    expect(await rows()).toHaveLength(0);
  });

  it('the routes that emit are the routes the Worker drains after', () => {
    // A hook without a matcher waits for the cron; a matcher without a hook is dead weight. Neither
    // shows up in a type check, so the pair is asserted on the source.
    // No `import.meta` here: the functions project compiles to CJS (see cron.test.ts).
    const eventsIn = (file: string) =>
      [
        ...new Set(
          [
            ...(readFileSync(path.join(process.cwd(), file), 'utf8') as string).matchAll(
              /emitAutomationEvent(?:ForUsers)?\(\s*d,\s*'([a-z._]+)'/g,
            ),
          ].map((m) => m[1] as string),
        ),
      ].sort();
    // Every event the learning service records must be listed in the matcher above or reached by the
    // cron; this is the pair that silently drifts apart when a hook is added.
    expect(eventsIn('src/services/learning.ts')).toEqual([
      'attempt.started',
      'package.completed',
      'quiz.failed',
      'quiz.failed_twice',
      'quiz.passed',
      'section.completed',
    ]);
    for (const path of [
      '/v1/me/quizzes/q1/attempts',
      '/v1/me/attempts/a1/submit',
      '/v1/me/sections/s1/progress',
    ])
      expect(AUTOMATION_EVENT_PATH.test(path), path).toBe(true);
    for (const path of ['/v1/me/notifications/read-all', '/v1/admin/push-automations/x/run'])
      expect(AUTOMATION_EVENT_PATH.test(path), path).toBe(false);
    // …and the admin-side hook: a team join is queued by two requests, and both are drained right
    // after, so the manager reads «عضو تازه» in the same page they saved.
    expect(eventsIn('src/services/users.ts')).toEqual(['team.member_joined']);
    for (const path of ['/v1/admin/users/u1', '/v1/auth/phone-register'])
      expect(AUTOMATION_ADMIN_EVENT_PATH.test(path), path).toBe(true);
    for (const path of ['/v1/admin/users', '/v1/admin/teams/t1', '/v1/auth/login-phone'])
      expect(AUTOMATION_ADMIN_EVENT_PATH.test(path), path).toBe(false);
  });
});

describe('event variables', () => {
  it('are resolved from the learner’s own state, so a hook stays one line', async () => {
    const m = await ctx.user('marketer');
    const fx = await buildFixture(ctx, { title: 'آموزش کرم مرطوب کننده' });
    await device(m.token);
    await enable('package_updated');
    await emitAutomationEventForUsers(ctx.deps, 'package.updated', [m.id], {});
    expect(await drainAutomationEvents(ctx.deps)).toMatchObject({ sent: 1 });
    // The emitted vars were empty: `{title}` and the `{packageId}` of the action link came from the
    // engine, which is why the hook site never has to import the learning state.
    expect(ctx.deps.push.sent[0]?.msg.body).toContain('آموزش کرم مرطوب کننده');
    expect(ctx.deps.push.sent[0]?.msg.data?.link).toBe(`/packages/${fx.packageId}`);
  });

  it('are frozen into the queue document a delayed rule reads later', async () => {
    const m = await ctx.user('marketer');
    await buildFixture(ctx, { title: 'آموزش کرم مرطوب کننده' });
    await device(m.token);
    await enable('quiz_failed_nudge'); // event_delay 120m, actionRef /quiz/{sectionId}
    await emitAutomationEvent(ctx.deps, 'quiz.failed', m.id, { sectionId: 'sec-9' });
    await drainAutomationEvents(ctx.deps);
    const day = dayKey(ctx.deps.clock(), 'Asia/Tehran');
    const queue = await store().query<{ vars: Record<string, string>; dueAt: string }>({
      collection: `push_automation_queue/${day}`,
    });
    expect(queue).toHaveLength(1);
    expect(queue[0]?.vars.sectionId).toBe('sec-9');
    ctx.advance(121 * 60_000);
    expect((await runPushAutomations(ctx.deps)).queue).toMatchObject({ scanned: 1, sent: 1 });
    expect(ctx.deps.push.sent[0]?.msg.data?.link).toBe('/quiz/sec-9');
  });

  it('a real submit queues the nudge without a caller thinking about it', async () => {
    const m = await ctx.user('marketer');
    const fx = await buildFixture(ctx, { sections: 1 });
    await device(m.token);
    await enable('quiz_failed_nudge');
    const start = await ctx
      .api(m.token)
      .post(`/v1/me/quizzes/${fx.sections[0]?.quizId}/attempts`, {});
    expect(start.status).toBe(201);
    // The fixture's correct key is `'b'`, so answering everything `'a'` is a real failure.
    const wrong = Object.fromEntries((fx.sections[0]?.questionIds ?? []).map((q) => [q, 'a']));
    const submit = await ctx
      .api(m.token)
      .post(`/v1/me/attempts/${start.body.data.attemptId}/submit`, { answers: wrong });
    expect(submit.status).toBe(200);
    expect(submit.body.data.passed).toBe(false);
    const queued = await rows();
    expect(queued.map((r) => r.event).sort()).toEqual(['quiz.failed']);
    // …and the delayed rule is what the drain made out of it
    await drainAutomationEvents(ctx.deps);
    const day = dayKey(ctx.deps.clock(), 'Asia/Tehran');
    const queue = await store().query<{ key: string; vars: Record<string, string> }>({
      collection: `push_automation_queue/${day}`,
    });
    expect(queue.map((q) => q.key)).toEqual(['quiz_failed_nudge']);
    expect(queue[0]?.vars.sectionId).toBe(fx.sections[0]?.id);
    expect(queue[0]?.vars.title).toBe('آموزش کرم مرطوب کننده');
  });
});

describe('a team gaining a member', () => {
  /** `teams/<id>` has to exist before a user may be attached to it (adminUpdateUser validates it). */
  const team = (id: string, managerId: string) =>
    store().set(`teams/${id}`, {
      name: 'تیم الف',
      managerId,
      memberCount: 0,
      archived: false,
      createdAt: ctx.deps.clock().toISOString(),
      updatedAt: ctx.deps.clock().toISOString(),
    });
  const signUp = (name: string, phone: string, teamId: string) =>
    register(
      ctx.deps,
      { name, identifier: phone, password: 'passw0rd123', province: 'تهران', city: 'تهران' },
      'marketer',
      { teamId },
    );

  it('names the person who joined, not the manager reading it', async () => {
    const boss = await ctx.user('manager', { teamId: 'team-a', name: 'مریم' });
    await enable('manager_member_joined');
    ctx.advance(60_000); // the listener set is cached for 30s, so a toggle needs a new read
    await signUp('سارا', '09123330000', 'team-a');
    const queued = await rows();
    expect(queued).toHaveLength(1);
    expect(queued[0]?.event).toBe('team.member_joined');
    expect(queued[0]?.userId).toBe(boss.id);
    expect(queued[0]?.vars).toEqual({ memberName: 'سارا' });
    expect(await drainAutomationEvents(ctx.deps)).toMatchObject({ sent: 1 });
    const inbox = await ctx.api(boss.token).get('/v1/me/notifications');
    expect(inbox.body.data.items[0]).toMatchObject({
      title: 'عضو تازه در تیم شما',
      body: 'سارا به تیم شما پیوست.',
      actionRef: '/manager',
    });
    // The point of the separate variable: `{name}` in this very message would have been the
    // manager’s own first name, because an event resolves variables from its recipient.
    expect(inbox.body.data.items[0]?.body).not.toContain('مریم');
    expect(ctx.deps.push.sent).toHaveLength(0); // seeded with push:false — the manager is not pinged
  });

  it('fires when an admin moves someone into the team, and stays free while the rule is off', async () => {
    const boss = await ctx.user('manager', { teamId: 'team-a', name: 'مریم' });
    await team('team-a', boss.id);
    const off = await ctx.user('marketer', { name: 'رضا' });
    await adminUpdateUser(ctx.deps, ACTOR, off.id, { teamId: 'team-a' });
    expect(await rows()).toHaveLength(0); // §4.9: no enabled rule, no outbox write
    await enable('manager_member_joined');
    ctx.advance(60_000); // the listener set is cached for 30s, so a toggle needs a new read
    const on = await ctx.user('marketer', { name: 'سارا' });
    await adminUpdateUser(ctx.deps, ACTOR, on.id, { teamId: 'team-a' });
    expect((await rows()).map((r) => r.userId)).toEqual([boss.id]);
    expect((await rows())[0]?.vars.memberName).toBe('سارا');
    // Saving the person again (their team did not change) is not a second join.
    await adminUpdateUser(ctx.deps, ACTOR, on.id, { teamId: 'team-a', city: 'شهرری' });
    expect(await rows()).toHaveLength(1);
  });

  it('is one notice per new member, and still one per replayed join', async () => {
    const boss = await ctx.user('manager', { teamId: 'team-a' });
    await enable('manager_member_joined');
    ctx.advance(60_000); // the listener set is cached for 30s, so a toggle needs a new read
    const emit = (memberId: string) =>
      emitAutomationEventForUsers(
        ctx.deps,
        'team.member_joined',
        [boss.id],
        { memberName: memberId },
        { dedupeKey: memberId },
      );
    expect(await emit('u-new')).toBe(1);
    expect(await emit('u-new')).toBe(0); // a replayed request collapses, like any other event
    expect(await emit('u-other')).toBe(1); // two people joining on one day are two notices
    expect((await rows()).map((r) => r.vars.memberName).sort()).toEqual(['u-new', 'u-other']);
  });

  it('does not tell a manager about themselves', async () => {
    await enable('manager_member_joined');
    ctx.advance(60_000); // the listener set is cached for 30s, so a toggle needs a new read
    // The only manager of the team is the person joining: the filter drops themself, so the row count
    // stays zero. A *second* manager on that team would still be told (a colleague did join).
    await register(
      ctx.deps,
      {
        name: 'مریم',
        identifier: '09123330001',
        password: 'passw0rd123',
        province: 'تهران',
        city: 'تهران',
      },
      'manager',
      { teamId: 'team-a' },
    );
    expect(await rows()).toHaveLength(0);
  });
});
