import type { Attempt, MentorNudge, User } from '../domain/types';
import type { Doc } from '../store/types';
import { DAY, HOUR } from '../lib/time';
import { getPolicy, track, type Deps } from './context';
import { loadUserLearning, type PackageView } from './learning-state';
import { createNudge } from './mentor-rules';
import { effectiveCurrent, getStreak, todayKey } from './streak';

/**
 * Behaviour-management engine (موتور مدیریت رفتار).
 *
 * The mentor is not a chat box that waits for questions: it *manages the marketer's behaviour*.
 * This module turns raw learning events into an explainable state, and the state into the single
 * most useful next action plus at most one intervention per session.
 *
 * Everything here is deterministic and rule-based (no LLM): decisions about people must be
 * auditable and reproducible. LLMs are only used to *phrase* a message (see `phraseMessage`),
 * never to decide who gets nudged.
 *
 * Layered model:
 *   events → signals → state (momentum/pressure/mastery/risk) → interventions (rules B1–B12)
 *          → channel (card / chat / voice / push / manager note) → escalation ladder
 */

export type Momentum = 'new' | 'excelling' | 'on_track' | 'slowing' | 'at_risk' | 'stalled';

export interface BehaviorSignals {
  activePackages: number;
  overduePackages: number;
  dueSoon72h: number;
  incompleteNearDeadline: number;
  stalledSections: Array<{ packageId: string; sectionId: string; title: string; percent: number }>;
  nearCompletion: Array<{
    packageId: string;
    title: string;
    percent: number;
    deadlineAt: string | null;
  }>;
  failedQuizzes: Array<{ packageId: string; sectionId: string; score: number; attempts: number }>;
  inactiveDays: number | null;
  completedLast7d: number;
  startedLast7d: number;
  streakDays: number;
  onTimeRate: number | null;
  avgQuizScore: number | null;
  /** Per brand/product mastery, used for coaching and gap analysis. */
  mastery: Array<{ key: string; label: string; percent: number; quizAvg: number | null }>;
  /** Set by the orchestrator after state computation (used by the "top performer" rule). */
  momentumHint?: Momentum;
}

export interface BehaviorState {
  momentum: Momentum;
  /** 0-100: deadline pressure the marketer is under. */
  pressure: number;
  /** 0-100: how well they are progressing. */
  health: number;
  /** 0-100: probability of missing the next deadline (explainable heuristic). */
  risk: number;
  reason: string;
  streakDays: number;
}

export type InterventionRuleId =
  | 'B1' // deadline ≤72h and progress < 80%
  | 'B2' // overdue
  | 'B3' // quiz failed
  | 'B4' // retake approved
  | 'B5' // inactive
  | 'B6' // stalled section
  | 'B7' // near completion
  | 'B8' // streak celebration
  | 'B9' // mastery gap → review
  | 'B10' // coach moment (role-play)
  | 'B11' // top performer → mentor others
  | 'B12'; // policy reminder (deadline changed / new assignment)

export type InterventionChannel = 'card' | 'chat' | 'voice' | 'push' | 'manager_note';

export interface Intervention {
  ruleId: InterventionRuleId;
  priority: 1 | 2 | 3 | 4 | 5; // 1 = most urgent
  channel: InterventionChannel;
  /** Persian message shown to the marketer. */
  message: string;
  /** In-app deep link. */
  actionRef: string | null;
  /** Deterministic dedupe key (per user+rule+ref+day). */
  refKey: string;
  /** A role-play suggestion the mentor can offer in the same breath. */
  coach?: { objection: string; productName: string; mood: string };
  /** Hours before the same rule may fire again. */
  cooldownHours: number;
  /** Explains *why* this fired — surfaced in the admin quality report. */
  reason: string;
}

// ─── Signal extraction ──────────────────────────────────────────────────────

const hoursLeft = (deadlineAt: string | null, now: Date) =>
  deadlineAt ? (Date.parse(deadlineAt) - now.getTime()) / HOUR : Number.POSITIVE_INFINITY;

