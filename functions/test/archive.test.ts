import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildFixture,
  createCtx,
  passQuiz,
  watchSection,
  type Fixture,
  type TestCtx,
} from './support/ctx';

let ctx: TestCtx;
let fx: Fixture;
let admin: { id: string; token: string };
let sa: { id: string; token: string };
let marketer: { id: string; token: string; phone: string };

beforeEach(async () => {
  ctx = await createCtx();
  fx = await buildFixture(ctx, { sections: 1, durationSec: 60, deadlineDays: 5 });
  admin = await ctx.user('admin');
  sa = await ctx.user('superadmin');
  marketer = await ctx.user('marketer', { name: 'علی عدلی' });
});

async function doQuiz() {
  const s = fx.sections[0];
  if (!s) throw new Error('fixture has no section');
  await watchSection(ctx, marketer.token, s.id, 60);
  const ok = await passQuiz(ctx, marketer.token, s.quizId, s.answers);
  expect(ok.body.data.passed).toBe(true);
}

const count = async (col: string) => (await ctx.deps.store.query({ collection: col })).length;

describe('user blacklist (حذف کاربر)', () => {
  it('blocks sign-in and sign-up for the number and moves the user to the archive', async () => {
    const del = await ctx.api(admin.token).del(`/v1/admin/users/${marketer.id}`);
    expect(del.status).toBe(200);
    expect(del.body.data.user.status).toBe('blacklisted');

    // Old session is dead; phone login says blocked (not «not registered»).
    expect((await ctx.api(marketer.token).get('/v1/me')).status).toBeGreaterThanOrEqual(401);
    const login = await ctx.api().post('/v1/auth/phone-login', { phone: marketer.phone });
    expect(login.status).toBe(403);
    expect(login.body.error.message).toContain('مسدود');
    const reg = await ctx.api().post('/v1/auth/phone-register', {
      name: 'علی عدلی',
      phone: marketer.phone,
      province: 'تهران',
      city: 'تهران',
    });
    expect(reg.status).toBe(403);

    // Gone from the users list, present in the archive blacklist.
    const list = await ctx.api(admin.token).get('/v1/admin/users');
    expect(list.body.data.some((u: { id: string }) => u.id === marketer.id)).toBe(false);
    const arch = await ctx.api(admin.token).get('/v1/admin/archive/users');
    expect(arch.body.data.map((u: { id: string }) => u.id)).toContain(marketer.id);
  });

  it('restoring from the archive lets the user sign in again', async () => {
    await ctx.api(admin.token).del(`/v1/admin/users/${marketer.id}`);
    const res = await ctx.api(admin.token).post(`/v1/admin/archive/users/${marketer.id}/restore`);
    expect(res.status).toBe(200);
    expect(res.body.data.user.status).toBe('active');
    const login = await ctx.api().post('/v1/auth/phone-login', { phone: marketer.phone });
    expect(login.status).toBe(200);
    const list = await ctx.api(admin.token).get('/v1/admin/users');
    expect(list.body.data.some((u: { id: string }) => u.id === marketer.id)).toBe(true);
    expect((await ctx.api(admin.token).get('/v1/admin/archive/users')).body.data).toHaveLength(0);
  });

  it('refuses to delete yourself, and only a superadmin may delete admins', async () => {
    expect((await ctx.api(admin.token).del(`/v1/admin/users/${admin.id}`)).status).toBe(403);
    expect((await ctx.api(admin.token).del(`/v1/admin/users/${sa.id}`)).status).toBe(403);
    const other = await ctx.user('admin');
    expect((await ctx.api(sa.token).del(`/v1/admin/users/${other.id}`)).status).toBe(200);
  });

  it('purging from the archive removes the account and all its data', async () => {
    await doQuiz();
    expect(await count('attempts')).toBe(1);
    expect(await count('section_progress')).toBeGreaterThan(0);
    // Only archived users can be purged.
    expect((await ctx.api(admin.token).del(`/v1/admin/archive/users/${marketer.id}`)).status).toBe(
      409,
    );
    await ctx.api(admin.token).del(`/v1/admin/users/${marketer.id}`);
    const res = await ctx.api(admin.token).del(`/v1/admin/archive/users/${marketer.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.purged).toBe(true);

    for (const col of [
      'attempts',
      'section_progress',
      'package_completions',
      'points_ledger',
      'notifications',
    ])
      expect(
        await ctx.deps.store.query({ collection: col, where: [['userId', '==', marketer.id]] }),
      ).toHaveLength(0);
    expect(await ctx.deps.store.get(`users/${marketer.id}`)).toBeNull();
    expect(await ctx.deps.store.get(`_auth/${marketer.id}`)).toBeNull();
    expect((await ctx.api(admin.token).get('/v1/admin/archive/users')).body.data).toHaveLength(0);

    // The number is free again: a fresh sign-up works and is a brand-new user.
    const reg = await ctx.api().post('/v1/auth/phone-register', {
      name: 'علی عدلی',
      phone: marketer.phone,
      province: 'تهران',
      city: 'تهران',
    });
    expect(reg.status).toBe(201);
    expect(reg.body.data.user.id).not.toBe(undefined);
    expect(reg.body.data.user.pointsBalance).toBe(0);
  });
});

describe('report archive (حذف گزارش)', () => {
  const ref = () => ({ userId: marketer.id, packageId: fx.packageId });

  it('hides the row from reports, lists it in the archive, and restores it', async () => {
    await doQuiz();
    const before = await ctx.api(admin.token).get('/v1/admin/reports/completion');
    expect(before.body.data.rows).toHaveLength(1);
    const quizzesBefore = await ctx.api(admin.token).get('/v1/admin/reports/quizzes');
    expect(quizzesBefore.body.data.attempts).toHaveLength(1);

    const arc = await ctx.api(admin.token).post('/v1/admin/archive/reports', { items: [ref()] });
    expect(arc.status).toBe(200);
    expect(arc.body.data.archived).toBe(1);

    const after = await ctx.api(admin.token).get('/v1/admin/reports/completion');
    expect(after.body.data.rows).toHaveLength(0);
    const quizzesAfter = await ctx.api(admin.token).get('/v1/admin/reports/quizzes');
    expect(quizzesAfter.body.data.attempts).toHaveLength(0);
    const list = await ctx.api(admin.token).get('/v1/admin/archive/reports');
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].userName).toBe('علی عدلی');

    const res = await ctx.api(admin.token).post('/v1/admin/archive/reports/restore', ref());
    expect(res.status).toBe(200);
    expect(
      (await ctx.api(admin.token).get('/v1/admin/reports/completion')).body.data.rows,
    ).toHaveLength(1);
  });

  it('purging deletes the progress/attempt data and keeps the row hidden', async () => {
    await doQuiz();
    await ctx.api(admin.token).post('/v1/admin/archive/reports', { items: [ref()] });
    const res = await ctx.api(admin.token).post('/v1/admin/archive/reports/purge', ref());
    expect(res.status).toBe(200);
    expect(await count('attempts')).toBe(0);
    expect(await count('section_progress')).toBe(0);
    expect(await count('package_completions')).toBe(0);
    // Gone from the archive list and still not back in the reports.
    expect((await ctx.api(admin.token).get('/v1/admin/archive/reports')).body.data).toHaveLength(0);
    expect(
      (await ctx.api(admin.token).get('/v1/admin/reports/completion')).body.data.rows,
    ).toHaveLength(0);
    // The leftover marker holds ids only: no name or phone.
    const marker = await ctx.deps.store.query<Record<string, unknown>>({
      collection: 'archived_reports',
    });
    expect(marker).toHaveLength(1);
    expect(marker[0]).not.toHaveProperty('userName');
  });

  it('non-admins cannot use the archive', async () => {
    expect((await ctx.api(marketer.token).get('/v1/admin/archive/users')).status).toBe(403);
    expect(
      (await ctx.api(marketer.token).post('/v1/admin/archive/reports', { items: [ref()] })).status,
    ).toBe(403);
  });
});
