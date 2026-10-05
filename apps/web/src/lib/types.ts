/** Client-side view of the /v1 API contracts (spec §21). */
export type Role = 'marketer' | 'manager' | 'admin' | 'superadmin';

export interface Me {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  /** Residence («محل سکونت») captured at sign-up; null on accounts created before it existed. */
  province: string | null;
  city: string | null;
  role: Role;
  teamId: string | null;
  brandIds: string[];
  status: 'active' | 'inactive';
  pointsBalance: number;
  onboardedAt: string | null;
  lastActiveAt: string | null;
  createdAt: string;
}

export interface AuthResult {
  user: Me;
  idToken: string;
  refreshToken: string;
  expiresIn: number;
}

export type SectionState = 'locked' | 'open' | 'in_progress' | 'quiz' | 'completed';
export type PackageUserStatus = 'new' | 'in_progress' | 'completed';

export interface BrandRef {
  id: string;
  name: string;
  logoUrl: string;
}
export interface ProductRef {
  id: string;
  name: string;
  imageUrl: string;
}

export interface SectionView {
  id: string;
  order: number;
  title: string;
  mediaType: 'video' | 'audio';
  durationSec: number;
  quizId: string;
  /** false = no quiz on this section (the package quiz is on its podcast section). */
  quizRequired?: boolean;
  percent: number;
  mediaCompleted: boolean;
  quizPassed: boolean;
  lastPositionSec: number;
  state: SectionState;
  lockReason: string | null;
  archived: boolean;
}

