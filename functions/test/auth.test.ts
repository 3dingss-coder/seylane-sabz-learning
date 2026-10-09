import { beforeEach, describe, expect, it } from 'vitest';
import { createCtx, type TestCtx } from './support/ctx';

let ctx: TestCtx;
beforeEach(async () => {
  ctx = await createCtx();
});

const signup = (phone = '09361112233', name = 'نیلوفر') =>
  ctx.api().post('/v1/auth/phone-register', {
    name,
    phone,
    province: 'خراسان رضوی',
    city: 'مشهد',
  });

describe('phone-only auth boundary', () => {
  it('returns the same generic login failure for existing and unknown numbers without issuing sessions', async () => {
    const existing = await ctx.user('marketer');
    await ctx.user('admin');
    const refreshBefore = await ctx.deps.store.query({ collection: '_auth_refresh' });

    const known = await ctx.api().post('/v1/auth/phone-login', { phone: existing.phone });
    const unknown = await ctx.api().post('/v1/auth/phone-login', { phone: '09990000000' });

    expect(known.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(known.body).toEqual(unknown.body);
    expect(known.body.data).toBeUndefined();
    expect(JSON.stringify(known.body)).not.toContain(existing.id);
    expect(await ctx.deps.store.query({ collection: '_auth_refresh' })).toHaveLength(
      refreshBefore.length,
    );
  });

  it('validates and normalizes phone syntax without querying account state', async () => {
    const invalid = await ctx.api().post('/v1/auth/phone-login', { phone: 'not-a-phone' });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe('VALIDATION');
    const valid = await ctx.api().post('/v1/auth/phone-login', { phone: '+98 (936) 111-2233' });
    expect(valid.status).toBe(401);
    expect(valid.body.error.message).toMatch(/به‌تنهایی/);
  });

  it('returns an identical acknowledgement for a new number and an existing account', async () => {
    const existing = await ctx.user('superadmin');
    const refreshBefore = await ctx.deps.store.query({ collection: '_auth_refresh' });
    const fresh = await signup('۰۹۳۶۱۱۱۲۲۳۳');
    const duplicate = await signup(existing.phone, 'نام دیگر');

    expect(fresh.status).toBe(202);
    expect(duplicate.status).toBe(fresh.status);
    expect(duplicate.body).toEqual(fresh.body);
    expect(fresh.body.data).toMatchObject({ accepted: true });
    expect(fresh.body.data.user).toBeUndefined();
    expect(fresh.body.data.idToken).toBeUndefined();
    expect(fresh.body.data.refreshToken).toBeUndefined();
    expect(JSON.stringify(duplicate.body)).not.toContain(existing.id);
    expect(JSON.stringify(duplicate.body)).not.toContain('superadmin');

    const pending = await ctx.deps.store.query<{
      name: string;
      phone: string;
      role: string;
      status: string;
      phoneVerifiedAt: string | null;
      province: string;
      city: string;
    }>({ collection: 'users', where: [['phone', '==', '09361112233']] });
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      name: 'نیلوفر',
      phone: '09361112233',
      role: 'marketer',
      status: 'inactive',
      phoneVerifiedAt: null,
      province: 'خراسان رضوی',
      city: 'مشهد',
    });
    expect(
      await ctx.deps.store.query({ collection: 'users', where: [['phone', '==', existing.phone]] }),
    ).toHaveLength(1);
    expect(await ctx.deps.store.query({ collection: '_auth_refresh' })).toHaveLength(
      refreshBefore.length,
    );
    expect((await ctx.api().get('/v1/me')).status).toBe(401);

    const newPhoneLogin = await ctx.api().post('/v1/auth/phone-login', { phone: '09361112233' });
    const unknownPhoneLogin = await ctx
      .api()
      .post('/v1/auth/phone-login', { phone: '09990000000' });
    expect(newPhoneLogin.body).toEqual(unknownPhoneLogin.body);
    expect(newPhoneLogin.status).toBe(401);
  });

  it('blocks public role, status, user-ID, password, and OTP field selection', async () => {
    const res = await ctx.api().post('/v1/auth/phone-register', {
      name: 'کاربر عادی',
      phone: '09361112244',
      province: 'تهران',
      city: 'تهران',
      role: 'superadmin',
      status: 'active',
      id: 'chosen-admin-id',
      firebaseUid: 'chosen-admin-id',
      code: '123456',
      password: 'not-accepted',
    });
    expect(res.status).toBe(400);
    expect(
      await ctx.deps.store.query({ collection: 'users', where: [['phone', '==', '09361112244']] }),
    ).toHaveLength(0);
  });

  it('requires a valid Iranian mobile and the residence fields for registration', async () => {
    const badPhone = await ctx.api().post('/v1/auth/phone-register', {
      name: 'شماره نامعتبر',
      phone: '12345',
      province: 'تهران',
      city: 'تهران',
    });
    expect(badPhone.status).toBe(400);

    const missing = await ctx.api().post('/v1/auth/phone-register', {
      name: 'بی‌استان',
      phone: '09361112244',
    });
    expect(missing.status).toBe(400);
    expect(missing.body.error.details.map((d: { field: string }) => d.field)).toContain('province');

    const wrongCity = await ctx.api().post('/v1/auth/phone-register', {
      name: 'شهر اشتباه',
      phone: '09361112255',
      province: 'یزد',
      city: 'مشهد',
    });
    expect(wrongCity.status).toBe(400);
    const detail = wrongCity.body.error.details.find((d: { field: string }) => d.field === 'city');
    expect(detail?.message).toContain('مشهد');
    expect(detail?.message).toContain('یزد');
  });

  it('stores only canonical phone and residence spellings and marks the phone unverified', async () => {
    const res = await ctx.api().post('/v1/auth/phone-register', {
      name: 'فاطمه',
      phone: '۰۹۳۶۱۱۱۲۲۷۷',
      province: 'سیستان وبلوچستان',
      city: 'زاهدان',
    });
    expect(res.status).toBe(202);
    const stored = await ctx.deps.store.query<{
      phone: string;
      phoneVerifiedAt: string | null;
      province: string;
      city: string;
      status: string;
    }>({ collection: 'users', where: [['phone', '==', '09361112277']] });
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      phone: '09361112277',
      phoneVerifiedAt: null,
      province: 'سیستان و بلوچستان',
      city: 'زاهدان',
      status: 'inactive',
    });
  });

  it('concurrent normalized duplicate registrations return the same response and create at most one record', async () => {
    const [first, second] = await Promise.all([
      signup('+989361112288', 'همزمان'),
      signup('۰۹۳۶۱۱۱۲۲۸۸', 'همزمان'),
    ]);
    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    expect(first.body).toEqual(second.body);
    expect(
      await ctx.deps.store.query({ collection: 'users', where: [['phone', '==', '09361112288']] }),
    ).toHaveLength(1);
  });

  it('never creates a second account or grants a session for an existing privileged account', async () => {
    const seeded = await ctx.user('superadmin');
    const before = await ctx.deps.store.get(`users/${seeded.id}`);
    const login = await ctx.api().post('/v1/auth/phone-login', { phone: seeded.phone });
    const duplicate = await signup(seeded.phone, 'مدیر ارشد دوم');
    const newRequest = await signup('09369998877', 'بازاریاب تازه');

    expect(login.status).toBe(401);
    expect(login.body.data).toBeUndefined();
    expect(duplicate.status).toBe(202);
    expect(duplicate.body).toEqual(newRequest.body);
    expect(JSON.stringify(duplicate.body)).not.toContain(seeded.id);
    expect(JSON.stringify(duplicate.body)).not.toContain('مدیر ارشد');
    expect(await ctx.deps.store.get(`users/${seeded.id}`)).toEqual(before);
  });

  it('fails closed in production without durable D1 and rate-limit storage', async () => {
    const prod = await createCtx({ env: 'prod' });
    const known = await prod.user('admin');
    const body = {
      name: 'ثبت‌نام تولیدی',
      phone: '09367778899',
      province: 'تهران',
      city: 'تهران',
    };
    const existingRequest = await prod.api().post('/v1/auth/phone-register', {
      ...body,
      phone: known.phone,
    });
    const newRequest = await prod.api().post('/v1/auth/phone-register', body);
    expect(existingRequest.status).toBe(503);
    expect(existingRequest.body).toEqual(newRequest.body);
    expect(
      await prod.deps.store.query({ collection: 'users', where: [['phone', '==', body.phone]] }),
    ).toHaveLength(0);
  });

  it('legacy password, staff-login, reset, and password-change endpoints are removed', async () => {
    for (const path of [
      '/v1/auth/login',
      '/v1/auth/register',
      '/v1/auth/staff-login',
      '/v1/auth/password-reset',
      '/v1/auth/phone/request',
    ]) {
      expect((await ctx.api().post(path, { identifier: 'x', password: 'anything' })).status).toBe(
        404,
      );
    }
    const marketer = await ctx.user('marketer');
    expect(
      (
        await ctx
          .api(marketer.token)
          .post('/v1/me/password', { currentPassword: 'x', newPassword: 'y' })
      ).status,
    ).toBe(404);
    const admin = await ctx.user('admin');
    expect(
      (await ctx.api(admin.token).post(`/v1/admin/users/${marketer.id}/reset-password`)).status,
    ).toBe(404);
  });
});

