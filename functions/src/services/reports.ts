import { z } from 'zod';
import { ApiError } from '../http/errors';
import { DAY, HOUR, zonedOffsetMs } from '../lib/time';
import type { Doc } from '../store/types';
import type { Attempt, Message, RetakeRequest, Team, User } from '../domain/types';
import { audit, track, type Actor, type Deps } from './context';
import { loadLearningForUsers, loadUserLearning, type PackageView } from './learning-state';
import { notifyTemplate } from './notify';
import { publicUser } from './users';

/** Laggard = overdue & incomplete, or ≤72h left with < 50% progress. */
export function isLagging(p: PackageView, now: Date): boolean {
  if (p.status === 'completed' || p.packageStatus !== 'published' || !p.deadlineAt) return false;
  const left = Date.parse(p.deadlineAt) - now.getTime();
  return left < 0 || (left <= 72 * HOUR && p.percent < 50);
}

export interface MemberLearning {
  user: Doc<User>;
  packages: PackageView[];
}

export async function loadMembers(d: Deps, users: Array<Doc<User>>): Promise<MemberLearning[]> {
  const learning = await loadLearningForUsers(d, users);
  return users.map((u) => ({ user: u, packages: learning.get(u.id)?.packages ?? [] }));
}

export function summarize(members: MemberLearning[], now: Date) {
  let assigned = 0;
  let completed = 0;
  let onTime = 0;
  const delays: number[] = [];
  const laggards: Array<{
    userId: string;
    name: string;
    province: string | null;
    city: string | null;
    packageId: string;
    packageTitle: string;
    percent: number;
    deadlineAt: string | null;
    overdueDays: number;
    lastActivityAt: string | null;
    stuckAt: string | null;
  }> = [];
  for (const m of members) {
    for (const p of m.packages) {
      if (p.packageStatus !== 'published' && p.status !== 'completed') continue;
      assigned++;
      if (p.status === 'completed') {
        completed++;
        if (p.onTime) onTime++;
        else if (p.completedAt && p.deadlineAt)
          delays.push((Date.parse(p.completedAt) - Date.parse(p.deadlineAt)) / DAY);
      } else if (p.deadlineAt && p.deadlineAt < now.toISOString())
        delays.push((now.getTime() - Date.parse(p.deadlineAt)) / DAY);
      if (isLagging(p, now)) {
        const stuck = p.sections.find((s) => s.state !== 'completed' && s.state !== 'locked');
        laggards.push({
          userId: m.user.id,
          name: m.user.name,
          province: m.user.province,
          city: m.user.city,
          packageId: p.id,
          packageTitle: p.title,
          percent: p.percent,
          deadlineAt: p.deadlineAt,
          overdueDays:
            p.deadlineAt && p.deadlineAt < now.toISOString()
              ? Math.ceil((now.getTime() - Date.parse(p.deadlineAt)) / DAY)
              : 0,
          lastActivityAt: p.lastActivityAt,
          stuckAt: stuck ? stuck.title : null,
        });
      }
    }
  }
  laggards.sort((a, b) => b.overdueDays - a.overdueDays || a.percent - b.percent);
  return {
    kpis: {
      members: members.length,
      completionRate: assigned ? Math.round((completed / assigned) * 100) : 0,
      onTimeRate: completed ? Math.round((onTime / completed) * 100) : 0,
      laggardCount: new Set(laggards.map((l) => l.userId)).size,
      avgDelayDays: delays.length
        ? Math.round((delays.reduce((a, b) => a + b, 0) / delays.length) * 10) / 10
        : 0,
      assigned,
      completed,
    },
    laggards,
  };
}

// ─── Manager scope (spec §19.4 #3: teamId == manager.teamId) ────────────────
export async function teamMembers(d: Deps, manager: Doc<User>): Promise<Array<Doc<User>>> {
  if (!manager.teamId) return [];
  return d.store.query<User>({
    collection: 'users',
    where: [
      ['teamId', '==', manager.teamId],
      ['role', '==', 'marketer'],
    ],
  });
}

