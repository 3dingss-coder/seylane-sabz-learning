import { z } from 'zod';
import { ApiError } from '../http/errors';
import { ids } from '../lib/ids';
import { DAY, HOUR } from '../lib/time';
import type { Doc } from '../store/types';
import type {
  Attempt,
  AttemptSnapshotItem,
  Message,
  Package,
  Question,
  Quiz,
  RetakeRequest,
  Section,
  SectionProgress,
  User,
} from '../domain/types';
import { getPolicy, track, type Deps } from './context';
import {
  computeNextItem,
  loadUserLearning,
  type PackageCompletion,
  type PackageView,
  type SectionView,
} from './learning-state';
import { createNudge } from './mentor-rules';
import { notifyTemplate } from './notify';
import { awardPoints, evaluateBadges } from './rewards';

const LOCKED = 'این قسمت هنوز قفل است. ابتدا قسمت قبل را کامل کنید و در آزمون آن قبول شوید.';

// ─── Home / catalog (PROMPT 008) ────────────────────────────────────────────
export async function home(d: Deps, user: Doc<User>) {
  const { packages } = await loadUserLearning(d, user);
  const active = packages.filter((p) => p.packageStatus === 'published' || p.status !== 'new');
  const totalProgress = active.length
    ? Math.round(active.reduce((a, p) => a + p.percent, 0) / active.length)
    : 0;
  await track(d, 'home_viewed', user.id);
  return {
    nextItem: computeNextItem(packages),
    totalProgress,
    counts: {
      inProgress: packages.filter((p) => p.status === 'in_progress').length,
      new: packages.filter((p) => p.status === 'new').length,
      completed: packages.filter((p) => p.status === 'completed').length,
      overdue: packages.filter((p) => p.overdue).length,
    },
    pointsBalance: user.pointsBalance,
    packages: packages.map(stripSections),
  };
}

function stripSections(p: PackageView) {
  const { sections, ...rest } = p;
  return {
    ...rest,
    sectionCount: sections.filter((s) => !s.archived).length,
    completedSections: sections.filter((s) => !s.archived && s.state === 'completed').length,
  };
}

export async function listMyPackages(
  d: Deps,
  user: Doc<User>,
  status?: 'new' | 'in_progress' | 'completed',
) {
  const { packages } = await loadUserLearning(d, user);
  await track(d, 'catalog_viewed', user.id, { status: status ?? 'all' });
  return packages.filter((p) => !status || p.status === status).map(stripSections);
}

async function packageForUser(d: Deps, user: Doc<User>, packageId: string): Promise<PackageView> {
  const { packages } = await loadUserLearning(d, user);
  const p = packages.find((x) => x.id === packageId);
  if (!p) throw new ApiError('NOT_FOUND', 'این آموزش برای شما فعال نیست.');
  return p;
}

export async function myPackage(d: Deps, user: Doc<User>, packageId: string) {
  const p = await packageForUser(d, user, packageId);
  const notes = await d.store.query<Message>({
    collection: 'messages',
    where: [
      ['toUserId', '==', user.id],
      ['packageId', '==', packageId],
    ],
    orderBy: [['createdAt', 'desc']],
    limit: 20,
  });
  const senders = await d.store.getMany<User>(
    [...new Set(notes.map((n) => n.fromUserId))].map((id) => `users/${id}`),
  );
  const nameOf = new Map(senders.filter((s): s is Doc<User> => !!s).map((s) => [s.id, s.name]));
  await track(d, 'package_opened', user.id, { packageId, status: p.status });
  return {
    package: stripSections(p),
    sections: p.sections,
    notes: notes.map((n) => ({
      id: n.id,
      type: n.type,
      body: n.body,
      fromName: nameOf.get(n.fromUserId) ?? 'مدیر',
      readAt: n.readAt,
      createdAt: n.createdAt,
    })),
  };
}

