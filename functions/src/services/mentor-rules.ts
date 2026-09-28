import type { Doc } from '../store/types';
import type { MentorNudge, User } from '../domain/types';
import { dayKey, DAY, HOUR } from '../lib/time';
import { getPolicy, track, type Deps } from './context';
import type { PackageView } from './learning-state';

type RuleId = MentorNudge['ruleId'];

/**
 * Rule-based mentor (spec §23.6, MVP-mandatory, no LLM). Nudges are throttled to one per
 * rule+ref per day via deterministic ids.
 */
export async function createNudge(
  d: Deps,
  userId: string,
  ruleId: RuleId,
  message: string,
  actionRef: string | null,
  refKey: string,
): Promise<boolean> {
  const policy = await getPolicy(d);
  const day = dayKey(d.clock(), policy.timezone);
  const id = `${userId}_${ruleId}_${refKey}_${day}`.slice(0, 1400);
  try {
    const nudge: MentorNudge = {
      userId,
      ruleId,
      message,
      actionRef,
      dayKey: day,
      acted: false,
      createdAt: d.clock().toISOString(),
    };
    await d.store.create(`mentor_nudges/${id}`, nudge as unknown as Record<string, unknown>);
  } catch {
    return false;
  }
  await track(d, 'mentor_nudge_created', userId, { ruleId });
  return true;
}

export interface RuleHit {
  ruleId: RuleId;
  message: string;
  actionRef: string | null;
  refKey: string;
}

function hoursLeft(deadline: string, now: Date) {
  return Math.max(0, Math.round((Date.parse(deadline) - now.getTime()) / HOUR));
}

/** Pure evaluation of the scheduled rules (R1, R4) for one user. */
export function evaluateScheduledRules(
  packages: PackageView[],
  lastActiveAt: string | null,
  now: Date,
  inactiveDays: number,
): RuleHit[] {
  const hits: RuleHit[] = [];
  const active = packages.filter(
    (p) => p.status !== 'completed' && p.packageStatus === 'published',
  );
  for (const p of active) {
    if (!p.deadlineAt) continue;
    const left = Date.parse(p.deadlineAt) - now.getTime();
    if (left > 0 && left <= 72 * HOUR && p.percent < 80) {
      const next = p.sections.find((s) => s.state !== 'completed' && s.state !== 'locked');
      const h = hoursLeft(p.deadlineAt, now);
      hits.push({
        ruleId: 'R1',
        message: `تا مهلت «${p.title}» ${h} ساعت مانده — ${next ? `قسمت «${next.title}» را ادامه بده.` : 'ادامه بده.'}`,
        actionRef: next ? `/sections/${next.id}` : `/packages/${p.id}`,
        refKey: p.id,
      });
    }
  }
  if (active.length > 0) {
    const last = lastActiveAt ? Date.parse(lastActiveAt) : 0;
    if (now.getTime() - last >= inactiveDays * DAY) {
      const first = active[0];
      hits.push({
        ruleId: 'R4',
        message: first
          ? `چند روزی است سر نزده‌ای. «${first.title}» منتظر توست — فقط چند دقیقه وقت بگذار.`
          : 'چند روزی است سر نزده‌ای — آموزش‌هایت منتظرند.',
        actionRef: first ? `/packages/${first.id}` : '/',
        refKey: 'inactive',
      });
    }
  }
  return hits;
}

/** Daily scheduled job: R1/R4 for all active marketers. */
export async function runMentorDaily(d: Deps): Promise<number> {
  const { loadShared, loadUserLearning } = await import('./learning-state');
  const policy = await getPolicy(d);
  const users = await d.store.query<User>({
    collection: 'users',
    where: [
      ['role', '==', 'marketer'],
      ['status', '==', 'active'],
    ],
  });
  const shared = await loadShared(d);
  let n = 0;
  for (const u of users as Doc<User>[]) {
    const { packages } = await loadUserLearning(d, u, shared);
    for (const hit of evaluateScheduledRules(
      packages,
      u.lastActiveAt,
      d.clock(),
      policy.reminderInactiveDays,
    )) {
      if (await createNudge(d, u.id, hit.ruleId, hit.message, hit.actionRef, hit.refKey)) n++;
    }
  }
  return n;
}

export async function myNudges(d: Deps, userId: string) {
  const since = new Date(d.clock().getTime() - 7 * DAY).toISOString();
  const list = await d.store.query<MentorNudge>({
    collection: 'mentor_nudges',
    where: [
      ['userId', '==', userId],
      ['createdAt', '>=', since],
    ],
    orderBy: [['createdAt', 'desc']],
    limit: 10,
  });
  return list.map((n) => ({
    id: n.id,
    ruleId: n.ruleId,
    message: n.message,
    actionRef: n.actionRef,
    createdAt: n.createdAt,
  }));
}
