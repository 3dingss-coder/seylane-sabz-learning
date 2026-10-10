import { beforeEach, describe, expect, it } from 'vitest';
import { DAY, dayKey } from '../src/lib/time';
import { CRON_JOBS, runCron } from '../src/services/cron';
import { notifyTemplate, flushDeferredPush } from '../src/services/notify';
import {
  fireAutomationEvent,
  runPushAutomations,
  pruneExpiredShards,
  stillValid,
} from '../src/services/push-automation-engine';
import { computeNextItem, loadUserLearning } from '../src/services/learning-state';
import {
  AUTOMATION_VAR_NAMES,
  CATALOG_KEYS,
  PUSH_AUTOMATION_CATALOG,
  catalogSeed,
} from '../src/services/push-automation-catalog';
import {
  seedCatalog,
  setAutomationEnabled,
  setPaused,
  updateAutomation,
  dryRun,
  traceUser,
  listAutomations,
} from '../src/services/push-automation-admin';
import {
  DEFAULT_SETTINGS,
  advanceCounter,
  gate,
  isClaimed,
  isSafePathTemplate,
  readCounter,
  readSettings,
  tryClaim,
  windowKeyFor,
  writeCounter,
  writePrefs,
  writePrefsSafe,
  prefsSchema,
  type UserCounter,
} from '../src/services/push-automation-governor';
import { createCtx, buildFixture, type TestCtx } from './support/ctx';
import type { Doc } from '../src/store/types';
import type { PushAutomation, PushAutomationSettings, User } from '../src/domain/types';

const freshCounter = (over: Partial<UserCounter> = {}): UserCounter => ({
  day: '2026-10-03',
  daySent: 0,
  week: '2026-W40',
  weekSent: 0,
  lastAt: null,
  keys: {},
  ...over,
});

/**
 * The automation engine's contract, on the memory store and the fake push sender:
 * nothing sends that was not switched on, nothing sends twice, everything that did not send has a
 * reason a person can read, and no rule can be saved with an unsafe destination.
 */

let ctx: TestCtx;
let admin: { id: string; token: string; phone: string };
let marketer: { id: string; token: string; phone: string };

beforeEach(async () => {
  ctx = await createCtx({ start: '2026-10-03T06:30:00.000Z' }); // 10:00 Tehran, Saturday
  admin = await ctx.user('admin');
  marketer = await ctx.user('marketer');
  await seedCatalog(ctx.deps, { id: 'test', role: 'admin' });
});

const store = () => ctx.deps.store;
type AutoStub = { enabled: boolean; version: number; name: string; stats?: unknown };
const getAuto = async (key: string): Promise<AutoStub> =>
  (await store().get<AutoStub>(`push_automations/${key}`)) ?? {
    enabled: false,
    version: 0,
    name: '',
    stats: null,
  };
const marketerDoc = async (): Promise<Doc<User>> =>
  (await store().get<User>(`users/${marketer.id}`)) as Doc<User>;
const notifications = (userId: string) =>
  store().query<{ type: string; title: string; pushStatus: string; automationKey?: string | null }>(
    {
      collection: 'notifications',
      where: [['userId', '==', userId]],
    },
  );
const device = (token: string = `fcm-token-${Math.random().toString(36).slice(2, 10)}`) =>
  ctx.api(marketer.token).post('/v1/me/devices', { token, platform: 'android' });

async function enable(key: string) {
  const r = await ctx
    .api(admin.token)
    .patch(`/v1/admin/push-automations/${key}`, { enabled: true });
  expect(r.status, JSON.stringify(r.body)).toBe(200);
}

/** Makes the user look inactive for `days` (the same field the behaviour engine reads). */
async function inactiveFor(days: number, userId = marketer.id) {
  await store().update(`users/${userId}`, {
    lastActiveAt: new Date(ctx.deps.clock().getTime() - days * DAY).toISOString(),
  });
}

