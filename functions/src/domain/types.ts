/** Firestore data model (spec §20). All timestamps are ISO strings (UTC). */
export type Role = 'marketer' | 'manager' | 'admin' | 'superadmin';
export const ROLES: Role[] = ['marketer', 'manager', 'admin', 'superadmin'];
export type UserStatus = 'active' | 'inactive';

export interface User {
  name: string;
  phone: string | null;
  email: string | null;
  /** Residence («محل سکونت»), captured at sign-up; null on accounts created before it existed. */
  province: string | null;
  city: string | null;
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
  /** false = no quiz gates this section (the package quiz lives on another section). Missing = true. */
  quizRequired?: boolean;
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
  /** false = no quiz gates this section (the package quiz lives on another section). Missing = true. */
  quizRequired?: boolean;
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
  | 'manual';
export interface PointsEntry {
  userId: string;
  amount: number;
  reason: PointsReason;
  refId: string;
  createdAt: string;
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
  /** Optional rich-push image; absent on legacy notifications. */
  imageUrl?: string | null;
  /** Optional campaign that originated this notification. */
  campaignId?: string | null;
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
  /**
   * Full approved knowledge document (the markdown the admin pastes or uploads).
   * This is the source of truth for how the mentor talks about the brand/product.
   * Older boxes simply omit it.
   */
  document?: string;
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
