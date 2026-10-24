import { notifyTemplate } from '../services/notify';
import { Router, type LightRouter } from '../http/router';
import { z } from 'zod';
import { authenticate, h, me } from '../http/auth';
import { rateLimit, type RateLimiter } from '../http/rateLimit';
import { parse } from '../http/validate';
import type { Deps } from '../services/context';
import * as users from '../services/users';
import { MemoryAuthProvider } from '../auth/memory';
import { ApiError } from '../http/errors';
import { randomBytesBase64Url } from '../lib/crypto';
import { ids } from '../lib/ids';
import type { User } from '../domain/types';

type PasswordlessIdentifier = Extract<users.Identifier, { kind: 'phone' | 'nationalCode' }>;

const ip = (req: { ip?: string }) => req.ip ?? 'unknown';

/** Complete a passwordless marketer login for either phone or national-code identity. */
async function passwordlessLogin(
  d: Deps,
  auth: MemoryAuthProvider,
  identity: PasswordlessIdentifier,
) {
  const isNationalCode = identity.kind === 'nationalCode';
  const blacklistedMessage = isNationalCode
    ? users.BLACKLISTED_NATIONAL_CODE_MESSAGE
    : users.BLACKLISTED_MESSAGE;
  const idKind = isNationalCode ? 'کد ملی' : 'شماره';
  const result = await auth.demoSignIn(identity.authEmail);
  if (!result.ok) {
    if (result.reason === 'disabled') {
      const key = await d.store.get<{ uid: string | null }>(
        `unique_keys/${ids.uniqueKey(identity.kind, identity.value)}`,
      );
      const owner = key?.uid ? await d.store.get<User>(`users/${key.uid}`) : null;
      if (owner?.status === 'blacklisted')
        throw new ApiError('FORBIDDEN', blacklistedMessage, { reason: 'BLACKLISTED' });
      throw new ApiError('FORBIDDEN', 'حساب شما غیرفعال شده است. با مدیر خود تماس بگیرید.');
    }
    throw new ApiError('NOT_FOUND', `این ${idKind} هنوز ثبت‌نام نکرده است. ابتدا ثبت‌نام کنید.`, {
      reason: 'NOT_REGISTERED',
    });
  }

  const user = await d.store.get<User>(`users/${result.uid}`);
  if (user?.status === 'blacklisted')
    throw new ApiError('FORBIDDEN', blacklistedMessage, { reason: 'BLACKLISTED' });
  if (!user || user.status !== 'active') throw new ApiError('UNAUTHENTICATED');
  if (user.role !== 'marketer')
    throw new ApiError(
      'FORBIDDEN',
      isNationalCode
        ? 'این کد ملی از طریق ورود با کد ملی قابل استفاده نیست.'
        : 'این شماره از طریق ورود با شماره موبایل قابل استفاده نیست.',
    );
  const identityMatches =
    identity.kind === 'phone'
      ? user.phone === identity.phone
      : user.nationalCodeHash === identity.nationalCodeHash;
  if (!identityMatches) throw new ApiError('UNAUTHENTICATED');

  await d.store.update(`users/${result.uid}`, { lastActiveAt: d.clock().toISOString() });
  return { user: users.publicUser(user), ...result.tokens };
}

