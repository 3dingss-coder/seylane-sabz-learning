import { randomInt } from '../lib/crypto';
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

// ─── Validation (PROMPT 002) ────────────────────────────────────────────────
export const passwordSchema = z
  .string({ required_error: 'رمز عبور را وارد کنید.' })
  .min(8, 'رمز عبور باید حداقل ۸ نویسه باشد.')
  .max(128, 'رمز عبور خیلی طولانی است.')
  .refine(
    (p) => /[A-Za-z\u0600-\u06FF]/.test(p) && /\d|[۰-۹]/.test(p),
    'رمز عبور باید حداقل یک حرف و یک عدد داشته باشد.',
  );

const identifierSchema = z
  .string({ required_error: 'شماره موبایل یا ایمیل را وارد کنید.' })
  .trim()
  .min(3, 'شماره موبایل یا ایمیل را وارد کنید.')
  .max(120);

// ─── Residence («محل سکونت») ────────────────────────────────────────────────
/** The province/city pair is validated against the generated directory (domain/iranLocations). */
const provinceSchema = text(2, 40, 'استان').refine(
  (s) => canonicalProvince(s) !== null,
  'این استان در فهرست استان‌های ایران نیست.',
);
const citySchema = text(2, 60, 'شهر');

const residenceShape = {
  province: provinceSchema.optional(),
  city: citySchema.optional(),
};

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

export const registerSchema = z
  .object({
    name: text(2, 60, 'نام'),
    identifier: identifierSchema,
    password: passwordSchema,
    ...residenceShape,
  })
  .superRefine(checkResidence);
export const loginSchema = z.object({
  identifier: identifierSchema,
  password: z.string().min(1, 'رمز عبور را وارد کنید.').max(128),
});

/** Self sign-up by phone only (no password: marketers sign in with their number). */
export const phoneRegisterSchema = z
  .object({
    name: text(2, 60, 'نام'),
    phone: z.string().min(1, 'شماره موبایل را وارد کنید.').max(20),
    // Required here: every self sign-up tells us where the marketer sells (admin/manager panels).
    province: provinceSchema,
    city: citySchema,
  })
  .superRefine(checkResidence);
export const staffLoginSchema = z.object({
  username: z.string().trim().min(2).max(60),
  password: z.string().min(1).max(128),
  panel: z.enum(['admin', 'manager']),
});

/** Staff (admin/manager) usernames map to an internal, non-routable auth email. */
export function staffAuthEmail(username: string): string {
  const slug = username
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9._-]/g, '');
  return `${slug || 'staff'}@staff.seylane.local`;
}

export type Identifier =
  | { kind: 'phone'; phone: string; authEmail: string }
  | { kind: 'email'; email: string; authEmail: string };

/** Accepts mobile (Persian/Latin digits, +98) or email. */
export function parseIdentifier(raw: string): Identifier {
  const s = raw.trim();
  if (s.includes('@')) {
    const email = s.toLowerCase();
    if (!z.string().email().safeParse(email).success)
      throw new ApiError('VALIDATION', 'ایمیل واردشده درست نیست.');
    return { kind: 'email', email, authEmail: email };
  }
  const phone = normalizePhone(s);
  if (!phone) throw new ApiError('VALIDATION', 'شماره موبایل درست نیست. مثال: ۰۹۱۲۱۲۳۴۵۶۷');
  return { kind: 'phone', phone, authEmail: phoneToAuthEmail(phone) };
}