export async function sectionIndex(
  d: Deps,
  sectionId: string,
): Promise<{ section: Doc<Section>; pkg: Doc<Package> }> {
  const idx = await d.store.get<{ packageId: string }>(`section_index/${sectionId}`);
  if (!idx) throw new ApiError('NOT_FOUND', 'این قسمت پیدا نشد.');
  const [section, pkg] = await Promise.all([
    d.store.get<Section>(`packages/${idx.packageId}/sections/${sectionId}`),
    d.store.get<Package>(`packages/${idx.packageId}`),
  ]);
  if (!section || !pkg) throw new ApiError('NOT_FOUND', 'این قسمت پیدا نشد.');
  return { section, pkg };
}

async function sectionForUser(d: Deps, user: Doc<User>, sectionId: string) {
  const { section, pkg } = await sectionIndex(d, sectionId);
  const view = await packageForUser(d, user, pkg.id);
  const sv = view.sections.find((s) => s.id === sectionId);
  if (!sv) throw new ApiError('NOT_FOUND', 'این قسمت پیدا نشد.');
  return { section, pkg, view, sv };
}

export async function mySection(d: Deps, user: Doc<User>, sectionId: string) {
  const { section, view, sv } = await sectionForUser(d, user, sectionId);
  const active = view.sections.filter((s) => !s.archived);
  const idx = active.findIndex((s) => s.id === sectionId);
  const policy = await getPolicy(d);
  return {
    section: {
      ...sv,
      description: section.description,
      mediaSource: section.mediaSource,
      youtubeId: section.mediaSource === 'youtube' ? section.youtubeId : null,
    },
    package: {
      id: view.id,
      title: view.title,
      deadlineAt: view.deadlineAt,
      brand: view.brand,
      product: view.product,
    },
    position: { index: idx + 1, total: active.length },
    nextSectionId: active[idx + 1]?.id ?? null,
    completionThreshold: policy.completionThreshold,
  };
}

/** Signed short-lived media URL (files) or YouTube id. Locked sections are refused. */
export async function sectionMedia(d: Deps, user: Doc<User>, sectionId: string) {
  const { section, sv } = await sectionForUser(d, user, sectionId);
  if (sv.state === 'locked') throw new ApiError('FORBIDDEN', LOCKED);
  if (section.mediaSource === 'youtube')
    return {
      source: 'youtube' as const,
      youtubeId: section.youtubeId,
      url: null,
      mime: null,
      expiresAt: null,
    };
  if (!section.mediaPath) throw new ApiError('NOT_FOUND', 'فایل این قسمت هنوز آماده نیست.');
  const ttl = 4 * 3600;
  const url = await d.blob.signedReadUrl(section.mediaPath, ttl);
  return {
    source: 'file' as const,
    youtubeId: null,
    url,
    mime: section.mediaMime,
    expiresAt: new Date(d.clock().getTime() + ttl * 1000).toISOString(),
  };
}

// ─── Progress heartbeat (PROMPT 009, spec §21.5) ────────────────────────────
export const heartbeatSchema = z.object({
  positionSec: z
    .number({ invalid_type_error: 'موقعیت پخش معتبر نیست.' })
    .min(0)
    .max(24 * 3600),
  playedDeltaSec: z
    .number()
    .min(0, 'مقدار پخش معتبر نیست.')
    .max(70, 'مقدار پخش بیش از حد مجاز است.'),
  ts: z.string().max(40).optional(),
  deviceId: z.string().max(80).optional(),
  event: z.enum(['heartbeat', 'pause', 'ended', 'hidden', 'start']).optional(),
});

export const MAX_DELTA = 70;
export const OVERPLAY_FACTOR = 1.2;