export interface PackageSummary {
  id: string;
  title: string;
  description: string;
  brand: BrandRef | null;
  product: ProductRef | null;
  deadlineAt: string | null;
  estimatedMinutes: number;
  status: PackageUserStatus;
  packageStatus: 'draft' | 'published' | 'archived';
  percent: number;
  overdue: boolean;
  completedAt: string | null;
  onTime: boolean | null;
  lastActivityAt: string | null;
  pathOrder: number;
  totalDurationSec: number;
  sectionCount: number;
  completedSections: number;
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

export interface HomeData {
  nextItem: NextItem | null;
  totalProgress: number;
  counts: { inProgress: number; new: number; completed: number; overdue: number };
  pointsBalance: number;
  packages: PackageSummary[];
}

export interface ManagerNote {
  id: string;
  body: string;
  fromName: string;
  createdAt: string;
}

export interface PackageDetail {
  package: PackageSummary;
  sections: SectionView[];
  notes: ManagerNote[];
}

export interface SectionDetail {
  section: SectionView & {
    description: string;
    mediaSource: 'youtube' | 'file';
    youtubeId: string | null;
  };
  package: {
    id: string;
    title: string;
    deadlineAt: string | null;
    brand: BrandRef | null;
    product: ProductRef | null;
  };
  position: { index: number; total: number };
  nextSectionId: string | null;
  /** The package's single quiz lives on one section; every media row links to it. */
  quizSectionId?: string;
  packageQuizPassed?: boolean;
  completionThreshold: number;
}

export interface SectionMedia {
  source: 'youtube' | 'file';
  youtubeId: string | null;
  url: string | null;
  mime: string | null;
  expiresAt: string | null;
}

export interface ProgressResult {
  percent: number;
  completed: boolean;
  lastPositionSec: number;
  playedSeconds?: number;
  duplicate?: boolean;
}

export interface QuizOption {
  key: string;
  text: string;
}
export interface QuizQuestion {
  id: string;
  order: number;
  stem: string;
  options: QuizOption[];
}
export interface AttemptInfo {
  used: number;
  max: number;
  remaining: number;
  passed: boolean;
  mediaCompleted: boolean;
  /** Last try was below the pass mark: content must be watched/listened to again first. */
  rewatchRequired?: boolean;
  canAttempt: boolean;
  inProgressAttemptId: string | null;
  inProgressAnswers: Record<string, string>;
  pendingRetake: { id: string; status: string } | null;
  lastAttempt: { score: number; passed: boolean; submittedAt: string } | null;
}
export interface QuizData {
  quiz: {
    id: string;
    sectionId: string;
    sectionTitle: string;
    packageId: string;
    packageTitle: string;
    passScore: number;
    questionCount: number;
  };
  questions: QuizQuestion[];
  attemptInfo: AttemptInfo;
}
export interface StartAttempt {
  attemptId: string;
  attemptNumber: number;
  resumed: boolean;
}
export interface SubmitResult {
  attemptId: string;
  attemptNumber: number;
  score: number;
  passed: boolean;
  passScore: number;
  correctCount: number;
  total: number;
  remainingAttempts: number;
  rewatchRequired?: boolean;
  nextAction: 'next_section' | 'package_complete' | 'retry' | 'request_retake' | 'retake_pending';
  packageCompleted: boolean;
  pointsEarned: number;
  review: Array<{ questionId: string; correct: boolean; explanation: string }>;
}

export interface PointsData {
  balance: number;
  ledger: Array<{ id: string; amount: number; reason: string; refId: string; createdAt: string }>;
}
export interface BadgeView {
  id: string;
  code: string;
  title: string;
  description: string;
  icon: string;
  earned: boolean;
  earnedAt: string | null;
}
export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  actionRef: string | null;
  readAt: string | null;
  createdAt: string;
}
export interface MessageItem {
  id: string;
  type: 'message' | 'note';
  body: string;
  packageId: string | null;
  fromName: string;
  readAt: string | null;
  createdAt: string;
}
export interface Nudge {
  id: string;
  ruleId: string;
  /** Same field name as `mentor_nudges.message` (spec §20.4) returned by GET /me/mentor/nudges. */
  message: string;
  actionRef: string | null;
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
  | 'media';
export type ChatMode = 'text' | 'voice' | 'coach';
export type ChatOutcome = 'answered' | 'unknown' | 'blocked' | 'fallback';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  sources: Array<{ type: ChatSourceType | string; id: string; title: string }>;
  outcome: ChatOutcome | null;
  feedback: 'up' | 'down' | null;
  /** Which surface produced the turn (text chat, voice call or the sales role-play). */
  mode?: ChatMode | null;
  /** `gemini:…`, `groq:…`, `retrieval`, `voice-session` … — shown in the QA screens. */
  provider?: string | null;
  latencyMs?: number | null;
  createdAt: string;
}
export interface ChatReply {
  messageId: string;
  reply: string;
  sources: ChatMessage['sources'];
  outcome: ChatOutcome;
  provider?: string;
  latencyMs?: number;
  nextAction?: { label: string; actionRef: string | null } | null;
}

// ─── Mentor voice calls ─────────────────────────────────────────────────────
export interface VoiceSessionOffer {
  transport: 'live' | 'turn';
  sessionId: string;
  systemInstruction: string;
  live?: {
    url: string;
    token: string;
    model: string;
    expiresAt: string;
    input: { mime: string; sampleRate: number };
    output: { mime: string; sampleRate: number };
  };
  fallback?: { transcribe: string; ground: string; finalize: string };
}

export interface VoiceTurnReply {
  transcript: string;
  reply: string;
  /** Null when server TTS is unavailable → speak with the browser voice instead. */
  audio: { base64: string; mime: string; provider: string } | null;
  sources: ChatMessage['sources'];
  outcome: ChatOutcome;
  nextAction?: { label: string; actionRef: string | null } | null;
  provider: string;
  latency: { sttMs: number; answerMs: number; ttsMs: number; totalMs: number };
}

export interface VoiceTurnInput {
  audio: string;
  mime: string;
  durationSec: number;
  packageId?: string | null;
}

// ─── Behaviour brief (GET /me/mentor/behavior) ──────────────────────────────
export type Momentum = 'new' | 'excelling' | 'on_track' | 'slowing' | 'at_risk' | 'stalled';

