import { Router } from 'express';
import { z } from 'zod';
import { h, me } from '../http/auth';
import { rateLimit, type RateLimiter } from '../http/rateLimit';
import { parse } from '../http/validate';
import { track, type Deps } from '../services/context';
import * as learning from '../services/learning';
import * as mentor from '../services/mentor';
import { myNudges } from '../services/mentor-rules';
import * as notify from '../services/notify';
import * as reports from '../services/reports';
import * as rewards from '../services/rewards';
import * as users from '../services/users';

/** Client-side analytics events that the app may report (server validates name). */
const CLIENT_EVENTS = [
  'app_opened',
  'signup_started',
  'next_item_cta_clicked',
  'notification_cta_clicked',
  'mentor_chat_opened',
  'playback_error',
  'manager_digest_opened',
  'report_filtered',
  'youtube_blocked_reported',
] as const;

/** Spec §21.2 — marketer module (authenticated; data scoped to the caller). */
export function meRouter(d: Deps, limiter: RateLimiter): Router {
  const r = Router();
  const uid = (req: Parameters<typeof me>[0]) => me(req).id;

  r.get(
    '/me',
    h(async (req) => users.publicUser(me(req))),
  );
  r.patch(
    '/me',
    h(async (req) => users.updateMe(d, me(req), parse(users.patchMeSchema, req.body))),
  );
  r.post(
    '/me/password',
    rateLimit(limiter, 'pwchange', 5, 60_000, uid),
    h(
      async (req) => users.changePassword(d, me(req), parse(users.changePasswordSchema, req.body)),
      204,
    ),
  );
  r.post(
    '/me/onboarding',
    h(async (req) => users.completeOnboarding(d, me(req))),
  );
  r.post(
    '/me/events',
    h(async (req) => {
      const e = parse(
        z.object({
          name: z.enum(CLIENT_EVENTS),
          props: z.record(z.union([z.string().max(100), z.number(), z.boolean()])).optional(),
        }),
        req.body,
      );
      await track(d, e.name, me(req).id, e.props ?? {});
    }, 204),
  );

  r.get(
    '/me/home',
    h(async (req) => learning.home(d, me(req))),
  );
  r.get(
    '/me/packages',
    h(async (req) =>
      learning.listMyPackages(
        d,
        me(req),
        parse(
          z.object({ status: z.enum(['new', 'in_progress', 'completed']).optional() }),
          req.query,
        ).status,
      ),
    ),
  );
  r.get(
    '/me/packages/:id',
    h(async (req) => learning.myPackage(d, me(req), String(req.params.id))),
  );
  r.get(
    '/me/sections/:id',
    h(async (req) => learning.mySection(d, me(req), String(req.params.id))),
  );
  r.get(
    '/me/sections/:id/media',
    h(async (req) => learning.sectionMedia(d, me(req), String(req.params.id))),
  );
  r.get(
    '/me/sections/:id/progress',
    h(async (req) => learning.getProgress(d, me(req), String(req.params.id))),
  );
  r.post(
    '/me/sections/:id/progress',
    rateLimit(limiter, 'heartbeat', 20, 60_000, uid),
    h(async (req) =>
      learning.recordProgress(
        d,
        me(req),
        String(req.params.id),
        parse(learning.heartbeatSchema, req.body),
        req.get('Idempotency-Key') ?? undefined,
      ),
    ),
  );

  r.get(
    '/me/quizzes/:id',
    h(async (req) => learning.getQuizForUser(d, me(req), String(req.params.id))),
  );
  r.post(
    '/me/quizzes/:id/attempts',
    rateLimit(limiter, 'attempt', 10, 60_000, uid),
    h(async (req) => learning.startAttempt(d, me(req), String(req.params.id)), 201),
  );
  r.post(
    '/me/attempts/:id/submit',
    rateLimit(limiter, 'submit', 10, 60_000, uid),
    h(async (req) =>
      learning.submitAttempt(
        d,
        me(req),
        String(req.params.id),
        parse(learning.submitSchema, req.body),
      ),
    ),
  );
  r.post(
    '/me/quizzes/:id/retake-requests',
    h(async (req) => learning.requestRetake(d, me(req), String(req.params.id)), 201),
  );

  r.get(
    '/me/points',
    h(async (req) => rewards.myPoints(d, me(req).id)),
  );
  r.get(
    '/me/badges',
    h(async (req) => rewards.myBadges(d, me(req).id)),
  );

  r.get(
    '/me/notifications',
    h(async (req) => notify.myNotifications(d, me(req).id)),
  );
  r.post(
    '/me/notifications/read-all',
    h(async (req) => notify.markAllRead(d, me(req).id)),
  );
  r.post(
    '/me/notifications/:id/read',
    h(async (req) => notify.markNotificationRead(d, me(req).id, String(req.params.id))),
  );
  r.get(
    '/me/messages',
    h(async (req) => reports.myMessages(d, me(req).id)),
  );
  r.post(
    '/me/messages/:id/read',
    h(async (req) => reports.markMessageRead(d, me(req).id, String(req.params.id))),
  );
  r.post(
    '/me/devices',
    h(async (req) => notify.registerDevice(d, me(req).id, parse(notify.deviceSchema, req.body))),
  );
  r.delete(
    '/me/devices',
    h(
      async (req) =>
        notify.unregisterDevice(
          d,
          me(req).id,
          parse(z.object({ token: z.string().min(10).max(4096) }), req.body).token,
        ),
      204,
    ),
  );

  r.get(
    '/me/mentor/nudges',
    h(async (req) => myNudges(d, me(req).id)),
  );
  r.get(
    '/me/mentor/history',
    h(async (req) =>
      mentor.chatHistory(
        d,
        me(req).id,
        typeof req.query.packageId === 'string' ? req.query.packageId : null,
      ),
    ),
  );
  r.post(
    '/me/mentor/chat',
    rateLimit(limiter, 'mentor', 10, 60_000, uid, 'کمی آهسته‌تر! چند ثانیه صبر کن و دوباره بپرس.'),
    h(async (req) => mentor.chat(d, me(req), parse(mentor.chatSchema, req.body))),
  );
  r.post(
    '/me/mentor/feedback',
    h(async (req) => mentor.feedback(d, me(req), parse(mentor.feedbackSchema, req.body))),
  );
  return r;
}
