import { z } from 'zod';
import { ApiError } from '../http/errors';
import { ids, nationalCodeToAuthEmailFromDigest, phoneToAuthEmail } from '../lib/ids';
import type { Doc, Where } from '../store/types';
import type { ArchivedReport, Team, User } from '../domain/types';
import { audit, nowIso, track, type Actor, type Deps } from './context';
import { loadLearningForUsers } from './learning-state';
import { publicUser, staffAuthEmail } from './users';

/**
 * Admin archive (آرشیو): the place deleted users («لیست سیاه») and deleted reports wait.
 *
 *  • Deleting a user      → status `blacklisted` (can't sign in or register; data kept).
 *  • Restore from archive → status `active` again.
 *  • Delete from archive  → everything stored about the user is physically removed.
 *  • Deleting a report row (one marketer × one package) hides it from reports (kept in archive);
 *    deleting it from the archive removes its progress/attempt data.
 */

const PRIVILEGED = ['admin', 'superadmin'];

/** Collections whose documents carry the user's id in a `userId` field. */
const USER_ID_COLLECTIONS = [
  'attempts',
  'section_progress',
  'package_completions',
  'points_ledger',
  'user_badges',
  'device_tokens',
  'notifications',
  'retake_requests',
  'chat_messages',
  'mentor_nudges',
  'voice_sessions',
  'escalation_events',
  'behavior_interventions',
  'analytics_events',
  'archived_reports',
] as const;

/** Delete every document of `collection` matching `where`; returns how many were removed. */
async function deleteWhere(d: Deps, collection: string, where: Where[]): Promise<number> {
  const docs = await d.store.query<{ id?: string }>({ collection, where });
  await d.store.deleteMany(docs.map((x) => `${collection}/${x.id}`));
  return docs.length;
}

const reportDocId = (userId: string, packageId: string) => `${userId}_${packageId}`;

/** Keys («userId_packageId») of report rows hidden from reports (archived or purged). */
export async function archivedReportKeys(d: Deps): Promise<Set<string>> {
  const rows = await d.store.query<ArchivedReport>({ collection: 'archived_reports' });
  return new Set(rows.map((r) => reportDocId(r.userId, r.packageId)));
}

// ─── Users ──────────────────────────────────────────────────────────────────
function assertCanTouch(actor: Actor, target: Doc<User>, what: string) {
  if (actor.id === target.id)
    throw new ApiError('FORBIDDEN', `نمی‌توانید حساب خودتان را ${what} کنید.`);
  if (PRIVILEGED.includes(target.role) && actor.role !== 'superadmin')
    throw new ApiError('FORBIDDEN', 'فقط مدیر ارشد سیستم می‌تواند کاربران مدیریتی را حذف کند.');
}

/** «حذف کاربر»: block the number and move the account to the archive blacklist. */
export async function blacklistUser(d: Deps, actor: Actor, userId: string) {
  const target = await d.store.get<User>(`users/${userId}`);
  if (!target) throw new ApiError('NOT_FOUND', 'کاربر پیدا نشد.');
  if (target.status === 'blacklisted') return { user: publicUser(target), warnings: [] };
  assertCanTouch(actor, target, 'حذف');
  if (target.role === 'superadmin') {
    const supers = await d.store.query<User>({
      collection: 'users',
      where: [
        ['role', '==', 'superadmin'],
        ['status', '==', 'active'],
      ],
    });
    if (supers.filter((s) => s.id !== userId).length === 0)
      throw new ApiError('CONFLICT', 'این آخرین مدیر ارشد سیستم است و حذف نمی‌شود.');
  }
  const warnings: string[] = [];
  if (target.role === 'manager') {
    const managed = await d.store.query<Team>({
      collection: 'teams',
      where: [['managerId', '==', userId]],
    });
    for (const t of managed)
      await d.store.update(`teams/${t.id}`, { managerId: null, updatedAt: nowIso(d) });
    if (managed.length)
      warnings.push(
        `مدیریت تیم «${managed.map((t) => t.name).join('، ')}» از این کاربر گرفته شد؛ مدیر جدیدی انتخاب کنید.`,
      );
  }
  const now = nowIso(d);
  await d.store.update(`users/${userId}`, {
    status: 'blacklisted',
    blacklistedAt: now,
    blacklistedBy: actor.id,
    updatedAt: now,
  });
  await d.auth.setDisabled(userId, true);
  await d.auth.revoke(userId);
  // A deleted user must not receive pushes any more.
  await deleteWhere(d, 'device_tokens', [['userId', '==', userId]]);
  await audit(d, actor, 'user.blacklisted', 'users', userId, { status: target.status }, null);
  await track(d, 'admin_user_blacklisted', actor.id, {});
  const updated = await d.store.get<User>(`users/${userId}`);
  return { user: updated ? publicUser(updated) : null, warnings };
}

