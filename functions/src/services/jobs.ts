import { DAY, HOUR, zonedParts } from '../lib/time';
import { ids } from '../lib/ids';
import type { Doc } from '../store/types';
import type { Package, Team, User } from '../domain/types';
import { getPolicy, track, type Deps } from './context';
import { loadShared, loadUserLearning } from './learning-state';
import { notifyTemplate } from './notify';
import { isLagging, loadMembers } from './reports';

/**
 * Scheduled jobs (spec §26, PROMPT 011). Written as plain services so they are unit-testable
 * with a fake clock; exported as onSchedule functions in index.ts and runnable locally.
 */

/** Hourly: 72h/24h warnings (once per threshold) + deadline-passed escalation (once). */
export async function runDeadlineSweep(d: Deps) {
  const policy = await getPolicy(d);
  const now = d.clock();
  const shared = await loadShared(d);
  const marketers = await d.store.query<User>({
    collection: 'users',
    where: [
      ['role', '==', 'marketer'],
      ['status', '==', 'active'],
    ],
  });
  const stats = { warnings: 0, passed: 0, managerReports: 0 };
  const passedByTeam = new Map<string, Array<{ name: string; title: string }>>();
  const thresholds = [...policy.warningHours].sort((a, b) => a - b);
  for (const u of marketers as Doc<User>[]) {
    const { packages } = await loadUserLearning(d, u, shared);
    for (const p of packages) {
      if (p.status === 'completed' || p.packageStatus !== 'published' || !p.deadlineAt) continue;
      const left = Date.parse(p.deadlineAt) - now.getTime();
      if (left > 0) {
        // Smallest threshold that has been crossed → exactly one warning per threshold.
        const h = thresholds.find((t) => left <= t * HOUR);
        if (h !== undefined) {
          const n = await notifyTemplate(
            d,
            [u.id],
            'deadline_warning',
            { title: p.title, hours: Math.max(1, Math.round(left / HOUR)) },
            {
              actionRef: `/packages/${p.id}`,
              priority: 'high',
              urgent: left < 24 * HOUR,
              throttleKey: `warn_${p.id}_${h}_${p.deadlineAt}`,
              throttleMs: 3650 * DAY,
            },
          );
          if (n) {
            stats.warnings++;
            await track(d, 'deadline_warning_sent', u.id, { packageId: p.id, hours: h });
          }
        }
      } else {
        const escId = ids.escalation(u.id, p.id, 'deadline_passed');
        try {
          await d.store.create(`escalation_events/${escId}`, {
            userId: u.id,
            teamId: u.teamId,
            packageId: p.id,
            type: 'deadline_passed',
            createdAt: now.toISOString(),
          });
        } catch {
          continue; // already escalated
        }
        await notifyTemplate(
          d,
          [u.id],
          'deadline_passed',
          { title: p.title },
          { actionRef: `/packages/${p.id}`, priority: 'high', urgent: true },
        );
        await track(d, 'deadline_passed', u.id, { packageId: p.id });
        stats.passed++;
        if (u.teamId) {
          const list = passedByTeam.get(u.teamId) ?? [];
          list.push({ name: u.name, title: p.title });
          passedByTeam.set(u.teamId, list);
        }
      }
    }
  }
  // Manager report (D15/D16: warning → manager report, no automatic penalty/lock).
  for (const [teamId, list] of passedByTeam) {
    const managers = await d.store.query<User>({
      collection: 'users',
      where: [
        ['teamId', '==', teamId],
        ['role', '==', 'manager'],
        ['status', '==', 'active'],
      ],
    });
    const body =
      list.length === 1
        ? `مهلت «${list[0]?.title}» برای ${list[0]?.name} تمام شد و آموزش کامل نشده است.`
        : `مهلت آموزش برای ${list.length} مورد در تیم شما تمام شد و کامل نشده است.`;
    stats.managerReports += await notifyTemplate(
      d,
      managers.map((m) => m.id),
      'escalation',
      { body },
      { actionRef: '/manager', priority: 'high' },
    );
  }
  return stats;
}

