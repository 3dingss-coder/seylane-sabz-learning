import { z } from 'zod';
import { ApiError } from '../http/errors';
import { isoDate, text } from '../http/validate';
import { DAY, HOUR, endOfZonedDay } from '../lib/time';
import type { Doc } from '../store/types';
import type {
  Assignment,
  AssignmentType,
  Brand,
  LearningPath,
  Package,
  Team,
  User,
} from '../domain/types';
import { audit, getPolicy, nowIso, track, type Actor, type Deps } from './context';
import { assignmentApplies } from './learning-state';
import { notifyTemplate } from './notify';

export function formatFaDate(iso: string | null): string {
  if (!iso) return 'بدون مهلت';
  return new Intl.DateTimeFormat('fa-IR', {
    timeZone: 'Asia/Tehran',
    month: 'long',
    day: 'numeric',
  }).format(new Date(iso));
}

export const assignmentSchema = z
  .object({
    type: z.enum(['global', 'team', 'user', 'brand']),
    targetId: z.string().max(80).nullable().optional(),
    packageIds: z.array(z.string().max(80)).min(1, 'حداقل یک بسته انتخاب کنید.').max(100),
  })
  .refine((a) => a.type === 'global' || !!a.targetId, {
    message: 'مخاطب انتساب را انتخاب کنید.',
    path: ['targetId'],
  });

async function validateTarget(d: Deps, type: AssignmentType, targetId: string | null) {
  if (type === 'global') return;
  const col = type === 'team' ? 'teams' : type === 'user' ? 'users' : 'brands';
  const t = await d.store.get<Team | User | Brand>(`${col}/${targetId}`);
  if (!t) throw new ApiError('VALIDATION', 'مخاطب انتساب معتبر نیست.');
  if (type === 'user' && (t as User).status !== 'active')
    throw new ApiError('VALIDATION', 'کاربر انتخاب‌شده غیرفعال است.');
}

async function usersForAssignment(
  d: Deps,
  a: Pick<Assignment, 'type' | 'targetId' | 'revokedAt'>,
): Promise<Array<Doc<User>>> {
  const where: Array<[string, '==' | 'array-contains', unknown]> = [
    ['status', '==', 'active'],
    ['role', '==', 'marketer'],
  ];
  if (a.type === 'team') where.push(['teamId', '==', a.targetId]);
  if (a.type === 'brand') where.push(['brandIds', 'array-contains', a.targetId]);
  let users = await d.store.query<User>({ collection: 'users', where });
  if (a.type === 'user') users = users.filter((u) => u.id === a.targetId);
  return users.filter((u) => assignmentApplies(a, u));
}

