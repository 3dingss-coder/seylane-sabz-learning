import { notifyTemplate } from '../services/notify';
import { Router } from 'express';
import { z } from 'zod';
import { authenticate, h, me } from '../http/auth';
import { rateLimit, type RateLimiter } from '../http/rateLimit';
import { parse } from '../http/validate';
import type { Deps } from '../services/context';
import * as users from '../services/users';

const ip = (req: { ip?: string }) => req.ip ?? 'unknown';

/** Spec §21.1 — public auth endpoints (API is the only gateway, D35). */
export function authRouter(d: Deps, limiter: RateLimiter): Router {
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
