import { beforeEach, describe, expect, it } from 'vitest';
import {
  IMPORT_MAX_ROWS,
  exportAutomations,
  importAutomations,
  seedCatalog,
  updateAutomation,
  setAutomationEnabled,
  listTextRevisions,
  type AutomationExportRow,
} from '../src/services/push-automation-admin';
import { createCtx, type TestCtx } from './support/ctx';
import type { Doc } from '../src/store/types';
import type { PushAutomation } from '../src/domain/types';

/**
 * The transfer pair the rollout guide needs: a snapshot an admin can read in review, and an import
 * that writes through the panel's own create/update paths. What these tests hold fixed:
 *
 *  • a file carries the editable fields only — no `version`, no `stats`, no ids, nothing secret;
 *  • importing never enables anything (§4.1: a click turns a send on, a file does not);
 *  • every overwritten row leaves a text revision behind, so an import is readable *and* reversible;
 *  • a gate keeps its wording out of reach, and one broken row is reported in Persian without
 *    aborting the other 29.
 */

const ACTOR = { id: 'test', role: 'admin' } as const;

let ctx: TestCtx;
let admin: { id: string; token: string; phone: string };

beforeEach(async () => {
  ctx = await createCtx({ start: '2026-10-03T06:30:00.000Z' }); // 10:00 Tehran, Saturday
  admin = await ctx.user('admin');
  await seedCatalog(ctx.deps, ACTOR);
});

const store = () => ctx.deps.store;
const row = async (key: string) =>
  (await store().get<PushAutomation>(`push_automations/${key}`)) as PushAutomation;
const exportAll = (q: { keys?: string; gates?: string } = {}) =>
  exportAutomations(ctx.deps, { keys: q.keys, gates: q.gates === '1' });

describe('export', () => {
  it('carries the editable fields of every non-gate row, and nothing else', async () => {
    const out = await exportAll();
    expect(out.format).toBe('seylane.push-automation/2');
    expect(out.timezone).toBe('Asia/Tehran');
    // 38 seeded rows minus the 13 that are gates in front of an existing template.
    expect(out.count).toBe(25);
    expect(out.rows).toHaveLength(out.count);
    const sample = out.rows.find((r) => r.key === 'inactive_1d');
    expect(Object.keys(sample ?? {}).sort()).toEqual(
      [
        'audience',
        'audienceRole',
        'category',
        'delivery',
        'description',
        'enabled',
        'key',
        'message',
        'name',
        'optInOnly',
        'supersedes',
        'trigger',
        // v2 (format /2): a rule's meaning lives in these three, so a transfer file that dropped them
        // would import the wording of a rule without its conditions — a different rule wearing its name.
        'repeatPolicy',
        'schemaVersion',
        'when',
      ].sort(),
    );
    // Fields the target environment computes for itself must not be transferable at all.
    for (const r of out.rows)
      expect(JSON.stringify(r)).not.toMatch(/"version"|"stats"|"createdBy"|"updatedAt"/);
    // …and the file must not name a person, a device or a key.
    expect(JSON.stringify(out)).not.toMatch(/phone|token|secret|password/i);
  });

  it('includes gates only when asked, and can be narrowed to a list of keys', async () => {
    expect((await exportAll()).count).toBe(25);
    expect((await exportAll({ gates: '1' })).count).toBe(38);
    const two = await exportAll({ keys: 'inactive_1d, week_start ,unknown_key' });
    expect(two.rows.map((r) => r.key)).toEqual(['inactive_1d', 'week_start']);
  });

  it('reflects an admin edit, which is the whole point of diffing the file in review', async () => {
    await updateAutomation(ctx.deps, ACTOR, 'inactive_1d', {
      message: { title: 'خبر داری؟', body: 'دیروز هم سر نزدی.', actionRef: '/', imageUrl: null },
    });
    const rows = (await exportAll()).rows;
    expect(rows.find((r) => r.key === 'inactive_1d')?.message.title).toBe('خبر داری؟');
  });
});

