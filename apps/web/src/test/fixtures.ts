import type { HomeData, Me, PackageSummary, QuizData, SectionDetail } from '@/lib/types';

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
