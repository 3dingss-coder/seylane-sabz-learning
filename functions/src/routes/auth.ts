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

const ip = (req: { ip?: string }) => req.ip ?? 'unknown';

/** Spec §21.1 — public auth endpoints (API is the only gateway, D35). */
export function authRouter(d: Deps, limiter: RateLimiter): LightRouter {
  const r = Router();
  const perIp = (name: string, n: number) => rateLimit(limiter, name, n, 60_000, ip);
  const localDemoPhoneAuth =
    d.auth instanceof MemoryAuthProvider &&
    d.config.env !== 'prod' &&
    (d.config.backend === 'memory' || d.config.env === 'test');
  const phoneUnavailable = () =>
    new ApiError(
      'UNAVAILABLE',
      'تأیید شماره تا زمان اتصال سرویس پیامکی فعال نیست. از مدیر سامانه راهنمایی بگیرید.',
    );
  const signInVerifiedPhone = d.auth.signInVerifiedPhone?.bind(d.auth);
  const issueVerifiedPhoneSession = async (email: string) => {
    if (!signInVerifiedPhone) throw phoneUnavailable();
    return signInVerifiedPhone(email);
  };
  r.post(
    '/auth/register',
    perIp('register', 5),
    h(async (req) => {
      const input = parse(users.registerSchema, req.body);
      const identifier = users.parseIdentifier(input.identifier);
      if (d.config.env === 'prod' && identifier.kind === 'phone') throw phoneUnavailable();
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
  const verifiedPhoneSchema = z.object({
    phone: z.string().max(20),
    challengeId: z.string().min(8).max(200),
    code: z.string().min(4).max(12),
  });

  r.post(
    '/auth/phone/request',
    perIp('phone-code', 3),
    h(async (req) => {
      const provider = d.phoneVerification;
      if (!provider) throw phoneUnavailable();
      const { phone } = parse(z.object({ phone: z.string().max(20) }), req.body);
      const id = users.parseIdentifier(phone);
      if (id.kind !== 'phone') throw new ApiError('VALIDATION', 'شماره موبایل وارد کنید.');
      return { accepted: true, ...(await provider.requestCode(id.phone)) };
    }, 202),
  );

  // Passwordless phone sign-in is only available in disposable local/test memory mode, or when
  // a real provider has verified a one-time challenge. D1/production never accepts a phone alone.
  r.post(
    '/auth/phone-login',
    perIp('phone-login', 10),
    h(async (req) => {
      let email: string;
      if (localDemoPhoneAuth) {
        const { phone } = parse(z.object({ phone: z.string().max(20) }), req.body);
        const id = users.parseIdentifier(phone);
        if (id.kind !== 'phone') throw new ApiError('VALIDATION', 'شماره موبایل وارد کنید.');
        email = id.authEmail;
      } else {
        const provider = d.phoneVerification;
        if (!provider || !d.auth.signInVerifiedPhone) throw phoneUnavailable();
        const input = parse(verifiedPhoneSchema, req.body);
        const id = users.parseIdentifier(input.phone);
        if (id.kind !== 'phone') throw new ApiError('VALIDATION', 'شماره موبایل وارد کنید.');
        if (
          !(await provider.verifyCode({
            phone: id.phone,
            challengeId: input.challengeId,
            code: input.code,
          }))
        )
          throw new ApiError('UNAUTHENTICATED', 'کد تأیید درست یا معتبر نیست.');
        email = id.authEmail;
      }

      const result = localDemoPhoneAuth
        ? await (d.auth as MemoryAuthProvider).demoSignIn(email)
        : await issueVerifiedPhoneSession(email);
      if (!result.ok) {
        if (localDemoPhoneAuth)
          throw new ApiError('NOT_FOUND', 'این شماره هنوز ثبت‌نام نکرده است. ابتدا ثبت‌نام کنید.', {
            reason: 'NOT_REGISTERED',
          });
        throw new ApiError('UNAUTHENTICATED', 'شماره یا کد تأیید درست نیست.');
      }
      const user = await d.store.get<import('../domain/types').User>(`users/${result.uid}`);
      if (!user || user.status !== 'active') {
        await d.auth.revoke(result.uid);
        throw new ApiError('UNAUTHENTICATED');
      }
      if (user.role !== 'marketer') {
        await d.auth.revoke(result.uid);
        throw new ApiError(
          'FORBIDDEN',
          'این شماره از طریق ورود با شماره موبایل قابل استفاده نیست.',
        );
      }
      await d.store.update(`users/${result.uid}`, { lastActiveAt: new Date().toISOString() });
      return { user: users.publicUser(user), ...result.tokens };
    }),
  );

  r.post(
    '/auth/phone-register',
    perIp('phone-register', 5),
    h(async (req) => {
      const provider = d.phoneVerification;
      if (!localDemoPhoneAuth && (!provider || !signInVerifiedPhone)) throw phoneUnavailable();
      const input = localDemoPhoneAuth
        ? parse(users.phoneRegisterSchema, req.body)
        : parse(users.verifiedPhoneRegisterSchema, req.body);
      const id = users.parseIdentifier(input.phone);
      if (id.kind !== 'phone') throw new ApiError('VALIDATION', 'شماره موبایل وارد کنید.');
      if (!localDemoPhoneAuth) {
        if (!provider) throw phoneUnavailable();
        const verification = input as typeof input & { challengeId: string; code: string };
        const valid = await provider.verifyCode({
          phone: id.phone,
          challengeId: verification.challengeId,
          code: verification.code,
        });
        if (!valid) throw new ApiError('UNAUTHENTICATED', 'کد تأیید درست یا معتبر نیست.');
      }
      // A fresh random credential is never exposed to the client or used as proof of phone ownership.
      const password = randomBytesBase64Url(24);
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
      const session = localDemoPhoneAuth
        ? await (d.auth as MemoryAuthProvider).demoSignIn(id.authEmail)
        : await issueVerifiedPhoneSession(id.authEmail);
      if (!session.ok) throw new ApiError('INTERNAL');
      return { user: users.publicUser(user), ...session.tokens };
    }, 201),
  );
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