export async function assertTeamMember(
  d: Deps,
  manager: Doc<User>,
  userId: string,
): Promise<Doc<User>> {
  const u = await d.store.get<User>(`users/${userId}`);
  // Admins may inspect anyone; managers only their own team. Same 403 for "not found" to avoid probing.
  if (!u) throw new ApiError(manager.role === 'manager' ? 'FORBIDDEN' : 'NOT_FOUND');
  if (manager.role === 'manager' && (!manager.teamId || u.teamId !== manager.teamId))
    throw new ApiError('FORBIDDEN', 'این کاربر عضو تیم شما نیست.');
  return u;
}

export async function managerDashboard(d: Deps, manager: Doc<User>) {
  const team = manager.teamId ? await d.store.get<Team>(`teams/${manager.teamId}`) : null;
  const members = await loadMembers(
    d,
    (await teamMembers(d, manager)).filter((u) => u.status === 'active'),
  );
  const pendingRetakes = manager.teamId
    ? await d.store.query<RetakeRequest>({
        collection: 'retake_requests',
        where: [
          ['teamId', '==', manager.teamId],
          ['status', '==', 'pending'],
        ],
      })
    : [];
  await track(d, 'manager_dashboard_viewed', manager.id);
  return {
    team: team ? { id: team.id, name: team.name } : null,
    ...summarize(members, d.clock()),
    pendingRetakes: pendingRetakes.length,
  };
}

export const reportQuery = z.object({
  from: z.string().max(40).optional(),
  to: z.string().max(40).optional(),
  brand: z.string().max(80).optional(),
  product: z.string().max(80).optional(),
  user: z.string().max(80).optional(),
  team: z.string().max(80).optional(),
  status: z.enum(['new', 'in_progress', 'completed', 'overdue']).optional(),
  city: z.string().max(80).optional(),
  province: z.string().max(80).optional(),
});

const REPORT_TZ = 'Asia/Tehran';

/**
 * Report date bounds. A plain `YYYY-MM-DD` is a calendar day in Tehran (what the Jalali picker
 * shows), not a UTC day; anything else is parsed as a full timestamp.
 */
export function reportBound(v: string, edge: 'start' | 'end'): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return Date.parse(v);
  const utc = Date.parse(`${v}T00:00:00Z`);
  if (Number.isNaN(utc)) return utc;
  const start = utc - zonedOffsetMs(new Date(utc), REPORT_TZ);
  return edge === 'start' ? start : start + DAY - 1;
}

export function completionRows(
  members: MemberLearning[],
  f: z.infer<typeof reportQuery>,
  now: Date,
) {
  const from = f.from ? reportBound(f.from, 'start') : null;
  const to = f.to ? reportBound(f.to, 'end') : null;
  if (
    (from !== null && Number.isNaN(from)) ||
    (to !== null && Number.isNaN(to)) ||
    (from !== null && to !== null && from > to)
  )
    throw new ApiError('VALIDATION', 'بازه تاریخ معتبر نیست.');
  const rows = [];
  for (const m of members) {
    if (f.user && m.user.id !== f.user) continue;
    if (f.city && m.user.city !== f.city) continue;
    if (f.province && m.user.province !== f.province) continue;
    for (const p of m.packages) {
      if (f.brand && p.brand?.id !== f.brand) continue;
      if (f.product && p.product?.id !== f.product) continue;
      if (f.status === 'overdue' ? !p.overdue : f.status && p.status !== f.status) continue;
      // Date range filters on the package deadline.
      if (from && (!p.deadlineAt || Date.parse(p.deadlineAt) < from)) continue;
      if (to && (!p.deadlineAt || Date.parse(p.deadlineAt) > to)) continue;
      const stuck = p.sections.find((s) => s.state !== 'completed');
      rows.push({
        userId: m.user.id,
        userName: m.user.name,
        teamId: m.user.teamId,
        province: m.user.province,
        city: m.user.city,
        packageId: p.id,
        packageTitle: p.title,
        brandId: p.brand?.id ?? null,
        brandName: p.brand?.name ?? null,
        productId: p.product?.id ?? null,
        productName: p.product?.name ?? null,
        percent: p.percent,
        status: p.status,
        overdue: p.overdue,
        lagging: isLagging(p, now),
        deadlineAt: p.deadlineAt,
        completedAt: p.completedAt,
        onTime: p.onTime,
        lastActivityAt: p.lastActivityAt,
        stuckAt: stuck?.title ?? null,
      });
    }
  }
  return rows.sort((a, b) => Number(b.lagging) - Number(a.lagging) || a.percent - b.percent);
}

