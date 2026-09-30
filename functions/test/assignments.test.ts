import { beforeEach, describe, expect, it } from 'vitest';
import { zonedParts } from '../src/lib/time';
import { buildFixture, createCtx, type TestCtx } from './support/ctx';

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

describe('assignment union over the API (28.2 #9)', () => {
  it('global ∪ team ∪ user; revocation hides only unstarted packages', async () => {
    const g = await buildFixture(ctx, { assign: 'none', title: 'عمومی' });
    const t = await buildFixture(ctx, { assign: 'none', title: 'تیمی' });
    const u = await buildFixture(ctx, { assign: 'none', title: 'فردی' });
    const m1 = await ctx.user('marketer', { teamId: 't1' });
    const m2 = await ctx.user('marketer', { teamId: 't2' });
    expect(
      (
        await ctx
          .api(admin.token)
          .post('/v1/admin/assignments', { type: 'global', packageIds: [g.packageId] })
      ).status,
    ).toBe(201);
    await ctx
      .api(admin.token)
      .post('/v1/admin/assignments', { type: 'team', targetId: 't1', packageIds: [t.packageId] });
    const ua = await ctx.api(admin.token).post('/v1/admin/assignments', {
      type: 'user',
      targetId: m1.id,
      packageIds: [u.packageId, g.packageId],
    });
    expect(await ids(m1.token)).toEqual([g.packageId, t.packageId, u.packageId].sort());
    expect(await ids(m2.token)).toEqual([g.packageId]);
    // notifications sent for new assignments
    const n = await ctx.api(m1.token).get('/v1/me/notifications');
    expect(JSON.stringify(n.body.data)).toContain('new_assignment');
    // revoke the user assignment → u disappears (not started), g still from global
    expect(
      (await ctx.api(admin.token).del(`/v1/admin/assignments/${ua.body.data.assignment.id}`))
        .status,
    ).toBe(200);
    expect(await ids(m1.token)).toEqual([g.packageId, t.packageId].sort());
  });

  it('assigning a draft is allowed with a Persian warning (visible after publish)', async () => {
    const res = await ctx.api(admin.token).post('/v1/admin/packages', {
      title: 'پیش‌نویس تست',
      description: 'توضیح',
      brandId: null,
      productId: null,
    });
    expect(res.status).toBe(201);
    const a = await ctx
      .api(admin.token)
      .post('/v1/admin/assignments', { type: 'global', packageIds: [res.body.data.id] });
    expect(a.status).toBe(201);
    expect(a.body.data.warnings.join(' ')).toContain('هنوز منتشر نشده');
  });
});

describe('learning paths assign their audience (one place for «who / order / when»)', () => {
  it('saving a team path makes its packages visible to that team only; archiving removes them', async () => {
    const a = await buildFixture(ctx, { assign: 'none', title: 'مرحله ۱' });
    const b = await buildFixture(ctx, { assign: 'none', title: 'مرحله ۲' });
    const m1 = await ctx.user('marketer', { teamId: 't1' });
    const m2 = await ctx.user('marketer', { teamId: 't2' });
    expect(await ids(m1.token)).toEqual([]);

    const start = new Date(ctx.deps.clock().getTime() + 3600_000).toISOString();
    const created = await ctx.api(admin.token).post('/v1/admin/paths', {
      name: 'آشنایی تیم ۱',
      scope: 'team',
      targetId: 't1',
      startAt: start,
      items: [
        { packageId: a.packageId, deadlineOffsetDays: 3 },
        { packageId: b.packageId, deadlineOffsetDays: 7 },
      ],
    });
    expect(created.status).toBe(201);
    expect(created.body.data.deadlinesUpdated).toBe(2);
    expect(await ids(m1.token)).toEqual([a.packageId, b.packageId].sort());
    expect(await ids(m2.token)).toEqual([]);
    // «روز ۳» = until the END of that day in the policy timezone, not exactly 72 h after the start.
    const pkgA = await ctx.deps.store.get<{ deadlineAt: string }>(`packages/${a.packageId}`);
    const due = zonedParts(new Date(pkgA?.deadlineAt ?? ''), 'Asia/Tehran');
    const wanted = zonedParts(new Date(Date.parse(start) + 3 * 86_400_000), 'Asia/Tehran');
    expect(`${due.year}-${due.month}-${due.day}`).toBe(
      `${wanted.year}-${wanted.month}-${wanted.day}`,
    );
    expect(`${due.hour}:${due.minute}`).toBe('23:59');

    // Editing the path (drop step 2, move to team 2) re-syncs the managed assignment.
    const pathId = created.body.data.id as string;
    await ctx.api(admin.token).put(`/v1/admin/paths/${pathId}`, {
      name: 'آشنایی تیم ۲',
      scope: 'team',
      targetId: 't2',
      items: [{ packageId: a.packageId }],
    });
    expect(await ids(m1.token)).toEqual([]);
    expect(await ids(m2.token)).toEqual([a.packageId]);
    const managed = (await ctx.api(admin.token).get('/v1/admin/assignments')).body.data as Array<{
      pathId?: string;
    }>;
    expect(managed.filter((x) => x.pathId === pathId)).toHaveLength(1);

    expect((await ctx.api(admin.token).del(`/v1/admin/paths/${pathId}`)).status).toBe(204);
    expect(await ids(m2.token)).toEqual([]);
  });

  it('a manual assignment with the same packages is not taken over by a path', async () => {
    const a = await buildFixture(ctx, { assign: 'none' });
    const m = await ctx.user('marketer', { teamId: 't1' });
    await ctx.api(admin.token).post('/v1/admin/assignments', {
      type: 'team',
      targetId: 't1',
      packageIds: [a.packageId],
    });
    const p = await ctx.api(admin.token).post('/v1/admin/paths', {
      name: 'مسیر',
      scope: 'team',
      targetId: 't1',
      items: [{ packageId: a.packageId }],
    });
    await ctx.api(admin.token).del(`/v1/admin/paths/${p.body.data.id}`);
    // The manual assignment still grants access.
    expect(await ids(m.token)).toEqual([a.packageId]);
  });
});