/** Daily 10:00 Tehran: reminder for in-progress training (throttled daily). */
export async function runDailyReminders(d: Deps) {
  const policy = await getPolicy(d);
  const shared = await loadShared(d);
  const marketers = await d.store.query<User>({
    collection: 'users',
    where: [
      ['role', '==', 'marketer'],
      ['status', '==', 'active'],
    ],
  });
  // The admin sets this in «سیاست‌ها» («یادآوری پس از چند روز عدم فعالیت») — it must drive the job.
  const inactiveMs = Math.max(1, policy.reminderInactiveDays) * DAY;
  const throttleMs = Math.max(20 * HOUR, inactiveMs);
  const now = d.clock().getTime();
  let sent = 0;
  for (const u of marketers as Doc<User>[]) {
    // Skip anyone who was active inside the inactivity window.
    if (u.lastActiveAt && now - Date.parse(u.lastActiveAt) < inactiveMs) continue;
    const { packages } = await loadUserLearning(d, u, shared);
    const p = packages.find((x) => x.status === 'in_progress' && x.packageStatus === 'published');
    if (!p) continue;
    sent += await notifyTemplate(
      d,
      [u.id],
      'reminder',
      { title: p.title, percent: p.percent },
      { actionRef: `/packages/${p.id}`, throttleKey: 'daily_reminder', throttleMs },
    );
  }
  return { sent };
}

/** Weekly digest (Saturday 09:00 Tehran by default). Runs hourly; acts only at the policy slot. */
export async function runWeeklyDigest(d: Deps, force = false) {
  const policy = await getPolicy(d);
  const p = zonedParts(d.clock(), policy.timezone);
  if (!force && (p.weekday !== policy.weeklyDigestDay || p.hour !== policy.weeklyDigestHour))
    return { sent: 0, skipped: true };
  const teams = await d.store.query<Team>({
    collection: 'teams',
    where: [['archived', '==', false]],
  });
  let sent = 0;
  for (const t of teams) {
    const managers = await d.store.query<User>({
      collection: 'users',
      where: [
        ['teamId', '==', t.id],
        ['role', '==', 'manager'],
        ['status', '==', 'active'],
      ],
    });
    if (!managers.length) continue;
    const members = await loadMembers(
      d,
      await d.store.query<User>({
        collection: 'users',
        where: [
          ['teamId', '==', t.id],
          ['role', '==', 'marketer'],
          ['status', '==', 'active'],
        ],
      }),
    );
    const lagging = members.filter((m) => m.packages.some((pk) => isLagging(pk, d.clock())));
    const count = lagging.length;
    const week = `${p.year}-${p.month}-${p.day}`;
    const n = await notifyTemplate(
      d,
      managers.map((m) => m.id),
      'weekly_digest',
      { count },
      {
        actionRef: '/manager',
        priority: 'high',
        throttleKey: `digest_${t.id}_${week}`,
        throttleMs: 6 * DAY,
      },
    );
    sent += n;
    // §26 #9: the digest also goes by email (only channel that uses email).
    if (n > 0 && d.mail.enabled) {
      const text = weeklyDigestEmail(t.name, lagging, d.config.appUrl);
      for (const mgr of managers.filter((m) => m.email)) {
        try {
          await d.mail.send({
            to: mgr.email ?? '',
            subject: `گزارش هفتگی ${t.name}: ${count} نفر عقب‌اند`,
            text,
          });
        } catch (e) {
          console.warn('[digest] email failed', (e as Error).message);
        }
      }
    }
  }
  return { sent, skipped: false };
}

export function weeklyDigestEmail(
  teamName: string,
  lagging: Array<{ user: { name: string }; packages: Array<{ title: string; percent: number }> }>,
  appUrl: string,
): string {
  const lines = [
    `سلام،`,
    ``,
    `خلاصه هفتگی ${teamName}:`,
    lagging.length
      ? `${lagging.length} نفر از تیم شما در آموزش‌ها عقب هستند:`
      : 'هیچ‌کس در تیم شما عقب نیست. عالی است!',
    ...lagging.map(
      (m) =>
        `• ${m.user.name}: ${m.packages
          .filter((pk) => pk.percent < 100)
          .map((pk) => `${pk.title} (${pk.percent}٪)`)
          .join('، ')}`,
    ),
    ``,
    appUrl ? `برای پیگیری وارد پنل شوید: ${appUrl}/manager` : 'برای پیگیری وارد پنل مدیر شوید.',
  ];
  return lines.join('\n');
}

/** Package deadlines at risk — used by admin dashboard. */
export function upcomingDeadlines(packages: Array<Doc<Package>>, now: Date, days = 7) {
  return packages.filter(
    (p) =>
      p.status === 'published' &&
      p.deadlineAt &&
      Date.parse(p.deadlineAt) > now.getTime() &&
      Date.parse(p.deadlineAt) - now.getTime() <= days * DAY,
  );
}
