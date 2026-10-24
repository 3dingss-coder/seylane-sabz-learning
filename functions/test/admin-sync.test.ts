import { beforeEach, describe, expect, it } from 'vitest';
import { DAY, zonedParts } from '../src/lib/time';
import { runDailyReminders } from '../src/services/jobs';
import type { Package } from '../src/domain/types';
import { buildFixture, createCtx, type TestCtx } from './support/ctx';

/**
 * Regressions for the admin panel → marketer panel contract: what the admin saves must be what
 * the marketer sees, and nothing the admin configures may be silently dropped.
 */

let ctx: TestCtx;
let admin: { id: string; token: string };
beforeEach(async () => {
  ctx = await createCtx();
  admin = await ctx.user('admin');
  for (const t of ['t1', 't2'])
    await ctx.deps.store.set(`teams/${t}`, {
      name: t,
      managerId: null,
      archived: false,
      createdAt: '',
      updatedAt: '',
    });
});

const ids = async (token: string) =>
  ((await ctx.api(token).get('/v1/me/packages')).body.data as Array<{ id: string }>)
    .map((p) => p.id)
    .sort();

const pkg = (id: string) => ctx.deps.store.get<Package>(`packages/${id}`);

interface AdminSection {
  id: string;
  order: number;
  archived?: boolean;
}
const adminSections = async (c: TestCtx, token: string, packageId: string) =>
  (
    (await c.api(token).get(`/v1/admin/packages/${packageId}`)).body.data as {
      sections: AdminSection[];
    }
  ).sections;

describe('sections: ordering and archiving', () => {
  it('reordering the visible sections works when an archived section exists', async () => {
    const f = await buildFixture(ctx, { assign: 'global', sections: 3 });
    const sections = await adminSections(ctx, admin.token, f.packageId);
    expect(sections).toHaveLength(3);
    const third = sections[2]?.id ?? '';
    expect(
      (
        await ctx
          .api(admin.token)
          .patch(`/v1/admin/packages/${f.packageId}/sections/${third}`, { archived: true })
      ).status,
    ).toBe(200);

    const live = sections.slice(0, 2).map((s) => s.id);
    const res = await ctx
      .api(admin.token)
      .put(`/v1/admin/packages/${f.packageId}/sections/order`, { ids: [...live].reverse() });
    expect(res.body.error).toBeUndefined();
    expect(res.status).toBe(200);
    const after = (await adminSections(ctx, admin.token, f.packageId)).filter((s) => !s.archived);
    expect(after.map((s) => s.order)).toEqual([1, 2]);
  });

  it('a restored section moves to the end instead of duplicating an order number', async () => {
    const f = await buildFixture(ctx, { assign: 'global', sections: 2 });
    const sections = await adminSections(ctx, admin.token, f.packageId);
    const first = sections[0]?.id ?? '';
    await ctx.api(admin.token).patch(`/v1/admin/packages/${f.packageId}/sections/${first}`, {
      archived: true,
    });
    const back = await ctx
      .api(admin.token)
      .patch(`/v1/admin/packages/${f.packageId}/sections/${first}`, { archived: false });
    expect(back.status).toBe(200);
    // Appended after the remaining live section (order 2) instead of reusing its own old 1.
    expect(back.body.data.order).toBe(3);
  });

  it('an archived package stays reachable and can be restored for the marketer', async () => {
    const f = await buildFixture(ctx, { assign: 'global' });
    const m = await ctx.user('marketer', { teamId: 't1' });
    expect(await ids(m.token)).toEqual([f.packageId]);

    expect(
      (await ctx.api(admin.token).post(`/v1/admin/packages/${f.packageId}/archive`)).status,
    ).toBe(200);
    expect(await ids(m.token)).toEqual([]);

    const listed = await ctx.api(admin.token).get('/v1/admin/packages?status=archived');
    expect((listed.body.data as unknown[]).length).toBe(1);

    const restored = await ctx.api(admin.token).post(`/v1/admin/packages/${f.packageId}/unarchive`);
    expect(restored.status).toBe(200);
    expect(restored.body.data.status).toBe('published');
    expect(restored.body.data.publishIssues).toEqual([]);
    expect(await ids(m.token)).toEqual([f.packageId]);
  });
});