export type InterventionRuleId =
  | 'B1'
  | 'B2'
  | 'B3'
  | 'B4'
  | 'B5'
  | 'B6'
  | 'B7'
  | 'B8'
  | 'B9'
  | 'B10'
  | 'B11'
  | 'B12';

export interface MentorBrief {
  state: {
    momentum: Momentum;
    /** 0–100 — deadline pressure the marketer is under. */
    pressure: number;
    /** 0–100 — how well they are progressing. */
    health: number;
    /** 0–100 — heuristic risk of missing the next deadline. */
    risk: number;
    reason: string;
    streakDays: number;
  };
  signals: {
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
    mastery: Array<{ key: string; label: string; percent: number; quizAvg: number | null }>;
    momentumHint?: Momentum;
  };
  interventions: Array<{
    ruleId: InterventionRuleId;
    priority: 1 | 2 | 3 | 4 | 5;
    channel: 'card' | 'chat' | 'voice' | 'push' | 'manager_note';
    message: string;
    actionRef: string | null;
    refKey: string;
    coach?: { objection: string; productName: string; mood: string };
    cooldownHours: number;
    reason: string;
  }>;
  /** The single action the mentor recommends right now (also used by the voice assistant). */
  nextAction: { label: string; actionRef: string | null; reason: string } | null;
  /** True when the marketer should also get a manager nudge (escalation ladder). */
  escalateToManager: boolean;
}

// ─── Admin: AI quality + knowledge index ────────────────────────────────────
export interface MentorQuality {
  days: number;
  answers: {
    total: number;
    answered: number;
    unknown: number;
    blocked: number;
    fallback: number;
    unknownRate: number | null;
    avgLatencyMs: number | null;
    spoken: number;
  };
  providers: Array<{
    provider: string;
    calls: number;
    failovers: number;
    avgLatencyMs: number | null;
  }>;
  voice: {
    turns: number;
    sessions: number;
    minutes: number;
    avgSttMs: number | null;
    avgAnswerMs: number | null;
    avgTtsMs: number | null;
    ttsFallback: number;
  };
  behavior: { interventions: number; byRule: Record<string, number>; escalations: number };
  satisfaction: { up: number; down: number; score: number | null };
  knowledge: {
    live: number;
    embedded: number;
    builtAt: string | null;
    embeddingProvider: string | null;
  };
  health: Array<{ provider: string; model: string; labelFa: string; tasks: string[] }>;
}

export interface KnowledgeStats {
  builtAt: string | null;
  itemCount: number;
  embeddingProvider: string | null;
  byKind: Record<string, number>;
  extractorVersion: string;
  live: number;
  embedded: number;
  archived: number;
  media: {
    sections: { total: number; withTranscript: number; extracted: number };
    products: { total: number; withImage: number; extracted: number };
    failing: number;
    lastExtractAt: string | null;
  };
}