export function computeSignals(
  packages: PackageView[],
  attempts: Array<Doc<Attempt>>,
  now: Date,
  opts: { inactiveDays?: number } = {},
): BehaviorSignals {
  const active = packages.filter(
    (p) => p.status !== 'completed' && p.packageStatus === 'published',
  );
  const signals: BehaviorSignals = {
    activePackages: active.length,
    overduePackages: active.filter((p) => p.overdue).length,
    dueSoon72h: 0,
    incompleteNearDeadline: 0,
    stalledSections: [],
    nearCompletion: [],
    failedQuizzes: [],
    inactiveDays: opts.inactiveDays ?? null,
    completedLast7d: packages.filter(
      (p) => p.completedAt && now.getTime() - Date.parse(p.completedAt) <= 7 * DAY,
    ).length,
    startedLast7d: 0,
    streakDays: 0,
    onTimeRate: packages.filter((p) => p.onTime !== null).length
      ? Math.round(
          (packages.filter((p) => p.onTime === true).length /
            packages.filter((p) => p.onTime !== null).length) *
            100,
        )
      : null,
    avgQuizScore: null,
    mastery: [],
  };

  for (const p of active) {
    const left = hoursLeft(p.deadlineAt, now);
    if (left > 0 && left <= 72 * HOUR) {
      signals.dueSoon72h++;
      if (p.percent < 80) signals.incompleteNearDeadline++;
    }
    if (p.percent >= 80 && p.percent < 100) {
      signals.nearCompletion.push({
        packageId: p.id,
        title: p.title,
        percent: p.percent,
        deadlineAt: p.deadlineAt,
      });
    }
    for (const s of p.sections) {
      if (s.state === 'in_progress' && s.percent < 25 && s.percent > 0)
        signals.stalledSections.push({
          packageId: p.id,
          sectionId: s.id,
          title: s.title,
          percent: s.percent,
        });
    }
  }

  // Attempts: failures and mastery per section/package.
  const bySection = new Map<string, Array<Doc<Attempt>>>();
  for (const a of attempts) {
    const list = bySection.get(a.sectionId) ?? [];
    list.push(a);
    bySection.set(a.sectionId, list);
  }
  const scores: number[] = [];
  for (const [sectionId, list] of bySection) {
    const submitted = list.filter((a) => a.status === 'submitted' && a.score !== null);
    if (!submitted.length) continue;
    const best = Math.max(...submitted.map((a) => a.score ?? 0));
    const ordered = [...submitted].sort(
      (a, b) => Date.parse(a.submittedAt ?? a.startedAt) - Date.parse(b.submittedAt ?? b.startedAt),
    );
    const last = ordered[ordered.length - 1];
    if (!last) continue;
    scores.push(best);
    if (last.passed === false)
      signals.failedQuizzes.push({
        packageId: last.packageId,
        sectionId,
        score: last.score ?? 0,
        attempts: submitted.length,
      });
  }
  signals.avgQuizScore = scores.length
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : null;

  // Mastery per brand (label = brand name) — the "what do I actually know" view.
  const byBrand = new Map<string, { label: string; percents: number[]; quizzes: number[] }>();
  for (const p of packages) {
    const key = p.brand?.id ?? p.product?.id ?? p.id;
    const label = p.brand?.name ?? p.product?.name ?? p.title;
    const entry = byBrand.get(key) ?? { label, percents: [], quizzes: [] };
    entry.percents.push(p.percent);
    for (const s of p.sections) {
      const list = bySection.get(s.id);
      if (list?.length) entry.quizzes.push(Math.max(...list.map((a) => a.score ?? 0)));
    }
    byBrand.set(key, entry);
  }
  signals.mastery = [...byBrand.entries()]
    .map(([key, v]) => ({
      key,
      label: v.label,
      percent: Math.round(v.percents.reduce((a, b) => a + b, 0) / (v.percents.length || 1)),
      quizAvg: v.quizzes.length
        ? Math.round(v.quizzes.reduce((a, b) => a + b, 0) / v.quizzes.length)
        : null,
    }))
    .sort((a, b) => a.percent - b.percent)
    .slice(0, 8);

  return signals;
}

/** Rolling activity → streak + started counters (kept pure for tests). */
export function annotateActivity(
  signals: BehaviorSignals,
  packages: PackageView[],
  now: Date,
): BehaviorSignals {
  const days = new Set<string>();
  for (const p of packages) {
    for (const iso of [p.lastActivityAt, p.completedAt]) {
      if (!iso) continue;
      const d = new Date(iso);
      const diff = Math.floor((now.getTime() - d.getTime()) / DAY);
      if (diff >= 0 && diff <= 30) days.add(d.toISOString().slice(0, 10));
    }
  }
  const sorted = [...days].sort().reverse();
  let streak = 0;
  let cursor = new Date(now.toISOString().slice(0, 10));
  for (let i = 0; i < 31; i++) {
    const key = cursor.toISOString().slice(0, 10);
    if (sorted.includes(key)) {
      streak++;
      cursor = new Date(cursor.getTime() - DAY);
    } else if (i === 0) {
      // Today may simply not have happened yet — count from yesterday.
      cursor = new Date(cursor.getTime() - DAY);
    } else break;
  }
  return {
    ...signals,
    streakDays: streak,
    startedLast7d: packages.filter(
      (p) => p.lastActivityAt && now.getTime() - Date.parse(p.lastActivityAt) <= 7 * DAY,
    ).length,
  };
}

