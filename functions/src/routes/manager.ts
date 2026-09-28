import { Router } from 'express';
import { z } from 'zod';
import { h, me, requireRole } from '../http/auth';
import { rateLimit, type RateLimiter } from '../http/rateLimit';
import { parse } from '../http/validate';
import type { Deps } from '../services/context';
import * as reports from '../services/reports';

/** Spec §21.3 — team scope enforced in every service call (teamId == manager.teamId). */
export function managerRouter(d: Deps, limiter: RateLimiter): Router {
  const r = Router();
  r.use('/manager', requireRole('manager'));
  const uid = (req: Parameters<typeof me>[0]) => me(req).id;
  r.get(
    '/manager/dashboard',
    h(async (req) => reports.managerDashboard(d, me(req))),
  );
  r.get(
    '/manager/reports/completion',
    h(async (req) => reports.managerReport(d, me(req), parse(reports.reportQuery, req.query))),
  );
  r.get(
    '/manager/users/:id/progress',
    h(async (req) => reports.userTimeline(d, me(req), String(req.params.id))),
  );
  const spam = rateLimit(
    limiter,
    'mgr-msg',
    20,
    60 * 60_000,
    uid,
    'تعداد پیام‌های شما در این ساعت زیاد بوده است. کمی بعد دوباره تلاش کنید.',
  );
  r.post(
    '/manager/users/:id/messages',
    spam,
    h(
      async (req) =>
        reports.sendMessage(
          d,
          me(req),
          String(req.params.id),
          'message',
          parse(reports.messageSchema, req.body),
        ),
      201,
    ),
  );
  r.post(
    '/manager/users/:id/notes',
    spam,
    h(
      async (req) =>
        reports.sendMessage(
          d,
          me(req),
          String(req.params.id),
          'note',
          parse(reports.noteSchema, req.body),
        ),
      201,
    ),
  );
  r.get(
    '/manager/retake-requests',
    h(async (req) =>
      reports.listRetakes(
        d,
        me(req),
        parse(
          z.object({ status: z.enum(['pending', 'approved', 'rejected']).optional() }),
          req.query,
        ).status,
      ),
    ),
  );
  const note = z.object({ note: z.string().trim().max(500).nullable().optional() });
  r.post(
    '/manager/retake-requests/:id/approve',
    h(async (req) =>
      reports.reviewRetake(
        d,
        me(req),
        String(req.params.id),
        'approved',
        parse(note, req.body).note ?? null,
      ),
    ),
  );
  r.post(
    '/manager/retake-requests/:id/reject',
    h(async (req) =>
      reports.reviewRetake(
        d,
        me(req),
        String(req.params.id),
        'rejected',
        parse(note, req.body).note ?? null,
      ),
    ),
  );
  return r;
}