// ─── Quiz results report (per attempt + per learner/quiz) ────────────────────
export const quizReportQuery = reportQuery.omit({ status: true });

/** Correct / wrong / unanswered counts for a submitted attempt (derived from its snapshot). */
export function attemptTally(a: Pick<Attempt, 'snapshot' | 'answers'>) {
  const snapshot = a.snapshot ?? [];
  const answers = a.answers ?? {};
  const total = snapshot.length;
  const correct = snapshot.filter((s) => answers[s.questionId] === s.answerKey).length;
  const unanswered = snapshot.filter((s) => !answers[s.questionId]).length;
  return { total, correct, wrong: Math.max(0, total - correct - unanswered), unanswered };
}

export interface QuizAttemptRow {
  attemptId: string;
  userId: string;
  userName: string;
  teamId: string | null;
  province: string | null;
  city: string | null;
  packageId: string;
  packageTitle: string;
  brandName: string | null;
  productName: string | null;
  sectionId: string;
  sectionTitle: string;
  quizId: string;
  attemptNumber: number;
  total: number;
  correct: number;
  wrong: number;
  unanswered: number;
  score: number | null;
  passScore: number;
  passed: boolean | null;
  startedAt: string;
  submittedAt: string | null;
  durationSec: number | null;
}

export interface QuizSummaryRow {
  userId: string;
  userName: string;
  teamId: string | null;
  province: string | null;
  city: string | null;
  packageId: string;
  packageTitle: string;
  brandName: string | null;
  productName: string | null;
  sectionId: string;
  sectionTitle: string;
  quizId: string;
  attempts: number;
  passed: boolean;
  /** Number of the attempt that passed (null while not passed). */
  passedAtAttempt: number | null;
  firstScore: number | null;
  lastScore: number | null;
  bestScore: number | null;
  passScore: number;
  lastTotal: number;
  lastCorrect: number;
  lastWrong: number;
  totalCorrect: number;
  totalWrong: number;
  inProgress: boolean;
  lastSubmittedAt: string | null;
}

async function attemptsForUsers(d: Deps, users: Array<Doc<User>>): Promise<Array<Doc<Attempt>>> {
  if (users.length === 0) return [];
  const ids = new Set(users.map((u) => u.id));
  if (users.length <= 30) {
    const lists = await Promise.all(
      users.map((u) =>
        d.store.query<Attempt>({ collection: 'attempts', where: [['userId', '==', u.id]] }),
      ),
    );
    return lists.flat();
  }
  return (await d.store.query<Attempt>({ collection: 'attempts' })).filter((a) =>
    ids.has(a.userId),
  );
}

