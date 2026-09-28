import type { Doc } from '../store/types';
import type {
  Assignment,
  Brand,
  LearningPath,
  Package,
  Product,
  SectionProgress,
  User,
} from '../domain/types';
import type { Deps } from './context';
import { allBrands, productsById } from './catalog-cache';

/** Pure computation of what a user sees and what is locked (F2/F5/F9). */

export interface PackageCompletion {
  userId: string;
  packageId: string;
  teamId: string | null;
  completedAt: string;
  onTime: boolean;
  delayHours: number;
}

export type SectionState = 'locked' | 'open' | 'in_progress' | 'quiz' | 'completed';

export interface SectionView {
  id: string;
  order: number;
  title: string;
  mediaType: 'video' | 'audio';
  durationSec: number;
  quizId: string;
  percent: number;
  mediaCompleted: boolean;
  quizPassed: boolean;
  lastPositionSec: number;
  state: SectionState;
  lockReason: string | null;
  archived: boolean;
}

export type PackageUserStatus = 'new' | 'in_progress' | 'completed';

export interface PackageView {
  id: string;
  title: string;
  description: string;
  brand: { id: string; name: string; logoUrl: string } | null;
  product: { id: string; name: string; imageUrl: string } | null;
  deadlineAt: string | null;
  estimatedMinutes: number;
  status: PackageUserStatus;
  packageStatus: Package['status'];
  percent: number;
  overdue: boolean;
  completedAt: string | null;
  onTime: boolean | null;
  lastActivityAt: string | null;
  pathOrder: number;
  sections: SectionView[];
  totalDurationSec: number;
}

export interface NextItem {
  packageId: string;
  packageTitle: string;
  sectionId: string;
  sectionTitle: string;
  action: 'start' | 'resume' | 'quiz';
  deadlineAt: string | null;
  percent: number;
  mediaType: 'video' | 'audio';
  durationSec: number;
  imageUrl: string | null;
}

export function assignmentApplies(
  a: Pick<Assignment, 'type' | 'targetId' | 'revokedAt'>,
  user: Pick<User, 'teamId' | 'brandIds'> & { id: string },
): boolean {
  if (a.revokedAt) return false;
  switch (a.type) {
    case 'global':
      return true;
    case 'user':
      return a.targetId === user.id;
    case 'team':
      return !!user.teamId && a.targetId === user.teamId;
    case 'brand':
      return !!a.targetId && user.brandIds.includes(a.targetId);
  }
}

/** Union of global ∪ team ∪ user ∪ brand (spec §20.4). */
export function assignedPackageIds(
  assignments: Array<Pick<Assignment, 'type' | 'targetId' | 'revokedAt' | 'packageIds'>>,
  user: Pick<User, 'teamId' | 'brandIds'> & { id: string },
): Set<string> {
  const out = new Set<string>();
  for (const a of assignments)
    if (assignmentApplies(a, user)) for (const p of a.packageIds) out.add(p);
  return out;
}

export function sectionScore(
  s: Pick<SectionView, 'mediaCompleted' | 'quizPassed' | 'percent'>,
): number {
  if (s.mediaCompleted && s.quizPassed) return 100;
  return Math.min(90, Math.round(s.percent * 0.9));
}

export interface SharedData {
  now: Date;
  assignments: Doc<Assignment>[];
  packages: Map<string, Doc<Package>>;
  brands: Map<string, Doc<Brand>>;
  products: Map<string, Doc<Product>>;
  pathOrder: Map<string, number>;
}