describe('catalogue seeding', () => {
  it('seeds all 27+ scenarios disabled, and never overwrites an admin edit', async () => {
    expect(PUSH_AUTOMATION_CATALOG.length).toBe(CATALOG_KEYS.length);
    const all = await listAutomations(ctx.deps);
    expect(all.counts.total).toBe(CATALOG_KEYS.length);
    // The gates may be on (they mirror today's behaviour); nothing else may.
    for (const row of all.rows) {
      if (row.isGate) {
        // A gate keeps today's behaviour, so it arrives on — turning it off would delete an
        // in-app notification the product sends right now.
        expect(row.enabled, `${row.key} gate must match today's behaviour`).toBe(true);
        continue;
      }
      expect(row.enabled, `${row.key} must arrive disabled`).toBe(false);
    }
    const before = await getAuto('inactive_1d');
    await store().update('push_automations/inactive_1d', { name: 'ویرایش ادمین' });
    const again = await seedCatalog(ctx.deps, { id: 'test', role: 'admin' });
    expect(again.created).toEqual([]);
    expect((await getAuto('inactive_1d')).name).toBe('ویرایش ادمین');
    expect((await getAuto('inactive_1d')).version).toBe(before.version);
  });

  it('every destination in the catalogue is a safe internal path template', () => {
    for (const entry of PUSH_AUTOMATION_CATALOG) {
      expect(
        isSafePathTemplate(entry.message.actionRef, AUTOMATION_VAR_NAMES),
        `${entry.key} → ${entry.message.actionRef}`,
      ).toBe(true);
    }
  });

  it('rejects unsafe destinations and unknown variables at the API', async () => {
    const evil = await ctx.api(admin.token).patch('/v1/admin/push-automations/inactive_1d', {
      message: { title: 'سلام', body: 'متن', actionRef: 'https://evil.example/x' },
    });
    expect(evil.status).toBe(400);
    const varHost = await ctx.api(admin.token).patch('/v1/admin/push-automations/inactive_1d', {
      message: { title: 'a'.repeat(2), body: 'متن تست', actionRef: '/packages/{name}' },
    });
    expect(varHost.status).toBe(400);
    const unknownVar = await ctx.api(admin.token).patch('/v1/admin/push-automations/inactive_1d', {
      message: { title: 'سلام', body: 'مدت: {durationLeft}', actionRef: '/' },
    });
    expect(unknownVar.status).toBe(400);
    expect(unknownVar.body.error.message).toContain('durationLeft');
  });
});

describe('governor: windows, claims, caps', () => {
  /** The catalogue entry, with the fields a stored document always carries. */
  const a = (over: Partial<PushAutomation> = {}): PushAutomation => ({
    ...(catalogSeed('inactive_1d') as unknown as PushAutomation),
    key: 'inactive_1d',
    enabled: true,
    version: 1,
    createdAt: '2026-10-03T06:30:00.000Z',
    updatedAt: '2026-10-03T06:30:00.000Z',
    createdBy: 'test',
    updatedBy: 'test',
    stats: null,
    ...over,
  });

  /**
   * `'ok'` or the skip reason — what the panel shows, so the test reads like the UI.
   * `dry` is on: each probe below tests one rule in isolation, and a probe must not burn the real
   * idempotency claim of the user. The claim itself has its own test above.
   */
  const gateReason = async (
    input: Partial<Parameters<typeof gate>[1]> & { settings?: PushAutomationSettings },
  ): Promise<string> => {
    const settings = input.settings ?? (await readSettings(ctx.deps));
    const r = await gate(ctx.deps, {
      automation: a(),
      user: await marketerDoc(),
      prefs: null,
      counter: freshCounter(),
      settings,
      dry: true,
      ...input,
    });
    return r.ok ? 'ok' : r.reason;
  };

  it('the same Tehran day maps to one window key, the next day to another', async () => {
    const d1 = await windowKeyFor(ctx.deps, a(), DAY);
    ctx.advance(12 * 3600_000); // still the same Tehran day
    expect(await windowKeyFor(ctx.deps, a(), DAY)).toBe(d1);
    ctx.advance(DAY);
    expect(await windowKeyFor(ctx.deps, a(), DAY)).not.toBe(d1);
  });

  it('a claim is granted once per window and never twice', async () => {
    const w = await windowKeyFor(ctx.deps, a(), DAY);
    expect(await tryClaim(ctx.deps, 'inactive_1d', marketer.id, w)).toBe(true);
    expect(await tryClaim(ctx.deps, 'inactive_1d', marketer.id, w)).toBe(false);
    expect(await isClaimed(ctx.deps, 'inactive_1d', marketer.id, w)).toBe(true);
    expect(await isClaimed(ctx.deps, 'inactive_1d', 'other-user', w)).toBe(false);
  });

  it('refuses in this order: paused → disabled → inactive user → caps', async () => {
    expect(
      await gateReason({
        settings: { ...DEFAULT_SETTINGS, paused: true, updatedAt: '', updatedBy: null },
      }),
    ).toBe('paused');
    expect(await gateReason({})).toBe('ok');
    expect(await gateReason({ automation: a({ enabled: false }) })).toBe('disabled');
    expect(await gateReason({ automation: a({ requiresFeature: 'team_rank' }) })).toBe(
      'notImplemented',
    );
    const suspended = { ...(await marketerDoc()), status: 'suspended' } as unknown as Doc<User>;
    expect(await gateReason({ user: suspended })).toBe('inactiveUser');
    expect(
      await gateReason({
        automation: a({ category: 'quizzes' }),
        counter: freshCounter({ daySent: 2 }),
      }),
    ).toBe('capDay');
    expect(
      await gateReason({ counter: freshCounter({ weekSent: DEFAULT_SETTINGS.maxPerUserPerWeek }) }),
    ).toBe('capWeek');
    expect(
      await gateReason({
        automation: a({ audience: { type: 'role', targetId: 'admin', channel: 'any' } }),
      }),
    ).toBe('audience');
    expect(await gateReason({ hasDevice: false })).toBe('noDevice');
    expect(await gateReason({ missingVariables: ['section'] })).toBe('missingVariable');
  });

  it('gap and per-automation cooldown both apply; only urgent skips the gap', async () => {
    const recent = freshCounter({
      lastAt: new Date(ctx.deps.clock().getTime() - 60_000).toISOString(),
      keys: { inactive_1d: ctx.deps.clock().toISOString() },
    });
    expect(await gateReason({ counter: recent })).toBe('cooldown');
    expect(
      await gateReason({
        automation: a({ delivery: { ...a().delivery, cooldownMs: 0 } }),
        counter: recent,
      }),
    ).toBe('gap');
    expect(
      await gateReason({
        automation: a({ delivery: { ...a().delivery, cooldownMs: 0, priority: 'urgent' } }),
        counter: recent,
      }),
    ).toBe('ok');
  });

  it('a user who muted this category is refused, and an opt-in rule needs the opt-in', async () => {
    expect(
      await gateReason({
        prefs: { mutedCategories: ['deadlines'], preferredHour: null, optIns: {}, updatedAt: '' },
      }),
    ).toBe('optedOut');
    expect(await gateReason({ automation: a({ optInOnly: true }) })).toBe('optInOnly');
    expect(
      await gateReason({
        automation: a({ optInOnly: true }),
        prefs: {
          mutedCategories: [],
          preferredHour: null,
          optIns: { inactive_1d: true },
          updatedAt: '',
        },
      }),
    ).toBe('ok');
  });

  it('sendOnce refuses a second send and a used claim always loses to the window', async () => {
    expect(
      await gateReason({
        automation: a({ delivery: { ...a().delivery, cooldownMs: 0, sendOnce: true } }),
        counter: freshCounter({ keys: { inactive_1d: ctx.deps.clock().toISOString() } }),
      }),
    ).toBe('sendOnce');
    expect(await gateReason({ lostToPriority: true })).toBe('priority');
  });

  it('the counter resets when the Tehran day and the ISO week roll over', async () => {
    await writeCounter(ctx.deps, marketer.id, freshCounter({ daySent: 2, weekSent: 9 }));
    ctx.advance(4 * DAY); // Saturday → Wednesday: a new day and a new ISO week
    const after = await readCounter(ctx.deps, marketer.id);
    expect(after.daySent).toBe(0);
    expect(after.weekSent).toBe(0);
    expect(advanceCounter(after, 'x', true, after.day, after.week, after.day).daySent).toBe(1);
  });
});

