import { z } from 'zod';
import { authenticate, h, me } from '../http/auth';
import { ApiError } from '../http/errors';
import { rateLimit, type RateLimiter } from '../http/rateLimit';
import { parse } from '../http/validate';
import { Router, type LightRouter } from '../http/router';
import type { Deps } from '../services/context';
import * as users from '../services/users';

const ip = (req: { ip?: string }) => req.ip ?? 'unknown';
const phoneInputSchema = z.object({ phone: z.string().trim().min(1).max(32) }).strict();
const PHONE_LOGIN_UNAVAILABLE =
  'شمارهٔ تلفن به‌تنهایی هویت را ثابت نمی‌کند. ورود به حساب‌های موجود از این مسیر ممکن نیست؛ در حال حاضر کد پیامکی یا روش تأیید دیگری فعال نیست.';
const PHONE_REGISTER_UNAVAILABLE =
  'ثبت درخواست تلفنی به ذخیره‌سازی پایدار نیاز دارد؛ این سرویس فعلاً درخواست را ثبت نمی‌کند.';
const PHONE_REGISTER_ACK = {
  accepted: true,
  message:
    'درخواست دریافت شد. این پاسخ وجود یا نبود حساب فعلی را نشان نمی‌دهد؛ شماره تأیید نشده و نشست یا دسترسی صادر نمی‌شود.',
} as const;

/** Public auth endpoints. Existing sessions can refresh; a phone number alone never restores one. */
export function authRouter(d: Deps, limiter: RateLimiter): LightRouter {
  const r = Router();
  const perIp = (name: string, n: number) => rateLimit(limiter, name, n, 60_000, ip);

  r.post(
    '/auth/phone-login',
    perIp('phone-login', 10),
    h(async (req) => {
      const { phone } = parse(phoneInputSchema, req.body);
      users.requirePhone(phone);
      // Deliberately do not query users/auth indexes here. The same response is returned for every
      // syntactically valid number, whether registered or not, and no token or user detail is read.
      throw new ApiError('UNAUTHENTICATED', PHONE_LOGIN_UNAVAILABLE);
    }),
  );

  r.post(
    '/auth/phone-register',
    perIp('phone-register', 5),
    h(async (req) => {
      const input = parse(users.phoneRegisterSchema, req.body);
      const durableProductionBackend =
        d.config.env !== 'prod' || (d.config.backend === 'd1' && Boolean(d.rateLimitStore));
      if (!durableProductionBackend) throw new ApiError('UNAVAILABLE', PHONE_REGISTER_UNAVAILABLE);

      try {
        const team = await d.store.get('teams/team-seylane');
        await users.register(d, input, 'marketer', {
          ...(team ? { teamId: 'team-seylane' } : {}),
          status: 'inactive',
        });
      } catch (err) {
        // A duplicate phone is deliberately indistinguishable from a newly recorded request.
        // Never return an existing user, role, ID, session, or an account-existence error.
        if (!(err instanceof ApiError) || err.code !== 'CONFLICT') throw err;
      }

      // New numbers create only an inactive, unverified marketer record. It receives no session;
      // no private account is opened and a caller cannot learn whether a phone was already used.
      return PHONE_REGISTER_ACK;
    }, 202),
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
  return r;
}
