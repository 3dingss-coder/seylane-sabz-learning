import { z } from 'zod';
import { ApiError } from '../http/errors';
import { text } from '../http/validate';
import { ids, normalizePhone, phoneToAuthEmail } from '../lib/ids';
import { StoreConflictError, type Doc } from '../store/types';
import {
  canonicalCity,
  canonicalProvince,
  isValidResidence,
  normalizeLocation,
} from '../domain/iranLocations';
import type { Role, Team, User } from '../domain/types';
import { audit, nowIso, SYSTEM, track, type Actor, type Deps } from './context';

// ─── Residence («محل سکونت») ────────────────────────────────────────────────
/** The province/city pair is validated against the generated directory (domain/iranLocations). */
const provinceSchema = text(2, 40, 'استان').refine(
  (s) => canonicalProvince(s) !== null,
  'این استان در فهرست استان‌های ایران نیست.',
);
const citySchema = text(2, 60, 'شهر');

/**
 * Both parts travel together and the city must belong to the province (sign-up + admin edit).
 * `null` clears the pair (only sent by the admin patch); absent fields are left untouched.
 */
function checkResidence(
  v: { province?: string | null | undefined; city?: string | null | undefined },
  ctx: z.RefinementCtx,
) {
  if (v.province === undefined && v.city === undefined) return;
  const province = v.province ?? '';
  const city = v.city ?? '';
  if (!province) {
    if (city)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['province'],
        message: 'استان را انتخاب کنید.',
      });
    return;
  }
  if (!city) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['city'], message: 'شهر را انتخاب کنید.' });
    return;
  }
  if (!isValidResidence(province, city)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['city'],
      message: `«${city}» در استان ${canonicalProvince(province) ?? province} نیست.`,
    });
  }
}

/** Residence as stored: canonical names, or nulls when the caller sent neither part. */
function residence(input: {
  province?: string | null | undefined;
  city?: string | null | undefined;
}) {
  return {
    province: input.province ? canonicalProvince(input.province) : null,
    city: input.province && input.city ? canonicalCity(input.province, input.city) : null,
  };
}

/** Public self-registration always creates a low-privilege marketer account. */
export const phoneRegisterSchema = z
  .object({
    name: text(2, 60, 'نام'),
    phone: z.string().trim().min(1, 'شماره موبایل را وارد کنید.').max(32),
    province: provinceSchema,
    city: citySchema,
  })
  .strict()
  .superRefine(checkResidence);

/**
 * Phone formats are normalized before any lookup or uniqueness key is computed. A phone number is
 * not proof of identity; this helper validates syntax only and never marks a number as verified.
 */
export function requirePhone(raw: string): string {
  const phone = normalizePhone(raw);
  if (!phone) throw new ApiError('VALIDATION', 'شماره موبایل درست نیست. مثال: ۰۹۱۲۱۲۳۴۵۶۷');
  return phone;
}

export function publicUser(u: Doc<User>) {
  return {
    id: u.id,
    name: u.name,
    phone: u.phone,
    phoneVerifiedAt: u.phoneVerifiedAt ?? null,
    email: u.email,
    province: u.province ?? null,
    city: u.city ?? null,
    role: u.role,
    teamId: u.teamId,
    brandIds: u.brandIds,
    status: u.status,
    pointsBalance: u.pointsBalance,
    onboardedAt: u.onboardedAt,
    lastActiveAt: u.lastActiveAt,
    createdAt: u.createdAt,
  };
}

// ─── Phone account creation / existing sessions ──────────────────────────────
const duplicatePhone = () => new ApiError('CONFLICT', 'ساخت حساب با این شماره ممکن نیست.');

type RegistrationExtra = Pick<Partial<User>, 'teamId' | 'brandIds' | 'onboardedAt' | 'status'>;

/**
 * Trusted service-level account creation. Public self-registration calls this with the fixed role
 * `marketer`; privileged roles are only supplied by seed/bootstrap code. No phone ownership is
 * inferred from normalization or uniqueness.
 */