/** Anti-cheat core (D23): consumption only grows by playedDelta, capped at duration×1.2. Pure. */
export function applyHeartbeat(
  prev: Pick<SectionProgress, 'playedSeconds' | 'completed'> | null,
  input: { positionSec: number; playedDeltaSec: number },
  durationSec: number,
  threshold: number,
): {
  playedSeconds: number;
  percent: number;
  completed: boolean;
  justCompleted: boolean;
  lastPositionSec: number;
} {
  if (input.positionSec > durationSec + 2)
    throw new ApiError('VALIDATION', 'موقعیت پخش از طول قسمت بیشتر است.');
  const delta = Math.min(MAX_DELTA, Math.max(0, input.playedDeltaSec));
  const cap = durationSec * OVERPLAY_FACTOR;
  const playedSeconds = Math.min(cap, (prev?.playedSeconds ?? 0) + delta);
  const percent =
    durationSec > 0 ? Math.min(100, Math.floor((playedSeconds / durationSec) * 100)) : 0;
  const completed = !!prev?.completed || percent >= threshold;
  return {
    playedSeconds: Math.round(playedSeconds * 10) / 10,
    percent,
    completed,
    justCompleted: completed && !prev?.completed,
    lastPositionSec: Math.min(durationSec, Math.max(0, input.positionSec)),
  };
}

export async function getProgress(d: Deps, user: Doc<User>, sectionId: string) {
  const { sv } = await sectionForUser(d, user, sectionId);
  return {
    percent: sv.percent,
    lastPositionSec: sv.lastPositionSec,
    completed: sv.mediaCompleted,
    quizPassed: sv.quizPassed,
    state: sv.state,
  };
}

export async function recordProgress(
  d: Deps,
  user: Doc<User>,
  sectionId: string,
  input: z.infer<typeof heartbeatSchema>,
  idempotencyKey: string | undefined,
) {
  const { section, pkg, sv } = await sectionForUser(d, user, sectionId);
  if (sv.state === 'locked') throw new ApiError('FORBIDDEN', LOCKED);
  const policy = await getPolicy(d);
  const now = d.clock().toISOString();
  const path = `section_progress/${ids.progress(user.id, sectionId)}`;
  const key = idempotencyKey?.slice(0, 80);
  const result = await d.store.runTransaction(async (tx) => {
    const prev = await tx.get<SectionProgress>(path);
    if (key && prev?.recentKeys?.includes(key)) return { duplicate: true, prev, next: null };
    const next = applyHeartbeat(prev, input, section.durationSec, policy.completionThreshold);
    const recentKeys = key
      ? [...(prev?.recentKeys ?? []), key].slice(-30)
      : (prev?.recentKeys ?? []);
    const doc: SectionProgress = {
      userId: user.id,
      sectionId,
      packageId: pkg.id,
      playedSeconds: next.playedSeconds,
      percent: next.percent,
      completed: next.completed,
      completedAt: prev?.completedAt ?? (next.justCompleted ? now : null),
      lastPositionSec: next.lastPositionSec,
      quizPassed: prev?.quizPassed ?? false,
      quizPassedAt: prev?.quizPassedAt ?? null,
      recentKeys,
      startedAt: prev?.startedAt ?? now,
      updatedAt: now,
    };
    tx.set(path, doc as unknown as Record<string, unknown>);
    return { duplicate: false, prev, next: doc, justCompleted: next.justCompleted };
  });
  if (result.duplicate || !result.next) {
    const p = result.prev;
    return {
      percent: p?.percent ?? 0,
      completed: !!p?.completed,
      lastPositionSec: p?.lastPositionSec ?? 0,
      playedSeconds: p?.playedSeconds ?? 0,
      duplicate: true,
    };
  }
  const nowD = d.clock();
  await d.store.set(`playback_events/${d.store.newId()}`, {
    userId: user.id,
    sectionId,
    positionSec: input.positionSec,
    playedDeltaSec: input.playedDeltaSec,
    acceptedDeltaSec:
      Math.round((result.next.playedSeconds - (result.prev?.playedSeconds ?? 0)) * 10) / 10,
    clientTs: input.ts ?? null,
    ts: now,
    deviceId: input.deviceId ?? null,
    expireAt: new Date(nowD.getTime() + 90 * DAY),
  });
  await d.store.update(`users/${user.id}`, { lastActiveAt: now });
  if (!result.prev) {
    await track(d, 'section_played', user.id, { sectionId, mediaType: section.mediaType });
    const minutes = Math.max(1, Math.round(section.durationSec / 60));
    await createNudge(
      d,
      user.id,
      'R5',
      `این قسمت حدود ${minutes} دقیقه است — می‌توانی در مسیر گوش بدهی.`,
      `/sections/${sectionId}`,
      sectionId,
    );
    await maybeReengaged(d, user.id);
  }
  await track(d, 'playback_heartbeat', user.id, { sectionId, deltaSec: input.playedDeltaSec });
  if ('justCompleted' in result && result.justCompleted) {
    await track(d, 'section_completed', user.id, {
      sectionId,
      elapsedSec: result.next.playedSeconds,
    });
  }
  return {
    percent: result.next.percent,
    completed: result.next.completed,
    lastPositionSec: result.next.lastPositionSec,
    playedSeconds: result.next.playedSeconds,
    duplicate: false,
  };
}