describe('paths: audience, deadlines and half-written edits', () => {
  it('an audience with no active marketer is reported, not swallowed', async () => {
    const f = await buildFixture(ctx, { assign: 'none' });
    const res = await ctx
      .api(admin.token)
      .post('/v1/admin/assignments', { type: 'team', targetId: 't2', packageIds: [f.packageId] });
    expect(res.status).toBe(201);
    expect(res.body.data.recipients).toBe(0);
    expect(res.body.data.warnings.join(' ')).toContain('هیچ بازاریاب فعالی');
  });

  it('a path cannot be emptied — that would revoke the whole audience silently', async () => {
    const f = await buildFixture(ctx, { assign: 'none' });
    const m = await ctx.user('marketer', { teamId: 't1' });
    const created = await ctx.api(admin.token).post('/v1/admin/paths', {
      name: 'مسیر تیم',
      scope: 'team',
      targetId: 't1',
      items: [{ packageId: f.packageId }],
    });
    expect(created.status).toBe(201);
    expect(await ids(m.token)).toEqual([f.packageId]);
    const bad = await ctx.api(admin.token).put(`/v1/admin/paths/${created.body.data.id}`, {
      name: 'مسیر تیم',
      scope: 'team',
      targetId: 't1',
      items: [],
    });
    expect(bad.status).toBe(400);
    expect(JSON.stringify(bad.body.error)).toContain('حداقل یک آموزش');
    expect(await ids(m.token)).toEqual([f.packageId]);
  });

  it('rejects an archived package before writing, so the path is never half-applied', async () => {
    const a = await buildFixture(ctx, { assign: 'none', title: 'مجزا' });
    const p = await ctx.api(admin.token).post('/v1/admin/paths', {
      name: 'مسیر',
      scope: 'team',
      targetId: 't1',
      items: [{ packageId: a.packageId }],
    });
    expect(p.status).toBe(201);
    const pathId = p.body.data.id as string;
    await ctx.api(admin.token).post(`/v1/admin/packages/${a.packageId}/archive`);

    const bad = await ctx.api(admin.token).put(`/v1/admin/paths/${pathId}`, {
      name: 'نام تازه',
      scope: 'team',
      targetId: 't1',
      items: [{ packageId: a.packageId }],
    });
    expect(bad.status).toBe(400);
    expect(JSON.stringify(bad.body.error)).toContain('بایگانی');
    const stored = await ctx.deps.store.get<{ name: string }>(`learning_paths/${pathId}`);
    expect(stored?.name, 'the rejected edit must not have been written').toBe('مسیر');
  });

  it('step deadlines land on 23:59 Tehran, and a past one is reported as skipped', async () => {
    const f = await buildFixture(ctx, { assign: 'none' });
    const startAt = new Date(ctx.deps.clock().getTime() + 2 * 3600_000).toISOString();
    const created = await ctx.api(admin.token).post('/v1/admin/paths', {
      name: 'مسیر مهلت',
      scope: 'team',
      targetId: 't1',
      startAt,
      items: [{ packageId: f.packageId, deadlineOffsetDays: 3 }],
    });
    expect(created.status).toBe(201);
    expect(created.body.data.deadlinesUpdated).toBe(1);
    const deadline = (await pkg(f.packageId))?.deadlineAt ?? '';
    const tz = zonedParts(new Date(deadline), 'Asia/Tehran');
    expect(`${tz.hour}:${tz.minute}`).toBe('23:59');
    expect(Date.parse(deadline) - Date.parse(startAt)).toBeGreaterThan(3 * DAY - 86_400_000);

    const past = await ctx.api(admin.token).put(`/v1/admin/paths/${created.body.data.id}`, {
      name: 'مسیر مهلت',
      scope: 'team',
      targetId: 't1',
      startAt: new Date(ctx.deps.clock().getTime() - 30 * DAY).toISOString(),
      items: [{ packageId: f.packageId, deadlineOffsetDays: 1 }],
    });
    expect(past.status).toBe(200);
    expect(past.body.data.deadlinesUpdated).toBe(0);
    expect(past.body.data.warnings.join(' ')).toContain('در گذشته بود');
  });
});