export function quizResultRows(
  members: MemberLearning[],
  attempts: Array<Doc<Attempt>>,
  f: z.infer<typeof quizReportQuery>,
) {
  const from = f.from ? reportBound(f.from, 'start') : null;
  const to = f.to ? reportBound(f.to, 'end') : null;
  if (
    (from !== null && Number.isNaN(from)) ||
    (to !== null && Number.isNaN(to)) ||
    (from !== null && to !== null && from > to)
  )
    throw new ApiError('VALIDATION', 'بازه تاریخ معتبر نیست.');

  const sections = new Map<
    string,
    {
      packageId: string;
      packageTitle: string;
      brandId: string | null;
      brandName: string | null;
      productId: string | null;
      productName: string | null;
      sectionTitle: string;
    }
  >();
  for (const m of members)
    for (const p of m.packages)
      for (const s of p.sections)
        if (!sections.has(s.id))
          sections.set(s.id, {
            packageId: p.id,
            packageTitle: p.title,
            brandId: p.brand?.id ?? null,
            brandName: p.brand?.name ?? null,
            productId: p.product?.id ?? null,
            productName: p.product?.name ?? null,
            sectionTitle: s.title,
          });
  const byUser = new Map(members.map((m) => [m.user.id, m.user]));

  const attemptRows: QuizAttemptRow[] = [];
  const inProgress = new Set<string>();
  const kept: Array<Doc<Attempt>> = [];
  for (const a of attempts) {
    const u = byUser.get(a.userId);
    if (!u) continue;
    if (f.user && u.id !== f.user) continue;
    if (f.city && u.city !== f.city) continue;
    if (f.province && u.province !== f.province) continue;
    const info = sections.get(a.sectionId);
    if (f.brand && info?.brandId !== f.brand) continue;
    if (f.product && info?.productId !== f.product) continue;
    if (a.status !== 'submitted') {
      inProgress.add(`${a.userId}|${a.quizId}`);
      continue;
    }
    const at = a.submittedAt ? Date.parse(a.submittedAt) : NaN;
    if (from !== null && !(at >= from)) continue;
    if (to !== null && !(at <= to)) continue;
    kept.push(a);
    const t = attemptTally(a);
    attemptRows.push({
      attemptId: a.id,
      userId: u.id,
      userName: u.name,
      teamId: u.teamId,
      province: u.province,
      city: u.city,
      packageId: a.packageId,
      packageTitle: info?.packageTitle ?? '—',
      brandName: info?.brandName ?? null,
      productName: info?.productName ?? null,
      sectionId: a.sectionId,
      sectionTitle: info?.sectionTitle ?? '—',
      quizId: a.quizId,
      attemptNumber: a.attemptNumber,
      ...t,
      score: a.score,
      passScore: a.passScore,
      passed: a.passed,
      startedAt: a.startedAt,
      submittedAt: a.submittedAt,
      durationSec:
        a.submittedAt && a.startedAt
          ? Math.max(0, Math.round((Date.parse(a.submittedAt) - Date.parse(a.startedAt)) / 1000))
          : null,
    });
  }
  attemptRows.sort(
    (x, y) =>
      Date.parse(y.submittedAt ?? '') - Date.parse(x.submittedAt ?? '') ||
      x.userName.localeCompare(y.userName, 'fa'),
  );

  const groups = new Map<string, QuizAttemptRow[]>();
  for (const r of attemptRows) {
    const k = `${r.userId}|${r.quizId}`;
    const g = groups.get(k);
    if (g) g.push(r);
    else groups.set(k, [r]);
  }
  const summary: QuizSummaryRow[] = [];
  for (const [k, g] of groups) {
    const ordered = [...g].sort((a, b) => a.attemptNumber - b.attemptNumber);
    const first = ordered[0];
    const last = ordered[ordered.length - 1];
    if (!first || !last) continue;
    const passedAt = ordered.find((r) => r.passed === true) ?? null;
    const scores = ordered.map((r) => r.score).filter((x): x is number => x !== null);
    summary.push({
      userId: first.userId,
      userName: first.userName,
      teamId: first.teamId,
      province: first.province,
      city: first.city,
      packageId: first.packageId,
      packageTitle: first.packageTitle,
      brandName: first.brandName,
      productName: first.productName,
      sectionId: first.sectionId,
      sectionTitle: first.sectionTitle,
      quizId: first.quizId,
      attempts: ordered.length,
      passed: passedAt !== null,
      passedAtAttempt: passedAt?.attemptNumber ?? null,
      firstScore: first.score,
      lastScore: last.score,
      bestScore: scores.length ? Math.max(...scores) : null,
      passScore: last.passScore,
      lastTotal: last.total,
      lastCorrect: last.correct,
      lastWrong: last.wrong,
      totalCorrect: ordered.reduce((n, r) => n + r.correct, 0),
      totalWrong: ordered.reduce((n, r) => n + r.wrong, 0),
      inProgress: inProgress.has(k),
      lastSubmittedAt: last.submittedAt,
    });
  }
  summary.sort(
    (a, b) =>
      Date.parse(b.lastSubmittedAt ?? '') - Date.parse(a.lastSubmittedAt ?? '') ||
      a.userName.localeCompare(b.userName, 'fa'),
  );
  return { attempts: attemptRows, summary };
}