export async function register(
  d: Deps,
  input: { name: string; phone: string; province?: string | null; city?: string | null },
  role: Role = 'marketer',
  extra: RegistrationExtra = {},
) {
  const phone = requirePhone(input.phone);
  // Detect legacy rows that predate the unique-key reservation. Limit 2 so duplicate legacy rows
  // are detected without selecting one or merging data from either account.
  const existing = await d.store.query<User>({
    collection: 'users',
    where: [['phone', '==', phone]],
    limit: 2,
  });
  if (existing.length) throw duplicatePhone();

  const keyId = ids.uniqueKey('phone', phone);
  const now = nowIso(d);
  try {
    // This D1-backed reservation is the cross-isolate uniqueness boundary for concurrent sign-ups.
    await d.store.create(`unique_keys/${keyId}`, { kind: 'phone', createdAt: now, uid: null });
  } catch (err) {
    if (err instanceof StoreConflictError) throw duplicatePhone();
    throw err;
  }

  let uid: string;
  try {
    uid = await d.auth.createUser({
      email: phoneToAuthEmail(phone),
      displayName: input.name,
    });
  } catch (err) {
    // A definite uniqueness conflict means createUser did not create an identity; release the
    // reservation. For timeouts/unknown outcomes keep it reserved: the D1 operation may commit late.
    if (err instanceof StoreConflictError) {
      try {
        await d.store.delete(`unique_keys/${keyId}`);
      } catch (cleanupError) {
        console.error('[auth] could not release definite phone reservation conflict', cleanupError);
      }
      throw duplicatePhone();
    }
    throw err;
  }

  const user: User = {
    name: input.name,
    phone,
    phoneVerifiedAt: null,
    email: null,
    ...residence(input),
    firebaseUid: uid,
    role,
    teamId: extra.teamId ?? null,
    brandIds: extra.brandIds ?? [],
    status: extra.status ?? 'active',
    pointsBalance: 0,
    onboardedAt: extra.onboardedAt ?? null,
    lastActiveAt: null,
    createdAt: now,
    updatedAt: now,
  };
  // Do not undo earlier writes after an ambiguous D1 timeout: a pending write may commit later.
  // The reserved unique key keeps subsequent public sign-ups fail-closed for this phone.
  await d.store.set(`users/${uid}`, user);
  await d.store.update(`unique_keys/${keyId}`, { uid });
  await d.auth.setClaims(uid, { role: user.role });
  try {
    await track(d, 'signup_requested', uid, { method: 'phone' });
  } catch (err) {
    // Analytics is not part of account/session creation; don't turn a completed signup into a
    // lost-session response just because its optional event write failed.
    console.warn(
      '[auth] signup analytics failed',
      err instanceof Error ? err.name : 'unknown error',
    );
  }
  return { ...user, id: uid } as Doc<User>;
}

export async function refresh(d: Deps, refreshToken: string) {
  const r = await d.auth.refresh(refreshToken);
  if (!r) throw new ApiError('UNAUTHENTICATED');
  const user = await d.store.get<User>(`users/${r.uid}`);
  if (!user || user.status !== 'active') throw new ApiError('UNAUTHENTICATED');
  return { user: publicUser(user), ...r.tokens };
}

export async function logout(d: Deps, userId: string) {
  await d.auth.revoke(userId);
}

// ─── Profile (Me) ───────────────────────────────────────────────────────────
export const patchMeSchema = z.object({ name: text(2, 60, 'نام') });

export async function updateMe(d: Deps, user: Doc<User>, input: z.infer<typeof patchMeSchema>) {
  await d.store.update(`users/${user.id}`, { name: input.name, updatedAt: nowIso(d) });
  return publicUser({ ...user, name: input.name });
}

export async function completeOnboarding(d: Deps, user: Doc<User>) {
  if (user.onboardedAt) return { onboardedAt: user.onboardedAt };
  const at = nowIso(d);
  await d.store.update(`users/${user.id}`, { onboardedAt: at });
  await track(d, 'onboarding_completed', user.id);
  return { onboardedAt: at };
}