/** KPI Nudge: first activity within 48h of a nudge/reminder counts as re-engagement. */
async function maybeReengaged(d: Deps, userId: string) {
  const since = new Date(d.clock().getTime() - 48 * HOUR).toISOString();
  const recent = await d.store.query<{ type: string; createdAt: string }>({
    collection: 'notifications',
    where: [
      ['userId', '==', userId],
      ['createdAt', '>=', since],
    ],
    limit: 20,
  });
  const nudge = recent.find((n) =>
    ['reminder', 'deadline_warning', 'deadline_passed', 'mentor_nudge'].includes(n.type),
  );
  if (nudge) await track(d, 'reengaged_after_nudge', userId, { nudgeType: nudge.type });
}

// ─── Quiz engine (PROMPT 010) ───────────────────────────────────────────────
async function quizContext(d: Deps, user: Doc<User>, quizId: string) {
  const quiz = await d.store.get<Quiz>(`quizzes/${quizId}`);
  if (!quiz) throw new ApiError('NOT_FOUND', 'آزمون پیدا نشد.');
  const ctx = await sectionForUser(d, user, quiz.sectionId);
  return { quiz, ...ctx };
}

async function attemptAllowance(d: Deps, userId: string, quiz: Doc<Quiz>) {
  const policy = await getPolicy(d);
  const [attempts, approved, pending] = await Promise.all([
    d.store.query<Attempt>({
      collection: 'attempts',
      where: [
        ['userId', '==', userId],
        ['quizId', '==', quiz.id],
      ],
    }),
    d.store.query<RetakeRequest>({
      collection: 'retake_requests',
      where: [
        ['userId', '==', userId],
        ['quizId', '==', quiz.id],
        ['status', '==', 'approved'],
      ],
    }),
    d.store.query<RetakeRequest>({
      collection: 'retake_requests',
      where: [
        ['userId', '==', userId],
        ['quizId', '==', quiz.id],
        ['status', '==', 'pending'],
      ],
    }),
  ]);
  const base = quiz.maxAttempts ?? policy.maxAttempts;
  const granted = approved.reduce((a, r) => a + (r.grantedAttempts || 1), 0);
  attempts.sort((a, b) => a.attemptNumber - b.attemptNumber);
  return {
    attempts,
    max: base + granted,
    passScore: quiz.passScore ?? policy.passScore,
    pending: pending[0] ?? null,
    approvedCount: approved.length,
  };
}

async function activeQuestions(d: Deps, quizId: string) {
  const qs = await d.store.query<Question>({
    collection: `quizzes/${quizId}/questions`,
    where: [['archived', '==', false]],
  });
  return qs.sort((a, b) => a.order - b.order);
}

