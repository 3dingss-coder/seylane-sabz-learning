import { Router, type LightRouter } from '../http/router';
import { z } from 'zod';
import { h, me } from '../http/auth';
import { rateLimit, type RateLimiter } from '../http/rateLimit';
import { parse } from '../http/validate';
import { track, type Deps } from '../services/context';
import * as learning from '../services/learning';
import * as mentor from '../services/mentor';
import * as mentorAi from '../services/mentor-ai';
import * as behavior from '../services/behavior';
import * as voice from '../services/voice';
import { ApiError } from '../http/errors';
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
  'mentor_voice_opened',
  'mentor_voice_turn_sent',
  'playback_error',
  'manager_digest_opened',
  'report_filtered',
  'youtube_blocked_reported',
  'client_error',
] as const;

/** Spec §21.2 — marketer module (authenticated; data scoped to the caller). */
export function meRouter(d: Deps, limiter: RateLimiter): LightRouter {
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
        { skipBudget: !d.config.playbackBudget },
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

  // ── Multi-provider mentor (Gemini ⇄ Groq) ───────────────────────────────────
  // The answer pipeline: guardrail → hybrid retrieval → grounding envelope → routed LLM →
  // output guard. Quota is shared with the legacy chat endpoint so limits cannot be bypassed.
  r.post(
    '/me/mentor/ask',
    rateLimit(limiter, 'mentor', 10, 60_000, uid, 'کمی آهسته‌تر! چند ثانیه صبر کن و دوباره بپرس.'),
    h(async (req) => {
      const user = me(req);
      const quota = await mentor.consumeQuota(d, user.id);
      if (quota === 'user' || quota === 'global')
        throw new ApiError(
          'RATE_LIMIT',
          quota === 'user'
            ? 'سقف پیام‌های امروز تمام شد. فردا دوباره بپرس.'
            : 'منتور امروز خیلی شلوغ بوده. سؤالت را از مدیر بپرس.',
        );
      const input = parse(mentorAi.askSchema, req.body);
      return mentorAi.answerQuestion(d, user, {
        question: input.text,
        packageId: input.packageId ?? null,
        spoken: input.spoken ?? false,
      });
    }),
  );
  // Behaviour management: the "what should I do now" brief the mentor card shows.
  r.get(
    '/me/mentor/behavior',
    h(async (req) => behavior.myBehavior(d, me(req))),
  );

  // ── Voice call (تماس صوتی) ──────────────────────────────────────────────────
  r.post(
    '/me/mentor/voice/session',
    rateLimit(limiter, 'voice', 6, 60_000, uid, 'کمی صبر کن و دوباره تماس بگیر.'),
    h(async (req) =>
      voice.createVoiceSession(d, me(req), parse(voice.voiceSessionSchema, req.body)),
    ),
  );
  r.post(
    '/me/mentor/voice/turn',
    rateLimit(limiter, 'voice', 20, 60_000, uid, 'کمی آهسته‌تر صحبت کن!'),
    h(async (req) => voice.voiceTurn(d, me(req), parse(voice.voiceTurnSchema, req.body))),
  );
  // Grounding tool used by the duplex Live session: the model gets product facts only from here.
  r.post(
    '/me/mentor/voice/ground',
    rateLimit(limiter, 'voice', 40, 60_000, uid),
    h(async (req) => mentorAi.groundForVoice(d, me(req), parse(mentorAi.groundSchema, req.body))),
  );
  r.post(
    '/me/mentor/voice/transcript',
    h(async (req) =>
      voice.finalizeVoiceSession(d, me(req), parse(voice.voiceTranscriptSchema, req.body)),
    ),
  );

  // ── Sales coaching practice (نقش‌آفرینی فروش) ────────────────────────────────
  r.post(
    '/me/mentor/coach/start',
    h(async (req) => mentorAi.pickPersona(d, me(req), parse(mentorAi.coachStartSchema, req.body))),
  );
  r.post(
    '/me/mentor/coach/turn',
    rateLimit(limiter, 'mentor', 12, 60_000, uid, 'کمی آهسته‌تر! چند ثانیه صبر کن.'),
    h(async (req) => mentorAi.coachTurn(d, me(req), parse(mentorAi.coachTurnSchema, req.body))),
  );
  r.post(
    '/me/mentor/coach/debrief',
    h(async (req) =>
      mentorAi.coachDebrief(d, me(req), parse(mentorAi.coachDebriefSchema, req.body)),
    ),
  );
  return r;
}
