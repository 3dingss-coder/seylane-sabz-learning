import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { session } from '@/lib/session';
import type { AdminPackageDetail, AdminSection, Me } from '@/lib/types';
import { marketer } from '@/test/fixtures';
import { mockApi } from '@/test/mockApi';
import { renderApp } from '@/test/renderApp';

const admin: Me = { ...marketer, id: 'a1', name: 'ادمین', role: 'admin', teamId: null };

beforeEach(() => {
  localStorage.clear();
  session.clear();
});
afterEach(() => vi.unstubAllGlobals());

const asAdmin = () => {
  localStorage.setItem('ssl.refresh', 'r1');
  return {
    'POST /v1/auth/refresh': () => ({
      data: { user: admin, idToken: 't1', refreshToken: 'r2', expiresIn: 3600 },
    }),
    'GET /v1/me': () => ({ data: admin }),
    'GET /v1/admin/brands': () => ({
      data: [{ id: 'b1', name: 'آتل', nameLatin: null, logoUrl: null, archived: false }],
    }),
    'GET /v1/admin/products': () => ({ data: [] }),
    'GET /v1/admin/products?brandId=b1': () => ({ data: [] }),
    'GET /v1/admin/teams': () => ({ data: [{ id: 't1', name: 'تیم تهران' }] }),
    'GET /v1/admin/users': () => ({ data: [] }),
    'GET /v1/admin/paths': () => ({ data: [] }),
  };
};

const kpis = {
  marketers: 3,
  activeMarketers: 2,
  activationRate: 60,
  wau: 2,
  mau: 2,
  wauMau: 100,
  onTimeCompletionRate: 0,
  firstPassRate: 0,
  avgDelayHours: 0,
  completions: 0,
  nudgeReengagementRate: 0,
};

const section = (over: Partial<AdminSection> = {}): AdminSection => ({
  id: 's1',
  order: 1,
  title: 'معرفی',
  description: '',
  transcript: '',
  mediaType: 'audio',
  mediaSource: 'file',
  youtubeUrl: null,
  youtubeId: null,
  mediaId: 'm1',
  mediaMime: 'audio/mp4',
  mediaSizeBytes: 1,
  durationSec: 60,
  quizId: 'q1',
  archived: false,
  quiz: { id: 'q1', questionCount: 1, needsReview: false, version: 1 },
  ...over,
});

const detail = (over: Partial<AdminPackageDetail['package']> = {}, sections = [section()]) => ({
  package: {
    id: 'p1',
    title: 'آموزش آتل',
    description: '',
    brandId: 'b1',
    productId: null,
    status: 'draft' as const,
    deadlineAt: '2099-01-01T00:00:00.000Z',
    estimatedMinutes: 0,
    coverUrl: null,
    sections: [],
    publishedAt: null,
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...over,
  },
  sections,
  publishIssues: [] as string[],
});

