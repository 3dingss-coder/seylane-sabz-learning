import type { Policy } from './types';

/** Defaults from spec §9 / §18.5 (editable in admin → policies). */
export const DEFAULT_POLICY: Omit<Policy, 'updatedAt' | 'updatedBy'> = {
  passScore: 80,
  maxAttempts: 3,
  completionThreshold: 85,
  pointsTable: { first_pass_quiz: 20, package_completion: 30, on_time_completion: 50 },
  penaltyEnabled: false,
  latePenalty: 0,
  warningHours: [72, 24],
  quietHours: { start: '22:00', end: '07:00' },
  timezone: 'Asia/Tehran',
  weeklyDigestDay: 6,
  weeklyDigestHour: 9,
  reminderInactiveDays: 3,
  mentorChatEnabled: true,
  mentorDailyLimitPerUser: 20,
  mentorDailyLimitGlobal: 2000,
  mentorVoiceEnabled: true,
  mentorVoiceMinutesPerUser: 15,
  mentorVoiceMinutesGlobal: 300,
};