/** Pure state computation — no I/O, fully testable. */
export function computeState(signals: BehaviorSignals): BehaviorState {
  let pressure = 0;
  pressure += Math.min(45, signals.incompleteNearDeadline * 22);
  pressure += Math.min(35, signals.overduePackages * 18);
  pressure += Math.min(20, signals.failedQuizzes.length * 8);

  let health = 50;
  health += Math.min(25, signals.completedLast7d * 12);
  health += Math.min(15, signals.streakDays * 3);
  health += Math.min(10, signals.startedLast7d * 4);
  if (signals.avgQuizScore !== null) health += Math.round((signals.avgQuizScore - 70) / 5);
  health -= Math.min(25, signals.stalledSections.length * 6);
  if (signals.inactiveDays !== null)
    health -= Math.min(30, Math.max(0, signals.inactiveDays - 2) * 8);
  health = Math.max(0, Math.min(100, health));
  pressure = Math.max(0, Math.min(100, pressure));

  const inactive = signals.inactiveDays ?? 0;
  let risk = Math.round(pressure * 0.55 + (100 - health) * 0.35 + inactive * 4);
  if (signals.activePackages === 0) risk = 0;
  risk = Math.max(0, Math.min(100, risk));

  let momentum: Momentum;
  let reason: string;
  if (signals.activePackages === 0) {
    momentum = 'excelling';
    reason = 'همه‌ی آموزش‌های فعلی تمام شده است.';
  } else if (
    signals.completedLast7d === 0 &&
    signals.startedLast7d === 0 &&
    (signals.inactiveDays ?? 0) >= 5
  ) {
    momentum = 'stalled';
    reason = `${signals.inactiveDays} روز است فعالیتی ثبت نشده.`;
  } else if (risk >= 60) {
    momentum = 'at_risk';
    reason = signals.overduePackages
      ? `${signals.overduePackages} آموزش از مهلت گذشته.`
      : `فشار مهلت بالا و پیشرفت کم است.`;
  } else if (risk >= 35 || health < 45) {
    momentum = 'slowing';
    reason = signals.stalledSections.length
      ? `در ${signals.stalledSections.length} قسمت پیشرفت متوقف مانده.`
      : 'سرعت یادگیری نسبت به هفته‌ی قبل کمتر شده.';
  } else if (health >= 80 && risk < 25) {
    momentum = 'excelling';
    reason =
      signals.streakDays >= 3
        ? `${signals.streakDays} روز پیوسته فعال بوده.`
        : 'پیشرفت خیلی خوب است.';
  } else if (signals.startedLast7d === 0 && signals.completedLast7d === 0) {
    momentum = 'new';
    reason = 'هنوز شروع نکرده.';
  } else {
    momentum = 'on_track';
    reason = 'در مسیر برنامه است.';
  }

  return { momentum, pressure, health, risk, reason, streakDays: signals.streakDays };
}

// ─── Intervention rules ─────────────────────────────────────────────────────

const fa = (n: number) => n.toLocaleString('fa-IR');

