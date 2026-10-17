import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { session } from '@/lib/session';
import type { Me } from '@/lib/types';
import { marketer } from '@/test/fixtures';
import { mockApi } from '@/test/mockApi';
import { renderApp } from '@/test/renderApp';

const admin: Me = { ...marketer, id: 'a1', name: 'ادمین', role: 'admin', teamId: null };

beforeEach(() => {
  localStorage.clear();
  session.clear();
});
afterEach(() => vi.unstubAllGlobals());

const signIn = () => {
  localStorage.setItem('ssl.refresh', 'r1');
  return {
    'POST /v1/auth/refresh': () => ({
      data: { user: admin, idToken: 't1', refreshToken: 'r2', expiresIn: 3600 },
    }),
    'GET /v1/me': () => ({ data: admin }),
  };
};

const TREE = {
  brands: [
    {
      id: 'b1',
      name: 'آتل',
      logoUrl: '',
      logoIsFallback: true,
      productCount: 2,
      brandLevelPackages: 1,
      packageCount: 3,
    },
  ],
  unassignedCount: 3,
};

describe('ContentPage — real content tabs (brands / unassigned / archive)', () => {
  const contentMocks = (extra: Record<string, unknown> = {}) => ({
    ...signIn(),
    'GET /v1/admin/content/tree': () => ({ data: TREE }),
    'GET /v1/admin/packages?unassigned=true': () => ({ data: [] }),
    'GET /v1/admin/packages?status=archived': () => ({ data: [] }),
    ...extra,
  });

  it('renders the three real tabs and the brand cards with real actions', async () => {
    mockApi(contentMocks());
    renderApp('/admin/content');
    expect(
      await screen.findByRole('tab', { name: /برندها/ }, { timeout: 15000 }),
    ).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /بدون تخصیص/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /بایگانی/ })).toBeInTheDocument();
    // brand card links into brand detail and shows real counts + the temporary-logo warning
    const card = await screen.findByTestId('brand-card');
    expect(within(card).getAllByText('آتل').length).toBeGreaterThan(0);
    expect(within(card).getByText(/۲ محصول/)).toBeInTheDocument();
    expect(within(card).getByText('لوگوی موقت هلدینگ')).toBeInTheDocument();
  }, 20000);

  it('honours the ?tab= deep link used by the dashboard cards', async () => {
    mockApi(contentMocks());
    renderApp('/admin/content?tab=unassigned');
    expect(await screen.findByRole('tab', { name: /بدون تخصیص/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });
});

describe('PackageEditorPage — real preparation sequence preserved', () => {
  it('shows the Product → Sections → Quizzes → Publish → Audience steps in order', async () => {
    mockApi({
      ...signIn(),
      'GET /v1/admin/packages/p1': () => ({
        data: {
          package: {
            id: 'p1',
            title: 'آموزش آتل',
            description: '',
            brandId: 'b1',
            productId: null,
            status: 'draft',
            deadlineAt: '2099-01-01T00:00:00.000Z',
            estimatedMinutes: 0,
            coverUrl: null,
            sections: [],
            publishedAt: null,
            updatedAt: '2026-09-01T00:00:00.000Z',
          },
          sections: [],
          publishIssues: [],
        },
      }),
      'GET /v1/admin/assignments': () => ({ data: [] }),
    });
    renderApp('/admin/packages/p1');
    const steps = await screen.findByTestId('package-steps', {}, { timeout: 5000 });
    const ol = within(steps).getByRole('list', { name: 'مراحل آماده‌سازی' });
    // the sequence order itself is the contract: Product → Sections → Quizzes → Publish → Audience
    const text = ol.textContent ?? '';
    const idx = ['محصول', 'قسمت‌ها', 'آزمون‌ها', 'انتشار', 'مخاطبان'].map((l) => text.indexOf(l));
    expect(idx.every((v) => v >= 0)).toBe(true);
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
    expect(within(steps).getByText(/قدم بعدی/)).toBeInTheDocument();
  });
});

describe('QuizBuilderPage — four-option MCQ contract preserved', () => {
  const QUIZ = {
    quiz: {
      id: 'q1',
      sectionId: 's1',
      packageId: 'p1',
      passScore: null,
      maxAttempts: null,
      version: 1,
      active: true,
      questionCount: 1,
      needsReview: false,
    },
    questions: [
      {
        id: 'qq1',
        stem: 'مزیت اصلی این محصول چیست؟',
        options: [
          { key: 'a', text: 'گزینه اول' },
          { key: 'b', text: 'گزینه دوم' },
          { key: 'c', text: 'گزینه سوم' },
          { key: 'd', text: 'گزینه چهارم' },
        ],
        answerKey: 'a',
        explanation: 'چون ویژگی اصلی همین است.',
        order: 1,
      },
    ],
    archivedCount: 0,
  };

  it('keeps options, correct-answer marker, explanation, reorder/edit/delete and settings', async () => {
    mockApi({
      ...signIn(),
      'GET /v1/admin/quizzes/q1': () => ({ data: QUIZ }),
      'GET /v1/admin/policies': () => ({ data: { passScore: 70, maxAttempts: 3 } }),
    });
    renderApp('/admin/quizzes/q1');
    expect(
      await screen.findByText(/مزیت اصلی این محصول چیست/, {}, { timeout: 15000 }),
    ).toBeInTheDocument();
    // four options, only the correct one is marked
    for (const t of ['الف) گزینه اول', 'ب) گزینه دوم', 'ج) گزینه سوم', 'د) گزینه چهارم'])
      expect(screen.getByText(t)).toBeInTheDocument();
    expect(screen.getByLabelText('پاسخ صحیح')).toBeInTheDocument();
    expect(screen.getByText(/توضیح: چون ویژگی اصلی همین است\./)).toBeInTheDocument();
    // question controls (reorder / edit / delete)
    for (const name of ['بالا', 'پایین', 'ویرایش سؤال', 'حذف سؤال'])
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    // publish settings + the minimum-question requirement
    expect(screen.getByLabelText('نمره قبولی (٪)')).toBeInTheDocument();
    expect(screen.getByLabelText('حداکثر تلاش')).toBeInTheDocument();
    expect(screen.getByText('برای انتشار، هر آزمون حداقل ۳ سؤال لازم دارد.')).toBeInTheDocument();
  }, 20000);

  it('new-question dialog keeps the four-option MCQ form with explanation', async () => {
    mockApi({
      ...signIn(),
      'GET /v1/admin/quizzes/q1': () => ({ data: QUIZ }),
      'GET /v1/admin/policies': () => ({ data: { passScore: 70, maxAttempts: 3 } }),
    });
    renderApp('/admin/quizzes/q1');
    fireEvent.click(await screen.findByRole('button', { name: 'سؤال جدید' }, { timeout: 5000 }));
    const dialog = await screen.findByRole('dialog', { name: 'سؤال جدید' });
    expect(within(dialog).getByLabelText('متن سؤال')).toBeInTheDocument();
    for (const k of ['الف', 'ب', 'ج', 'د']) {
      expect(within(dialog).getByLabelText(`متن گزینه ${k}`)).toBeInTheDocument();
      expect(within(dialog).getByLabelText(`گزینه ${k} صحیح است`)).toBeInTheDocument();
    }
    expect(within(dialog).getByLabelText(/توضیح پاسخ/)).toBeInTheDocument();
  });
});

describe('AssignmentsPage — paths & audiences entry points preserved', () => {
  it('renders both ways to reach marketers and the two real tabs', async () => {
    mockApi({
      ...signIn(),
      'GET /v1/admin/assignments': () => ({ data: [] }),
      'GET /v1/admin/paths': () => ({ data: [] }),
    });
    renderApp('/admin/assignments');
    expect(
      await screen.findByText('مسیر یادگیری (پیشنهادی)', {}, { timeout: 15000 }),
    ).toBeInTheDocument();
    expect(screen.getByText('انتساب مستقیم')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /مسیرهای یادگیری/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /انتساب‌های فعال/ })).toBeInTheDocument();
  });
});