export async function managerQuizReport(
  d: Deps,
  manager: Doc<User>,
  f: z.infer<typeof quizReportQuery>,
) {
  const users = await teamMembers(d, manager);
  const [members, attempts] = await Promise.all([loadMembers(d, users), attemptsForUsers(d, users)]);
  await track(d, 'manager_report_viewed', manager.id, { filters: Object.keys(f), kind: 'quizzes' });
  return {
    ...quizResultRows(members, attempts, f),
    members: members.map((m) => ({ id: m.user.id, name: m.user.name })),
  };
}

export async function adminQuizReport(d: Deps, f: z.infer<typeof quizReportQuery>) {
  const where: Array<[string, '==', unknown]> = [['role', '==', 'marketer']];
  if (f.team) where.push(['teamId', '==', f.team]);
  if (f.city) where.push(['city', '==', f.city]);
  if (f.province) where.push(['province', '==', f.province]);
  const users = await d.store.query<User>({ collection: 'users', where });
  const [members, attempts] = await Promise.all([loadMembers(d, users), attemptsForUsers(d, users)]);
  return quizResultRows(members, attempts, f);
}

export async function managerReport(d: Deps, manager: Doc<User>, f: z.infer<typeof reportQuery>) {
  const members = await loadMembers(d, await teamMembers(d, manager));
  await track(d, 'manager_report_viewed', manager.id, { filters: Object.keys(f) });
  return {
    rows: completionRows(members, f, d.clock()),
    members: members.map((m) => ({ id: m.user.id, name: m.user.name })),
  };
}

export async function userTimeline(d: Deps, viewer: Doc<User>, userId: string) {
  const u = await assertTeamMember(d, viewer, userId);
  const [{ packages }, attempts, messages] = await Promise.all([
    loadUserLearning(d, u),
    d.store.query<Attempt>({ collection: 'attempts', where: [['userId', '==', userId]] }),
    d.store.query<Message>({
      collection: 'messages',
      where: [['toUserId', '==', userId]],
      orderBy: [['createdAt', 'desc']],
      limit: 30,
    }),
  ]);
  if (viewer.role === 'manager')
    await track(d, 'manager_user_detail_viewed', viewer.id, { userId });
  return {
    user: publicUser(u),
    packages: packages.map((p) => ({
      ...p,
      sections: p.sections.map((s) => ({
        ...s,
        attempts: attempts
          .filter((a) => a.sectionId === s.id && a.status === 'submitted')
          .sort((a, b) => a.attemptNumber - b.attemptNumber)
          .map((a) => ({
            attemptNumber: a.attemptNumber,
            score: a.score,
            passed: a.passed,
            submittedAt: a.submittedAt,
            startedAt: a.startedAt,
            passScore: a.passScore,
            ...attemptTally(a),
          })),
      })),
    })),
    messages: messages.map((m) => ({
      id: m.id,
      type: m.type,
      body: m.body,
      packageId: m.packageId,
      readAt: m.readAt,
      createdAt: m.createdAt,
    })),
  };
}

export const messageSchema = z.object({
  body: z.string().trim().min(1, 'متن پیام را بنویسید.').max(1000, 'پیام حداکثر ۱۰۰۰ نویسه است.'),
  packageId: z.string().max(80).nullable().optional(),
});
export const noteSchema = z.object({
  body: z.string().trim().min(1, 'متن یادداشت را بنویسید.').max(1000),
  packageId: z.string().min(1, 'آموزش مربوط را انتخاب کنید.').max(80),
});