/** Pure rule evaluation: signals → ordered interventions. */
export function planInterventions(
  signals: BehaviorSignals,
  packages: PackageView[],
  now: Date,
  opts: { maxInterventions?: number; lastActiveAt?: string | null } = {},
): Intervention[] {
  const out: Intervention[] = [];
  const byId = new Map(packages.map((p) => [p.id, p]));
  const hoursLeftOf = (p: PackageView) => hoursLeft(p.deadlineAt, now);

  for (const p of packages.filter((x) => x.overdue && x.status !== 'completed')) {
    out.push({
      ruleId: 'B2',
      priority: 1,
      channel: 'push',
      message: `مهلت «${p.title}» گذشته و ${fa(100 - Math.round(p.percent))}٪ مانده. همین امروز تمامش کن؛ مدیرت هم می‌تواند کمک کند.`,
      actionRef: `/packages/${p.id}`,
      refKey: p.id,
      cooldownHours: 24,
      reason: 'مهلت گذشته و آموزش کامل نشده',
    });
  }

  for (const p of packages.filter((x) => !x.overdue && x.status !== 'completed')) {
    const left = hoursLeftOf(p);
    if (left > 0 && left <= 72 * HOUR && p.percent < 80) {
      const next = p.sections.find((s) => s.state !== 'completed');
      out.push({
        ruleId: 'B1',
        priority: left <= 24 * HOUR ? 1 : 2,
        channel: 'card',
        message: `تا مهلت «${p.title}» ${fa(Math.max(1, Math.round(left)))} ساعت مانده و ${fa(Math.round(p.percent))}٪ پیش رفته‌ای. ${next ? `از قسمت «${next.title}» ادامه بده.` : 'ادامه بده.'}`,
        actionRef: next ? `/sections/${next.id}` : `/packages/${p.id}`,
        refKey: p.id,
        coach: next
          ? { objection: 'وقت ندارم', productName: p.product?.name ?? p.title, mood: 'بی‌حوصله' }
          : undefined,
        cooldownHours: 12,
        reason: 'کمتر از ۷۲ ساعت به مهلت و پیشرفت زیر ۸۰٪',
      });
    }
  }

  for (const f of signals.failedQuizzes) {
    const p = byId.get(f.packageId);
    const prefix = f.score >= 60 ? 'نزدیک بودی' : 'اشکالی ندارد';
    out.push({
      ruleId: 'B3',
      priority: 2,
      channel: 'card',
      message: `${prefix} — آزمون «${p?.title ?? 'این قسمت'}» ${fa(f.score)} از ۱۰۰ شد. یک بار متن قسمت را مرور کن و دوباره امتحان بده.`,
      actionRef: `/quiz/${p?.sections.find((s) => s.id === f.sectionId)?.quizId ?? ''}`,
      refKey: `${f.sectionId}`,
      coach: {
        objection: 'باز هم نمی‌توانم قبول شوم',
        productName: p?.product?.name ?? p?.title ?? '',
        mood: 'دلسرد',
      },
      cooldownHours: 48,
      reason: 'آخرین تلاش آزمون رد شده',
    });
  }

  if ((signals.inactiveDays ?? 0) >= 3 && signals.activePackages > 0) {
    const target = packages.find((p) => p.status !== 'completed');
    out.push({
      ruleId: 'B5',
      priority: signals.overduePackages ? 2 : 3,
      channel: 'push',
      message: `${fa(signals.inactiveDays ?? 0)} روز است آموزش‌ها را باز نکرده‌ای. ${target ? `فقط ۵ دقیقه وقت بگذار و «${target.sections.find((s) => s.state !== 'completed')?.title ?? target.title}» را ببین.` : ''}`,
      actionRef: target ? `/packages/${target.id}` : '/',
      refKey: 'inactive',
      cooldownHours: 72,
      reason: 'بی‌فعالیتی بیش از ۳ روز',
    });
  }

  for (const s of signals.stalledSections.slice(0, 2)) {
    out.push({
      ruleId: 'B6',
      priority: 3,
      channel: 'chat',
      message: `قسمت «${s.title}» را نصفه رها کرده‌ای (${fa(s.percent)}٪). از همان‌جا که رفتی ادامه بده؛ فقط چند دقیقه مانده.`,
      actionRef: `/sections/${s.sectionId}`,
      refKey: s.sectionId,
      cooldownHours: 48,
      reason: 'قسمت شروع‌شده اما کمتر از ۲۵٪',
    });
  }

  for (const p of signals.nearCompletion.slice(0, 2)) {
    out.push({
      ruleId: 'B7',
      priority: 3,
      channel: 'card',
      message: `«${p.title}» ${fa(Math.round(p.percent))}٪ پیش رفته — یک قدم تا تکمیل و گرفتن امتیازش مانده.`,
      actionRef: `/packages/${p.packageId}`,
      refKey: p.packageId,
      cooldownHours: 24,
      reason: 'پیشرفت بالای ۸۰٪',
    });
  }

  if (signals.streakDays >= 5) {
    out.push({
      ruleId: 'B8',
      priority: 4,
      channel: 'chat',
      message: `${fa(signals.streakDays)} روز پیوسته در حال یادگیری هستی — عالی است. امروز هم فقط یک قسمت کوتاه ببین تا رشته قطع نشود.`,
      actionRef: '/',
      refKey: 'streak',
      cooldownHours: 24,
      reason: 'زنجیره فعالیت ۵ روز یا بیشتر',
    });
  }

  const weak = signals.mastery.find((m) => (m.quizAvg ?? 100) < 70 && m.percent < 70);
  if (weak) {
    out.push({
      ruleId: 'B9',
      priority: 3,
      channel: 'chat',
      message: `در «${weak.label}» نمره‌هایت ${fa(weak.quizAvg ?? 0)} است و ${fa(weak.percent)}٪ پیش رفته‌ای. پیشنهاد می‌کنم یک دور سریع مرور کنیم.`,
      actionRef: '/learn',
      refKey: weak.key,
      cooldownHours: 96,
      reason: 'شکاف تسلط در یک برند/محصول',
      coach: { objection: 'این محصول را خوب نمی‌شناسم', productName: weak.label, mood: 'بی‌اطلاع' },
    });
  }

  if (
    signals.momentumHint === 'excelling' ||
    (signals.completedLast7d >= 2 && (signals.avgQuizScore ?? 0) >= 85)
  ) {
    out.push({
      ruleId: 'B11',
      priority: 4,
      channel: 'voice',
      message: 'کارت خیلی خوب پیش می‌رود. دوست داری یک تمرین فروش کوتاه با هم انجام بدهیم؟',
      actionRef: '/mentor',
      refKey: 'performer',
      cooldownHours: 168,
      reason: 'عملکرد بالا — زمان تمرین مهارت',
      coach: { objection: 'قیمت بالاست', productName: 'محصول پرفروش', mood: 'مردد' },
    });
  }

  const order = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4 } as const;
  return out
    .sort((a, b) => order[a.priority] - order[b.priority])
    .slice(0, opts.maxInterventions ?? 3);
}

