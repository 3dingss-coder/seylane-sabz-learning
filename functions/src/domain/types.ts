/** Firestore data model (spec §20). All timestamps are ISO strings (UTC). */
export type Role = 'marketer' | 'manager' | 'admin' | 'superadmin';
export const ROLES: Role[] = ['marketer', 'manager', 'admin', 'superadmin'];
export type UserStatus = 'active' | 'inactive';

export interface User {
  name: string;
  phone: string | null;
  email: string | null;
  firebaseUid: string;
  role: Role;
  teamId: string | null;
  brandIds: string[];
  status: UserStatus;
  pointsBalance: number;
  onboardedAt: string | null;
  lastActiveAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Team {
  name: string;
  managerId: string | null;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export type CatalogSource = 'catalog' | 'reactivated' | 'supplement' | 'admin';

export interface Brand {
  name: string;
  nameLatin: string | null;
  logoUrl: string;
  logoPath: string | null;
  /** true when logoUrl is the holding-logo fallback (D34) */
  logoIsFallback: boolean;
  sortOrder: number;
  archived: boolean;
  source: CatalogSource;
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  brandId: string;
  name: string;
  code: string | null;
  barcode: string | null;
  category: string | null;
  description: string | null;
  imageUrl: string;
  imagePath: string | null;
  imageIsFallback: boolean;
  archived: boolean;
  source: CatalogSource;
  createdAt: string;
  updatedAt: string;
}

export type PackageStatus = 'draft' | 'published' | 'archived';

export interface SectionSummary {
  id: string;
  order: number;
  title: string;
  mediaType: MediaType;
  durationSec: number;
  quizId: string;
  archived: boolean;
}

export interface Package {
  /** D32: optional (brand-level package) */
  productId: string | null;
  /** D33: required to publish; null = unassigned draft */
  brandId: string | null;
  title: string;
  description: string;
  status: PackageStatus;
  /** Absolute cutoff for everyone. Ignored for the learner when `deadlineHours` is set. */
  deadlineAt: string | null;
  /**
   * Personal learning window: each marketer gets this many hours, counted from their own start
   * (see effectiveDeadlineAt). Missing on older documents = null.
   */
  deadlineHours?: number | null;
  estimatedMinutes: number;
  coverUrl: string | null;
  /** Denormalized, ordered section summaries (read-optimisation for Home/catalog). */
  sections: SectionSummary[];
  createdBy: string;
  publishedAt: string | null;
  seedTag: string | null;
  createdAt: string;
  updatedAt: string;
}

export type MediaType = 'video' | 'audio';
export type MediaSource = 'youtube' | 'file';

export interface Section {
  packageId: string;
  order: number;
  title: string;
  description: string;
  /** Optional learning text used by AI mentor retrieval (RAG). */
  transcript: string;
  mediaType: MediaType;
  mediaSource: MediaSource;
  youtubeUrl: string | null;
  youtubeId: string | null;
  mediaId: string | null;
  mediaPath: string | null;
  mediaMime: string | null;
  mediaSizeBytes: number | null;
  durationSec: number;
  quizId: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface QuizOption {
  key: string;
  text: string;
}

export interface Question {
  order: number;
  stem: string;
  options: QuizOption[];
  answerKey: string;
  explanation: string;
  version: number;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Quiz {
  sectionId: string;
  packageId: string;
  /** null → policy default */
  passScore: number | null;
  maxAttempts: number | null;
  version: number;
  active: boolean;
  questionCount: number;
  needsReview: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AttemptSnapshotItem {
  questionId: string;
  answerKey: string;
  optionKeys: string[];
  version: number;
}

export interface Attempt {
  quizId: string;
  userId: string;
  sectionId: string;
  packageId: string;
  attemptNumber: number;
  status: 'in_progress' | 'submitted';
  answers: Record<string, string>;
  score: number | null;
  passed: boolean | null;
  passScore: number;
  quizVersion: number;
  snapshot: AttemptSnapshotItem[];
  startedAt: string;
  submittedAt: string | null;
}

export interface RetakeRequest {
  userId: string;
  teamId: string | null;
  quizId: string;
  sectionId: string;
  packageId: string;
  lastAttemptId: string;
  status: 'pending' | 'approved' | 'rejected';
  grantedAttempts: number;
  reviewedBy: string | null;
  reviewNote: string | null;
  escalated: boolean;
  createdAt: string;
  reviewedAt: string | null;
}

export interface SectionProgress {
  userId: string;
  sectionId: string;
  packageId: string;
  playedSeconds: number;
  percent: number;
  completed: boolean;
  completedAt: string | null;
  lastPositionSec: number;
  quizPassed: boolean;
  quizPassedAt: string | null;
  recentKeys: string[];
  startedAt: string;
  updatedAt: string;
}

export type AssignmentType = 'global' | 'team' | 'user' | 'brand';
export interface Assignment {
  type: AssignmentType;
  targetId: string | null;
  packageIds: string[];
  createdBy: string;
  createdAt: string;
  revokedAt: string | null;
  revokedBy: string | null;
  /** Set when the assignment is managed by a learning path (kept in sync on path save/archive). */
  pathId?: string | null;
}

export interface LearningPathItem {
  packageId: string;
  order: number;
  deadlineOffsetDays: number | null;
}
export interface LearningPath {
  name: string;
  description: string;
  scope: AssignmentType;
  targetId: string | null;
  startAt: string | null;
  items: LearningPathItem[];
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export type PointsReason =
  | 'on_time_completion'
  | 'first_pass_quiz'
  | 'package_completion'
  | 'badge'
  | 'policy_penalty'
  | 'manual'
  // PHASE-3 §3.3.3 — capability points for the new mechanics
  | 'station_completed'
  | 'duel_pass'
  | 'review_on_time'
  | 'quest'
  | 'mastery';
export interface PointsEntry {
  userId: string;
  amount: number;
  reason: PointsReason;
  refId: string;
  createdAt: string;
}

// ── PHASE-3 — motivation engine (§3.2 streak · §3.4 spaced · §3.5 mastery · §3.6 quests · §3.3 coins) ──

/**
 * پیوستگی (§3.2). Counted in Asia/Tehran days and only by a *learning* action (a completed
 * station), never by opening the app (G-02). Rule G-03: this record is never part of any
 * manager or admin payload.
 */
export interface Streak {
  current: number;
  longest: number;
  /** current high-water mark — re-based after a break, so repeated breaks keep ramping down */
  peak: number;
  /** what the repair window can win back (§3.2.2 بازگردانی); 0 when no window is open */
  pendingPeak: number;
  /** YYYY-MM-DD of the last counted day */
  lastDay: string | null;
  shields: number;
  /** completed stations since the last shield charge (5 → +1 shield, max 2) */
  stationsSinceShield: number;
  /** a broken streak can be repaired while this day has not passed (3 days) */
  repairUntil: string | null;
  onLeaveUntil: string | null;
  leaveTakenAt: string | null;
  updatedAt: string;
}

export type StreakEvent =
  'started' | 'extended' | 'unchanged' | 'shield_used' | 'broken' | 'repaired' | 'on_leave';

/** Per-question memory for spaced repetition (§3.4, Half-Life Regression, simplified). */
export interface QuestionMemory {
  userId: string;
  questionId: string;
  quizId: string;
  sectionId: string;
  packageId: string;
  correctStreak: number;
  halfLifeDays: number;
  seenCount: number;
  lastSeenAt: string | null;
  nextReviewAt: string;
  /** set once a successful review happens at ≥30 / ≥90 days of age (§3.5 condition 3) */
  milestone30: boolean;
  milestone90: boolean;
  reviewsTotal: number;
  reviewsOnTime: number;
  updatedAt: string;
}

export type QuestKind = 'stations' | 'perfect_duel' | 'reviews' | 'help' | 'roleplay';
export type ChestQuality = 'bronze' | 'silver' | 'gold';

export interface Quest {
  userId: string;
  day: string;
  kind: QuestKind;
  title: string;
  progress: number;
  target: number;
  coinReward: number;
  doneAt: string | null;
  /** chest quality, fixed when the quest is completed (variable reward, known range) */
  chest: ChestQuality | null;
  chestCoins: number;
  updatedAt: string;
}

export type CoinReason =
  | 'station_completed'
  | 'duel_first_pass'
  | 'duel_retry_pass'
  | 'review_on_time'
  | 'package_completed'
  | 'mastery'
  | 'helped_teammate'
  | 'quest'
  | 'chest'
  | 'redeem';

export interface CoinEntry {
  userId: string;
  amount: number;
  reason: CoinReason;
  refId: string;
  createdAt: string;
}

/** G-04: coins buy real fulfilment only — never a score, never a hidden deadline move. */
export type CoinFulfilment = 'physical' | 'process' | 'coaching';

export interface CoinCatalogItem {
  code: string;
  title: string;
  price: number;
  fulfilment: CoinFulfilment;
  note: string;
}

export interface CoinBalance {
  userId: string;
  balance: number;
  lifetime: number;
  updatedAt: string;
}

export interface CoinRedemption {
  userId: string;
  code: string;
  title: string;
  price: number;
  /** always visible to the user and to ops; a redemption is never silent (G-04) */
  status: 'pending_fulfilment' | 'fulfilled' | 'cancelled';
  createdAt: string;
}

/** استادی محصول (§3.5) — a defensible competence definition, not a decorative label (G-07). */
export interface MasteryRecord {
  userId: string;
  packageId: string;
  stationDone: boolean;
  /** passes ≥80% on two independent attempts at least 7 days apart */
  duel80Count: number;
  duel80LastAt: string | null;
  reviews30: boolean;
  reviews90: boolean;
  roleplayOk: boolean;
  masteredAt: string | null;
  updatedAt: string;
}

export interface Badge {
  code: string;
  title: string;
  description: string;
  icon: string;
  rule: {
    type: 'first_package' | 'packages_completed' | 'first_try_passes' | 'on_time_streak' | 'points';
    threshold: number;
  };
  active: boolean;
}
export interface UserBadge {
  userId: string;
  badgeId: string;
  earnedAt: string;
}

export type NotificationType =
  | 'welcome'
  | 'new_assignment'
  | 'deadline_warning'
  | 'deadline_passed'
  | 'reminder'
  | 'quiz_failed'
  | 'quiz_passed'
  | 'retake_request'
  | 'retake_reviewed'
  | 'manager_message'
  | 'mentor_nudge'
  | 'weekly_digest'
  | 'badge_earned'
  | 'escalation'
  | 'manual';

export interface Notification {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  actionRef: string | null;
  readAt: string | null;
  pushStatus: 'none' | 'sent' | 'deferred' | 'skipped' | 'failed';
  deliverAfter: string | null;
  createdAt: string;
}

export interface DeviceToken {
  userId: string;
  token: string;
  platform: 'web' | 'android';
  lastSeenAt: string;
}

export interface NotificationTemplate {
  title: string;
  body: string;
  updatedAt: string;
}

export interface Message {
  fromUserId: string;
  toUserId: string;
  type: 'message' | 'note';
  packageId: string | null;
  body: string;
  readAt: string | null;
  createdAt: string;
}

export interface MentorNudge {
  userId: string;
  ruleId: 'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R6';
  message: string;
  actionRef: string | null;
  dayKey: string;
  acted: boolean;
  createdAt: string;
}

export type ChatSourceType =
  | 'package'
  | 'section'
  | 'product'
  | 'brand'
  | 'faq'
  | 'play'
  | 'policy'
  | 'media'
  /** A «جعبه‌ی رفتار منتور» (behaviour box) — admin-authored mentor knowledge. */
  | 'guide';

export type ChatMode = 'text' | 'voice' | 'coach';

export interface ChatMessage {
  userId: string;
  role: 'user' | 'assistant';
  text: string;
  packageId: string | null;
  sources: Array<{ type: ChatSourceType; id: string; title: string }>;
  outcome: 'answered' | 'unknown' | 'blocked' | 'fallback' | null;
  feedback: 'up' | 'down' | null;
  createdAt: string;
  expireAt: Date;
  /** 'voice' → spoken through the phone-style call, 'coach' → sales role-play. */
  mode?: ChatMode | null;
  /** Which model answered, e.g. `groq:whisper-large-v3-turbo` (quality audit). */
  provider?: string | null;
  latencyMs?: number | null;
}

export interface Policy {
  passScore: number;
  maxAttempts: number;
  completionThreshold: number;
  pointsTable: Record<'first_pass_quiz' | 'package_completion' | 'on_time_completion', number>;
  penaltyEnabled: boolean;
  latePenalty: number;
  warningHours: number[];
  quietHours: { start: string; end: string };
  timezone: string;
  weeklyDigestDay: number; // 0=Sunday … 6=Saturday
  weeklyDigestHour: number;
  reminderInactiveDays: number;
  mentorChatEnabled: boolean;
  mentorDailyLimitPerUser: number;
  mentorDailyLimitGlobal: number;
  /** Voice calls (F14-V): STT → grounded answer → TTS, or a duplex Live session. */
  mentorVoiceEnabled: boolean;
  mentorVoiceMinutesPerUser: number;
  mentorVoiceMinutesGlobal: number;
  /** Let the mentor read the whole catalog (every brand/product), not only assigned ones. */
  mentorCatalogScope: 'all' | 'assigned';
  /** Let the mentor use quiz stems, options and answer keys as knowledge. */
  mentorQuizAnswerAccess: boolean;
  updatedAt: string;
  updatedBy: string | null;
}

// ─── Mentor behaviour boxes (جعبه‌ی رفتار منتور) ──────────────────────────────
/**
 * One editable box per brand / product (plus one global default) that tells the mentor *how to
 * behave* and *what it must know* about that brand or product. Admin-authored, versioned by
 * `updatedAt`, and fed into the mentor pipeline in two ways:
 *   1. as a knowledge item (retrievable + citable like any approved content), and
 *   2. as a behaviour block in the system prompt whenever the question is about that target.
 */
export type MentorGuideKind = 'global' | 'brand' | 'product';
/** Persian labels are what the admin sees; the codes are what the store keeps. */
export type MentorGuideTone = 'friendly' | 'professional' | 'coach' | 'brief';
/** 'inherit' follows `Policy.mentorQuizAnswerAccess`. */
export type MentorGuideQuizPolicy = 'inherit' | 'allow' | 'hide';

export interface MentorGuideObjection {
  objection: string;
  answer: string;
}
export interface MentorGuideFaq {
  question: string;
  answer: string;
}

export interface MentorGuide {
  kind: MentorGuideKind;
  /** null for the global box; brand id / product id otherwise. */
  targetId: string | null;
  /** Overrides the brand/product name in mentor prompts and the admin list. */
  title: string;
  /** A disabled box is ignored everywhere (retrieval + prompts) but keeps its content. */
  enabled: boolean;
  tone: MentorGuideTone;
  /** One line: who the mentor is for this brand/product. */
  personaNote: string;
  /** Positioning summary — the mentor must know this by heart. */
  summary: string;
  /** Product/brand facts the mentor should always be able to state. */
  keyPoints: string[];
  /** Benefits for the customer (sales ammunition). */
  sellingPoints: string[];
  /** Objection → approved answer pairs. */
  objections: MentorGuideObjection[];
  /** Short approved Q&A. */
  faq: MentorGuideFaq[];
  /** Things the mentor must say / must never say. */
  dos: string[];
  donts: string[];
  /** Extra search vocabulary (nicknames, Latin names, slang). */
  keywords: string[];
  /** 0–2: retrieval boost for this box, so a defined brand always wins over generic content. */
  priority: number;
  /** May the mentor quote the answer key of this brand/product's quizzes? */
  quizAnswers: MentorGuideQuizPolicy;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLog {
  actorId: string;
  actorRole: Role | 'system';
  action: string;
  entity: string;
  entityId: string;
  before: unknown;
  after: unknown;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  expireAt: Date;
}

export interface EscalationEvent {
  userId: string;
  teamId: string | null;
  packageId: string;
  type: 'deadline_passed' | 'retake_exhausted';
  createdAt: string;
}

export interface MediaAsset {
  kind: 'video' | 'audio' | 'image';
  status: 'pending' | 'ready' | 'rejected';
  path: string;
  declaredMime: string;
  mime: string | null;
  sizeBytes: number | null;
  declaredSize: number;
  originalName: string;
  durationSec: number | null;
  target: { type: 'section' | 'brand_logo' | 'product_image'; id: string | null };
  createdBy: string;
  createdAt: string;
  rejectReason: string | null;
  /** Media library (resumable uploads + organisation). All optional: older docs lack them. */
  library?: boolean;
  title?: string;
  brandId?: string | null;
  productId?: string | null;
  partSize?: number;
  totalParts?: number;
  archived?: boolean;
}