describe('import', () => {
  /** A second environment: its own memory store, its own fresh seed. */
  async function otherEnv() {
    const b = await createCtx({ start: '2026-10-04T06:30:00.000Z' });
    await seedCatalog(b.deps, ACTOR);
    return b;
  }
  const pick = (rows: AutomationExportRow[], key: string): AutomationExportRow =>
    rows.find((r) => r.key === key) as AutomationExportRow;

  it('moves tuned wording across, leaves enablement alone and keeps the old text readable', async () => {
    await updateAutomation(ctx.deps, ACTOR, 'inactive_1d', {
      message: { title: 'دلم برات تنگ شده', body: 'سه روز شد.', actionRef: '/', imageUrl: null },
    });
    await setAutomationEnabled(ctx.deps, ACTOR, 'inactive_1d', true);
    const tuned = await exportAll({ keys: 'inactive_1d' });
    expect(tuned.rows[0]?.enabled).toBe(true); // the source really is on — the file says so

    const b = await otherEnv();
    const before = (await b.deps.store.get<PushAutomation>(
      'push_automations/inactive_1d',
    )) as PushAutomation;
    expect(before.enabled).toBe(false);
    const report = await importAutomations(b.deps, ACTOR, { rows: tuned.rows });
    expect(report).toMatchObject({ created: 0, updated: 1, skipped: 0 });

    const landed = (await b.deps.store.get<PushAutomation>(
      'push_automations/inactive_1d',
    )) as PushAutomation;
    expect(landed.message.title).toBe('دلم برات تنگ شده');
    // A transfer must never be what turns a send on.
    expect(landed.enabled).toBe(false);
    expect(landed.version).toBe(2);
    // the wording it replaced is still readable in the target environment
    const revs = await b.deps.store.query<{ version: number; message: { title: string } }>({
      collection: 'push_automation_text_revs/inactive_1d',
    });
    expect(revs.map((x) => x.message.title)).toEqual(['ادامه بده {name}']);
    expect(await listTextRevisions(b.deps, 'inactive_1d')).toHaveLength(1);
  });

  it('creates an unknown key as a disabled custom automation', async () => {
    const report = await importAutomations(ctx.deps, ACTOR, {
      rows: [
        {
          key: 'vip_follow_up',
          name: 'پیگیری مشتریان ویژه',
          description: 'برای تیم فروش',
          category: 'deadlines',
          audienceRole: 'marketer',
          enabled: true,
          trigger: { kind: 'schedule_daily', time: '11:00' },
          audience: { type: 'all', targetId: null, channel: 'any' },
          message: { title: 'سلام', body: 'امروز هم ادامه بده.', actionRef: '/', imageUrl: null },
          delivery: {
            priority: 'normal',
            push: true,
            inApp: true,
            respectQuietHours: true,
            cooldownMs: 0,
          },
        },
      ],
    });
    expect(report.created).toBe(1);
    const created = await row('vip_follow_up');
    expect(created.enabled).toBe(false); // §4.1 again: created off, whatever the file said
    expect(created.isSystem).toBe(false);
    expect(created.templateKey).toBeNull();
    expect(created.requiresFeature ?? null).toBeNull();
    expect(created.version).toBe(1);
  });

  it('reports a broken row in Persian and still applies the good ones', async () => {
    const custom = {
      key: 'vip_follow_up',
      name: 'پیگیری مشتریان ویژه',
      description: 'برای تیم فروش',
      category: 'deadlines',
      audienceRole: 'marketer',
      trigger: { kind: 'schedule_daily', time: '11:00' },
      audience: { type: 'all', targetId: null, channel: 'any' },
      message: { title: 'سلام', body: 'امروز هم ادامه بده.', actionRef: '/', imageUrl: null },
      delivery: {
        priority: 'normal',
        push: true,
        inApp: true,
        respectQuietHours: true,
        cooldownMs: 0,
      },
    };
    const brokenVar = {
      ...custom,
      key: 'bad_vars',
      name: 'متن شکسته',
      message: { ...custom.message, body: '{durationLeft}' },
    };
    const report = await importAutomations(ctx.deps, ACTOR, {
      rows: [brokenVar, pick((await exportAll()).rows, 'inactive_1d'), custom, { key: 'short' }],
    });
    expect(report).toMatchObject({ checked: 4, created: 1, updated: 1, skipped: 2 });
    expect(report.results.map((x) => x.action)).toEqual([
      'skipped',
      'updated',
      'created',
      'skipped',
    ]);
    expect(report.results[0]?.message).toContain('durationLeft');
    expect(report.results.filter((x) => x.action === 'skipped').map((x) => x.key)).toEqual([
      'bad_vars',
      'short',
    ]); // which row failed, not merely that one did
    expect(await row('inactive_1d')).toBeTruthy();
    expect(await row('vip_follow_up')).toBeTruthy();
    expect(await store().get('push_automations/bad_vars')).toBeNull();
  });

  it('a dry run validates the same rules and writes nothing', async () => {
    const rows = [pick((await exportAll()).rows, 'streak_5'), { key: 'nope' }];
    const before = JSON.stringify(await row('streak_5'));
    const report = await importAutomations(ctx.deps, ACTOR, { rows, dryRun: true });
    expect(report).toMatchObject({ dryRun: true, checked: 2, created: 0, updated: 0, skipped: 1 });
    expect(report.results[0]).toEqual({ key: 'streak_5', action: 'updated' });
    expect(JSON.stringify(await row('streak_5'))).toBe(before);
    expect(await store().get('push_automations/nope')).toBeNull();
    const logs = await store().query<{ action: string }>({
      collection: 'audit_logs',
      where: [['action', '==', 'push_automation.imported']],
    });
    expect(logs).toHaveLength(0); // nothing happened, so nothing is logged as having happened
  });

  it('will not overwrite a gate row — and even when allowed, never its borrowed wording', async () => {
    const gateRow = (await exportAutomations(ctx.deps, { gates: true })).rows.find(
      (r) => r.key === 'reminder',
    ) as AutomationExportRow;
    expect(gateRow.message.title).toBe('ادامه بده!'); // the gate documents the template's text
    const refused = await importAutomations(ctx.deps, ACTOR, { rows: [gateRow] });
    expect(refused.results[0]).toMatchObject({
      key: 'reminder',
      action: 'skipped',
      message: expect.stringContaining('دروازه'),
    });

    const hijack = { ...gateRow, message: { ...gateRow.message, title: 'متنِ قالب را عوض کن' } };
    const allowed = await importAutomations(ctx.deps, ACTOR, {
      rows: [hijack],
      allowGates: true,
    });
    expect(allowed).toMatchObject({ updated: 1, skipped: 0 });
    expect((await row('reminder')).message.title).toBe('ادامه بده!');
  });

  it('tells you to seed first when a catalogue key is not there yet', async () => {
    const fresh = await createCtx({ start: '2026-10-05T06:30:00.000Z' }); // no seedCatalog here
    const report = await importAutomations(fresh.deps, ACTOR, {
      rows: [pick((await exportAll()).rows, 'inactive_1d')],
    });
    expect(report.results[0]).toMatchObject({
      key: 'inactive_1d',
      action: 'skipped',
      message: expect.stringContaining('seed'),
    });
  });

  it('refuses a row that ignores quiet hours without being urgent', async () => {
    // An export taken from an environment that still holds the old combination must not smuggle it
    // into the target: §4.4 hands the quiet-hours window to priority `urgent` and nothing else, and
    // the engine no longer honours the pair either way — so a file cannot re-arm it.
    const src = pick((await exportAll()).rows, 'inactive_1d');
    const legacy = {
      ...src,
      delivery: {
        ...src.delivery,
        priority: 'normal' as const,
        respectQuietHours: false,
      },
    };
    const preview = await importAutomations(ctx.deps, ACTOR, { rows: [legacy], dryRun: true });
    expect(preview.results[0]?.action).toBe('skipped'); // the dry run says so before anything is written
    expect(preview.results[0]?.message).toContain('اولویت «فوری»');

    const report = await importAutomations(ctx.deps, ACTOR, { rows: [legacy] });
    expect(report).toMatchObject({ checked: 1, created: 0, updated: 0, skipped: 1 });
    expect((await row('inactive_1d')).delivery.respectQuietHours).toBe(true); // the row is untouched
    // the honest form of the same switch — the rule really is urgent — imports fine
    const honest = { ...legacy, delivery: { ...legacy.delivery, priority: 'urgent' as const } };
    expect((await importAutomations(ctx.deps, ACTOR, { rows: [honest] })).updated).toBe(1);
    expect((await row('inactive_1d')).delivery.respectQuietHours).toBe(false);
  });

  it('writes one audit record for the import, with the counts', async () => {
    await importAutomations(ctx.deps, ACTOR, {
      rows: [pick((await exportAll()).rows, 'inactive_1d')],
    });
    const logs = await store().query<{ action: string; after: { updated: number } }>({
      collection: 'audit_logs',
      where: [['action', '==', 'push_automation.imported']],
    });
    expect(logs).toHaveLength(1);
    expect(logs[0]?.after.updated).toBe(1);
  });
});

