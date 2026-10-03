import { beforeAll, describe, expect, it } from 'vitest';
import type { Assignment, Package, User } from '../src/domain/types';
import { runDeadlineSweep } from '../src/services/jobs';
import { effectiveDeadlineAt, loadUserLearning } from '../src/services/learning-state';
import type { Doc } from '../src/store/types';
import { createCtx, type TestCtx } from './support/ctx';

const H = 3600_000;

describe('effectiveDeadlineAt (pure)', () => {
  const base = { deadlineAt: '2026-01-01T00:00:00.000Z', publishedAt: '2026-06-01T00:00:00.000Z' };
  it('without a personal window the fixed date applies to everyone', () => {
    expect(
      effectiveDeadlineAt({ ...base, deadlineHours: null }, { createdAt: '2026-07-01T00:00:00Z' }),
    ).toBe(base.deadlineAt);
  });
  it('counts the window from registration', () => {
    expect(
      effectiveDeadlineAt(
        { ...base, deadlineHours: 24 },
        { createdAt: '2026-07-01T10:00:00.000Z' },
      ),
    ).toBe('2026-07-02T10:00:00.000Z');
  });
  it('counts from publish time when the package came after the marketer registered', () => {
    expect(
      effectiveDeadlineAt(
        { ...base, deadlineHours: 24 },
        { createdAt: '2026-03-01T00:00:00.000Z' },
      ),
    ).toBe('2026-06-02T00:00:00.000Z');
  });
});

describe('personal learning window per marketer', () => {
  let ctx: TestCtx;
  let a: { id: string; token: string };
  let b: { id: string; token: string };
  let t0: number;
  let pkgId: string;

  const doc = async (id: string) => {
    const u = await ctx.deps.store.get<User>(`users/${id}`);
    return { ...(u as User), id } as Doc<User>;
  };
  const types = async (userId: string) =>
    (
      await ctx.deps.store.query<{ type: string; userId: string }>({
        collection: 'notifications',
        where: [['userId', '==', userId]],
      })
    ).map((n) => n.type);

  beforeAll(async () => {
    ctx = await createCtx();
    t0 = ctx.now.value.getTime();
    a = await ctx.user('marketer'); // registers at t0
    ctx.advance(30 * H);
    b = await ctx.user('marketer'); // registers 30h later
    pkgId = 'pkg-personal';
    const published = new Date(t0 - 10 * 24 * H).toISOString();
    const pkg: Package = {
      productId: null,
      brandId: null,
      title: 'برند دارت',
      description: '',
      status: 'published',
      // Old shared date, long past: must NOT be what marketers see.
      deadlineAt: new Date(t0 - 24 * H).toISOString(),
      deadlineHours: 24,
      estimatedMinutes: 0,
      coverUrl: null,
      sections: [],
      createdBy: 'test',
      publishedAt: published,
      seedTag: null,
      createdAt: published,
      updatedAt: published,
    };
    await ctx.deps.store.set(`packages/${pkgId}`, pkg as unknown as Record<string, unknown>);
    const asg: Assignment = {
      type: 'global',
      targetId: null,
      packageIds: [pkgId],
      createdBy: 'test',
      createdAt: published,
      revokedAt: null,
      revokedBy: null,
      pathId: null,
    };
    await ctx.deps.store.set('assignments/asg-personal', asg as unknown as Record<string, unknown>);
  });

  it('each marketer gets their own deadline from their own registration time', async () => {
    const ua = await doc(a.id);
    const ub = await doc(b.id);
    const va = (await loadUserLearning(ctx.deps, ua)).packages.find((p) => p.id === pkgId);
    const vb = (await loadUserLearning(ctx.deps, ub)).packages.find((p) => p.id === pkgId);
    expect(va?.deadlineAt).toBe(new Date(Date.parse(ua.createdAt) + 24 * H).toISOString());
    expect(vb?.deadlineAt).toBe(new Date(Date.parse(ub.createdAt) + 24 * H).toISOString());
    expect(va?.deadlineAt).not.toBe(vb?.deadlineAt);
    expect(va?.overdue).toBe(true); // registered 30h ago, window was 24h
    expect(vb?.overdue).toBe(false); // just registered: a full 24h left
  });

  it('notifies only the marketer whose own window passed, and warns the other near the end', async () => {
    await runDeadlineSweep(ctx.deps);
    expect(await types(a.id)).toContain('deadline_passed');
    expect(await types(b.id)).not.toContain('deadline_passed');
    expect(await types(b.id)).not.toContain('deadline_warning'); // clock just started

    ctx.advance(19 * H); // b has 5h of 24h left → inside the 25% warning zone
    await runDeadlineSweep(ctx.deps);
    expect(await types(b.id)).toContain('deadline_warning');
    expect(await types(b.id)).not.toContain('deadline_passed');

    ctx.advance(6 * H); // b's own window is over now
    await runDeadlineSweep(ctx.deps);
    expect(await types(b.id)).toContain('deadline_passed');
  });
});