export async function getQuizForUser(d: Deps, user: Doc<User>, quizId: string) {
  const { quiz, sv, view, section } = await quizContext(d, user, quizId);
  if (sv.state === 'locked') throw new ApiError('FORBIDDEN', LOCKED);
  const allowance = await attemptAllowance(d, user.id, quiz);
  const submitted = allowance.attempts.filter((a) => a.status === 'submitted');
  const inProgress = allowance.attempts.find((a) => a.status === 'in_progress') ?? null;
  const passed = submitted.some((a) => a.passed);
  const questions = await activeQuestions(d, quizId);
  // Questions come from the in-progress attempt snapshot if one exists (versioning).
  let shown = questions;
  if (inProgress) {
    const snapIds = inProgress.snapshot.map((s) => s.questionId);
    const all = await d.store.getMany<Question>(
      snapIds.map((id) => `quizzes/${quizId}/questions/${id}`),
    );
    shown = all.filter((q): q is Doc<Question> => !!q);
  }
  const last = submitted[submitted.length - 1] ?? null;
  return {
    quiz: {
      id: quiz.id,
      sectionId: quiz.sectionId,
      sectionTitle: section.title,
      packageId: view.id,
      packageTitle: view.title,
      passScore: allowance.passScore,
      questionCount: shown.length,
    },
    // answerKey/explanation are never sent before submission (spec §24).
    questions: shown.map((q) => ({ id: q.id, order: q.order, stem: q.stem, options: q.options })),
    attemptInfo: {
      used: submitted.length,
      max: allowance.max,
      remaining: Math.max(0, allowance.max - submitted.length - (inProgress ? 1 : 0)),
      passed,
      mediaCompleted: sv.mediaCompleted,
      canAttempt:
        sv.mediaCompleted &&
        !passed &&
        (inProgress !== null || submitted.length < allowance.max) &&
        questions.length > 0,
      inProgressAttemptId: inProgress?.id ?? null,
      inProgressAnswers: inProgress?.answers ?? {},
      pendingRetake: allowance.pending
        ? { id: allowance.pending.id, createdAt: allowance.pending.createdAt }
        : null,
      lastAttempt: last
        ? {
            attemptNumber: last.attemptNumber,
            score: last.score,
            passed: last.passed,
            submittedAt: last.submittedAt,
          }
        : null,
    },
  };
}

export async function startAttempt(d: Deps, user: Doc<User>, quizId: string) {
  const { quiz, sv, view } = await quizContext(d, user, quizId);
  if (sv.state === 'locked') throw new ApiError('FORBIDDEN', LOCKED);
  if (!sv.mediaCompleted)
    throw new ApiError('CONFLICT', 'اول قسمت را کامل ببینید یا گوش کنید، بعد آزمون فعال می‌شود.');
  const questions = await activeQuestions(d, quizId);
  if (questions.length === 0)
    throw new ApiError('CONFLICT', 'آزمونی برای این قسمت تعریف نشده است. به مدیر اطلاع داده شد.');
  const policy = await getPolicy(d);
  const res = await d.store.runTransaction(async (tx) => {
    const attempts = await tx.query<Attempt>({
      collection: 'attempts',
      where: [
        ['userId', '==', user.id],
        ['quizId', '==', quizId],
      ],
    });
    const approved = await tx.query<RetakeRequest>({
      collection: 'retake_requests',
      where: [
        ['userId', '==', user.id],
        ['quizId', '==', quizId],
        ['status', '==', 'approved'],
      ],
    });
    const inProgress = attempts.find((a) => a.status === 'in_progress');
    if (inProgress)
      return { attemptId: inProgress.id, attemptNumber: inProgress.attemptNumber, resumed: true };
    if (attempts.some((a) => a.passed))
      throw new ApiError('CONFLICT', 'شما قبلاً در این آزمون قبول شده‌اید.');
    const max =
      (quiz.maxAttempts ?? policy.maxAttempts) +
      approved.reduce((a, r) => a + (r.grantedAttempts || 1), 0);
    if (attempts.length >= max)
      throw new ApiError(
        'CONFLICT',
        'تلاش‌های شما تمام شده است. می‌توانید درخواست تلاش مجدد بدهید.',
        { reason: 'attempts_exhausted' },
      );
    const n = attempts.length + 1;
    const snapshot: AttemptSnapshotItem[] = questions.map((q) => ({
      questionId: q.id,
      answerKey: q.answerKey,
      optionKeys: q.options.map((o) => o.key),
      version: q.version,
    }));
    const attempt: Attempt = {
      quizId,
      userId: user.id,
      sectionId: quiz.sectionId,
      packageId: view.id,
      attemptNumber: n,
      status: 'in_progress',
      answers: {},
      score: null,
      passed: null,
      passScore: quiz.passScore ?? policy.passScore, // policy snapshot (edge case 27.2)
      quizVersion: quiz.version,
      snapshot,
      startedAt: d.clock().toISOString(),
      submittedAt: null,
    };
    const id = ids.attempt(user.id, quizId, n);
    tx.create(`attempts/${id}`, attempt as unknown as Record<string, unknown>);
    return { attemptId: id, attemptNumber: n, resumed: false };
  });
  if (!res.resumed)
    await track(d, 'quiz_started', user.id, { quizId, attemptNumber: res.attemptNumber });
  return res;
}

