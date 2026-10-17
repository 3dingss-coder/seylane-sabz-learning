import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi } from '@/test/mockApi';
import type { HomeData, PackageSummary } from '@/lib/types';
import { EmptyState, ToastProvider } from '@/components/ui';
import { Mascot } from '@/components/brand/Mascot';
import { HomePage } from './HomePage';
import { MentorPage } from './MentorPage';

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({ user: { id: 'u1', name: 'سارا محمدی', role: 'marketer' } }),
}));

const PKG: PackageSummary = {
  id: 'p1',
  title: 'آموزش شامپو دافی',
  description: 'آموزش محصول',
  brand: { id: 'b1', name: 'دافی', logoUrl: '' },
  product: { id: 'pr1', name: 'شامپو', imageUrl: '' },
  deadlineAt: null,
  estimatedMinutes: 10,
  status: 'in_progress',
  packageStatus: 'published',
  percent: 33,
  overdue: false,
  completedAt: null,
  onTime: null,
  lastActivityAt: null,
  pathOrder: 1,
  totalDurationSec: 600,
  sectionCount: 3,
  completedSections: 1,
};

const HOME_ROUTINE: HomeData = {
  nextItem: {
    packageId: 'p1',
    packageTitle: 'آموزش شامپو دافی',
    sectionId: 's1',
    sectionTitle: 'بخش اول',
    action: 'start',
    deadlineAt: null,
    percent: 33,
    mediaType: 'video',
    durationSec: 180,
    imageUrl: null,
  },
  totalProgress: 33,
  counts: { inProgress: 1, new: 0, completed: 0, overdue: 0 },
  pointsBalance: 120,
  packages: [PKG],
};

function renderHome() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const homeRoutes = (data: HomeData) => ({
  'GET /v1/me/home': () => ({ data }),
  'GET /v1/me/mentor/nudges': () => ({ data: [] }),
});

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('HomePage — one dominant next action (marketer core principle)', () => {
  it('renders the next-action focal card + CTA, metrics, points and my trainings', async () => {
    mockApi(homeRoutes(HOME_ROUTINE));
    renderHome();
    expect(await screen.findByTestId('next-item')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'شروع' })).toBeInTheDocument();
    expect(screen.getByText('کار بعدی')).toBeInTheDocument();
    expect(screen.getByText('در حال انجام')).toBeInTheDocument();
    expect(screen.getByText('جدید')).toBeInTheDocument();
    expect(screen.getByText('تکمیل')).toBeInTheDocument();
    expect(screen.getByText('امتیاز شما')).toBeInTheDocument();
    expect(screen.getByText('آموزش‌های من')).toBeInTheDocument();
    expect(screen.getByTestId('package-card')).toBeInTheDocument();
  });

  it('shows no mascot on the routine home screen (must not overwhelm)', async () => {
    mockApi(homeRoutes(HOME_ROUTINE));
    const { container } = renderHome();
    await screen.findByTestId('next-item');
    expect(container.querySelector('img[src="/brand/mascot.webp"]')).toBeNull();
  });

  it('empty state carries the decorative mascot (empty state allowed)', async () => {
    mockApi(homeRoutes({ ...HOME_ROUTINE, nextItem: null, packages: [] }));
    const { container } = renderHome();
    expect(await screen.findByText('هنوز آموزشی ندارید')).toBeInTheDocument();
    const mascot = container.querySelector('img[src="/brand/mascot.webp"]');
    expect(mascot).not.toBeNull();
    expect(mascot).toHaveAttribute('alt', '');
  });

  it('all-done success moment carries the success mascot and keeps the message', async () => {
    mockApi(
      homeRoutes({
        ...HOME_ROUTINE,
        nextItem: null,
        packages: [{ ...PKG, status: 'completed', percent: 100 }],
      }),
    );
    const { container } = renderHome();
    expect(await screen.findByText('همه آموزش‌ها را تمام کردی! 🎉')).toBeInTheDocument();
    expect(container.querySelector('img[src="/brand/mascot.webp"]')).not.toBeNull();
  });
});

describe('MentorPage — real mentor surface, mascot as supportive mentor state', () => {
  it('keeps suggestions, question input and attachment entry, with decorative mascot', async () => {
    mockApi({ 'GET /v1/me/mentor/history': () => ({ data: [] }) });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <MemoryRouter>
            <MentorPage />
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>,
    );
    expect(await screen.findByText('منتور')).toBeInTheDocument();
    const mascot = container.querySelector('img[src="/brand/mascot.webp"]');
    expect(mascot).not.toBeNull();
    expect(mascot).toHaveAttribute('alt', '');
    // capability surface (not a reduced chat mockup): suggestions + input + attach menu entry
    expect(await screen.findByText('مزیت اصلی این محصول چیست؟')).toBeInTheDocument();
    expect(screen.getByLabelText('سؤال شما')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'پیوست تصویر، متن یا لینک' })).toBeInTheDocument();
  });
});

describe('EmptyState illustration slot (Stage 4 additive)', () => {
  it('renders a custom illustration and keeps the title/description contract', () => {
    render(
      <EmptyState
        title="خالی"
        description="توضیح"
        illustration={<Mascot mood="guide" className="h-24 w-auto" />}
      />,
    );
    expect(screen.getByText('خالی')).toBeInTheDocument();
    expect(screen.getByText('توضیح')).toBeInTheDocument();
  });
});
