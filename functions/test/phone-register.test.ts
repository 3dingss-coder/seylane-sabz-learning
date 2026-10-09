import { describe, expect, it } from 'vitest';
import { createCtx } from './support/ctx';

describe('public phone registration', () => {
  it('records only a pending marketer request and never exposes account state or issues a session', async () => {
    const ctx = await createCtx();
    const privileged = await ctx.user('superadmin');
    const payload = {
      name: 'علیرضا مرندی',
      phone: '۰۹۹۵۶۶۶۷۸۹۹',
      province: 'آذربایجان شرقی',
      city: 'آبش احمد',
    };
    const registration = await ctx.api().post('/v1/auth/phone-register', payload);

    expect(registration.status).toBe(202);
    expect(registration.body.data).toMatchObject({ accepted: true });
    expect(registration.body.data.user).toBeUndefined();
    expect(registration.body.data.idToken).toBeUndefined();
    expect(registration.body.data.refreshToken).toBeUndefined();

    const users = await ctx.deps.store.query<{
      id: string;
      name: string;
      phone: string;
      role: string;
      status: string;
      phoneVerifiedAt: string | null;
    }>({ collection: 'users', where: [['phone', '==', '09956667899']] });
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({
      name: 'علیرضا مرندی',
      phone: '09956667899',
      role: 'marketer',
      status: 'inactive',
      phoneVerifiedAt: null,
    });

    const duplicate = await ctx.api().post('/v1/auth/phone-register', {
      ...payload,
      phone: privileged.phone, // existing superadmin: same public response as a new request
    });
    expect(duplicate.status).toBe(registration.status);
    expect(duplicate.body).toEqual(registration.body);

    const existingLogin = await ctx.api().post('/v1/auth/phone-login', { phone: privileged.phone });
    const unknownLogin = await ctx.api().post('/v1/auth/phone-login', { phone: '09990000000' });
    expect(existingLogin.status).toBe(401);
    expect(existingLogin.body).toEqual(unknownLogin.body);
    expect(existingLogin.body.data).toBeUndefined();

    expect((await ctx.api().get('/v1/me')).status).toBe(401);
    expect(
      (await ctx.api().post('/v1/auth/login', { identifier: payload.phone, password: 'none' }))
        .status,
    ).toBe(404);
  });

  it('rejects client-selected IDs, roles, and extra authentication fields', async () => {
    const ctx = await createCtx();
    const response = await ctx.api().post('/v1/auth/phone-register', {
      name: 'کاربر آزمایشی',
      phone: '09990001111',
      province: 'تهران',
      city: 'تهران',
      id: 'chosen-id',
      role: 'superadmin',
      code: '123456',
      password: 'not-accepted',
    });
    expect(response.status).toBe(400);
    expect(
      await ctx.deps.store.query({ collection: 'users', where: [['phone', '==', '09990001111']] }),
    ).toHaveLength(0);
  });
});
