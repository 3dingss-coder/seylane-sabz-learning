import { z } from 'zod';
import { DEFAULT_POLICY } from '../domain/policy';
import {
  audit,
  getPolicy,
  invalidatePolicy,
  nowIso,
  track,
  type Actor,
  type Deps,
} from './context';

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'ساعت باید به شکل ۲۲:۰۰ باشد.');

/** Numeric ranges (PROMPT 007 VALIDATION). */
export const policySchema = z.object({
  passScore: z
    .number()
    .int()
    .min(1, 'نمره قبولی بین ۱ تا ۱۰۰ است.')
    .max(100, 'نمره قبولی بین ۱ تا ۱۰۰ است.'),
  maxAttempts: z
    .number()
    .int()
    .min(1, 'تعداد تلاش بین ۱ تا ۱۰ است.')
    .max(10, 'تعداد تلاش بین ۱ تا ۱۰ است.'),
  completionThreshold: z
    .number()
    .int()
    .min(50, 'آستانه تکمیل بین ۵۰ تا ۱۰۰ است.')
    .max(100, 'آستانه تکمیل بین ۵۰ تا ۱۰۰ است.'),
  pointsTable: z.object({
    first_pass_quiz: z.number().int().min(0).max(1000),
    package_completion: z.number().int().min(0).max(1000),
    on_time_completion: z.number().int().min(0).max(1000),
  }),
  penaltyEnabled: z.boolean(),
  latePenalty: z.number().int().min(0).max(1000),
  warningHours: z
    .array(
      z
        .number()
        .int()
        .min(1)
        .max(24 * 14),
    )
    .min(1)
    .max(4),
  quietHours: z.object({ start: hhmm, end: hhmm }),
  weeklyDigestDay: z.number().int().min(0).max(6),
  weeklyDigestHour: z.number().int().min(0).max(23),
  reminderInactiveDays: z.number().int().min(1).max(30),
  mentorChatEnabled: z.boolean(),
  mentorDailyLimitPerUser: z.number().int().min(1).max(200),
  mentorDailyLimitGlobal: z.number().int().min(1).max(100000),
  mentorVoiceEnabled: z.boolean(),
  mentorVoiceMinutesPerUser: z.number().int().min(1).max(120),
  mentorVoiceMinutesGlobal: z.number().int().min(1).max(5000),
  // Added after the first release: defaulted so clients built before the mentor behaviour boxes
  // keep working when they PUT the policy payload they previously GETed.
  mentorCatalogScope: z.enum(['all', 'assigned']).default(DEFAULT_POLICY.mentorCatalogScope),
  mentorQuizAnswerAccess: z.boolean().default(DEFAULT_POLICY.mentorQuizAnswerAccess),
});

export async function readPolicy(d: Deps) {
  const { timezone: _tz, ...p } = await getPolicy(d);
  return p;
}

/** New values apply to new attempts only (attempt stores its own passScore snapshot). */
export async function updatePolicy(d: Deps, actor: Actor, input: z.infer<typeof policySchema>) {
  const before = await getPolicy(d);
  const next = {
    ...DEFAULT_POLICY,
    ...input,
    warningHours: [...new Set(input.warningHours)].sort((a, b) => b - a),
    updatedAt: nowIso(d),
    updatedBy: actor.id,
  };
  await d.store.set('policies/global', next);
  invalidatePolicy(d);
  const changed = (Object.keys(input) as Array<keyof typeof input>).filter(
    (k) => JSON.stringify(before[k]) !== JSON.stringify(input[k]),
  );
  await audit(d, actor, 'policy.updated', 'policies', 'global', before, next);
  await track(d, 'admin_policy_updated', actor.id, { keys: changed });
  return next;
}