// ─── Admin: users (PROMPT 007) ──────────────────────────────────────────────
export const adminUserQuery = z.object({
  q: z.string().max(80).optional(),
  role: z.enum(['marketer', 'manager', 'admin', 'superadmin']).optional(),
  teamId: z.string().max(80).optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

export async function listUsers(d: Deps, f: z.infer<typeof adminUserQuery>) {
  const where: Array<[string, '==', unknown]> = [];
  if (f.role) where.push(['role', '==', f.role]);
  if (f.teamId) where.push(['teamId', '==', f.teamId === 'none' ? null : f.teamId]);
  if (f.status) where.push(['status', '==', f.status]);
  let users = await d.store.query<User>({ collection: 'users', where });
  if (f.q) {
    const q = f.q.trim().toLowerCase();
    const phone = normalizePhone(q);
    // Province/city are searchable too: «مشهد» / «خراسان» finds every marketer of that region.
    const residenceQuery = normalizeLocation(q);
    users = users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        (u.email ?? '').includes(q) ||
        (u.phone ?? '').includes(phone ?? (q.replace(/\D/g, '') || '§')) ||
        (u.province !== null &&
          u.province !== undefined &&
          normalizeLocation(u.province).includes(residenceQuery)) ||
        (u.city !== null &&
          u.city !== undefined &&
          normalizeLocation(u.city).includes(residenceQuery)),
    );
  }
  users.sort((a, b) => a.name.localeCompare(b.name, 'fa'));
  return users.map(publicUser);
}

export const adminPatchUserSchema = z
  .object({
    name: text(2, 60, 'نام').optional(),
    role: z.enum(['marketer', 'manager', 'admin', 'superadmin']).optional(),
    teamId: z.string().max(80).nullable().optional(),
    status: z.enum(['active', 'inactive']).optional(),
    brandIds: z.array(z.string().max(80)).max(50).optional(),
    // Admins may correct the residence captured at sign-up (also for accounts that predate it).
    province: provinceSchema.nullable().optional(),
    city: citySchema.nullable().optional(),
  })
  .superRefine(checkResidence)
  .refine((v) => Object.keys(v).length > 0, 'هیچ تغییری ارسال نشده است.');

const PRIVILEGED: Role[] = ['admin', 'superadmin'];

export async function adminUpdateUser(
  d: Deps,
  actor: Actor,
  userId: string,
  patch: z.infer<typeof adminPatchUserSchema>,
) {
  const target = await d.store.get<User>(`users/${userId}`);
  if (!target) throw new ApiError('NOT_FOUND', 'کاربر پیدا نشد.');
  const selfEdit = actor.id === userId;
  if (selfEdit && (patch.role !== undefined || patch.status !== undefined)) {
    throw new ApiError('FORBIDDEN', 'نمی‌توانید نقش یا وضعیت حساب خودتان را تغییر دهید.');
  }
  const roleChanged = patch.role !== undefined && patch.role !== target.role;
  if (roleChanged || (patch.status !== undefined && PRIVILEGED.includes(target.role))) {
    // roles.manage — only superadmin may grant/revoke admin-level roles.
    const touchesPrivileged =
      PRIVILEGED.includes(target.role) ||
      (patch.role !== undefined && PRIVILEGED.includes(patch.role));
    if (touchesPrivileged && actor.role !== 'superadmin')
      throw new ApiError('FORBIDDEN', 'فقط مدیر ارشد سیستم می‌تواند نقش‌های مدیریتی را تغییر دهد.');
  }
  const losingSuper =
    target.role === 'superadmin' &&
    ((patch.role !== undefined && patch.role !== 'superadmin') || patch.status === 'inactive');
  if (losingSuper) {
    const supers = await d.store.query<User>({
      collection: 'users',
      where: [
        ['role', '==', 'superadmin'],
        ['status', '==', 'active'],
      ],
    });
    if (supers.filter((s) => s.id !== userId).length === 0)
      throw new ApiError(
        'CONFLICT',
        'این آخرین مدیر ارشد سیستم است و نمی‌توان نقش یا وضعیت آن را تغییر داد.',
      );
  }
  if (patch.teamId) {
    const team = await d.store.get<Team>(`teams/${patch.teamId}`);
    if (!team || team.archived) throw new ApiError('VALIDATION', 'تیم انتخاب‌شده معتبر نیست.');
  }
  if (patch.brandIds?.length) {
    const brands = await d.store.getMany(patch.brandIds.map((b) => `brands/${b}`));
    if (brands.some((b) => !b)) throw new ApiError('VALIDATION', 'برند انتخاب‌شده معتبر نیست.');
  }
  const warnings: string[] = [];
  // A user who stops being an active manager must not stay attached to a team: otherwise the team
  // keeps showing them as its manager (listTeams) and their panel keeps listing its members.
  const wasManager = target.role === 'manager';
  const stopsManaging =
    wasManager &&
    ((patch.role !== undefined && patch.role !== 'manager') || patch.status === 'inactive');
  const movedTeam = wasManager && patch.teamId !== undefined && patch.teamId !== target.teamId;
  if (stopsManaging || movedTeam) {
    const managed = await d.store.query<Team>({
      collection: 'teams',
      where: [['managerId', '==', userId]],
    });
    const toClear = stopsManaging ? managed : managed.filter((t) => t.id === target.teamId);
    for (const t of toClear)
      await d.store.update(`teams/${t.id}`, { managerId: null, updatedAt: nowIso(d) });
    if (toClear.length)
      warnings.push(
        `مدیریت تیم «${toClear.map((t) => t.name).join('، ')}» از این کاربر گرفته شد؛ در بخش تیم‌ها مدیر جدیدی انتخاب کنید.`,
      );
  }
  const update: Partial<User> = { ...patch, updatedAt: nowIso(d) } as Partial<User>;
  // Store the canonical spellings, not whatever the picker/search box sent.
  if (patch.province) Object.assign(update, residence(patch));
  await d.store.update(`users/${userId}`, update as Record<string, unknown>);
  if (roleChanged) await d.auth.setClaims(userId, { role: patch.role });
  if (roleChanged || patch.status === 'inactive') await d.auth.revoke(userId);
  if (patch.status !== undefined && patch.status !== target.status)
    await d.auth.setDisabled(userId, patch.status === 'inactive');
  const before = Object.fromEntries(
    Object.keys(patch).map((k) => [k, (target as unknown as Record<string, unknown>)[k]]),
  );
  await audit(
    d,
    actor,
    roleChanged ? 'user.role_changed' : 'user.updated',
    'users',
    userId,
    before,
    patch,
  );
  await track(d, 'admin_user_updated', actor.id, { fields: Object.keys(patch) });
  const updated = await d.store.get<User>(`users/${userId}`);
  return { user: updated ? publicUser(updated) : null, warnings };
}

// ─── Teams ─────────────────────────────────────────────────────────────────
export const teamSchema = z.object({
  name: text(2, 60, 'نام تیم'),
  managerId: z.string().max(80).nullable().optional(),
});

export async function listTeams(d: Deps) {
  const [teams, users] = await Promise.all([
    d.store.query<Team>({ collection: 'teams' }),
    d.store.query<User>({ collection: 'users', where: [['status', '==', 'active']] }),
  ]);
  return teams
    .filter((t) => !t.archived)
    .map((t) => ({
      id: t.id,
      name: t.name,
      managerId: t.managerId,
      managerName: users.find((u) => u.id === t.managerId)?.name ?? null,
      memberCount: users.filter((u) => u.teamId === t.id && u.role === 'marketer').length,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fa'));
}

async function assignManager(
  d: Deps,
  teamId: string,
  managerId: string | null | undefined,
): Promise<string[]> {
  if (!managerId) return [];
  const m = await d.store.get<User>(`users/${managerId}`);
  if (!m || m.role !== 'manager' || m.status !== 'active')
    throw new ApiError('VALIDATION', 'مدیر تیم باید کاربری فعال با نقش «مدیر فروش» باشد.');
  const warnings: string[] = [];
  // Moving a manager to another team frees the team they managed before — a team may not keep a
  // `managerId` that no longer belongs to it.
  if (m.teamId && m.teamId !== teamId) {
    const prev = await d.store.get<Team>(`teams/${m.teamId}`);
    if (prev && !prev.archived && prev.managerId === m.id) {
      await d.store.update(`teams/${m.teamId}`, { managerId: null, updatedAt: nowIso(d) });
      warnings.push(`تیم قبلی «${prev.name}» هم بدون مدیر ماند؛ برایش مدیر جدیدی انتخاب کنید.`);
    }
  }
  await d.store.update(`users/${managerId}`, { teamId, updatedAt: nowIso(d) });
  return warnings;
}

export async function createTeam(d: Deps, actor: Actor, input: z.infer<typeof teamSchema>) {
  const id = d.store.newId();
  const now = nowIso(d);
  const warnings = await assignManager(d, id, input.managerId);
  const team: Team = {
    name: input.name,
    managerId: input.managerId ?? null,
    archived: false,
    createdAt: now,
    updatedAt: now,
  };
  await d.store.set(`teams/${id}`, team);
  await audit(d, actor, 'team.created', 'teams', id, null, team);
  return { id, ...team, warnings };
}

export async function updateTeam(
  d: Deps,
  actor: Actor,
  teamId: string,
  input: Partial<z.infer<typeof teamSchema>> & { archived?: boolean },
) {
  const team = await d.store.get<Team>(`teams/${teamId}`);
  if (!team) throw new ApiError('NOT_FOUND', 'تیم پیدا نشد.');
  const managerChanged = input.managerId !== undefined && input.managerId !== team.managerId;
  const warnings = managerChanged ? await assignManager(d, teamId, input.managerId) : [];
  // The previous manager is detached from the team (also when the team is archived), so their panel
  // no longer shows a team the admin list has already hidden.
  if ((managerChanged || input.archived) && team.managerId) {
    await d.store.update(`users/${team.managerId}`, { teamId: null, updatedAt: nowIso(d) });
    warnings.push('مدیر قبلی از این تیم جدا شد.');
  }
  const patch = { ...input, updatedAt: nowIso(d) };
  await d.store.update(`teams/${teamId}`, patch);
  await audit(d, actor, 'team.updated', 'teams', teamId, team, patch);
  return { ...team, ...patch, id: teamId, warnings };
}

/** Trusted seed/bootstrap only: the phone is not verified and this never grants a session. */
export async function ensureUser(
  d: Deps,
  p: {
    name: string;
    phone: string;
    role: Role;
    teamId?: string | null;
    brandIds?: string[];
    province?: string | null;
    city?: string | null;
  },
) {
  const phone = requirePhone(p.phone);
  const existing = await d.store.query<User>({
    collection: 'users',
    where: [['phone', '==', phone]],
    limit: 2,
  });
  if (existing.length > 1) {
    // Do not choose a canonical account or merge a pre-existing duplicate pair automatically.
    throw new ApiError('CONFLICT', 'برای این شماره چند حساب وجود دارد؛ بررسی دستی لازم است.');
  }
  if (existing[0]) return existing[0];
  const u = await register(
    d,
    {
      name: p.name,
      phone,
      province: p.province ?? undefined,
      city: p.city ?? undefined,
    },
    p.role,
    { teamId: p.teamId ?? null, brandIds: p.brandIds ?? [], onboardedAt: nowIso(d) },
  );
  await audit(d, SYSTEM, 'user.seeded', 'users', u.id, null, { role: p.role });
  return u;
}
