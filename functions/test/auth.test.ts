import { beforeEach, describe, expect, it } from 'vitest';
import { createCtx, type TestCtx } from './support/ctx';

let ctx: TestCtx;
beforeEach(async () => {
  ctx = await createCtx();
});

describe('auth (PROMPT 002)', () => {
  it('registers with phone (Persian digits) → marketer + tokens, then logs in', async () => {
    const res = await ctx
      .api()
      .post('/v1/auth/register', { name: 'سارا', identifier: '۰۹۳۵۱۲۳۴۵۶۷', password: 'abc12345' });
    expect(res.status).toBe(201);
    expect(res.body.data.user.role).toBe('marketer');
    expect(res.body.data.user.phone).toBe('09351234567');
    expect(res.body.data.idToken).toBeTruthy();
    const login = await ctx
      .api()
      .post('/v1/auth/login', { identifier: '09351234567', password: 'abc12345' });
    expect(login.status).toBe(200);
    const me = await ctx.api(login.body.data.idToken).get('/v1/me');
    expect(me.body.data.name).toBe('سارا');
  });

  it('duplicate registration → 409 with clear Persian message (28.2 #12)', async () => {
    await ctx
      .api()
      .post('/v1/auth/register', { name: 'سارا', identifier: '09351234567', password: 'abc12345' });
    ctx.limiter.reset();
    const dup = await ctx.api().post('/v1/auth/register', {
      name: 'دیگری',
      identifier: '+989351234567',
      password: 'xyz12345',
    });
    expect(dup.status).toBe(409);
    expect(dup.body.error.message).toBe('این شماره قبلاً ثبت شده است. وارد شوید.');
    expect(JSON.stringify(dup.body)).not.toContain('سارا');
  });

  it('concurrent duplicate sign-ups create exactly one user', async () => {
    const body = { name: 'همزمان', identifier: 'same@example.com', password: 'abc12345' };
    const results = await Promise.all([
      ctx.api().post('/v1/auth/register', body),
      ctx.api().post('/v1/auth/register', body),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    const users = await ctx.deps.store.query({
      collection: 'users',
      where: [['email', '==', 'same@example.com']],
    });
    expect(users).toHaveLength(1);
  });

  it('validates input in Persian', async () => {
    const res = await ctx
      .api()
      .post('/v1/auth/register', { name: 'ا', identifier: '123', password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/[\u0600-\u06FF]/);
  });

  it('wrong password → generic 401; 5 failures lock for 15 minutes', async () => {
    const u = await ctx.user('marketer');
    for (let i = 0; i < 4; i++) {
      const r = await ctx
        .api()
        .post('/v1/auth/login', { identifier: u.phone, password: 'wrong1234' });
      expect(r.status).toBe(401);
      expect(r.body.error.message).toBe('رمز یا نام کاربری اشتباه است.');
    }
    const fifth = await ctx
      .api()
      .post('/v1/auth/login', { identifier: u.phone, password: 'wrong1234' });
    expect(fifth.status).toBe(429);
    const locked = await ctx
      .api()
      .post('/v1/auth/login', { identifier: u.phone, password: 'pass1234' });
    expect(locked.status).toBe(429);
    ctx.advance(16 * 60_000);
    ctx.limiter.reset();
    const ok = await ctx
      .api()
      .post('/v1/auth/login', { identifier: u.phone, password: 'pass1234' });
    expect(ok.status).toBe(200);
  });

  it('unknown account gets the same 401 (no enumeration)', async () => {
    const r = await ctx
      .api()
      .post('/v1/auth/login', { identifier: '09990000000', password: 'whatever1' });
    expect(r.status).toBe(401);
    expect(r.body.error.message).toBe('رمز یا نام کاربری اشتباه است.');
  });

  it('refresh rotates tokens; logout revokes the session', async () => {
    const u = await ctx.user('marketer');
    const login = await ctx
      .api()
      .post('/v1/auth/login', { identifier: u.phone, password: 'pass1234' });
    const rt = login.body.data.refreshToken as string;
    ctx.advance(1000);
    const r1 = await ctx.api().post('/v1/auth/refresh', { refreshToken: rt });
    expect(r1.status).toBe(200);
    const reuse = await ctx.api().post('/v1/auth/refresh', { refreshToken: rt });
    expect(reuse.status).toBe(401);
    const token = r1.body.data.idToken as string;
    expect((await ctx.api(token).post('/v1/auth/logout')).status).toBe(204);
    ctx.advance(1000);
    expect((await ctx.api(token).get('/v1/me')).status).toBe(401);
  });

  it('deactivated account is blocked immediately', async () => {
    const admin = await ctx.user('admin');
    const u = await ctx.user('marketer');
    const r = await ctx.api(admin.token).patch(`/v1/admin/users/${u.id}`, { status: 'inactive' });
    expect(r.status).toBe(200);
    expect((await ctx.api(u.token).get('/v1/me')).status).toBe(401);
    const login = await ctx
      .api()
      .post('/v1/auth/login', { identifier: u.phone, password: 'pass1234' });
    expect(login.status).toBe(403);
  });

  it('password reset is always 202', async () => {
    const r = await ctx.api().post('/v1/auth/password-reset', { identifier: '09990000000' });
    expect(r.status).toBe(202);
  });

  it('registration is rate limited to 5/min/IP', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++)
      statuses.push((await ctx.api().post('/v1/auth/register', { name: 'x' })).status);
    expect(statuses[5]).toBe(429);
  });

  it('marketer can change own name only (mass-assignment safe)', async () => {
    const u = await ctx.user('marketer');
    const r = await ctx.api(u.token).patch('/v1/me', { name: 'نام جدید', role: 'admin' });
    expect(r.status).toBe(200);
    expect(r.body.data.role).toBe('marketer');
    expect(r.body.data.name).toBe('نام جدید');
  });
});