export function publicUser(u: Doc<User>) {
  return {
    id: u.id,
    name: u.name,
    phone: u.phone,
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

// ─── Register / Login ───────────────────────────────────────────────────────
/**
 * `team.member_joined` (prompt §8): one outbox row per manager of the team that gained a member, with
 * the joiner's name carried as `{memberName}` — in the event path `{name}` is resolved from the
 * *recipient*, so a manager would otherwise read their own name.
 *
 * `isListening` is checked before the query, so while no such rule is enabled this costs one read
 * cached for 30s and writes nothing (§4.9). The emit cannot throw, and a joiner who is themselves a
 * manager of that team is not told about themselves.
 */
async function announceTeamJoin(
  d: Deps,
  teamId: string,
  member: { id: string; name: string },
): Promise<void> {
  // Lazy, like the `notify` import below: `users.ts` is on the sign-up path and the automation stack is
  // only reached when someone actually enabled a rule.
  const { emitAutomationEventForUsers, isListening } = await import('./push-automation-events');
  if (!(await isListening(d, 'team.member_joined'))) return;
  const managers = await d.store.query<User>({
    collection: 'users',
    where: [
      ['teamId', '==', teamId],
      ['role', '==', 'manager'],
      ['status', '==', 'active'],
    ],
  });
  await emitAutomationEventForUsers(
    d,
    'team.member_joined',
    managers.map((m) => m.id).filter((id) => id !== member.id),
    { memberName: member.name },
    { dedupeKey: member.id },
  );
}

export async function register(
  d: Deps,
  input: z.infer<typeof registerSchema>,
  role: Role = 'marketer',
  extra: Partial<User> = {},
  opts: { passwordless?: boolean } = {},
) {
  const idf = parseIdentifier(input.identifier);
  const keyId = ids.uniqueKey(idf.kind, idf.kind === 'phone' ? idf.phone : idf.email);
  const now = nowIso(d);
  // Reserve the unique key first (handles concurrent sign-ups deterministically).
  try {
    await d.store.create(`unique_keys/${keyId}`, { kind: idf.kind, createdAt: now, uid: null });
  } catch (e) {
    if (e instanceof StoreConflictError) {
      throw new ApiError(
        'CONFLICT',
        idf.kind === 'phone'
          ? 'این شماره قبلاً ثبت شده است. وارد شوید.'
          : 'این ایمیل قبلاً ثبت شده است. وارد شوید.',
      );
    }
    throw e;
  }
  let uid: string;
  try {
    uid = await d.auth.createUser({
      email: idf.authEmail,
      password: input.password,
      displayName: input.name,
      passwordless: opts.passwordless,
    });
  } catch (e) {
    await d.store.delete(`unique_keys/${keyId}`);
    const code = (e as { code?: string }).code ?? '';
    if (code.includes('email-already-exists') || e instanceof StoreConflictError)
      throw new ApiError('CONFLICT', 'این حساب قبلاً ثبت شده است. وارد شوید.');
    throw e;
  }
  const user: User = {
    name: input.name,
    phone: idf.kind === 'phone' ? idf.phone : null,
    email: idf.kind === 'email' ? idf.email : null,
    ...residence(input),
    firebaseUid: uid,
    role,
    teamId: null,
    brandIds: [],
    status: 'active',
    pointsBalance: 0,
    onboardedAt: null,
    lastActiveAt: null,
    createdAt: now,
    updatedAt: now,
    ...extra,
  };
  await d.store.set(`users/${uid}`, user);
  await d.store.update(`unique_keys/${keyId}`, { uid });
  await d.auth.setClaims(uid, { role: user.role });
  await track(d, 'signup_completed', uid, { method: idf.kind });
  const created = { ...user, id: uid } as Doc<User>;
  // A self sign-up lands in the default sales team when it exists (routes/auth.ts), and that is a new
  // member for its managers — the same hook an admin's team move fires.
  if (created.teamId) await announceTeamJoin(d, created.teamId, { id: uid, name: user.name });
  return created;
}

async function loginGuard(d: Deps, key: string) {
  const g = await d.store.get<{ fails: number; lockedUntil: string | null }>(`login_guards/${key}`);
  if (g?.lockedUntil && g.lockedUntil > nowIso(d)) {
    throw new ApiError(
      'RATE_LIMIT',
      'به دلیل تلاش‌های ناموفق زیاد، ورود تا ۱۵ دقیقه بسته شد. بعداً دوباره تلاش کنید.',
    );
  }
  return g;
}

export async function login(d: Deps, input: z.infer<typeof loginSchema>) {
  let idf: Identifier;
  try {
    idf = parseIdentifier(input.identifier);
  } catch {
    throw new ApiError('UNAUTHENTICATED', 'رمز یا نام کاربری اشتباه است.');
  }
  const guardKey = ids.hash(idf.authEmail);
  const guard = await loginGuard(d, guardKey);
  const r = await d.auth.signIn(idf.authEmail, input.password);
  if (!r.ok) {
    if (r.reason === 'disabled') {
      await track(d, 'login_failed', null, { reason: 'disabled' });
      throw new ApiError('FORBIDDEN', 'حساب شما غیرفعال شده است. با مدیر خود تماس بگیرید.');
    }
    const fails = (guard?.fails ?? 0) + 1;
    const locked = fails >= 5;
    await d.store.set(`login_guards/${guardKey}`, {
      fails: locked ? 0 : fails,
      lockedUntil: locked ? new Date(d.clock().getTime() + 15 * 60_000).toISOString() : null,
    });
    await track(d, 'login_failed', null, { reason: r.reason });
    if (r.reason === 'locked' || locked)
      throw new ApiError(
        'RATE_LIMIT',
        'به دلیل تلاش‌های ناموفق زیاد، ورود تا ۱۵ دقیقه بسته شد. بعداً دوباره تلاش کنید.',
      );
    throw new ApiError('UNAUTHENTICATED', 'رمز یا نام کاربری اشتباه است.');
  }
  if (guard) await d.store.delete(`login_guards/${guardKey}`);
  const user = await d.store.get<User>(`users/${r.uid}`);
  if (!user) throw new ApiError('UNAUTHENTICATED', 'رمز یا نام کاربری اشتباه است.');
  if (user.status !== 'active')
    throw new ApiError('FORBIDDEN', 'حساب شما غیرفعال شده است. با مدیر خود تماس بگیرید.');
  await d.store.update(`users/${r.uid}`, { lastActiveAt: nowIso(d) });
  await track(d, 'login_success', r.uid, {});
  return { user: publicUser(user), ...r.tokens };
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

/** Always 202 (no account enumeration). Email → reset mail; phone → admins are notified (D35). */
export async function requestPasswordReset(d: Deps, identifier: string) {
  let idf: Identifier;
  try {
    idf = parseIdentifier(identifier);
  } catch {
    return;
  }
  const users = await d.store.query<User>({
    collection: 'users',
    where: [idf.kind === 'phone' ? ['phone', '==', idf.phone] : ['email', '==', idf.email]],
    limit: 1,
  });
  const user = users[0];
  if (!user || user.status !== 'active') return;
  if (idf.kind === 'email') {
    await d.auth.sendPasswordResetEmail(idf.email);
  } else {
    const { notifyUsers } = await import('./notify');
    const admins = await d.store.query<User>({
      collection: 'users',
      where: [
        ['role', 'in', ['admin', 'superadmin']],
        ['status', '==', 'active'],
      ],
    });
    await notifyUsers(
      d,
      admins.map((a) => a.id),
      'manual',
      {
        title: 'درخواست بازیابی رمز',
        body: `${user.name} درخواست بازیابی رمز عبور دارد. از بخش کاربران رمز موقت بسازید.`,
      },
      {
        actionRef: `/admin/users/${user.id}`,
        throttleKey: `pwreset_${user.id}`,
        throttleMs: 3600_000,
      },
    );
  }
  await track(d, 'password_reset_requested', null, { method: idf.kind });
}

// ─── Profile (Me) ───────────────────────────────────────────────────────────
export const patchMeSchema = z.object({ name: text(2, 60, 'نام') });
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: passwordSchema,
});

export async function updateMe(d: Deps, user: Doc<User>, input: z.infer<typeof patchMeSchema>) {
  await d.store.update(`users/${user.id}`, { name: input.name, updatedAt: nowIso(d) });
  return publicUser({ ...user, name: input.name });
}

export async function changePassword(
  d: Deps,
  user: Doc<User>,
  input: z.infer<typeof changePasswordSchema>,
) {
  const authEmail = user.email ?? (user.phone ? phoneToAuthEmail(user.phone) : '');
  const r = await d.auth.signIn(authEmail, input.currentPassword);
  if (!r.ok) throw new ApiError('VALIDATION', 'رمز فعلی اشتباه است.');
  await d.auth.setPassword(user.id, input.newPassword);
  await audit(d, { id: user.id, role: user.role }, 'user.password_changed', 'users', user.id);
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
  // Joining the team is the event, whoever moved the person in — including an admin-created account.
  if (patch.teamId && patch.teamId !== target.teamId)
    await announceTeamJoin(d, patch.teamId, { id: userId, name: patch.name ?? target.name });
  const updated = await d.store.get<User>(`users/${userId}`);
  return { user: updated ? publicUser(updated) : null, warnings };
}

function tempPassword(): string {
  const letters = 'abcdefghjkmnpqrstuvwxyz';
  let s = '';
  for (let i = 0; i < 6; i++) s += letters[randomInt(letters.length)];
  return `${s}${randomInt(1000, 9999)}`;
}

/** D35: phone users → temporary password shown once to the admin; email users → reset mail. */
export async function adminResetPassword(d: Deps, actor: Actor, userId: string) {
  const target = await d.store.get<User>(`users/${userId}`);
  if (!target) throw new ApiError('NOT_FOUND', 'کاربر پیدا نشد.');
  if (PRIVILEGED.includes(target.role) && actor.role !== 'superadmin')
    throw new ApiError(
      'FORBIDDEN',
      'برای بازنشانی رمز کاربر مدیریتی (admin/superadmin) وارد حساب مدیر ارشد سیستم شوید.',
    );
  await audit(d, actor, 'user.password_reset', 'users', userId);
  await track(d, 'admin_password_reset', actor.id, { method: target.email ? 'email' : 'temp' });
  if (target.email) {
    await d.auth.sendPasswordResetEmail(target.email);
    return { method: 'email' as const, temporaryPassword: null };
  }
  const pwd = tempPassword();
  await d.auth.setPassword(userId, pwd);
  await d.auth.revoke(userId);
  return { method: 'temporary' as const, temporaryPassword: pwd };
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

/** Used by seed/bootstrap: first superadmin (never via public API). */
export async function ensureUser(
  d: Deps,
  p: {
    name: string;
    identifier: string;
    password: string;
    role: Role;
    teamId?: string | null;
    brandIds?: string[];
    /** Optional residence for seeded/demo accounts (sign-up collects it from the form). */
    province?: string | null;
    city?: string | null;
  },
) {
  const idf = parseIdentifier(p.identifier);
  const existing = await d.store.query<User>({
    collection: 'users',
    where: [idf.kind === 'phone' ? ['phone', '==', idf.phone] : ['email', '==', idf.email]],
    limit: 1,
  });
  if (existing[0]) return existing[0];
  const u = await register(
    d,
    {
      name: p.name,
      identifier: p.identifier,
      password: p.password,
      province: p.province ?? undefined,
      city: p.city ?? undefined,
    },
    p.role,
    { teamId: p.teamId ?? null, brandIds: p.brandIds ?? [], onboardedAt: nowIso(d) },
  );
  await audit(d, SYSTEM, 'user.seeded', 'users', u.id, null, { role: p.role });
  return u;
}