export const submitSchema = z.object({
  answers: z
    .record(z.string().max(80), z.string().max(8))
    .refine((a) => Object.keys(a).length <= 50, 'تعداد پاسخ‌ها معتبر نیست.'),
});

/** Pure grading against the attempt snapshot (answerKey of that quizVersion). */
export function grade(
  snapshot: AttemptSnapshotItem[],
  answers: Record<string, string>,
  passScore: number,
) {
  const perQuestion = snapshot.map((s) => ({
    questionId: s.questionId,
    correct: answers[s.questionId] === s.answerKey,
  }));
  const correct = perQuestion.filter((p) => p.correct).length;
  const score = snapshot.length ? Math.round((correct / snapshot.length) * 100) : 0;
  return { score, passed: score >= passScore, correct, total: snapshot.length, perQuestion };
}

export async function submitAttempt(
  d: Deps,
  user: Doc<User>,
  attemptId: string,
  input: z.infer<typeof submitSchema>,
) {
  const path = `attempts/${attemptId}`;
  const now = d.clock().toISOString();
  const outcome = await d.store.runTransaction(async (tx) => {
    const a = await tx.get<Attempt>(path);
    if (!a || a.userId !== user.id) throw new ApiError('NOT_FOUND', 'این تلاش پیدا نشد.');
    if (a.status === 'submitted')
      return { a, fresh: false, g: grade(a.snapshot, a.answers, a.passScore) };
    const missing = a.snapshot.filter((s) => !input.answers[s.questionId]);
    if (missing.length)
      throw new ApiError(
        'VALIDATION',
        `به همه سؤال‌ها پاسخ دهید (${missing.length} سؤال بی‌پاسخ).`,
        { missing: missing.map((m) => m.questionId) },
      );
    for (const s of a.snapshot) {
      const ans = input.answers[s.questionId];
      if (ans && !s.optionKeys.includes(ans))
        throw new ApiError('VALIDATION', 'یکی از پاسخ‌ها معتبر نیست.');
    }
    const answers = Object.fromEntries(
      a.snapshot.map((s) => [s.questionId, input.answers[s.questionId] ?? '']),
    );
    const g = grade(a.snapshot, answers, a.passScore);
    tx.update(path, {
      status: 'submitted',
      answers,
      score: g.score,
      passed: g.passed,
      submittedAt: now,
    });
    if (g.passed) {
      const pPath = `section_progress/${ids.progress(user.id, a.sectionId)}`;
      tx.set(pPath, { quizPassed: true, quizPassedAt: now, updatedAt: now }, { merge: true });
    }
    return {
      a: {
        ...a,
        answers,
        status: 'submitted' as const,
        score: g.score,
        passed: g.passed,
        submittedAt: now,
      },
      fresh: true,
      g,
    };
  });
  const { a, g } = outcome;
  const quiz = await d.store.get<Quiz>(`quizzes/${a.quizId}`);
  const allowance = quiz ? await attemptAllowance(d, user.id, quiz) : null;
  const submittedCount =
    allowance?.attempts.filter((x) => x.status === 'submitted').length ?? a.attemptNumber;
  const remaining = allowance ? Math.max(0, allowance.max - submittedCount) : 0;
  let nextAction:
    'next_section' | 'package_complete' | 'retry' | 'request_retake' | 'retake_pending' = 'retry';
  let packageCompleted = false;
  let pointsEarned = 0;
  const { section, pkg } = await sectionIndex(d, a.sectionId);

  if (g.passed) {
    const view = await packageForUser(d, user, pkg.id);
    packageCompleted = view.status === 'completed';
    nextAction = packageCompleted ? 'package_complete' : 'next_section';
    if (outcome.fresh) {
      await track(d, 'quiz_passed', user.id, {
        quizId: a.quizId,
        score: g.score,
        attemptNumber: a.attemptNumber,
      });
      const policy = await getPolicy(d);
      if (
        a.attemptNumber === 1 &&
        (await awardPoints(
          d,
          user.id,
          'first_pass_quiz',
          a.quizId,
          policy.pointsTable.first_pass_quiz,
        ))
      )
        pointsEarned += policy.pointsTable.first_pass_quiz;
      if (packageCompleted) pointsEarned += await onPackageCompleted(d, user, pkg);
      else {
        const remainingSections = view.sections.filter(
          (s) => !s.archived && s.state !== 'completed',
        ).length;
        if (remainingSections === 1)
          await createNudge(
            d,
            user.id,
            'R6',
            `فقط یک قسمت تا پایان «${pkg.title}» مانده — تا امتیاز و نشان راهی نیست!`,
            `/packages/${pkg.id}`,
            pkg.id,
          );
      }
    }
  } else {
    nextAction = remaining > 0 ? 'retry' : allowance?.pending ? 'retake_pending' : 'request_retake';
    if (outcome.fresh) {
      await track(d, 'quiz_failed', user.id, {
        quizId: a.quizId,
        score: g.score,
        attemptNumber: a.attemptNumber,
      });
      await createNudge(
        d,
        user.id,
        'R2',
        `اشکالی ندارد — قسمت «${section.title}» را مرور کن و دوباره تلاش کن.`,
        `/sections/${a.sectionId}`,
        a.quizId,
      );
      await notifyTemplate(
        d,
        [user.id],
        'quiz_failed',
        { title: section.title },
        { actionRef: `/sections/${a.sectionId}` },
      );
    }
  }
  if (outcome.fresh)
    await track(d, 'quiz_submitted', user.id, { quizId: a.quizId, attemptNumber: a.attemptNumber });
  // Reveal only correctness (and explanation) — correct keys are not disclosed so retries stay fair.
  const questions = await d.store.getMany<Question>(
    a.snapshot.map((s) => `quizzes/${a.quizId}/questions/${s.questionId}`),
  );
  return {
    attemptId,
    attemptNumber: a.attemptNumber,
    score: g.score,
    passed: g.passed,
    passScore: a.passScore,
    correctCount: g.correct,
    total: g.total,
    remainingAttempts: remaining,
    nextAction,
    packageCompleted,
    pointsEarned,
    review: g.perQuestion.map((p, i) => ({
      questionId: p.questionId,
      correct: p.correct,
      explanation: g.passed ? (questions[i]?.explanation ?? '') : '',
    })),
  };
}

