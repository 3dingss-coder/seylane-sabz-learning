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
  // MemoryAuthProvider (local dev + Cloudflare D1) supports phone-only login. Never exposed on Firebase Auth.
  if (d.auth instanceof MemoryAuthProvider) {
    const demoAuth = d.auth;
    r.post(
      '/auth/demo-phone-login',
      perIp('demo-phone-login', 10),
      h(async (req) => {
        const { phone } = parse(z.object({ phone: z.string().max(20) }), req.body);
        const id = users.parseIdentifier(phone);
        if (id.kind !== 'phone') throw new ApiError('VALIDATION', 'شماره موبایل وارد کنید.');
        const result = await demoAuth.demoSignIn(id.authEmail);
        if (!result.ok) throw new ApiError('UNAUTHENTICATED', 'حسابی با این شماره پیدا نشد.');
        const user = await d.store.get<import('../domain/types').User>(`users/${result.uid}`);
        if (!user || user.status !== 'active') throw new ApiError('UNAUTHENTICATED');
        return { user: users.publicUser(user), ...result.tokens };
      }),
    );
  }
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