// ─── Manager ────────────────────────────────────────────────────────────────
export interface TeamKpis {
  members: number;
  completionRate: number;
  onTimeRate: number;
  laggardCount: number;
  avgDelayDays: number;
  assigned: number;
  completed: number;
}
export interface Laggard {
  userId: string;
  name: string;
  province: string | null;
  city: string | null;
  packageId: string;
  packageTitle: string;
  percent: number;
  deadlineAt: string | null;
  overdueDays: number;
  lastActivityAt: string | null;
  stuckAt: string | null;
}
export interface ManagerDashboard {
  team: { id: string; name: string } | null;
  kpis: TeamKpis;
  laggards: Laggard[];
  pendingRetakes: number;
}
export interface CompletionRow {
  userId: string;
  userName: string;
  teamId: string | null;
  province: string | null;
  city: string | null;
  packageId: string;
  packageTitle: string;
  brandId: string | null;
  brandName: string | null;
  productId: string | null;
  productName: string | null;
  percent: number;
  status: PackageUserStatus;
  overdue: boolean;
  lagging: boolean;
  deadlineAt: string | null;
  completedAt: string | null;
  onTime: boolean | null;
  lastActivityAt: string | null;
  stuckAt: string | null;
}
export interface CompletionReport {
  rows: CompletionRow[];
  members?: Array<{ id: string; name: string }>;
  kpis?: TeamKpis;
}
export interface TimelineAttempt {
  attemptNumber: number;
  score: number | null;
  passed: boolean | null;
  submittedAt: string | null;
}
export interface Timeline {
  user: Me;
  packages: Array<
    Omit<PackageSummary, 'sectionCount' | 'completedSections'> & {
      sections: Array<SectionView & { attempts: TimelineAttempt[] }>;
    }
  >;
  messages: Array<{
    id: string;
    type: 'message' | 'note';
    body: string;
    packageId: string | null;
    createdAt: string;
    readAt: string | null;
  }>;
}
export interface RetakeItem {
  id: string;
  userId: string;
  userName: string;
  userProvince: string | null;
  userCity: string | null;
  quizId: string;
  sectionTitle: string;
  packageTitle: string;
  status: 'pending' | 'approved' | 'rejected';
  escalated: boolean;
  scores: number[];
  createdAt: string;
}

// ─── Admin ──────────────────────────────────────────────────────────────────
export interface AdminBrand {
  id: string;
  name: string;
  nameLatin: string | null;
  logoUrl: string;
  logoIsFallback: boolean;
  sortOrder: number;
  archived: boolean;
}
export interface AdminProduct {
  id: string;
  brandId: string;
  name: string;
  code: string | null;
  category: string | null;
  description: string | null;
  imageUrl: string;
  imageIsFallback: boolean;
  archived: boolean;
}
// ─── Mentor behaviour boxes (جعبه‌ی رفتار منتور) ─────────────────────────────
export type MentorGuideKind = 'global' | 'brand' | 'product';
export type MentorGuideTone = 'friendly' | 'professional' | 'coach' | 'brief';
export type MentorGuideQuizPolicy = 'inherit' | 'allow' | 'hide';