export async function sendMessage(
  d: Deps,
  manager: Doc<User>,
  userId: string,
  type: 'message' | 'note',
  input: { body: string; packageId?: string | null },
) {
  const u = await assertTeamMember(d, manager, userId);
  if (u.status !== 'active')
    throw new ApiError('CONFLICT', 'این کاربر غیرفعال است و پیام به او نمی‌رسد.');
  const id = d.store.newId();
  const msg: Message = {
    fromUserId: manager.id,
    toUserId: userId,
    type,
    packageId: input.packageId ?? null,
    body: input.body,
    readAt: null,
    createdAt: d.clock().toISOString(),
  };
  await d.store.set(`messages/${id}`, msg as unknown as Record<string, unknown>);
  await audit(
    d,
    { id: manager.id, role: manager.role },
    type === 'note' ? 'manager.note_added' : 'manager.message_sent',
    'messages',
    id,
    null,
    { toUserId: userId, packageId: msg.packageId },
  );
  await track(d, type === 'note' ? 'manager_note_added' : 'manager_message_sent', manager.id, {
    hasPackage: !!msg.packageId,
  });
  await notifyTemplate(
    d,
    [userId],
    'manager_message',
    { manager: manager.name, snippet: input.body.slice(0, 80) },
    {
      actionRef: msg.packageId ? `/packages/${msg.packageId}` : '/messages',
      priority: 'high',
    },
  );
  return { id, ...msg };
}

export async function myMessages(d: Deps, userId: string) {
  const list = await d.store.query<Message>({
    collection: 'messages',
    where: [['toUserId', '==', userId]],
    orderBy: [['createdAt', 'desc']],
    limit: 50,
  });
  const senders = await d.store.getMany<User>(
    [...new Set(list.map((m) => m.fromUserId))].map((id) => `users/${id}`),
  );
  const names = new Map(senders.filter((s): s is Doc<User> => !!s).map((s) => [s.id, s.name]));
  return list.map((m) => ({
    id: m.id,
    type: m.type,
    body: m.body,
    packageId: m.packageId,
    fromName: names.get(m.fromUserId) ?? 'مدیر',
    readAt: m.readAt,
    createdAt: m.createdAt,
  }));
}

export async function markMessageRead(d: Deps, userId: string, id: string) {
  const m = await d.store.get<Message>(`messages/${id}`);
  if (!m || m.toUserId !== userId) throw new ApiError('NOT_FOUND');
  if (!m.readAt) await d.store.update(`messages/${id}`, { readAt: d.clock().toISOString() });
  return { ok: true };
}

// ─── Retake review (idempotent; concurrent approvals safe) ──────────────────
export async function listRetakes(
  d: Deps,
  viewer: Doc<User>,
  status: 'pending' | 'approved' | 'rejected' = 'pending',
) {
  const where: Array<[string, '==', unknown]> = [['status', '==', status]];
  if (viewer.role === 'manager') {
    if (!viewer.teamId) return [];
    where.push(['teamId', '==', viewer.teamId]);
  }
  const list = await d.store.query<RetakeRequest>({ collection: 'retake_requests', where });
  const userDocs = (
    await d.store.getMany<User>([...new Set(list.map((r) => r.userId))].map((id) => `users/${id}`))
  ).filter((u): u is Doc<User> => !!u);
  const names = new Map(userDocs.map((u) => [u.id, u.name]));
  // Batched: one attempts query per distinct quiz and one getMany for packages (was 2 per request).
  const quizIds = [...new Set(list.map((r) => r.quizId))];
  const attemptsByQuiz = new Map<string, Doc<Attempt>[]>();
  for (const quizId of quizIds)
    attemptsByQuiz.set(
      quizId,
      await d.store.query<Attempt>({ collection: 'attempts', where: [['quizId', '==', quizId]] }),
    );
  type PkgLite = { title: string; sections: Array<{ id: string; title: string }> };
  const pkgDocs = await d.store.getMany<PkgLite>(
    [...new Set(list.map((r) => r.packageId))].map((id) => `packages/${id}`),
  );
  const pkgById = new Map(pkgDocs.filter((p): p is Doc<PkgLite> => !!p).map((p) => [p.id, p]));
  const out = [];
  for (const r of list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))) {
    const attempts = (attemptsByQuiz.get(r.quizId) ?? []).filter((a) => a.userId === r.userId);
    const pkg = pkgById.get(r.packageId);
    const requester = userDocs.find((u) => u.id === r.userId);
    out.push({
      ...r,
      userName: names.get(r.userId) ?? '—',
      userProvince: requester?.province ?? null,
      userCity: requester?.city ?? null,
      packageTitle: pkg?.title ?? '',
      sectionTitle: pkg?.sections.find((s) => s.id === r.sectionId)?.title ?? '',
      scores: attempts
        .filter((a) => a.status === 'submitted')
        .sort((a, b) => a.attemptNumber - b.attemptNumber)
        .map((a) => a.score),
    });
  }
  return out;
}