export async function listAssignments(d: Deps, includeRevoked = false) {
  const list = await d.store.query<Assignment>({
    collection: 'assignments',
    where: includeRevoked ? [] : [['revokedAt', '==', null]],
  });
  return list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/** Idempotent create (same type/target/packages → existing). Returns warnings for past/short deadlines. */
export async function createAssignment(
  d: Deps,
  actor: Actor,
  input: z.infer<typeof assignmentSchema>,
  opts: { pathId?: string } = {},
) {
  const targetId = input.type === 'global' ? null : (input.targetId ?? null);
  await validateTarget(d, input.type, targetId);
  const pkgIds = [...new Set(input.packageIds)].sort();
  const pkgs = await d.store.getMany<Package>(pkgIds.map((id) => `packages/${id}`));
  if (pkgs.some((p) => !p)) throw new ApiError('VALIDATION', 'یکی از بسته‌ها پیدا نشد.');
  if (pkgs.some((p) => p?.status === 'archived'))
    throw new ApiError('VALIDATION', 'بسته بایگانی‌شده را نمی‌توان انتساب داد.');
  const existing = await d.store.query<Assignment>({
    collection: 'assignments',
    where: [
      ['type', '==', input.type],
      ['targetId', '==', targetId],
      ['revokedAt', '==', null],
    ],
  });
  // Path-managed assignments are never merged with manual ones (each path owns its own).
  const same = existing.find(
    (a) =>
      (a.pathId ?? null) === (opts.pathId ?? null) &&
      [...a.packageIds].sort().join(',') === pkgIds.join(','),
  );
  const now = d.clock();
  const warnings: string[] = [];
  for (const p of pkgs) {
    if (!p) continue;
    if (p.status === 'draft')
      warnings.push(`«${p.title}» هنوز منتشر نشده و پس از انتشار دیده می‌شود.`);
    if (p.deadlineAt && p.deadlineAt < now.toISOString())
      warnings.push(`مهلت «${p.title}» گذشته است.`);
    else if (p.deadlineAt && Date.parse(p.deadlineAt) - now.getTime() < 72 * HOUR)
      warnings.push(`مهلت «${p.title}» کمتر از ۷۲ ساعت دیگر است.`);
  }
  if (same) {
    const recipients = (await usersForAssignment(d, same)).length;
    return {
      assignment: same,
      created: false,
      warnings: recipients
        ? warnings
        : [...warnings, 'برای این مخاطب هیچ بازاریاب فعالی پیدا نشد؛ کسی آموزش را نمی‌بیند.'],
      notified: 0,
      recipients,
    };
  }
  const id = d.store.newId();
  const a: Assignment = {
    type: input.type,
    targetId,
    packageIds: pkgIds,
    createdBy: actor.id,
    createdAt: now.toISOString(),
    revokedAt: null,
    revokedBy: null,
    pathId: opts.pathId ?? null,
  };
  await d.store.set(`assignments/${id}`, a as unknown as Record<string, unknown>);
  await audit(d, actor, 'assignment.created', 'assignments', id, null, a);
  const users = await usersForAssignment(d, a);
  if (!users.length)
    warnings.push('برای این مخاطب هیچ بازاریاب فعالی پیدا نشد؛ کسی آموزش را نمی‌بیند.');
  let notified = 0;
  for (const p of pkgs) {
    if (!p || p.status !== 'published') continue;
    notified += await notifyTemplate(
      d,
      users.map((u) => u.id),
      'new_assignment',
      { title: p.title, deadline: formatFaDate(p.deadlineAt) },
      {
        actionRef: `/packages/${(p as Doc<Package>).id}`,
        priority: 'high',
        throttleKey: `assign_${(p as Doc<Package>).id}`,
        throttleMs: 3650 * DAY,
      },
    );
  }
  await track(d, 'admin_assignment_created', actor.id, { type: input.type, count: users.length });
  return { assignment: { id, ...a }, created: true, warnings, notified, recipients: users.length };
}

/** Revoke keeps progress; started users keep access (edge case). */
export async function revokeAssignment(d: Deps, actor: Actor, id: string) {
  const a = await d.store.get<Assignment>(`assignments/${id}`);
  if (!a) throw new ApiError('NOT_FOUND', 'انتساب پیدا نشد.');
  if (a.revokedAt) return a;
  const patch = { revokedAt: nowIso(d), revokedBy: actor.id };
  await d.store.update(`assignments/${id}`, patch);
  await audit(d, actor, 'assignment.revoked', 'assignments', id, a, patch);
  await track(d, 'admin_assignment_cancelled', actor.id, { type: a.type });
  return { ...a, ...patch, id };
}

/**
 * Publishing must make a package visible. If no active assignment covers the package yet, give it the
 * default audience (global = every active marketer). Packages already targeted at a team / user /
 * brand are left alone, so deliberately restricted audiences are never widened.
 */
export async function ensureDefaultAudience(d: Deps, actor: Actor, packageId: string) {
  const active = await d.store.query<Assignment>({
    collection: 'assignments',
    where: [['revokedAt', '==', null]],
  });
  if (active.some((a) => a.packageIds.includes(packageId))) return false;
  await createAssignment(d, actor, { type: 'global', targetId: null, packageIds: [packageId] });
  return true;
}

/** When a package is published: notify every marketer it is already assigned to. */
export async function notifyAssignedUsers(d: Deps, packageIds: string[]) {
  const assignments = await d.store.query<Assignment>({
    collection: 'assignments',
    where: [['revokedAt', '==', null]],
  });
  let notified = 0;
  let recipients = 0;
  for (const pid of packageIds) {
    const pkg = await d.store.get<Package>(`packages/${pid}`);
    if (!pkg || pkg.status !== 'published') continue;
    const userIds = new Set<string>();
    for (const a of assignments.filter((x) => x.packageIds.includes(pid)))
      for (const u of await usersForAssignment(d, a)) userIds.add(u.id);
    recipients += userIds.size;
    notified += await notifyTemplate(
      d,
      [...userIds],
      'new_assignment',
      { title: pkg.title, deadline: formatFaDate(pkg.deadlineAt) },
      {
        actionRef: `/packages/${pid}`,
        priority: 'high',
        throttleKey: `assign_${pid}`,
        throttleMs: 3650 * DAY,
      },
    );
  }
  return { notified, recipients };
}

// ─── Learning paths (F12.4) ────────────────────────────────────────────────
export const pathSchema = z.object({
  name: text(2, 80, 'نام مسیر'),
  description: z.string().trim().max(1000).optional().default(''),
  scope: z.enum(['global', 'team', 'user', 'brand']),
  targetId: z.string().max(80).nullable().optional(),
  startAt: isoDate('تاریخ شروع').nullable().optional(),
  items: z
    .array(
      z.object({
        packageId: z.string().max(80),
        deadlineOffsetDays: z
          .number()
          .int()
          .min(0, 'مهلت مرحله نمی‌تواند منفی باشد.')
          .max(365)
          .nullable()
          .optional(),
      }),
    )
    .min(1, 'حداقل یک آموزش برای مسیر انتخاب کنید.')
    .max(100),
});

export async function listPaths(d: Deps) {
  const list = await d.store.query<LearningPath>({
    collection: 'learning_paths',
    where: [['archived', '==', false]],
  });
  return list.sort((a, b) => a.name.localeCompare(b.name, 'fa'));
}

async function normalizePath(d: Deps, input: z.infer<typeof pathSchema>) {
  const targetId = input.scope === 'global' ? null : (input.targetId ?? null);
  if (input.scope !== 'global' && !targetId)
    throw new ApiError('VALIDATION', 'مخاطب مسیر را انتخاب کنید.');
  await validateTarget(d, input.scope, targetId);
  const pkgs = await d.store.getMany<Package>(input.items.map((i) => `packages/${i.packageId}`));
  if (pkgs.some((p) => !p)) throw new ApiError('VALIDATION', 'یکی از بسته‌های مسیر پیدا نشد.');
  // Checked here (before any write) so a saved path never ends up half-applied: createAssignment
  // below would reject the same thing after the path document was already updated.
  if (pkgs.some((p) => p?.status === 'archived'))
    throw new ApiError(
      'VALIDATION',
      'یکی از آموزش‌های مسیر بایگانی شده است؛ آن را از مسیر حذف کنید تا مسیر ذخیره شود.',
    );
  const seen = new Set<string>();
  for (const i of input.items) {
    if (seen.has(i.packageId)) throw new ApiError('VALIDATION', 'یک بسته دو بار در مسیر آمده است.');
    seen.add(i.packageId);
  }
  return {
    name: input.name,
    description: input.description ?? '',
    scope: input.scope,
    targetId,
    startAt: input.startAt ?? null,
    items: input.items.map((i, idx) => ({
      packageId: i.packageId,
      order: idx + 1,
      deadlineOffsetDays: i.deadlineOffsetDays ?? null,
    })),
  };
}

/**
 * A path is the one place an admin decides «who learns what, in which order, by when».
 * Saving it therefore also (1) assigns its packages to the path audience through a
 * path-owned assignment and (2) applies step deadlines when a start date is set.
 */
async function syncPath(d: Deps, actor: Actor, id: string, path: LearningPath) {
  const active = await d.store.query<Assignment>({
    collection: 'assignments',
    where: [
      ['pathId', '==', id],
      ['revokedAt', '==', null],
    ],
  });
  const pkgIds = path.items.map((i) => i.packageId);
  let notified = 0;
  let warnings: string[] = [];
  let recipients = 0;
  let keepId: string | null = null;
  if (!path.archived && pkgIds.length) {
    const r = await createAssignment(
      d,
      actor,
      { type: path.scope, targetId: path.targetId, packageIds: pkgIds },
      { pathId: id },
    );
    keepId = r.assignment.id;
    notified = r.notified;
    warnings = r.warnings;
    recipients = r.recipients;
  }
  for (const a of active) if (a.id !== keepId) await revokeAssignment(d, actor, a.id);
  let deadlinesUpdated = 0;
  if (!path.archived && path.startAt) {
    const r = await applyPathDeadlines(d, actor, id);
    deadlinesUpdated = r.updated.length;
    warnings = [...warnings, ...r.warnings];
  }
  return { notified, warnings, deadlinesUpdated, recipients };
}

export async function createPath(d: Deps, actor: Actor, input: z.infer<typeof pathSchema>) {
  const data = await normalizePath(d, input);
  const id = d.store.newId();
  const now = nowIso(d);
  const path: LearningPath = { ...data, archived: false, createdAt: now, updatedAt: now };
  await d.store.set(`learning_paths/${id}`, path as unknown as Record<string, unknown>);
  await audit(d, actor, 'path.created', 'learning_paths', id, null, path);
  await track(d, 'admin_path_created', actor.id, { items: path.items.length });
  return { id, ...path, ...(await syncPath(d, actor, id, path)) };
}

export async function updatePath(
  d: Deps,
  actor: Actor,
  id: string,
  input: z.infer<typeof pathSchema>,
) {
  const prev = await d.store.get<LearningPath>(`learning_paths/${id}`);
  if (!prev) throw new ApiError('NOT_FOUND', 'مسیر پیدا نشد.');
  const data = { ...(await normalizePath(d, input)), updatedAt: nowIso(d) };
  await d.store.update(`learning_paths/${id}`, data);
  await audit(d, actor, 'path.updated', 'learning_paths', id, prev, data);
  const next = { ...prev, ...data };
  return { ...next, id, ...(await syncPath(d, actor, id, next)) };
}

export async function archivePath(d: Deps, actor: Actor, id: string) {
  const prev = await d.store.get<LearningPath>(`learning_paths/${id}`);
  if (!prev) throw new ApiError('NOT_FOUND', 'مسیر پیدا نشد.');
  await d.store.update(`learning_paths/${id}`, { archived: true, updatedAt: nowIso(d) });
  await audit(d, actor, 'path.archived', 'learning_paths', id, prev, { archived: true });
  await syncPath(d, actor, id, { ...prev, archived: true });
}

/**
 * Applies step deadlines: package.deadlineAt = end (23:59) of the Tehran day that is
 * `deadlineOffsetDays` after the path start — so «روز ۳» really means "until the end of that day".
 * Keeps D16 (one deadline per package, the same for everyone) and reports what it did NOT apply,
 * so the admin is never left believing a deadline was changed when it wasn't.
 */
export async function applyPathDeadlines(d: Deps, actor: Actor, id: string) {
  const path = await d.store.get<LearningPath>(`learning_paths/${id}`);
  if (!path) throw new ApiError('NOT_FOUND', 'مسیر پیدا نشد.');
  if (!path.startAt)
    throw new ApiError('VALIDATION', 'برای محاسبه مهلت‌ها، تاریخ شروع مسیر را تعیین کنید.');
  const policy = await getPolicy(d);
  const now = d.clock();
  const updated: Array<{ packageId: string; deadlineAt: string }> = [];
  const skipped: Array<{ packageId: string; title: string; reason: 'past' | 'kept' }> = [];
  for (const it of path.items) {
    const title = (await d.store.get<Package>(`packages/${it.packageId}`))?.title ?? it.packageId;
    if (it.deadlineOffsetDays === null) {
      // No step deadline: whatever the package already has stays (a published package must keep one).
      skipped.push({ packageId: it.packageId, title, reason: 'kept' });
      continue;
    }
    const day = new Date(Date.parse(path.startAt) + it.deadlineOffsetDays * DAY);
    const deadlineAt = endOfZonedDay(day, policy.timezone).toISOString();
    if (deadlineAt <= now.toISOString()) {
      skipped.push({ packageId: it.packageId, title, reason: 'past' });
      continue;
    }
    await d.store.update(`packages/${it.packageId}`, { deadlineAt, updatedAt: nowIso(d) });
    updated.push({ packageId: it.packageId, deadlineAt });
  }
  const warnings = skipped
    .filter((s) => s.reason === 'past')
    .map((s) => `مهلت «${s.title}» در گذشته بود و تنظیم نشد؛ مهلت فعلی همان است.`);
  await audit(d, actor, 'path.deadlines_applied', 'learning_paths', id, null, {
    updated,
    skipped,
  });
  return { updated, skipped, warnings };
}
