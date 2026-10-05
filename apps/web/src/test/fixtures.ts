import type {
  BadgeView,
  HomeData,
  ManagerNote,
  Me,
  MessageItem,
  NotificationItem,
  PackageDetail,
  PackageSummary,
  PointsData,
  QuizData,
  SectionDetail,
  SectionView,
} from '@/lib/types';

export const marketer: Me = {
  id: 'u1',
  name: 'سارا احمدی',
  phone: '09120000004',
  email: null,
  role: 'marketer',
  teamId: 'team-tehran',
  brandIds: [],
  status: 'active',
  pointsBalance: 0,
  onboardedAt: '2026-09-01T00:00:00.000Z',
  lastActiveAt: null,
  createdAt: '2026-09-01T00:00:00.000Z',
};

export const pkg: PackageSummary = {
  id: 'seed-pkg-formi',
  title: 'آموزش کیت درمانی فورمی',
  description: 'آموزش معرفی و فروش',
  brand: {
    id: 'brand-sb-formi',
    name: 'فورمی',
    logoUrl: '/catalog/brands/brand-sb-formi/logo.png',
  },
  product: {
    id: 'sb-310350101',
    name: 'کیت درمانی فورمی',
    imageUrl: '/catalog/products/sb-310350101/main.jpg',
  },
  deadlineAt: new Date(Date.now() + 5 * 86400_000).toISOString(),
  estimatedMinutes: 16,
  status: 'in_progress',
  packageStatus: 'published',
  percent: 20,
  overdue: false,
  completedAt: null,
  onTime: null,
  lastActivityAt: null,
  pathOrder: 0,
  totalDurationSec: 945,
  sectionCount: 2,
  completedSections: 0,
};

export const home: HomeData = {
  nextItem: {
    packageId: pkg.id,
    packageTitle: pkg.title,
    sectionId: 'seed-pkg-formi-s1',
    sectionTitle: 'معرفی کلی محصول فورمی',
    action: 'resume',
    deadlineAt: pkg.deadlineAt,
    percent: 20,
    mediaType: 'audio',
    durationSec: 418,
    imageUrl: pkg.product?.imageUrl ?? null,
  },
  totalProgress: 20,
  counts: { inProgress: 1, new: 0, completed: 0, overdue: 0 },
  pointsBalance: 0,
  packages: [pkg],
};

export const sectionDetail: SectionDetail = {
  section: {
    id: 'seed-pkg-formi-s1',
    order: 1,
    title: 'معرفی کلی محصول فورمی',
    mediaType: 'audio',
    durationSec: 418,
    quizId: 'seed-pkg-formi-s1-quiz',
    percent: 100,
    mediaCompleted: true,
    quizPassed: false,
    lastPositionSec: 0,
    state: 'quiz',
    lockReason: null,
    archived: false,
    description: '',
    mediaSource: 'file',
    youtubeId: null,
  },
  package: {
    id: pkg.id,
    title: pkg.title,
    deadlineAt: pkg.deadlineAt,
    brand: pkg.brand,
    product: pkg.product,
  },
  position: { index: 1, total: 2 },
  nextSectionId: 'seed-pkg-formi-s2',
  completionThreshold: 90,
};

export const quiz: QuizData = {
  quiz: {
    id: 'seed-pkg-formi-s1-quiz',
    sectionId: 'seed-pkg-formi-s1',
    sectionTitle: 'معرفی کلی محصول فورمی',
    packageId: pkg.id,
    packageTitle: pkg.title,
    passScore: 70,
    questionCount: 2,
  },
  questions: [
    {
      id: 'q1',
      order: 1,
      stem: 'این قسمت درباره کدام محصول است؟',
      options: [
        { key: 'a', text: 'کیت درمانی فورمی' },
        { key: 'b', text: 'ب' },
        { key: 'c', text: 'ج' },
        { key: 'd', text: 'د' },
      ],
    },
    {
      id: 'q2',
      order: 2,
      stem: 'برند این محصول چیست؟',
      options: [
        { key: 'a', text: 'فورمی' },
        { key: 'b', text: 'کامان' },
        { key: 'c', text: 'پیکسل' },
        { key: 'd', text: 'دافی' },
      ],
    },
  ],
  attemptInfo: {
    used: 0,
    max: 3,
    remaining: 3,
    passed: false,
    mediaCompleted: true,
    canAttempt: true,
    inProgressAttemptId: null,
    inProgressAnswers: {},
    pendingRetake: null,
    lastAttempt: null,
  },
};

/** PHASE-7 §7.2 — fixtures for the remaining marketer surfaces, so axe can cover all of them. */
export const sections: SectionView[] = [
  {
    id: 'seed-pkg-formi-s1',
    order: 1,
    title: 'معرفی کلی محصول فورمی',
    mediaType: 'audio',
    durationSec: 418,
    quizId: 'seed-pkg-formi-s1-quiz',
    percent: 100,
    mediaCompleted: true,
    quizPassed: false,
    lastPositionSec: 0,
    state: 'quiz',
    lockReason: null,
    archived: false,
  },
  {
    id: 'seed-pkg-formi-s2',
    order: 2,
    title: 'مزیت‌ها در برابر رقیب',
    mediaType: 'video',
    durationSec: 527,
    quizId: 'seed-pkg-formi-s2-quiz',
    percent: 0,
    mediaCompleted: false,
    quizPassed: false,
    lastPositionSec: 0,
    state: 'locked',
    lockReason: 'ابتدا قسمت قبل را کامل کنید.',
    archived: false,
  },
];

export const notes: ManagerNote[] = [
  { id: 'n1', body: 'روی مزیت درمانی تأکید کن.', fromName: 'مدیر تیم', createdAt: '2026-09-20T08:00:00.000Z' },
];

export const packageDetail: PackageDetail = { package: pkg, sections, notes };

export const points: PointsData = {
  balance: 240,
  ledger: [
    { id: 'p1', amount: 120, reason: 'on_time_completion', refId: 'seed-pkg-formi-s1', createdAt: '2026-09-21T08:00:00.000Z' },
    { id: 'p2', amount: 120, reason: 'first_pass_quiz', refId: 'seed-pkg-formi-s1-quiz', createdAt: '2026-09-22T08:00:00.000Z' },
  ],
};

export const badges: BadgeView[] = [
  { id: 'b1', code: 'first_package', title: 'اولین بسته', description: 'اولین بستهٔ آموزشی را تمام کردی', icon: 'package', earned: true, earnedAt: '2026-09-22T08:00:00.000Z' },
  { id: 'b2', code: 'streak_7', title: 'هفت روز پیوسته', description: 'هفت روز پشت‌سرهم مرور کردی', icon: 'flame', earned: false, earnedAt: null },
];

export const messages: MessageItem[] = [
  { id: 'm1', type: 'message', body: 'این هفته روی فورمی تمرکز کنیم.', packageId: pkg.id, fromName: 'مدیر تیم', readAt: null, createdAt: '2026-09-23T08:00:00.000Z' },
];

export const notifications: NotificationItem[] = [
  { id: 'nt1', type: 'deadline', title: 'مهلت نزدیک', body: 'مهلت آموزش فورمی نزدیک است.', actionRef: pkg.id, readAt: null, createdAt: '2026-09-23T09:00:00.000Z' },
];
