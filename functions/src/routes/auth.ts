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
  // Marketers sign in with their phone number only (MemoryAuthProvider: local + Cloudflare D1).
  // Staff accounts can never use this route; they sign in with username + password below.
  if (d.auth instanceof MemoryAuthProvider) {
    const phoneAuth = d.auth;
    r.post(
      '/auth/phone-login',
      perIp('phone-login', 10),
      h(async (req) => {
        const { phone } = parse(z.object({ phone: z.string().max(20) }), req.body);
        const id = users.parseIdentifier(phone);
        if (id.kind !== 'phone') throw new ApiError('VALIDATION', 'شماره موبایل وارد کنید.');
        const result = await phoneAuth.demoSignIn(id.authEmail);
        if (!result.ok)
          throw new ApiError('NOT_FOUND', 'این شماره هنوز ثبت‌نام نکرده است. ابتدا ثبت‌نام کنید.', {
            reason: 'NOT_REGISTERED',
          });
        const user = await d.store.get<import('../domain/types').User>(`users/${result.uid}`);
        if (!user || user.status !== 'active') throw new ApiError('UNAUTHENTICATED');
        if (user.role !== 'marketer')
          throw new ApiError(
            'FORBIDDEN',
            'این شماره از طریق ورود با شماره موبایل قابل استفاده نیست.',
          );
        await d.store.update(`users/${result.uid}`, { lastActiveAt: new Date().toISOString() });
        return { user: users.publicUser(user), ...result.tokens };
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
        const password = randomBytesBase64Url(24);
        // Self sign-ups join the default sales team (when it exists) so the manager panel sees them.
        const team = await d.store.get('teams/team-seylane');
        const user = await users.register(
          d,
          { name: input.name, identifier: input.phone, password },
          'marketer',
          team ? { teamId: 'team-seylane' } : {},
        );
        await notifyTemplate(d, [user.id], 'welcome', { name: user.name }, { actionRef: '/' });
        const session = await users.login(d, { identifier: input.phone, password });
        return session;
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