// ─── Orchestration ──────────────────────────────────────────────────────────

export interface BehaviorBrief {
  state: BehaviorState;
  signals: BehaviorSignals;
  /** The one action the mentor recommends right now (also used by the voice assistant). */
  nextAction: { label: string; actionRef: string | null; reason: string } | null;
  interventions: Intervention[];
  /** True when the marketer should get a manager nudge as well (escalation ladder). */
  escalateToManager: boolean;
}

export async function evaluateBehavior(d: Deps, user: Doc<User>): Promise<BehaviorBrief> {
  const policy = await getPolicy(d);
  const now = d.clock();
  const [{ packages }, attempts] = await Promise.all([
    loadUserLearning(d, user),
    d.store.query<Attempt>({ collection: 'attempts', where: [['userId', '==', user.id]] }),
  ]);
  const inactiveDays = user.lastActiveAt
    ? Math.floor((now.getTime() - Date.parse(user.lastActiveAt)) / DAY)
    : null;
  let signals = computeSignals(packages, attempts, now, {
    ...(inactiveDays !== null ? { inactiveDays } : {}),
  });
  signals = annotateActivity(signals, packages, now);
  /* G-02: the product has exactly one streak definition — the PHASE-3 one, counted by completed
     stations, never by opening the app. annotateActivity keeps its own activity counters, but the
     number every rule and every screen shows comes from the streak record. */
  signals = {
    ...signals,
    streakDays: effectiveCurrent(await getStreak(d, user.id), todayKey(now)),
  };
  const state = computeState(signals);
  signals.momentumHint = state.momentum;
  const interventions = planInterventions(signals, packages, now, {
    lastActiveAt: user.lastActiveAt,
  });
  const top = interventions[0];
  return {
    state,
    signals,
    nextAction: top ? { label: top.message, actionRef: top.actionRef, reason: top.reason } : null,
    interventions,
    escalateToManager:
      state.momentum === 'at_risk' &&
      (signals.overduePackages > 0 || (inactiveDays ?? 0) >= policy.reminderInactiveDays + 3),
  };
}

/** Optional LLM phrasing — the rule decides *whether*, the model only decides *how*. */
export async function phraseMessage(
  d: Deps,
  intervention: Intervention,
  user: Doc<User>,
): Promise<string> {
  const hub = (await import('../ai/hub')).aiHub(d);
  const { BEHAVIOR_MESSAGE_SYSTEM } = await import('../ai/prompts');
  const candidates = hub.candidates('classify');
  const provider = candidates[0];
  if (!provider?.chat) return intervention.message;
  try {
    const res = await provider.chat({
      system: BEHAVIOR_MESSAGE_SYSTEM,
      prompt: `وضعیت: ${intervention.reason}\nپیام خام: ${intervention.message}\nنام کاربر: ${user.name}\nیک پیام بهتر بنویس.`,
      maxTokens: 120,
      temperature: 0.4,
    });
    const text = res.text.replace(/\s+/g, ' ').trim();
    return text.length >= 12 && text.length <= 220 ? text : intervention.message;
  } catch {
    return intervention.message;
  }
}