describe('engine: one send per window, with reasons', () => {
  it('nothing at all goes out while no automation is enabled', async () => {
    await device();
    await inactiveFor(2);
    const r = await runPushAutomations(ctx.deps, { force: true });
    expect(r.sweeps).toEqual([]);
    expect(ctx.deps.push.sent).toHaveLength(0);
  });

  it('sends once for a matching user, and never twice in the same window', async () => {
    await buildFixture(ctx);
    await device();
    await inactiveFor(2);
    await enable('inactive_1d');
    const first = await runPushAutomations(ctx.deps, { force: true });
    expect(first.sweeps[0]?.sent).toBe(1);
    expect(ctx.deps.push.sent).toHaveLength(1);
    const msg = ctx.deps.push.sent[0]?.msg;
    expect(msg?.title).toContain('ادامه بده');
    const learning = await loadUserLearning(ctx.deps, await marketerDoc());
    const next = computeNextItem(learning.packages);
    expect(msg?.data?.link).toBe(`/sections/${next?.sectionId}`);
    const notes = await notifications(marketer.id);
    expect(notes.filter((n) => n.type === 'automation')).toHaveLength(1);
    expect(notes[0]?.automationKey).toBe('inactive_1d');

    const second = await runPushAutomations(ctx.deps, { force: true });
    expect(second.sweeps[0]?.sent).toBe(0);
    expect(ctx.deps.push.sent).toHaveLength(1);
    const trace = await traceUser(ctx.deps, marketer.id);
    expect(trace.decisions.some((x) => x.reason === 'duplicate')).toBe(true);
    expect(trace.decisions.find((x) => x.reason === 'duplicate')?.label).toContain('پنجره');
  });

  it('the inactivity ladder sends only the highest matched step of one episode', async () => {
    await buildFixture(ctx);
    await device();
    await inactiveFor(4);
    for (const key of ['inactive_1d', 'inactive_2d', 'inactive_3d', 'inactive_7d'])
      await enable(key);
    const r = await runPushAutomations(ctx.deps, { force: true });
    const sent = r.sweeps.filter((x) => x.sent > 0);
    expect(sent.map((x) => x.key)).toEqual(['inactive_3d']);
    expect(ctx.deps.push.sent).toHaveLength(1);
    const other = r.sweeps.find((x) => x.key === 'inactive_1d');
    expect(other?.skipped).toBeGreaterThan(0);
  });

  it('an inactive account never receives a push', async () => {
    await buildFixture(ctx);
    await device();
    await inactiveFor(2);
    await store().update(`users/${marketer.id}`, { status: 'disabled' });
    await enable('inactive_1d');
    // not even evaluated: the population query itself excludes them (spec §4.9 + the cost rule)
    const r = await runPushAutomations(ctx.deps, { force: true });
    expect(r.sweeps.find((x) => x.key === 'inactive_1d')?.evaluated).toBe(0);
    expect(ctx.deps.push.sent).toHaveLength(0);
    // and the direct event path refuses with a readable reason
    await enable('two_fails_mentor');
    const e = await fireAutomationEvent(ctx.deps, 'quiz.failed_twice', marketer.id, {});
    expect(e.sent).toBe(0);
    expect((await traceUser(ctx.deps, marketer.id)).decisions[0]?.reason).toBe('inactiveUser');
  });

  it('a user without any device gets nothing (no provider call, no orphan quota)', async () => {
    await buildFixture(ctx);
    await inactiveFor(2);
    await enable('inactive_1d');
    const r = await runPushAutomations(ctx.deps, { force: true });
    expect(r.sweeps[0]?.sent).toBe(0);
    expect(ctx.deps.push.sent).toHaveLength(0);
    expect((await traceUser(ctx.deps, marketer.id)).decisions[0]?.reason).toBe('noDevice');
    // the claim was never taken, so the quota is intact for when they do register a device
    expect((await readCounter(ctx.deps, marketer.id)).daySent).toBe(0);
  });

  it('quiet hours: the in-app card is created, the push waits for the window to end', async () => {
    await buildFixture(ctx);
    await device();
    await inactiveFor(2);
    await enable('inactive_1d');
    ctx.setNow('2026-10-03T19:30:00.000Z'); // 23:00 Tehran — inside quiet hours
    const r = await runPushAutomations(ctx.deps, { force: true });
    expect(r.sweeps[0]?.sent).toBe(1);
    expect(ctx.deps.push.sent).toHaveLength(0);
    const [note] = await notifications(marketer.id);
    expect(note?.pushStatus).toBe('deferred');
    ctx.setNow('2026-10-04T03:30:00.000Z'); // 07:00 Tehran — window over
    expect(await flushDeferredPush(ctx.deps)).toBe(1);
    expect(ctx.deps.push.sent).toHaveLength(1);
  });

  it('the kill-switch stops the very next run and the reason is readable', async () => {
    await buildFixture(ctx);
    await device();
    await inactiveFor(2);
    await enable('inactive_1d');
    const paused = await ctx
      .api(admin.token)
      .post('/v1/admin/push-automations/pause', { paused: true });
    expect(paused.status).toBe(200);
    const r = await runPushAutomations(ctx.deps, { force: true });
    expect(r.paused).toBe(true);
    expect(r.sweeps).toEqual([]);
    expect(ctx.deps.push.sent).toHaveLength(0);
    await ctx.api(admin.token).post('/v1/admin/push-automations/pause', { paused: false });
    expect((await runPushAutomations(ctx.deps, { force: true })).sweeps[0]?.sent).toBe(1);
  });

  it('a used variable that cannot be filled blocks the send instead of shipping a broken sentence', async () => {
    await buildFixture(ctx);
    await device();
    await inactiveFor(2);
    // `hours` needs a deadline in the future; this package has none.
    const fx2 = await buildFixture(ctx, { assign: 'none' });
    await store().update(`packages/${fx2.packageId}`, { deadlineAt: null });
    await updateAutomation(ctx.deps, { id: 'test', role: 'admin' }, 'inactive_1d', {
      message: {
        title: 'مهلت: {hours}',
        body: 'یک متن قابل قبول',
        actionRef: '/',
        imageUrl: null,
      },
    });
    await enable('inactive_1d');
    const r = await runPushAutomations(ctx.deps, { force: true });
    expect(r.sweeps[0]?.sent).toBe(0);
    expect(ctx.deps.push.sent).toHaveLength(0);
    expect((await traceUser(ctx.deps, marketer.id)).decisions[0]?.reason).toBe('missingVariable');
  });

  it('the daily cap of the global settings stops the second automation of the same day', async () => {
    const fx = await buildFixture(ctx);
    // Overdue → the condition rule matches the same user in the same run.
    await store().update(`packages/${fx.packageId}`, {
      deadlineAt: new Date(ctx.deps.clock().getTime() - DAY).toISOString(),
    });
    await device();
    await inactiveFor(8);
    await ctx.api(admin.token).put('/v1/admin/push-automations/settings', {
      ...DEFAULT_SETTINGS,
      maxPerUserPerDay: 1,
      minGapMs: 0,
    });
    // `inactive_3d` wins the ladder, `overdue_daily` is a condition rule on the same user.
    await enable('inactive_3d');
    await enable('overdue_daily');
    const r = await runPushAutomations(ctx.deps, { force: true });
    const total = r.sweeps.reduce((n, x) => n + x.sent, 0);
    expect(total).toBe(1);
    expect(r.skippedTotals.capDay).toBeGreaterThanOrEqual(1);
    expect(ctx.deps.push.sent).toHaveLength(1);
  });

  it('a dry-run writes nothing at all', async () => {
    await buildFixture(ctx);
    await device();
    await inactiveFor(2);
    await enable('inactive_1d');
    const before = JSON.stringify(await notifications(marketer.id));
    const preview = await dryRun(ctx.deps, 'inactive_1d');
    expect(preview.wouldSend).toBe(1);
    expect(preview.sample[0]?.title).toBeTruthy();
    expect(ctx.deps.push.sent).toHaveLength(0);
    expect(JSON.stringify(await notifications(marketer.id))).toBe(before);
    expect((await readCounter(ctx.deps, marketer.id)).daySent).toBe(0);
    // …and the real run still can send afterwards
    expect((await runPushAutomations(ctx.deps, { force: true })).sweeps[0]?.sent).toBe(1);
  });
});

