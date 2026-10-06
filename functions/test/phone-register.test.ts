import { describe, expect, it } from 'vitest';
import { createCtx } from './support/ctx';

describe('phone sign-up (no password hashing)', () => {
  it('registers, returns a working session, and the account is not password-usable', async () => {
    const ctx = await createCtx();
    const res = await ctx.api().post('/v1/auth/phone-register', {
      name: 'علیرضا مرندی',
      phone: '09956667899',
      province: 'آذربایجان شرقی',
      city: 'آبش احمد',
    });
    expect(res.status).toBe(201);
    const { idToken, user } = res.body.data as { idToken: string; user: { name: string } };
    expect(user.name).toBe('علیرضا مرندی');
    expect((await ctx.api(idToken).get('/v1/me')).status).toBe(200);
    // Phone login still works; password login with any value never does.
    expect((await ctx.api().post('/v1/auth/phone-login', { phone: '09956667899' })).status).toBe(
      200,
    );
    expect(
      (await ctx.api().post('/v1/auth/login', { identifier: '09956667899', password: 'none' }))
        .status,
    ).toBe(401);
  });
});