export function computePackageView(
  shared: SharedData,
  pkg: Doc<Package>,
  progress: Map<string, Doc<SectionProgress>>,
  completion: PackageCompletion | undefined,
): PackageView {
  const nowIso = shared.now.toISOString();
  const sections: SectionView[] = [];
  let prevDone = true;
  const ordered = [...pkg.sections].sort((a, b) => a.order - b.order);
  for (const s of ordered) {
    const p = progress.get(s.id);
    // Archived sections: keep only if the user already engaged with them (edge case 27.2).
    if (s.archived && !p) continue;
    const mediaCompleted = !!p?.completed;
    const quizPassed = !!p?.quizPassed;
    const done = mediaCompleted && quizPassed;
    let state: SectionState;
    let lockReason: string | null = null;
    if (done) state = 'completed';
    else if (!prevDone) {
      state = 'locked';
      lockReason = 'ابتدا قسمت قبل را کامل کنید و در آزمون آن قبول شوید.';
    } else if (mediaCompleted) state = 'quiz';
    else if ((p?.playedSeconds ?? 0) > 0) state = 'in_progress';
    else state = 'open';
    sections.push({
      id: s.id,
      order: s.order,
      title: s.title,
      mediaType: s.mediaType,
      durationSec: s.durationSec,
      quizId: s.quizId,
      percent: p?.percent ?? 0,
      mediaCompleted,
      quizPassed,
      lastPositionSec: p?.lastPositionSec ?? 0,
      state,
      lockReason,
      archived: s.archived,
    });
    // Archived sections never block the sequence.
    if (!s.archived) prevDone = prevDone && done;
  }
  const active = sections.filter((s) => !s.archived);
  const totalDur = active.reduce((a, s) => a + Math.max(1, s.durationSec), 0);
  const percent =
    totalDur > 0
      ? Math.round(
          active.reduce((a, s) => a + sectionScore(s) * Math.max(1, s.durationSec), 0) / totalDur,
        )
      : 0;
  const allDone = active.length > 0 && active.every((s) => s.state === 'completed');
  const anyProgress = sections.some((s) => s.percent > 0 || s.quizPassed);
  const lastActivity =
    [...progress.values()]
      .map((p) => p.updatedAt)
      .sort()
      .pop() ?? null;
  const brand = pkg.brandId ? shared.brands.get(pkg.brandId) : undefined;
  const product = pkg.productId ? shared.products.get(pkg.productId) : undefined;
  const status: PackageUserStatus =
    allDone || completion ? 'completed' : anyProgress ? 'in_progress' : 'new';
  return {
    id: pkg.id,
    title: pkg.title,
    description: pkg.description,
    brand: brand ? { id: brand.id, name: brand.name, logoUrl: brand.logoUrl } : null,
    product: product ? { id: product.id, name: product.name, imageUrl: product.imageUrl } : null,
    deadlineAt: pkg.deadlineAt,
    estimatedMinutes: pkg.estimatedMinutes,
    status,
    packageStatus: pkg.status,
    percent: status === 'completed' ? 100 : percent,
    overdue: status !== 'completed' && !!pkg.deadlineAt && pkg.deadlineAt < nowIso,
    completedAt: completion?.completedAt ?? null,
    onTime: completion ? completion.onTime : null,
    lastActivityAt: lastActivity,
    pathOrder: shared.pathOrder.get(pkg.id) ?? 9999,
    sections,
    totalDurationSec: active.reduce((a, s) => a + s.durationSec, 0),
  };
}

/** Deadline-first ordering (nextItem = nearest deadline with percent<100 — PROMPT 008). */
export function sortPackages(list: PackageView[]): PackageView[] {
  return [...list].sort((a, b) => {
    const ad = a.deadlineAt ?? '9999';
    const bd = b.deadlineAt ?? '9999';
    if (ad !== bd) return ad < bd ? -1 : 1;
    if (a.pathOrder !== b.pathOrder) return a.pathOrder - b.pathOrder;
    return a.title.localeCompare(b.title, 'fa');
  });
}

export function computeNextItem(list: PackageView[]): NextItem | null {
  for (const p of sortPackages(list)) {
    if (p.status === 'completed' || p.packageStatus === 'archived') continue;
    const s = p.sections.find(
      (x) => !x.archived && x.state !== 'completed' && x.state !== 'locked',
    );
    if (!s) continue;
    return {
      packageId: p.id,
      packageTitle: p.title,
      sectionId: s.id,
      sectionTitle: s.title,
      action: s.state === 'quiz' ? 'quiz' : s.state === 'in_progress' ? 'resume' : 'start',
      deadlineAt: p.deadlineAt,
      percent: s.percent,
      mediaType: s.mediaType,
      durationSec: s.durationSec,
      imageUrl: p.product?.imageUrl ?? p.brand?.logoUrl ?? null,
    };
  }
  return null;
}