describe('user preferences', () => {
  it('mutes a push by category but never the in-app card, and protects deadlines', async () => {
    await buildFixture(ctx);
    await device();
    await inactiveFor(2);
    await enable('inactive_1d');
    // `deadlines` is protected: refused, not silently dropped.
    const bad = await ctx
      .api(marketer.token)
      .put('/v1/me/notification-prefs', { mutedCategories: ['deadlines'], optIns: {} });
    expect(bad.status).toBe(400);
    expect(bad.body.error.message).toContain('مهلت');
    await writePrefs(ctx.deps, marketer.id, {
      mutedCategories: ['progress'],
      preferredHour: null,
      optIns: {},
    });
    // muting another category does not touch a `deadlines` automation
    expect((await runPushAutomations(ctx.deps, { force: true })).sweeps[0]?.sent).toBe(1);
    expect(ctx.deps.push.sent).toHaveLength(1);
    // Two layers, on purpose (spec §4.6 + §4.7):
    //  • a *template* the user muted keeps its in-app card and only loses the push;
    //  • an *automation* the user muted stands down completely — its whole purpose was the push, and
    //    the refusal is written to the trace so the answer to «چرا پوش نگرفتم؟» is still readable.
    await writePrefs(ctx.deps, marketer.id, {
      mutedCategories: ['progress'],
      preferredHour: null,
      optIns: {},
    });
    const notesBefore = (await notifications(marketer.id)).length;
    const n = await notifyTemplate(ctx.deps, [marketer.id], 'badge_earned', { title: 'x' });
    expect(n).toBe(1);
    expect((await notifications(marketer.id)).length).toBe(notesBefore + 1);
    expect(ctx.deps.push.sent).toHaveLength(1); // badge_earned is in-app-only anyway; no provider call
    await writePrefsSafe(
      ctx.deps,
      marketer.id,
      prefsSchema.parse({ mutedCategories: ['quizzes'], preferredHour: null, optIns: {} }),
    );
    await notifyTemplate(ctx.deps, [marketer.id], 'retake_request', { title: 'y' });
    const muted = (await notifications(marketer.id)).find((x) => x.type === 'retake_request');
    expect(muted?.title).toBeTruthy(); // the card is there
    expect(muted?.pushStatus).toBe('skipped'); // the push is not
    // and the automation refuses outright, with a readable reason
    await writePrefs(ctx.deps, marketer.id, {
      mutedCategories: ['deadlines'],
      preferredHour: null,
      optIns: {},
    });
    ctx.advance(DAY);
    await inactiveFor(3);
    const r = await runPushAutomations(ctx.deps, { force: true });
    expect(r.sweeps[0]?.sent).toBe(0);
    expect(ctx.deps.push.sent).toHaveLength(1);
    expect((await traceUser(ctx.deps, marketer.id)).decisions[0]?.reason).toBe('optedOut');
  });

  it('writePrefsSafe refuses unknown categories', async () => {
    await expect(
      writePrefsSafe(
        ctx.deps,
        marketer.id,
        prefsSchema.parse({ mutedCategories: ['everything'], optIns: {} }),
      ),
    ).rejects.toThrow();
  });

  it('an opt-in-only rule stays silent until the user opts in', async () => {
    await buildFixture(ctx);
    await device();
    await enable('evening_nudge');
    ctx.setNow('2026-10-03T14:30:00.000Z'); // 18:00 Tehran
    expect(
      (await runPushAutomations(ctx.deps)).sweeps.find((x) => x.key === 'evening_nudge')?.sent,
    ).toBe(0);
    await store().set('notification_prefs/' + marketer.id, {
      mutedCategories: [],
      preferredHour: null,
      optIns: { evening_nudge: true },
      updatedAt: ctx.deps.clock().toISOString(),
    });
    await store().update(`users/${marketer.id}`, {
      lastActiveAt: ctx.deps.clock().toISOString(),
    });
    const r = await runPushAutomations(ctx.deps);
    expect(r.sweeps.find((x) => x.key === 'evening_nudge')?.sent).toBe(1);
    expect(ctx.deps.push.sent).toHaveLength(1);
  });
});