export interface MentorGuide {
  kind: MentorGuideKind;
  targetId: string | null;
  title: string;
  enabled: boolean;
  tone: MentorGuideTone;
  personaNote: string;
  summary: string;
  /** Full approved knowledge file. Older boxes omit it. */
  document?: string;
  keyPoints: string[];
  sellingPoints: string[];
  objections: Array<{ objection: string; answer: string }>;
  faq: Array<{ question: string; answer: string }>;
  dos: string[];
  donts: string[];
  keywords: string[];
  priority: number;
  quizAnswers: MentorGuideQuizPolicy;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** One row of the admin list: a brand or a product, with or without a box yet. */
export interface MentorGuideRow {
  key: string;
  kind: MentorGuideKind;
  targetId: string | null;
  name: string;
  parentName: string | null;
  imageUrl: string | null;
  code: string | null;
  defined: boolean;
  enabled: boolean;
  tone: MentorGuideTone;
  priority: number;
  quizAnswers: MentorGuideQuizPolicy;
  filled: number;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface MentorGuideDetail {
  guide: MentorGuide;
  defined: boolean;
  name: string;
}

export interface ContentTree {
  brands: Array<{
    id: string;
    name: string;
    logoUrl: string;
    logoIsFallback: boolean;
    productCount: number;
    brandLevelPackages: number;
    packageCount: number;
  }>;
  unassignedCount: number;
}
export interface AdminPackage {
  id: string;
  title: string;
  description: string;
  brandId: string | null;
  productId: string | null;
  status: 'draft' | 'published' | 'archived';
  deadlineAt: string | null;
  /** Personal learning window in hours, counted from each marketer's own start. */
  deadlineHours?: number | null;
  estimatedMinutes: number;
  coverUrl: string | null;
  sections: Array<{ id: string; title: string; order: number }>;
  publishedAt: string | null;
  updatedAt: string;
}
export interface AdminSection {
  id: string;
  order: number;
  title: string;
  description: string;
  transcript: string;
  mediaType: 'video' | 'audio';
  mediaSource: 'youtube' | 'file';
  youtubeUrl: string | null;
  youtubeId: string | null;
  mediaId: string | null;
  mediaMime: string | null;
  mediaSizeBytes: number | null;
  durationSec: number;
  quizId: string;
  archived: boolean;
  quiz: { id: string; questionCount: number; needsReview: boolean; version: number } | null;
}
export interface AdminPackageDetail {
  package: AdminPackage;
  sections: AdminSection[];
  publishIssues: string[];
}
export interface AdminQuestion {
  id: string;
  stem: string;
  options: QuizOption[];
  answerKey: string;
  explanation: string;
  order: number;
}
export interface AdminQuiz {
  quiz: {
    id: string;
    sectionId: string;
    packageId: string;
    passScore: number | null;
    maxAttempts: number | null;
    version: number;
    active: boolean;
    questionCount: number;
    needsReview: boolean;
  };
  questions: AdminQuestion[];
  archivedCount: number;
}
export interface AdminTeam {
  id: string;
  name: string;
  managerId: string | null;
  managerName: string | null;
  memberCount: number;
}
export interface AdminPath {
  id: string;
  name: string;
  description: string;
  scope: 'global' | 'team' | 'user' | 'brand';
  targetId: string | null;
  startAt: string | null;
  items: Array<{ packageId: string; order: number; deadlineOffsetDays: number | null }>;
  archived: boolean;
}
/** Result of saving a path: it is assigned to its audience and step deadlines are applied. */
export interface AdminPathSaved extends AdminPath {
  notified: number;
  deadlinesUpdated: number;
  warnings: string[];
}
export interface AdminAssignment {
  id: string;
  type: 'global' | 'team' | 'user' | 'brand';
  targetId: string | null;
  packageIds: string[];
  revokedAt: string | null;
  createdAt?: string;
  /** Managed by this learning path — change it by editing the path. */
  pathId?: string | null;
}
export interface AdminKpis {
  marketers: number;
  activeMarketers: number;
  activationRate: number;
  wau: number;
  mau: number;
  wauMau: number;
  onTimeCompletionRate: number;
  firstPassRate: number;
  avgDelayHours: number;
  completions: number;
  nudgeReengagementRate: number;
}
export interface AdminDashboard {
  kpis: AdminKpis;
  content: { published: number; drafts: number; unassigned: number; archived: number };
  pendingRetakes: number;
}
export interface NotificationTemplate {
  key: string;
  title: string;
  body: string;
  variables: string[];
  push: boolean;
  customized: boolean;
}
export interface PolicyData {
  passScore: number;
  maxAttempts: number;
  completionThreshold: number;
  pointsTable: { first_pass_quiz: number; package_completion: number; on_time_completion: number };
  penaltyEnabled: boolean;
  latePenalty: number;
  warningHours: number[];
  quietHours: { start: string; end: string };
  weeklyDigestDay: number;
  weeklyDigestHour: number;
  reminderInactiveDays: number;
  mentorChatEnabled: boolean;
  mentorDailyLimitPerUser: number;
  mentorDailyLimitGlobal: number;
  mentorVoiceEnabled: boolean;
  mentorVoiceMinutesPerUser: number;
  mentorVoiceMinutesGlobal: number;
  updatedAt?: string;
  updatedBy?: string | null;
}
export interface AuditEntry {
  id: string;
  actorId: string;
  actorRole: string;
  action: string;
  entity: string;
  entityId: string;
  before: unknown;
  after: unknown;
  createdAt: string;
}
export interface MentorReport {
  days: number;
  replies: number;
  up: number;
  down: number;
  satisfaction: number | null;
  byOutcome: Record<string, number>;
  users: number;
}
