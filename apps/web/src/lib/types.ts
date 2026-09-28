/** Client-side view of the /v1 API contracts (spec §21). */
export type Role = 'marketer' | 'manager' | 'admin' | 'superadmin';

export interface Me {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
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
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  sources: Array<{ type: string; id: string; title: string }>;
  outcome: 'answered' | 'unknown' | 'blocked' | 'fallback' | null;
  feedback: 'up' | 'down' | null;
  createdAt: string;
}
export interface ChatReply {
  messageId: string;
  reply: string;
  sources: ChatMessage['sources'];
  outcome: 'answered' | 'unknown' | 'blocked' | 'fallback';
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