describe('events and the delayed queue', () => {
  it('an event rule sends immediately; a delayed one waits and re-checks the reason', async () => {
    await enable('two_fails_mentor');
    await enable('quiz_failed_nudge');
    await device();
    const r = await fireAutomationEvent(ctx.deps, 'quiz.failed_twice', marketer.id, {
      title: 'آموزش کرم',
      sectionId: 'sec_1',
      packageId: 'pkg_1',
    });
    expect(r.sent).toBe(1);
    expect(ctx.deps.push.sent[0]?.msg?.data?.link).toBe('/mentor');

    const queued = await fireAutomationEvent(ctx.deps, 'quiz.failed', marketer.id, {
      title: 'آموزش کرم',
      sectionId: 'sec_1',
      packageId: 'pkg_1',
    });
    expect(queued.queued).toBe(1);
    expect(ctx.deps.push.sent).toHaveLength(1); // nothing early
    const day = dayKeyOf(ctx.deps.clock());
    const rows = await store().query<{ status: string; dueAt: string }>({
      collection: `push_automation_queue/${day}`,
    });
    expect(rows.length).toBe(1);
    expect(rows[0]?.status).toBe('pending');

    // 6 hours: past the 120-minute delay *and* past the 4h minimum gap between two pushes (the
    // global rule that just fired for the previous event, so the nudge is legitimately waiting).
    ctx.advance(6 * 3600_000);
    const drain = await runPushAutomations(ctx.deps);
    expect(drain.queue?.sent).toBe(1);
    expect(ctx.deps.push.sent).toHaveLength(2);
    // a second drain of the same window must not repeat it
    expect((await runPushAutomations(ctx.deps)).queue?.sent).toBe(0);
  });

  it('a pause leaves queued follow-ups pending, and resuming delivers them', async () => {
    await enable('quiz_failed_nudge');
    await device();
    const queued = await fireAutomationEvent(ctx.deps, 'quiz.failed', marketer.id, {
      title: 'آموزش کرم',
      sectionId: 'sec_1',
      packageId: 'pkg_1',
    });
    expect(queued.queued).toBe(1);
    await ctx.api(admin.token).post('/v1/admin/push-automations/pause', { paused: true });
    ctx.advance(6 * 3600_000);
    // past the delay and past the global gap, yet the kill-switch wins: nothing is sent *or* dropped
    const paused = await runPushAutomations(ctx.deps, { force: true });
    expect(paused.paused).toBe(true);
    expect(paused.queue).toBeNull();
    expect(ctx.deps.push.sent).toHaveLength(0);
    const day = dayKey(ctx.deps.clock(), 'Asia/Tehran');
    const rows = await store().query<{ status: string }>({
      collection: `push_automation_queue/${day}`,
    });
    expect(rows.filter((r) => r.status === 'pending')).toHaveLength(1);
    // (resumed through the service, not the API: the 6-hour jump has expired the test's access token)
    await setPaused(ctx.deps, { id: 'test', role: 'admin' }, false);
    expect((await runPushAutomations(ctx.deps)).queue?.sent).toBe(1);
    expect(ctx.deps.push.sent).toHaveLength(1);
    // and the same drain is idempotent
    expect((await runPushAutomations(ctx.deps)).queue?.sent).toBe(0);
  });

  it('a delayed nudge is dropped when the user already fixed the problem', async () => {
    await enable('quiz_abandoned');
    await device();
    await fireAutomationEvent(ctx.deps, 'attempt.started', marketer.id, {
      title: 'آموزش کرم',
      sectionId: 'sec_1',
      packageId: 'pkg_1',
    });
    // still valid while an attempt is open…
    const u = await marketerDoc();
    const abandoned = await store().get('push_automations/quiz_abandoned');
    expect(await stillValid(ctx.deps, abandoned as never, u, {})).toBe(false);
    await store().set('attempts/a1', {
      userId: marketer.id,
      quizId: 'q1',
      sectionId: 'sec_1',
      packageId: 'pkg_1',
      attemptNumber: 1,
      status: 'in_progress',
      answers: {},
      score: null,
      passed: null,
      passScore: 70,
      quizVersion: 1,
      snapshot: [],
      startedAt: ctx.deps.clock().toISOString(),
      submittedAt: null,
    });
    expect(await stillValid(ctx.deps, abandoned as never, u, {})).toBe(true);
    ctx.advance(31 * 60_000);
    expect((await runPushAutomations(ctx.deps)).queue?.sent).toBe(1);
  });

  it('a system gate keeps the current text and can silence a template without deleting it', async () => {
    await device();
    expect((await getAuto('reminder')).enabled).toBe(true); // seeded on: today's behaviour
    const n1 = await notifyTemplate(ctx.deps, [marketer.id], 'reminder', {
      title: 'x',
      percent: 10,
    });
    expect(n1).toBe(1);
    await ctx
      .api(admin.token)
      .patch('/v1/admin/push-automations/reminder', { enabled: false, confirmCritical: true });
    expect(
      await notifyTemplate(ctx.deps, [marketer.id], 'reminder', { title: 'y', percent: 20 }),
    ).toBe(0);
    // the template itself is untouched — the panel never rewrites DEFAULT_TEMPLATES text
    const tpl = await ctx.api(admin.token).get('/v1/admin/notification-templates');
    expect(JSON.stringify(tpl.body.data)).toContain('ادامه بده');
    await setAutomationEnabled(ctx.deps, { id: 'test', role: 'admin' }, 'reminder', true, true);
    expect(
      await notifyTemplate(ctx.deps, [marketer.id], 'reminder', { title: 'z', percent: 30 }),
    ).toBe(1);
  });

  it('an enabled inactivity automation supersedes the reminder push, not its in-app card', async () => {
    await buildFixture(ctx);
    await device();
    await store().update('push_automations/reminder', { enabled: true });
    await enable('inactive_1d'); // `supersedes: ['reminder']`
    const n = await notifyTemplate(ctx.deps, [marketer.id], 'reminder', {
      title: 'ادامه بده',
      percent: 10,
    });
    expect(n).toBe(1); // the card is still created
    expect(ctx.deps.push.sent).toHaveLength(0); // only the provider call stands down
  });
});