export async function reviewRetake(
  d: Deps,
  reviewer: Doc<User>,
  id: string,
  decision: 'approved' | 'rejected',
  note: string | null,
) {
  const path = `retake_requests/${id}`;
  const result = await d.store.runTransaction(async (tx) => {
    const r = await tx.get<RetakeRequest>(path);
    if (!r) throw new ApiError('NOT_FOUND', 'درخواست پیدا نشد.');
    if (reviewer.role === 'manager' && (!reviewer.teamId || r.teamId !== reviewer.teamId))
      throw new ApiError('FORBIDDEN', 'این درخواست مربوط به تیم شما نیست.');
    if (reviewer.role === 'manager' && r.escalated && r.status === 'pending')
      throw new ApiError('FORBIDDEN', 'این درخواست به مدیر سیستم ارجاع شده است.');
    if (r.status !== 'pending') {
      if (r.status === decision) return { r, changed: false };
      throw new ApiError('CONFLICT', 'این درخواست قبلاً بررسی شده است.');
    }
    tx.update(path, {
      status: decision,
      reviewedBy: reviewer.id,
      reviewNote: note,
      reviewedAt: d.clock().toISOString(),
    });
    return { r: { ...r, status: decision }, changed: true };
  });
  if (result.changed) {
    const actor: Actor = { id: reviewer.id, role: reviewer.role };
    await audit(
      d,
      actor,
      `retake.${decision}`,
      'retake_requests',
      id,
      { status: 'pending' },
      { status: decision, note },
    );
    await track(d, decision === 'approved' ? 'retake_approved' : 'retake_rejected', reviewer.id, {
      quizId: result.r.quizId,
    });
    const pkg = await d.store.get<{ title: string }>(`packages/${result.r.packageId}`);
    await notifyTemplate(
      d,
      [result.r.userId],
      'retake_reviewed',
      { title: pkg?.title ?? '', result: decision === 'approved' ? 'تأیید' : 'رد' },
      { actionRef: `/sections/${result.r.sectionId}` },
    );
  }
  return { id, status: decision };
}

// ─── Admin reports (§25.3) ──────────────────────────────────────────────────
export async function adminCompletion(d: Deps, f: z.infer<typeof reportQuery>) {
  const where: Array<[string, '==', unknown]> = [['role', '==', 'marketer']];
  if (f.team) where.push(['teamId', '==', f.team]);
  if (f.city) where.push(['city', '==', f.city]);
  if (f.province) where.push(['province', '==', f.province]);
  const users = await d.store.query<User>({ collection: 'users', where });
  const members = await loadMembers(d, users);
  return { rows: completionRows(members, f, d.clock()), ...summarize(members, d.clock()) };
}