// ─── Loaders ───────────────────────────────────────────────────────────────

export async function loadShared(d: Deps, extraPackageIds: string[] = []): Promise<SharedData> {
  const [assignments, published, brands, paths] = await Promise.all([
    d.store.query<Assignment>({ collection: 'assignments', where: [['revokedAt', '==', null]] }),
    d.store.query<Package>({ collection: 'packages', where: [['status', '==', 'published']] }),
    allBrands(d),
    d.store.query<LearningPath>({
      collection: 'learning_paths',
      where: [['archived', '==', false]],
    }),
  ]);
  const packages = new Map(published.map((p) => [p.id, p]));
  const missing = extraPackageIds.filter((id) => !packages.has(id));
  if (missing.length) {
    for (const p of await d.store.getMany<Package>(
      [...new Set(missing)].map((id) => `packages/${id}`),
    )) {
      if (p && p.status !== 'draft') packages.set(p.id, p);
    }
  }
  const products = await productsById(
    d,
    [...packages.values()].map((p) => p.productId ?? '').filter(Boolean),
  );
  const pathOrder = new Map<string, number>();
  for (const path of paths)
    for (const it of path.items)
      if (!pathOrder.has(it.packageId)) pathOrder.set(it.packageId, it.order);
  return {
    now: d.clock(),
    assignments,
    packages,
    brands: new Map(brands.map((b) => [b.id, b])),
    products,
    pathOrder,
  };
}

export interface UserLearning {
  packages: PackageView[];
  progressRows: Doc<SectionProgress>[];
}

/** Everything one user can see, with state. Started-but-unassigned packages remain visible (edge case). */
export async function loadUserLearning(
  d: Deps,
  user: Doc<User>,
  shared?: SharedData,
): Promise<UserLearning> {
  const [progressRows, completions] = await Promise.all([
    d.store.query<SectionProgress>({
      collection: 'section_progress',
      where: [['userId', '==', user.id]],
    }),
    d.store.query<PackageCompletion>({
      collection: 'package_completions',
      where: [['userId', '==', user.id]],
    }),
  ]);
  const startedIds = [...new Set(progressRows.map((p) => p.packageId))];
  const sh = shared ?? (await loadShared(d, startedIds));
  if (shared) {
    const missing = startedIds.filter((id) => !sh.packages.has(id));
    if (missing.length) {
      for (const p of await d.store.getMany<Package>(missing.map((id) => `packages/${id}`)))
        if (p && p.status !== 'draft') sh.packages.set(p.id, p);
    }
  }
  return { packages: computeUserPackages(sh, user, progressRows, completions), progressRows };
}

export function computeUserPackages(
  sh: SharedData,
  user: Doc<User>,
  progressRows: Doc<SectionProgress>[],
  completions: PackageCompletion[],
): PackageView[] {
  const assigned = assignedPackageIds(sh.assignments, user);
  const started = new Set(progressRows.map((p) => p.packageId));
  const byPkg = new Map<string, Map<string, Doc<SectionProgress>>>();
  for (const r of progressRows) {
    let m = byPkg.get(r.packageId);
    if (!m) byPkg.set(r.packageId, (m = new Map()));
    m.set(r.sectionId, r);
  }
  const compByPkg = new Map(completions.map((c) => [c.packageId, c]));
  const out: PackageView[] = [];
  for (const pkg of sh.packages.values()) {
    const visible =
      (pkg.status === 'published' && assigned.has(pkg.id)) ||
      (started.has(pkg.id) && pkg.status !== 'draft');
    if (!visible) continue;
    out.push(computePackageView(sh, pkg, byPkg.get(pkg.id) ?? new Map(), compByPkg.get(pkg.id)));
  }
  return sortPackages(out);
}