/** Records completion once, awards completion + on-time points, badges, R3 nudge. */
async function onPackageCompleted(d: Deps, user: Doc<User>, pkg: Doc<Package>): Promise<number> {
  const now = d.clock();
  const onTime = !pkg.deadlineAt || now.toISOString() <= pkg.deadlineAt;
  const delayHours =
    pkg.deadlineAt && !onTime ? Math.round((now.getTime() - Date.parse(pkg.deadlineAt)) / HOUR) : 0;
  const completion: PackageCompletion = {
    userId: user.id,
    packageId: pkg.id,
    teamId: user.teamId,
    completedAt: now.toISOString(),
    onTime,
    delayHours,
  };
  try {
    await d.store.create(
      `package_completions/${user.id}_${pkg.id}`,
      completion as unknown as Record<string, unknown>,
    );
  } catch {
    return 0; // already recorded (idempotent)
  }
  const policy = await getPolicy(d);
  let pts = 0;
  if (
    await awardPoints(
      d,
      user.id,
      'package_completion',
      pkg.id,
      policy.pointsTable.package_completion,
    )
  )
    pts += policy.pointsTable.package_completion;
  if (
    onTime &&
    (await awardPoints(
      d,
      user.id,
      'on_time_completion',
      pkg.id,
      policy.pointsTable.on_time_completion,
    ))
  )
    pts += policy.pointsTable.on_time_completion;
  if (!onTime && policy.penaltyEnabled && policy.latePenalty > 0)
    await awardPoints(d, user.id, 'policy_penalty', pkg.id, -Math.abs(policy.latePenalty));
  await track(d, 'package_completed', user.id, { packageId: pkg.id, onTime });
  if (!onTime)
    await track(d, 'completed_after_deadline', user.id, { packageId: pkg.id, delayHours });
  if (onTime)
    await createNudge(
      d,
      user.id,
      'R3',
      `آفرین! «${pkg.title}» را به‌موقع تمام کردی و امتیاز گرفتی.`,
      '/cards',
      pkg.id,
    );
  await evaluateBadges(d, user.id);
  return pts;
}