describe('teams ↔ managers stay consistent', () => {
  it('clearing a team manager detaches the user', async () => {
    const mgr = await ctx.user('manager', { teamId: 't1' });
    await ctx.api(admin.token).patch('/v1/admin/teams/t1', { managerId: mgr.id });
    expect(await ctx.deps.store.get<{ managerId: string | null }>('teams/t1')).toMatchObject({
      managerId: mgr.id,
    });
    const cleared = await ctx.api(admin.token).patch('/v1/admin/teams/t1', { managerId: null });
    expect(cleared.status).toBe(200);
    expect((await ctx.deps.store.get<{ teamId: string | null }>(`users/${mgr.id}`))?.teamId).toBe(
      null,
    );
  });

  it('moving a manager to another team frees the previous one', async () => {
    const mgr = await ctx.user('manager', { teamId: 't1' });
    await ctx.api(admin.token).patch('/v1/admin/teams/t1', { managerId: mgr.id });
    const res = await ctx.api(admin.token).patch('/v1/admin/teams/t2', { managerId: mgr.id });
    expect(res.status).toBe(200);
    expect(await ctx.deps.store.get<{ managerId: string | null }>('teams/t1')).toMatchObject({
      managerId: null,
    });
    expect(res.body.data.warnings.join(' ')).toContain('بدون مدیر ماند');
  });

  it('demoting a manager removes them from the team list', async () => {
    const mgr = await ctx.user('manager', { teamId: 't1' });
    await ctx.api(admin.token).patch('/v1/admin/teams/t1', { managerId: mgr.id });
    const res = await ctx.api(admin.token).patch(`/v1/admin/users/${mgr.id}`, {
      role: 'marketer',
    });
    expect(res.status).toBe(200);
    expect(res.body.data.warnings.join(' ')).toContain('مدیریت تیم');
    const teams = (await ctx.api(admin.token).get('/v1/admin/teams')).body.data as Array<{
      id: string;
      managerId: string | null;
      managerName: string | null;
    }>;
    expect(teams.find((t) => t.id === 't1')).toMatchObject({ managerId: null, managerName: null });
  });
});

describe('policies actually drive the jobs', () => {
  it('runDailyReminders waits for policy.reminderInactiveDays', async () => {
    const f = await buildFixture(ctx, { assign: 'global' });
    const m = await ctx.user('marketer', { teamId: 't1' });
    // Start the package so a reminder would be due.
    const sectionId = f.sections[0]?.id ?? '';
    expect(
      (
        await ctx
          .api(m.token)
          .post(`/v1/me/sections/${sectionId}/progress`, { positionSec: 30, playedDeltaSec: 30 })
          .set('Idempotency-Key', 'seed-progress')
      ).status,
    ).toBe(200);
    const policies = await ctx.api(admin.token).get('/v1/admin/policies');
    expect(policies.status).toBe(200);
    const put = await ctx.api(admin.token).put('/v1/admin/policies', {
      ...(policies.body.data as object),
      reminderInactiveDays: 5,
    });
    expect(put.status).toBe(200);
    const goInactive = (days: number) => {
      const iso = new Date(ctx.deps.clock().getTime() - days * DAY).toISOString();
      return ctx.deps.store.update(`users/${m.id}`, { lastActiveAt: iso, updatedAt: iso });
    };

    await goInactive(2);
    expect((await runDailyReminders(ctx.deps)).sent).toBe(0);

    await goInactive(6);
    expect((await runDailyReminders(ctx.deps)).sent).toBe(1);
  });
});