export async function listArchivedUsers(d: Deps) {
  const users = await d.store.query<User>({
    collection: 'users',
    where: [['status', '==', 'blacklisted']],
  });
  users.sort((a, b) => (b.blacklistedAt ?? '').localeCompare(a.blacklistedAt ?? ''));
  return users.map((u) => ({ ...publicUser(u), blacklistedAt: u.blacklistedAt ?? null }));
}

/** Admin gives the number permission again: the user is taken out of the archive. */
export async function restoreUser(d: Deps, actor: Actor, userId: string) {
  const target = await d.store.get<User>(`users/${userId}`);
  if (!target) throw new ApiError('NOT_FOUND', 'کاربر پیدا نشد.');
  if (target.status !== 'blacklisted')
    throw new ApiError('CONFLICT', 'این کاربر در لیست سیاه نیست.');
  await d.store.update(`users/${userId}`, {
    status: 'active',
    blacklistedAt: null,
    blacklistedBy: null,
    updatedAt: nowIso(d),
  });
  await d.auth.setDisabled(userId, false);
  await audit(d, actor, 'user.restored', 'users', userId, { status: 'blacklisted' }, null);
  await track(d, 'admin_user_restored', actor.id, {});
  const updated = await d.store.get<User>(`users/${userId}`);
  return { user: updated ? publicUser(updated) : null };
}

/**
 * Delete from the archive: physically remove the account and everything linked to it so it
 * doesn't take up database space. Afterwards the number is free and could sign up as a new user.
 */
export async function purgeUser(d: Deps, actor: Actor, userId: string) {
  const target = await d.store.get<User>(`users/${userId}`);
  if (!target) throw new ApiError('NOT_FOUND', 'کاربر پیدا نشد.');
  if (target.status !== 'blacklisted')
    throw new ApiError('CONFLICT', 'فقط کاربرانِ آرشیوشده را می‌توان برای همیشه حذف کرد.');
  assertCanTouch(actor, target, 'حذف');
  const removed: Record<string, number> = {};
  for (const col of USER_ID_COLLECTIONS)
    removed[col] = await deleteWhere(d, col, [['userId', '==', userId]]);
  removed.messages =
    (await deleteWhere(d, 'messages', [['fromUserId', '==', userId]])) +
    (await deleteWhere(d, 'messages', [['toUserId', '==', userId]]));
  removed.assignments = await deleteWhere(d, 'assignments', [
    ['type', '==', 'user'],
    ['targetId', '==', userId],
  ]);
  removed.audit_logs = await deleteWhere(d, 'audit_logs', [['entityId', '==', userId]]);
  removed._auth_refresh = await deleteWhere(d, '_auth_refresh', [['uid', '==', userId]]);
  await d.store.deleteMany([`mentor_memory/${userId}`]);
  // Sign-in bookkeeping + the unique identity reservation. Only the keyed digest of a national
  // code is kept on the user, so it can be removed here without storing the code itself.
  const authEmail = target.phone
    ? phoneToAuthEmail(target.phone)
    : target.nationalCodeHash
      ? nationalCodeToAuthEmailFromDigest(target.nationalCodeHash)
      : (target.email ?? staffAuthEmail(target.name));
  const keys = [`login_guards/${ids.hash(authEmail)}`];
  if (target.phone) keys.push(`unique_keys/${ids.uniqueKey('phone', target.phone)}`);
  if (target.email) keys.push(`unique_keys/${ids.uniqueKey('email', target.email)}`);
  if (target.nationalCodeHash)
    keys.push(`unique_keys/${ids.uniqueKey('nationalCode', target.nationalCodeHash)}`);
  await d.store.deleteMany(keys);
  await d.auth.deleteUser(userId);
  // The account document goes last: if anything above failed, the user is still in the archive.
  await d.store.deleteMany([`users/${userId}`]);
  // The audit entry holds only the id: no name, phone or other personal data.
  await audit(d, actor, 'user.purged', 'users', userId, null, null);
  await track(d, 'admin_user_purged', actor.id, {});
  return { purged: true, removed };
}

// ─── Reports ────────────────────────────────────────────────────────────────
export const reportRefSchema = z.object({
  userId: z.string().min(1).max(80),
  packageId: z.string().min(1).max(80),
});
export const archiveReportsSchema = z.object({
  items: z.array(reportRefSchema).min(1).max(200),
});