export async function adminKpis(d: Deps) {
  const now = d.clock();
  const since30 = new Date(now.getTime() - 30 * DAY).toISOString();
  const since7 = new Date(now.getTime() - 7 * DAY).toISOString();
  const [users, events, completions, firstAttempts] = await Promise.all([
    d.store.query<User>({ collection: 'users', where: [['role', '==', 'marketer']] }),
    d.store.query<{ name: string; userId: string | null; ts: string }>({
      collection: 'analytics_events',
      where: [['ts', '>=', since30]],
    }),
    d.store.query<{ userId: string; completedAt: string; onTime: boolean; delayHours: number }>({
      collection: 'package_completions',
    }),
    d.store.query<Attempt>({
      collection: 'attempts',
      where: [
        ['attemptNumber', '==', 1],
        ['status', '==', 'submitted'],
      ],
    }),
  ]);
  const played = events.filter(
    (e) => e.name === 'section_played' || e.name === 'playback_heartbeat',
  );
  const mau = new Set(played.map((e) => e.userId)).size;
  const wau = new Set(played.filter((e) => e.ts >= since7).map((e) => e.userId)).size;
  const firstCompletion = new Map<string, string>();
  for (const c of completions)
    if (!firstCompletion.has(c.userId) || (firstCompletion.get(c.userId) ?? '') > c.completedAt)
      firstCompletion.set(c.userId, c.completedAt);
  const activated = users.filter((u) => {
    const fc = firstCompletion.get(u.id);
    return fc && Date.parse(fc) - Date.parse(u.createdAt) <= 7 * DAY;
  }).length;
  const late = completions.filter((c) => !c.onTime);
  const nudges = events.filter((e) => e.name === 'mentor_nudge_created').length;
  const reengaged = events.filter((e) => e.name === 'reengaged_after_nudge').length;
  return {
    marketers: users.length,
    activeMarketers: users.filter((u) => u.status === 'active').length,
    activationRate: users.length ? Math.round((activated / users.length) * 100) : 0,
    wau,
    mau,
    wauMau: mau ? Math.round((wau / mau) * 100) : 0,
    onTimeCompletionRate: completions.length
      ? Math.round((completions.filter((c) => c.onTime).length / completions.length) * 100)
      : 0,
    firstPassRate: firstAttempts.length
      ? Math.round((firstAttempts.filter((a) => a.passed).length / firstAttempts.length) * 100)
      : 0,
    avgDelayHours: late.length
      ? Math.round(late.reduce((a, c) => a + c.delayHours, 0) / late.length)
      : 0,
    completions: completions.length,
    nudgeReengagementRate: nudges ? Math.round((reengaged / nudges) * 100) : 0,
  };
}

export async function adminDashboard(d: Deps) {
  const [kpis, packages, pendingRetakes] = await Promise.all([
    adminKpis(d),
    d.store.query<{ status: string; brandId: string | null }>({ collection: 'packages' }),
    d.store.query<RetakeRequest>({
      collection: 'retake_requests',
      where: [['status', '==', 'pending']],
    }),
  ]);
  return {
    kpis,
    content: {
      published: packages.filter((p) => p.status === 'published').length,
      drafts: packages.filter((p) => p.status === 'draft').length,
      unassigned: packages.filter((p) => p.status !== 'archived' && !p.brandId).length,
      archived: packages.filter((p) => p.status === 'archived').length,
    },
    pendingRetakes: pendingRetakes.length,
  };
}

/** Accepts only a real timestamp; anything else is a 400 instead of a 500 from `toISOString()`. */
const auditDate = z
  .string()
  .max(40)
  .optional()
  .refine((v) => v === undefined || !Number.isNaN(Date.parse(v)), 'تاریخ نامعتبر است.');

export const auditQuery = z.object({
  actor: z.string().max(80).optional(),
  action: z.string().max(80).optional(),
  entity: z.string().max(60).optional(),
  from: auditDate,
  to: auditDate,
});

export async function listAudit(d: Deps, f: z.infer<typeof auditQuery>) {
  const where: Array<[string, '==' | '>=' | '<=', unknown]> = [];
  if (f.actor) where.push(['actorId', '==', f.actor]);
  if (f.action) where.push(['action', '==', f.action]);
  if (f.entity) where.push(['entity', '==', f.entity]);
  if (f.from) where.push(['createdAt', '>=', new Date(f.from).toISOString()]);
  if (f.to) where.push(['createdAt', '<=', new Date(f.to).toISOString()]);
  const list = await d.store.query<Record<string, unknown> & { createdAt: string }>({
    collection: 'audit_logs',
    where,
    orderBy: [['createdAt', 'desc']],
    limit: 200,
  });
  return list.map(({ expireAt: _e, ...rest }) => rest);
}