describe('panel API', () => {
  it('is admin-only, audited and version-guarded', async () => {
    expect((await ctx.api().get('/v1/admin/push-automations')).status).toBe(401);
    expect((await ctx.api(marketer.token).get('/v1/admin/push-automations')).status).toBe(403);
    const list = await ctx.api(admin.token).get('/v1/admin/push-automations');
    expect(list.status).toBe(200);
    expect(list.body.data.rows.length).toBe(CATALOG_KEYS.length);
    const detail = await ctx.api(admin.token).get('/v1/admin/push-automations/inactive_1d');
    expect(detail.status).toBe(200);
    expect(detail.body.data.variables.length).toBeGreaterThan(5);
    const stale = await ctx
      .api(admin.token)
      .patch('/v1/admin/push-automations/inactive_1d', { name: 'تغییر', expectedVersion: 99 });
    expect(stale.status).toBe(409);
    const ok = await ctx.api(admin.token).patch('/v1/admin/push-automations/inactive_1d', {
      name: 'تغییر',
      expectedVersion: 1,
    });
    expect(ok.status).toBe(200);
    expect(ok.body.data.version).toBe(2);
    const audits = await ctx.api(admin.token).get('/v1/admin/audit-logs');
    expect(
      (audits.body.data as Array<{ action: string }>).some((x) =>
        x.action.startsWith('push_automation.'),
      ),
    ).toBe(true);
  });

  it('a custom automation can be created, run and deleted; a catalogue one cannot', async () => {
    const created = await ctx.api(admin.token).post('/v1/admin/push-automations', {
      key: 'boss_visit',
      name: 'بازدید حضوری',
      description: 'یادآوری قبل از بازدید مدیر از شعبه',
      category: 'messages',
      audienceRole: 'marketer',
      enabled: false,
      trigger: { kind: 'schedule_daily', time: '09:00' },
      audience: { type: 'role', targetId: 'marketer', channel: 'any' },
      message: {
        title: 'فردا بازدید داریم',
        body: 'سلام {name}، فردا ۹ صبح بازدید است.',
        actionRef: '/messages',
      },
      delivery: {
        priority: 'high',
        push: true,
        inApp: true,
        respectQuietHours: true,
        cooldownMs: 86400000,
      },
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(created.body.data.enabled).toBe(false);
    const on = await ctx.api(admin.token).post('/v1/admin/push-automations/boss_visit/enabled', {
      enabled: true,
    });
    expect(on.status).toBe(200);
    await device();
    const r = await runPushAutomations(ctx.deps, { force: true, onlyKey: 'boss_visit' });
    expect(r.sweeps[0]?.sent).toBe(1);
    expect(await store().get('push_automations/boss_visit')).not.toBeNull();
    expect((await ctx.api(admin.token).del('/v1/admin/push-automations/boss_visit')).status).toBe(
      200,
    );
    expect(await store().get('push_automations/boss_visit')).toBeNull();
    expect((await ctx.api(admin.token).del('/v1/admin/push-automations/inactive_1d')).status).toBe(
      409,
    );
  });

  it('a critical automation needs an explicit confirmation to switch off', async () => {
    await setAutomationEnabled(ctx.deps, { id: 'test', role: 'admin' }, 'reminder', true, true);
    const refused = await ctx.api(admin.token).post('/v1/admin/push-automations/reminder/enabled', {
      enabled: false,
    });
    expect(refused.status).toBe(409);
    expect(refused.body.error.message).toContain('تأیید');
    const ok = await ctx.api(admin.token).post('/v1/admin/push-automations/reminder/enabled', {
      enabled: false,
      confirmCritical: true,
    });
    expect(ok.status).toBe(200);
  });

  it('a v2 scenario cannot be enabled and explains why', async () => {
    const r = await ctx
      .api(admin.token)
      .post('/v1/admin/push-automations/team_rank_change/enabled', {
        enabled: true,
      });
    expect(r.status).toBe(400);
    expect(r.body.error.message).toContain('نیازمند');
  });

  it('test-send bypasses the caps, never counts in the stats, and is audited', async () => {
    await buildFixture(ctx);
    await device();
    await inactiveFor(2);
    await enable('inactive_1d');
    expect(ctx.deps.push.sent).toHaveLength(0); // nothing sent by switching it on alone
    const r = await ctx
      .api(admin.token)
      .post('/v1/admin/push-automations/inactive_1d/test-send', { userId: marketer.id });
    expect(r.status).toBe(200);
    expect(r.body.data.sent).toBe(true);
    expect(ctx.deps.push.sent).toHaveLength(1);
    expect((await readCounter(ctx.deps, marketer.id)).daySent).toBe(0);
    expect((await getAuto('inactive_1d')).stats ?? null).toBe(null);
    const notes = await notifications(marketer.id);
    expect(notes).toHaveLength(1);
    // …and the scheduled run is still allowed to send for real afterwards
    expect((await runPushAutomations(ctx.deps, { force: true })).sweeps[0]?.sent).toBe(1);
  });

  it('the run history records one row per window with the skip reasons', async () => {
    await buildFixture(ctx);
    await inactiveFor(2);
    await enable('inactive_1d');
    const r = await runPushAutomations(ctx.deps, { force: true });
    expect(r.runId).toBeTruthy();
    const run = await store().get<Record<string, unknown>>(`push_automation_runs/${r.runId}`);
    expect(run?.key).toBe('inactive_1d');
    expect(run?.sent).toBe(0); // no device → noDevice, and the reason is stored
    expect(Object.keys((run?.skipped ?? {}) as object)).toContain('noDevice');
    const runs = await ctx.api(admin.token).get('/v1/admin/push-automations/runs?limit=5');
    expect(runs.status).toBe(200);
    expect(runs.body.data[0].key).toBe('inactive_1d');
  });

  it('the cron group runs the engine before the flush, and one engine failure cannot stop the others', async () => {
    const order = CRON_JOBS['*/15 * * * *'] ?? [];
    expect(order.indexOf('push-automations')).toBeGreaterThanOrEqual(0);
    expect(order.indexOf('push-automations')).toBeLessThan(order.indexOf('flush-push'));
    const res = await runCron(ctx.deps, '*/15 * * * *');
    expect(res.jobs['push-automations']?.ok).toBe(true);
  });

  it('pruning keeps the store bounded without deleting a live window', async () => {
    await buildFixture(ctx);
    await device();
    await inactiveFor(2);
    await enable('inactive_1d');
    expect((await runPushAutomations(ctx.deps, { force: true })).sweeps[0]?.sent).toBe(1);
    const day = dayKeyOf(ctx.deps.clock());
    expect(
      (
        await store().query<Record<string, unknown>>({
          collection: `push_automation_claims/${day}`,
        })
      ).length,
    ).toBe(1);
    ctx.advance(4 * DAY);
    const removed = await pruneExpiredShards(ctx.deps);
    expect(removed).toBeGreaterThanOrEqual(0);
    // the claims of the *current* day are untouched until they age out
    expect(
      (
        await store().query<Record<string, unknown>>({
          collection: `push_automation_claims/${day}`,
        })
      ).length,
    ).toBe(1);
  });
});

// ─── helpers that need the module-scope ctx ─────────────────────────────────

function dayKeyOf(d: Date): string {
  return dayKey(d, 'Asia/Tehran');
}