/** Spec §21.1 — public auth endpoints (API is the only gateway, D35). */
export function authRouter(d: Deps, limiter: RateLimiter): LightRouter {
  const r = Router();
  const perIp = (name: string, n: number) => rateLimit(limiter, name, n, 60_000, ip);
  r.post(
    '/auth/register',
    perIp('register', 5),
    h(async (req) => {
      const input = parse(users.registerSchema, req.body);
      const user = await users.register(d, input);
      // F1: welcome message (in-app) for self sign-ups.
      await notifyTemplate(d, [user.id], 'welcome', { name: user.name }, { actionRef: '/' });
      const session = await users.login(d, {
        identifier: input.identifier,
        password: input.password,
      });
      return {
        user: users.publicUser(user),
        idToken: session.idToken,
        refreshToken: session.refreshToken,
        expiresIn: session.expiresIn,
      };
    }, 201),
  );
  r.post(
    '/auth/login',
    perIp('login', 10),
    h(async (req) => users.login(d, parse(users.loginSchema, req.body))),
  );
  // Passwordless marketer sign-in (MemoryAuthProvider: local + Cloudflare D1): phone for most
  // provinces, national code for the configured provinces. Staff use username + password below.
  if (d.auth instanceof MemoryAuthProvider) {
    const phoneAuth = d.auth;
    r.post(
      '/auth/phone-login',
      perIp('phone-login', 10),
      h(async (req) => {
        const { phone } = parse(z.object({ phone: z.string().max(20) }), req.body);
        const id = users.parseIdentifier(phone);
        if (id.kind !== 'phone') throw new ApiError('VALIDATION', 'شماره موبایل وارد کنید.');
        return passwordlessLogin(d, phoneAuth, id);
      }),
    );
    r.post(
      '/auth/national-code-login',
      perIp('national-code-login', 10),
      h(async (req) => {
        const input = parse(users.nationalCodeLoginSchema, req.body);
        const id = users.nationalCodeIdentifier(input.nationalCode, d.config.localSecret);
        return passwordlessLogin(d, phoneAuth, id);
      }),
    );
    r.post(
      '/auth/phone-register',
      perIp('phone-register', 5),
      h(async (req) => {
        const input = parse(users.phoneRegisterSchema, req.body);
        const id = users.parseIdentifier(input.phone);
        if (id.kind !== 'phone') throw new ApiError('VALIDATION', 'شماره موبایل وارد کنید.');
        // No password is ever shown or used: a random one satisfies the credential store.
        // (Passwordless: hashing + re-verifying it cost ~13 ms CPU per sign-up, over the Workers CPU limit.)
        const password = randomBytesBase64Url(24);
        // Self sign-ups join the default sales team (when it exists) so the manager panel sees them.
        const team = await d.store.get('teams/team-seylane');
        const user = await users.register(
          d,
          {
            name: input.name,
            identifier: input.phone,
            password,
            province: input.province,
            city: input.city,
          },
          'marketer',
          team ? { teamId: 'team-seylane' } : {},
          { passwordless: true },
        );
        await notifyTemplate(d, [user.id], 'welcome', { name: user.name }, { actionRef: '/' });
        const session = await phoneAuth.demoSignIn(id.authEmail);
        if (!session.ok) throw new ApiError('INTERNAL');
        return { user: users.publicUser(user), ...session.tokens };
      }, 201),
    );
    r.post(
      '/auth/national-code-register',
      perIp('national-code-register', 5),
      h(async (req) => {
        const input = parse(users.nationalCodeRegisterSchema, req.body);
        const identity = users.nationalCodeIdentifier(input.nationalCode, d.config.localSecret);
        // No password is shown or used: a random credential satisfies the auth provider. The
        // national code itself is never stored; only its keyed HMAC lookup value is persisted.
        const password = randomBytesBase64Url(24);
        const team = await d.store.get('teams/team-seylane');
        const user = await users.register(
          d,
          {
            name: input.name,
            identifier: identity.authEmail,
            password,
            province: input.province,
            city: input.city,
          },
          'marketer',
          team ? { teamId: 'team-seylane' } : {},
          { passwordless: true },
          identity,
        );
        await notifyTemplate(d, [user.id], 'welcome', { name: user.name }, { actionRef: '/' });
        const session = await phoneAuth.demoSignIn(identity.authEmail);
        if (!session.ok) throw new ApiError('INTERNAL');
        return { user: users.publicUser(user), ...session.tokens };
      }, 201),
    );
  }
  r.post(
    '/auth/staff-login',
    perIp('staff-login', 10),
    h(async (req) => {
      const input = parse(users.staffLoginSchema, req.body);
      const res = await users.login(d, {
        identifier: users.staffAuthEmail(input.username),
        password: input.password,
      });
      const allowed =
        input.panel === 'admin'
          ? res.user.role === 'admin' || res.user.role === 'superadmin'
          : res.user.role === 'manager';
      if (!allowed) {
        await d.auth.revoke(res.user.id);
        throw new ApiError('UNAUTHENTICATED', 'رمز یا نام کاربری اشتباه است.');
      }
      return res;
    }),
  );
  r.post(
    '/auth/refresh',
    perIp('refresh', 30),
    h(async (req) =>
      users.refresh(
        d,
        parse(z.object({ refreshToken: z.string().min(10).max(4096) }), req.body).refreshToken,
      ),
    ),
  );
  r.post(
    '/auth/logout',
    authenticate(d),
    h(async (req) => users.logout(d, me(req).id), 204),
  );
  r.post(
    '/auth/password-reset',
    perIp('pwreset', 5),
    h(async (req) => {
      await users.requestPasswordReset(
        d,
        parse(z.object({ identifier: z.string().min(3).max(120) }), req.body).identifier,
      );
      return { accepted: true };
    }, 202),
  );
  return r;
}
