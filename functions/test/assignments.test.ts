import { beforeEach, describe, expect, it } from 'vitest';
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