/** «حذف گزارش»: hide report rows from the reports and keep them in the archive. */
export async function archiveReports(
  d: Deps,
  actor: Actor,
  input: z.infer<typeof archiveReportsSchema>,
) {
  const now = nowIso(d);
  const userIds = [...new Set(input.items.map((i) => i.userId))];
  const found = await d.store.getMany<User>(userIds.map((u) => `users/${u}`));
  const users = found.filter((u): u is Doc<User> => !!u);
  const learning = await loadLearningForUsers(d, users);
  const byId = new Map(users.map((u) => [u.id, u]));
  const items: Array<{ path: string; data: ArchivedReport }> = [];
  for (const it of input.items) {
    const u = byId.get(it.userId);
    if (!u) continue;
    const p = learning.get(u.id)?.packages.find((x) => x.id === it.packageId);
    items.push({
      path: `archived_reports/${reportDocId(it.userId, it.packageId)}`,
      data: {
        userId: it.userId,
        packageId: it.packageId,
        userName: u.name,
        phone: u.phone,
        packageTitle: p?.title ?? '',
        brandName: p?.brand?.name ?? null,
        productName: p?.product?.name ?? null,
        percent: p?.percent ?? 0,
        status: p?.status ?? 'new',
        archivedAt: now,
        archivedBy: actor.id,
        purged: false,
      },
    });
  }
  const firstItem = items[0];
  if (!firstItem) throw new ApiError('NOT_FOUND', 'گزارشی برای حذف پیدا نشد.');
  await d.store.batchSet(items);
  await audit(d, actor, 'report.archived', 'reports', firstItem.data.userId, null, {
    count: items.length,
  });
  await track(d, 'admin_report_archived', actor.id, { count: items.length });
  return { archived: items.length };
}

export async function listArchivedReports(d: Deps) {
  const rows = await d.store.query<ArchivedReport>({ collection: 'archived_reports' });
  return rows
    .filter((r) => !r.purged)
    .sort((a, b) => b.archivedAt.localeCompare(a.archivedAt))
    .map((r) => ({
      userId: r.userId,
      packageId: r.packageId,
      userName: r.userName ?? '',
      phone: r.phone ?? null,
      packageTitle: r.packageTitle ?? '',
      brandName: r.brandName ?? null,
      productName: r.productName ?? null,
      percent: r.percent ?? 0,
      status: r.status ?? 'new',
      archivedAt: r.archivedAt,
    }));
}

export async function restoreReport(d: Deps, actor: Actor, input: z.infer<typeof reportRefSchema>) {
  const path = `archived_reports/${reportDocId(input.userId, input.packageId)}`;
  const row = await d.store.get<ArchivedReport>(path);
  if (!row || row.purged) throw new ApiError('NOT_FOUND', 'این گزارش در آرشیو نیست.');
  await d.store.deleteMany([path]);
  await audit(d, actor, 'report.restored', 'reports', input.userId, null, null);
  return { restored: true };
}

/**
 * Delete a report from the archive for good: its progress and quiz attempts are removed.
 * Only a bare id marker stays (no names) so the row does not come back in the reports.
 */
export async function purgeReport(d: Deps, actor: Actor, input: z.infer<typeof reportRefSchema>) {
  const { userId, packageId } = input;
  const path = `archived_reports/${reportDocId(userId, packageId)}`;
  const row = await d.store.get<ArchivedReport>(path);
  if (!row) throw new ApiError('NOT_FOUND', 'این گزارش در آرشیو نیست.');
  const both: Where[] = [
    ['userId', '==', userId],
    ['packageId', '==', packageId],
  ];
  const removed = {
    attempts: await deleteWhere(d, 'attempts', both),
    sectionProgress: await deleteWhere(d, 'section_progress', both),
    retakes: await deleteWhere(d, 'retake_requests', both),
    escalations: await deleteWhere(d, 'escalation_events', both),
  };
  await d.store.deleteMany([`package_completions/${reportDocId(userId, packageId)}`]);
  await d.store.set(path, {
    userId,
    packageId,
    archivedAt: nowIso(d),
    archivedBy: actor.id,
    purged: true,
  } satisfies ArchivedReport);
  await audit(d, actor, 'report.purged', 'reports', userId, null, null);
  await track(d, 'admin_report_purged', actor.id, {});
  return { purged: true, removed };
}

export async function archiveCounts(d: Deps) {
  const [users, reports] = await Promise.all([listArchivedUsers(d), listArchivedReports(d)]);
  return { users: users.length, reports: reports.length };
}