describe('session lifecycle and access control', () => {
  it('refresh rotates tokens; logout revokes the session', async () => {
    const user = await ctx.user('marketer');
    const initial = await ctx.issueTestSession(user.id);
    const rt = initial.refreshToken;
    ctx.advance(1000);
    const first = await ctx.api().post('/v1/auth/refresh', { refreshToken: rt });
    expect(first.status).toBe(200);
    const retry = await ctx.api().post('/v1/auth/refresh', { refreshToken: rt });
    expect(retry.status).toBe(200);
    ctx.advance(31_000);
    expect((await ctx.api().post('/v1/auth/refresh', { refreshToken: rt })).status).toBe(401);

    const accessToken = first.body.data.idToken as string;
    expect((await ctx.api(accessToken).post('/v1/auth/logout')).status).toBe(204);
    ctx.advance(1000);
    expect((await ctx.api(accessToken).get('/v1/me')).status).toBe(401);
  });

  it('deactivated accounts are blocked immediately and phone-login remains non-authenticating', async () => {
    const admin = await ctx.user('admin');
    const user = await ctx.user('marketer');
    expect(
      (await ctx.api(admin.token).patch(`/v1/admin/users/${user.id}`, { status: 'inactive' }))
        .status,
    ).toBe(200);
    expect((await ctx.api(user.token).get('/v1/me')).status).toBe(401);
    const login = await ctx.api().post('/v1/auth/phone-login', { phone: user.phone });
    expect(login.status).toBe(401);
    expect(login.body.data).toBeUndefined();
  });

  it('registration is rate limited to 5/min/IP before body validation', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++)
      statuses.push((await ctx.api().post('/v1/auth/phone-register', { name: 'x' })).status);
    expect(statuses[5]).toBe(429);
  });

  it('a spoofed X-Forwarded-For cannot bypass the per-IP limit', async () => {
    ctx.limiter.reset();
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++)
      statuses.push(
        (
          await ctx
            .api()
            .post('/v1/auth/phone-register', { name: 'x' })
            .set('X-Forwarded-For', `10.0.0.${i}, 203.0.113.7`)
        ).status,
      );
    expect(statuses[5]).toBe(429);
  });

  it('marketer can change own name only; request role is ignored', async () => {
    const user = await ctx.user('marketer');
    const res = await ctx.api(user.token).patch('/v1/me', { name: 'نام جدید', role: 'admin' });
    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe('marketer');
    expect(res.body.data.name).toBe('نام جدید');
  });

  it('existing session refresh survives cold-start store reset until revoked', async () => {
    const user = await ctx.user('marketer');
    const initial = await ctx.issueTestSession(user.id);
    const rt = initial.refreshToken;
    const list = await ctx.deps.store.query({ collection: '_auth_refresh' });
    for (const doc of list) await ctx.deps.store.delete(`_auth_refresh/${doc.id}`);
    const refreshed = await ctx.api().post('/v1/auth/refresh', { refreshToken: rt });
    expect(refreshed.status).toBe(200);
    const accessToken = refreshed.body.data.idToken as string;
    expect((await ctx.api(accessToken).post('/v1/auth/logout')).status).toBe(204);
    expect((await ctx.api().post('/v1/auth/refresh', { refreshToken: rt })).status).toBe(401);
  });
});