// ─── Retake requests (F4 AC④ / F11) ─────────────────────────────────────────
export async function requestRetake(d: Deps, user: Doc<User>, quizId: string) {
  const { quiz, view } = await quizContext(d, user, quizId);
  const allowance = await attemptAllowance(d, user.id, quiz);
  const submitted = allowance.attempts.filter((a) => a.status === 'submitted');
  if (submitted.some((a) => a.passed))
    throw new ApiError('CONFLICT', 'شما در این آزمون قبول شده‌اید.');
  if (submitted.length < allowance.max)
    throw new ApiError('CONFLICT', 'هنوز تلاش باقی‌مانده دارید.');
  if (allowance.pending)
    return { id: allowance.pending.id, status: 'pending' as const, existing: true };
  const last = submitted[submitted.length - 1];
  const id = d.store.newId();
  const escalated = allowance.approvedCount >= 2; // edge case 27.2: after 2 approved retakes → admin
  const req: RetakeRequest = {
    userId: user.id,
    teamId: user.teamId,
    quizId,
    sectionId: quiz.sectionId,
    packageId: view.id,
    lastAttemptId: last?.id ?? '',
    status: 'pending',
    grantedAttempts: 1,
    reviewedBy: null,
    reviewNote: null,
    escalated,
    createdAt: d.clock().toISOString(),
    reviewedAt: null,
  };
  await d.store.set(`retake_requests/${id}`, req as unknown as Record<string, unknown>);
  await track(d, 'retake_requested', user.id, { quizId });
  const section = view.sections.find((s) => s.id === quiz.sectionId);
  const title = section?.title ?? view.title;
  const managers = user.teamId
    ? await d.store.query<User>({
        collection: 'users',
        where: [
          ['teamId', '==', user.teamId],
          ['role', '==', 'manager'],
          ['status', '==', 'active'],
        ],
      })
    : [];
  let reviewers = managers.map((m) => m.id);
  if (escalated || reviewers.length === 0) {
    const admins = await d.store.query<User>({
      collection: 'users',
      where: [
        ['role', 'in', ['admin', 'superadmin']],
        ['status', '==', 'active'],
      ],
    });
    reviewers = [...reviewers, ...admins.map((a) => a.id)];
    if (escalated) {
      await d.store.set(
        `escalation_events/${ids.escalation(user.id, view.id, `retake_${quizId}`)}`,
        {
          userId: user.id,
          teamId: user.teamId,
          packageId: view.id,
          type: 'retake_exhausted',
          createdAt: req.createdAt,
        },
      );
    }
  }
  await notifyTemplate(
    d,
    reviewers,
    'retake_request',
    { name: user.name, title },
    { actionRef: '/manager/retakes', priority: 'high' },
  );
  return { id, status: 'pending' as const, existing: false };
}

export type { SectionView };