describe('the HTTP pair', () => {
  it('exports for an admin and never shadows the :key routes', async () => {
    const ok = await ctx.api(admin.token).get('/v1/admin/push-automations/export');
    expect(ok.status).toBe(200);
    expect(ok.body.data.rows).toHaveLength(25);
    // `export` matches the key pattern, so this only passes if the static route is registered first.
    const filtered = await ctx
      .api(admin.token)
      .get('/v1/admin/push-automations/export?keys=streak_5&gates=1');
    expect(filtered.body.data.rows.map((r: { key: string }) => r.key)).toEqual(['streak_5']);
  });

  it('caps the payload and needs an admin', async () => {
    const tooMany = await ctx.api(admin.token).post('/v1/admin/push-automations/import', {
      rows: Array.from({ length: IMPORT_MAX_ROWS + 1 }, (_, i) => ({ key: `key${i}` })),
    });
    expect(tooMany.status).toBe(400);
    const empty = await ctx.api(admin.token).post('/v1/admin/push-automations/import', {
      rows: [],
    });
    expect(empty.status).toBe(400);

    const noRole = await ctx
      .api((await ctx.user('marketer')).token)
      .get('/v1/admin/push-automations/export');
    expect(noRole.status).toBe(403);
  });

  it('round-trips through HTTP, which is how an operator will actually use it', async () => {
    const res = await ctx.api(admin.token).get('/v1/admin/push-automations/export?keys=week_start');
    expect(res.status).toBe(200);
    const payload = res.body.data.rows[0] as Record<string, unknown> & {
      message: { title: string };
    };
    payload.message.title = 'هفته تازه';
    payload.extraFutureField = 'ignored on purpose';
    const report = await ctx
      .api(admin.token)
      .post('/v1/admin/push-automations/import', { rows: [payload] });
    expect(report.status, JSON.stringify(report.body)).toBe(200);
    expect(report.body.data).toMatchObject({ updated: 1, created: 0, skipped: 0 });
    const doc = (await store().get<Doc<PushAutomation>>(
      'push_automations/week_start',
    )) as Doc<PushAutomation>;
    expect(doc.message.title).toBe('هفته تازه');
    expect(doc.name).toBe('شروع هفته'); // untouched fields stay untouched
    expect((doc as unknown as Record<string, unknown>).extraFutureField).toBeUndefined();
  });
});