/** Persists the planned interventions (deduped per rule+ref+day) and returns how many were new. */
export async function applyInterventions(
  d: Deps,
  user: Doc<User>,
  interventions: Intervention[],
): Promise<number> {
  const policy = await getPolicy(d);
  let created = 0;
  for (const iv of interventions) {
    const isNudgeRule =
      iv.ruleId === 'B1' || iv.ruleId === 'B5' || iv.ruleId === 'B7' || iv.ruleId === 'B3';
    if (isNudgeRule) {
      const ruleMap: Record<string, MentorNudge['ruleId']> = {
        B1: 'R1',
        B3: 'R2',
        B5: 'R4',
        B7: 'R6',
      };
      const ok = await createNudge(
        d,
        user.id,
        ruleMap[iv.ruleId] ?? 'R5',
        iv.message,
        iv.actionRef,
        iv.refKey,
      );
      if (ok) created++;
    }
    const day = d.clock().toISOString().slice(0, 10);
    const id = `${user.id}_${iv.ruleId}_${iv.refKey}_${day}`.slice(0, 1200);
    try {
      await d.store.create(`behavior_interventions/${id}`, {
        userId: user.id,
        ruleId: iv.ruleId,
        priority: iv.priority,
        channel: iv.channel,
        message: iv.message,
        actionRef: iv.actionRef,
        reason: iv.reason,
        acted: false,
        dayKey: day,
        createdAt: d.clock().toISOString(),
        expireAt: new Date(d.clock().getTime() + 180 * DAY),
      } as unknown as Record<string, unknown>);
      if (!isNudgeRule) created++;
    } catch {
      // Already fired today — deterministic id is the throttle.
    }
    await track(d, 'mentor_intervention_planned', user.id, {
      ruleId: iv.ruleId,
      priority: iv.priority,
      channel: iv.channel,
    });
  }
  void policy;
  return created;
}

/** Daily sweep for every active marketer (wired into the mentor-daily scheduled job). */
export async function runBehaviorSweep(d: Deps): Promise<number> {
  const users = await d.store.query<User>({
    collection: 'users',
    where: [
      ['role', '==', 'marketer'],
      ['status', '==', 'active'],
    ],
  });
  let created = 0;
  for (const user of users as Array<Doc<User>>) {
    try {
      const brief = await evaluateBehavior(d, user);
      created += await applyInterventions(d, user, brief.interventions.slice(0, 2));
      if (brief.escalateToManager && user.teamId) {
        await escalate(d, user, brief);
      }
    } catch (e) {
      console.warn(`[behavior] sweep failed for ${user.id}`, (e as Error).message);
    }
  }
  return created;
}

/** Escalation ladder step 3: the manager gets a note, the marketer is never told about it. */
async function escalate(d: Deps, user: Doc<User>, brief: BehaviorBrief): Promise<void> {
  const day = d.clock().toISOString().slice(0, 10);
  const id = `behavior_escalations/${user.id}_${day}`;
  const existing = await d.store.get(id);
  if (existing) return;
  const { notifyUsers } = await import('./notify');
  await d.store.set(id, {
    userId: user.id,
    teamId: user.teamId,
    momentum: brief.state.momentum,
    risk: brief.state.risk,
    reason: brief.state.reason,
    createdAt: d.clock().toISOString(),
    expireAt: new Date(d.clock().getTime() + 180 * DAY),
  } as unknown as Record<string, unknown>);
  const manager = await d.store.query<User>({
    collection: 'users',
    where: [
      ['teamId', '==', user.teamId],
      ['role', '==', 'manager'],
    ],
  });
  const ids = (manager as Array<Doc<User>>).map((m) => m.id);
  if (ids.length)
    await notifyUsers(d, ids, 'escalation', {
      title: 'نیاز به پیگیری',
      body: `${user.name} در خطر عقب‌ماندگی است: ${brief.state.reason}`,
    });
  await track(d, 'mentor_escalated_to_manager', user.id, {
    momentum: brief.state.momentum,
    risk: brief.state.risk,
  });
}

export async function myBehavior(d: Deps, user: Doc<User>): Promise<BehaviorBrief> {
  return evaluateBehavior(d, user);
}