describe('admin: everything understandable at a glance', () => {
  it('dashboard shows the 4-step publish guide and the «انتشار آموزش جدید» shortcut', async () => {
    mockApi({
      ...asAdmin(),
      'GET /v1/admin/dashboard': () => ({
        data: {
          kpis,
          content: { published: 1, drafts: 2, unassigned: 0, archived: 0 },
          pendingRetakes: 0,
        },
      }),
    });
    renderApp('/admin');
    const guide = await screen.findByTestId('publish-guide');
    for (const t of ['آموزش بساز', 'آزمون بگذار', 'منتشر کن', 'به بازاریاب‌ها برسان'])
      expect(within(guide).getByRole('heading', { name: t })).toBeInTheDocument();
    expect(await within(guide).findByRole('link', { name: /۲ پیش‌نویس/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'انتشار آموزش جدید' }));
    expect(await screen.findByRole('dialog', { name: 'بسته آموزشی جدید' })).toBeInTheDocument();
  });

  it('package editor names the next step (quiz) and links straight to it', async () => {
    mockApi({
      ...asAdmin(),
      'GET /v1/admin/packages/p1': () => ({
        data: { ...detail(), publishIssues: ['قسمت «معرفی»: آزمون باید حداقل ۳ سؤال داشته باشد.'] },
      }),
      'GET /v1/admin/assignments': () => ({ data: [] }),
    });
    renderApp('/admin/packages/p1');
    const steps = await screen.findByTestId('package-steps');
    expect(within(steps).getByText(/قدم بعدی — آزمون‌ها/)).toBeInTheDocument();
    expect(within(steps).getByRole('link', { name: 'آزمون «معرفی»' })).toHaveAttribute(
      'href',
      '/admin/quizzes/q1',
    );
    expect(screen.getByTestId('audience-card')).toHaveTextContent('بعد از انتشار');
  });

  it('published package nobody sees shows a warning and one click makes it visible to everyone', async () => {
    const complete = [
      section({ quiz: { id: 'q1', questionCount: 5, needsReview: false, version: 1 } }),
    ];
    let posted: unknown = null;
    mockApi({
      ...asAdmin(),
      'GET /v1/admin/packages/p1': () => ({ data: detail({ status: 'published' }, complete) }),
      'GET /v1/admin/assignments': () => ({
        data: posted
          ? [{ id: 'as1', type: 'global', targetId: null, packageIds: ['p1'], revokedAt: null }]
          : [],
      }),
      'POST /v1/admin/assignments': (body) => {
        posted = body;
        return { status: 201, data: { created: true, warnings: [], notified: 3, recipients: 3 } };
      },
    });
    renderApp('/admin/packages/p1');
    const card = await screen.findByTestId('audience-card');
    expect(await within(card).findByText(/هیچ بازاریابی آن را نمی‌بیند/)).toBeInTheDocument();
    fireEvent.click(within(card).getByRole('button', { name: 'نمایش برای همه بازاریاب‌ها' }));
    expect(await within(card).findByText('همه بازاریاب‌ها')).toBeInTheDocument();
    expect(posted).toEqual({ type: 'global', packageIds: ['p1'] });
    expect(within(card).queryByText(/هیچ بازاریابی آن را نمی‌بیند/)).not.toBeInTheDocument();
  });

  it('published package without audience offers «انتخاب مخاطبان»; with one it shows who sees it', async () => {
    const complete = [
      section({ quiz: { id: 'q1', questionCount: 5, needsReview: false, version: 1 } }),
    ];
    let assigned = false;
    mockApi({
      ...asAdmin(),
      'GET /v1/admin/packages/p1': () => ({ data: detail({ status: 'published' }, complete) }),
      'GET /v1/admin/assignments': () => ({
        data: assigned
          ? [{ id: 'as1', type: 'team', targetId: 't1', packageIds: ['p1'], revokedAt: null }]
          : [],
      }),
      'GET /v1/admin/packages?status=published': () => ({
        data: [detail({ status: 'published' }).package],
      }),
      'POST /v1/admin/assignments': () => {
        assigned = true;
        return { status: 201, data: { created: true, warnings: [], notified: 1 } };
      },
    });
    renderApp('/admin/packages/p1');
    const steps = await screen.findByTestId('package-steps');
    expect(within(steps).getByText(/قدم بعدی — مخاطبان/)).toBeInTheDocument();
    fireEvent.click(within(steps).getByRole('button', { name: 'انتخاب مخاطبان' }));
    const dialog = await screen.findByRole('dialog', { name: 'نمایش آموزش به بازاریاب‌ها' });
    // this package is pre-selected
    expect(await within(dialog).findByRole('checkbox', { name: 'آموزش آتل' })).toBeChecked();
    fireEvent.click(within(dialog).getByRole('button', { name: 'ثبت انتساب' }));
    expect(await screen.findByText('همه مسیرها و مخاطبان')).toBeInTheDocument();
    expect(await screen.findByText('تیم: تیم تهران')).toBeInTheDocument();
    expect(await screen.findByText(/این آموزش کامل است/)).toBeInTheDocument();
  });

  it('paths page leads with learning paths and explains the two ways to reach marketers', async () => {
    mockApi({ ...asAdmin(), 'GET /v1/admin/packages': () => ({ data: [] }) });
    renderApp('/admin/assignments');
    expect(await screen.findByRole('heading', { name: 'مسیرها و مخاطبان' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /مسیر یادگیری \(پیشنهادی\)/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(await screen.findByRole('button', { name: 'ساخت اولین مسیر' })).toBeInTheDocument();
  });
});
