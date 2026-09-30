import type { Deps } from '../services/context';
import type { User } from '../domain/types';
import { recordProgress } from '../services/learning';
import { ensureUser } from '../services/users';
import type { Doc } from '../store/types';

/**
 * Demo users/teams for dev + E2E only (never run on prod unless `--demo`).
 * Credentials are documented in README (dev only).
 */
export const DEMO_PASSWORD = 'demo1234';
export const DEMO_USERS = [
  {
    key: 'superadmin',
    role: 'superadmin' as const,
    name: 'مدیر ارشد سیستم',
    phone: '09120000001',
    team: null,
  },
  { key: 'admin', role: 'admin' as const, name: 'ادمین محتوا', phone: '09120000002', team: null },
  {
    key: 'manager',
    role: 'manager' as const,
    name: 'رضا مدیر فروش',
    phone: '09120000003',
    team: 'team-tehran',
  },
  {
    key: 'marketer',
    role: 'marketer' as const,
    name: 'سارا احمدی',
    phone: '09120000004',
    team: 'team-tehran',
  },
  {
    key: 'marketer2',
    role: 'marketer' as const,
    name: 'علی رضایی',
    phone: '09120000005',
    team: 'team-tehran',
  },
  {
    key: 'manager2',
    role: 'manager' as const,
    name: 'نرگس مدیر فروش',
    phone: '09120000006',
    team: 'team-isfahan',
  },
  {
    key: 'marketer3',
    role: 'marketer' as const,
    name: 'مریم کریمی',
    phone: '09120000007',
    team: 'team-isfahan',
  },
];

export async function seedDemo(d: Deps) {
  const iso = d.clock().toISOString();
  for (const [id, name] of [
    ['team-tehran', 'تیم فروش تهران'],
    ['team-isfahan', 'تیم فروش اصفهان'],
  ] as const) {
    if (!(await d.store.get(`teams/${id}`)))
      await d.store.set(`teams/${id}`, {
        name,
        managerId: null,
        archived: false,
        createdAt: iso,
        updatedAt: iso,
      });
  }
  const out: Array<{ role: string; name: string; phone: string; password: string }> = [];
  for (const u of DEMO_USERS) {
    const user = await ensureUser(d, {
      name: u.name,
      identifier: u.phone,
      password: DEMO_PASSWORD,
      role: u.role,
      teamId: u.team,
    });
    if (u.role === 'manager' && u.team)
      await d.store.update(`teams/${u.team}`, { managerId: user.id });
    out.push({ role: u.role, name: u.name, phone: u.phone, password: DEMO_PASSWORD });
    if (u.key === 'marketer2') await seedDemoProgress(d, user.id);
  }

  // Welcome / guidance messages from Manager Reza to Sara and Ali
  const managerReza = await d.store.query<User>({
    collection: 'users',
    where: [['phone', '==', '09120000003']],
  });
  const managerId = managerReza[0]?.id;
  const sara = await d.store.query<User>({
    collection: 'users',
    where: [['phone', '==', '09120000004']],
  });
  const ali = await d.store.query<User>({
    collection: 'users',
    where: [['phone', '==', '09120000005']],
  });
  if (managerId && sara[0]) {
    if (!(await d.store.get('messages/demo-msg-sara-1'))) {
      await d.store.set('messages/demo-msg-sara-1', {
        fromUserId: managerId,
        toUserId: sara[0].id,
        type: 'note',
        body: 'سارا جان، دوره‌های آموزشی جدید محصولات فورمی و آیس بابل منتشر شده است. لطفاً پیش از پایان مهلت ویدیوها را مشاهده کن و آزمون را بده.',
        packageId: 'seed-pkg-formi',
        readAt: null,
        createdAt: iso,
      });
    }
  }
  if (managerId && ali[0]) {
    if (!(await d.store.get('messages/demo-msg-ali-1'))) {
      await d.store.set('messages/demo-msg-ali-1', {
        fromUserId: managerId,
        toUserId: ali[0].id,
        type: 'note',
        body: 'علی عزیز، خسته نباشی. پیشرفت خوبی در بسته فورمی داشتی، آزمون را هم به زودی ثبت کن.',
        packageId: 'seed-pkg-formi',
        readAt: null,
        createdAt: iso,
      });
    }
  }

  return out;
}

/**
 * A little real progress for «علی رضایی» so the manager dashboard/report show data on a
 * fresh seed. Goes through the same heartbeat service as the app (idempotent keys), so
 * re-running the seed never double-counts.
 */
async function seedDemoProgress(d: Deps, userId: string) {
  const user = await d.store.get<User>(`users/${userId}`);
  if (!user) return;
  const doc = user as Doc<User>;
  for (let i = 0; i < 3; i++) {
    try {
      await recordProgress(
        d,
        doc,
        'seed-pkg-formi-s1',
        { positionSec: (i + 1) * 60, playedDeltaSec: 60, event: 'heartbeat' },
        `demo-seed-${userId}-${i}`,
        { skipBudget: true }, // trusted seed data, not a client
      );
    } catch {
      return; // package not assigned/published in this environment — skip quietly
    }
  }
}
