import { fireEvent, screen, waitFor, within } from '@testing-library/react';
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

const libItem = (over: Record<string, unknown> = {}) => ({
  id: 'lib1',
  kind: 'video',
  title: 'آموزش کامل فیلر شات دارت',
  originalName: 'dart.mp4',
  mime: 'video/mp4',
  sizeBytes: 7 * 1024 * 1024,
  durationSec: 451,
  createdAt: '2026-10-03T00:00:00.000Z',
  brandId: 'b1',
  productId: null,
  brandName: 'آتل',
  productName: null,
  assignmentInferred: false,
  usedBy: [],
  ...over,
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
    const guide = await screen.findByTestId('publish-guide', {}, { timeout: 5000 });
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

  const libraryMocks = (extra: Record<string, (body?: unknown) => never> | object = {}) => ({
    ...asAdmin(),
    'GET /v1/admin/packages/p1': () => ({ data: detail({}, []) }),
    'GET /v1/admin/assignments': () => ({ data: [] }),
    // The mock router matches on the path first, so one list serves both pickers (the real API
    // filters by ?kind=). The video picker simply also lists the audio file here.
    'GET /v1/admin/media/library': () => ({
      data: [
        libItem(),
        libItem({ id: 'lib2', title: 'ویدیوی برند دیگر', brandId: 'b2', brandName: 'پیکسل' }),
        libItem({ id: 'lib3', title: 'ویدیوی بدون برند', brandId: null, brandName: null }),
        libItem({ id: 'lib4', kind: 'audio', title: 'پادکست آتل' }),
      ],
    }),
    ...extra,
  });

  it('choosing a library file in the new-section dialog creates the section right away', async () => {
    let posted: Record<string, unknown> | null = null;
    mockApi(
      libraryMocks({
        'POST /v1/admin/packages/p1/sections': (body: unknown) => {
          posted = body as Record<string, unknown>;
          return { status: 201, data: { id: 's9' } };
        },
      }),
    );
    renderApp('/admin/packages/p1');
    fireEvent.click(
      (await screen.findAllByRole('button', { name: 'افزودن قسمت' }))[0] as HTMLElement,
    );
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'انتخاب از کتابخانه رسانه' }));

    // Opens filtered to the package's brand: same-brand and unassigned files, not other brands.
    expect(await screen.findByText('آموزش کامل فیلر شات دارت')).toBeInTheDocument();
    expect(screen.getByText('ویدیوی بدون برند')).toBeInTheDocument();
    expect(screen.queryByText('ویدیوی برند دیگر')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('آموزش کامل فیلر شات دارت'));
    // No «ذخیره قسمت» needed: picking is the decision.
    await screen.findByText(/قسمت اضافه شد/);
    expect(posted).toMatchObject({
      title: 'آموزش کامل فیلر شات دارت',
      mediaId: 'lib1',
      mediaType: 'video',
      mediaSource: 'file',
      durationSec: 451,
    });
  });

  it('an empty training offers the library and picking a file adds the section in one click', async () => {
    let posted: Record<string, unknown> | null = null;
    mockApi(
      libraryMocks({
        'POST /v1/admin/packages/p1/sections': (body: unknown) => {
          posted = body as Record<string, unknown>;
          return { status: 201, data: { id: 's9' } };
        },
      }),
    );
    renderApp('/admin/packages/p1');
    await screen.findByText('هنوز قسمتی ندارد');
    fireEvent.click(screen.getByRole('button', { name: 'انتخاب از کتابخانه رسانه' }));
    // Both videos and audio are offered here.
    expect(await screen.findByText('پادکست آتل')).toBeInTheDocument();
    fireEvent.click(screen.getByText('پادکست آتل'));
    await screen.findByText(/قسمت از کتابخانه اضافه شد/);
    expect(posted).toMatchObject({ title: 'پادکست آتل', mediaId: 'lib4', mediaType: 'audio' });
  });

  it('a library file can be added to a training from the library', async () => {
    let posted: Record<string, unknown> | null = null;
    mockApi({
      ...asAdmin(),
      'GET /v1/admin/media/library': () => ({ data: [libItem()] }),
      'GET /v1/admin/media/library/lib1/preview-url': () => ({
        data: { url: '/x.mp4', mime: 'video/mp4', kind: 'video' },
      }),
      'GET /v1/admin/packages?brandId=b1': () => ({
        data: [
          { id: 'p1', title: 'آموزش آتل', brandId: 'b1', productId: null, status: 'draft' },
          { id: 'p2', title: 'قدیمی', brandId: 'b1', productId: null, status: 'archived' },
        ],
      }),
      'POST /v1/admin/packages/p1/sections': (body) => {
        posted = body as Record<string, unknown>;
        return { status: 201, data: { id: 's9' } };
      },
    });
    renderApp('/admin/media');
    fireEvent.click(await screen.findByText('آموزش کامل فیلر شات دارت'));
    const select = await screen.findByLabelText('آموزش');
    await screen.findByRole('option', { name: /آموزش آتل/ });
    expect(screen.queryByRole('option', { name: /قدیمی/ })).not.toBeInTheDocument(); // archived hidden
    fireEvent.change(select, { target: { value: 'p1' } });
    fireEvent.click(screen.getByRole('button', { name: 'افزودن به آموزش' }));
    expect(await screen.findByText(/به آموزش «آموزش آتل» اضافه شد/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'رفتن به آموزش' })).toHaveAttribute(
      'href',
      '/admin/packages/p1',
    );
    expect(posted).toMatchObject({
      title: 'آموزش کامل فیلر شات دارت',
      mediaId: 'lib1',
      mediaType: 'video',
      mediaSource: 'file',
      durationSec: 451,
    });
  });

  it('a library file can start a brand-new training: package + section in one click', async () => {
    const calls: string[] = [];
    let pkgBody: Record<string, unknown> | null = null;
    mockApi({
      ...asAdmin(),
      'GET /v1/admin/media/library': () => ({ data: [libItem()] }),
      'GET /v1/admin/media/library/lib1/preview-url': () => ({
        data: { url: '/x.mp4', mime: 'video/mp4', kind: 'video' },
      }),
      'GET /v1/admin/packages?brandId=b1': () => ({ data: [] }),
      'POST /v1/admin/packages': (body) => {
        calls.push('package');
        pkgBody = body as Record<string, unknown>;
        return { status: 201, data: { id: 'pNew', title: 'آموزش کامل فیلر شات دارت' } };
      },
      'POST /v1/admin/packages/pNew/sections': () => {
        calls.push('section');
        return { status: 201, data: { id: 's1' } };
      },
    });
    renderApp('/admin/media');
    fireEvent.click(await screen.findByText('آموزش کامل فیلر شات دارت'));
    fireEvent.change(await screen.findByLabelText('آموزش'), { target: { value: '__new__' } });
    fireEvent.click(screen.getByRole('button', { name: 'ساخت آموزش و قسمت' }));
    expect(await screen.findByRole('link', { name: 'رفتن به آموزش' })).toHaveAttribute(
      'href',
      '/admin/packages/pNew',
    );
    expect(calls).toEqual(['package', 'section']);
    expect(pkgBody).toMatchObject({ title: 'آموزش کامل فیلر شات دارت', brandId: 'b1' });
  });

  it('does not leave an empty draft behind when the section cannot be created', async () => {
    const calls: string[] = [];
    mockApi({
      ...asAdmin(),
      'GET /v1/admin/media/library': () => ({ data: [libItem()] }),
      'GET /v1/admin/media/library/lib1/preview-url': () => ({
        data: { url: '/x.mp4', mime: 'video/mp4', kind: 'video' },
      }),
      'GET /v1/admin/packages?brandId=b1': () => ({ data: [] }),
      'POST /v1/admin/packages': () => ({
        status: 201,
        data: { id: 'pNew', title: 'آموزش کامل فیلر شات دارت' },
      }),
      'POST /v1/admin/packages/pNew/sections': () => ({
        error: { code: 'VALIDATION', message: 'فایل انتخاب‌شده آماده نیست.' },
      }),
      'POST /v1/admin/packages/pNew/archive': () => {
        calls.push('archive');
        return { data: {} };
      },
    });
    renderApp('/admin/media');
    fireEvent.click(await screen.findByText('آموزش کامل فیلر شات دارت'));
    fireEvent.change(await screen.findByLabelText('آموزش'), { target: { value: '__new__' } });
    fireEvent.click(screen.getByRole('button', { name: 'ساخت آموزش و قسمت' }));
    expect(await screen.findByText('فایل انتخاب‌شده آماده نیست.')).toBeInTheDocument();
    expect(calls).toEqual(['archive']);
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

  it('users page shows the sign-up residence, searches by it and lets the admin correct it', async () => {
    const withResidence: Me = { ...marketer, province: 'خراسان رضوی', city: 'نیشابور' };
    const without: Me = { ...marketer, id: 'u2', name: 'حسن بی‌شهر', province: null, city: null };
    const { calls } = mockApi({
      ...asAdmin(),
      'GET /v1/admin/users': () => ({ data: [withResidence, without] }),
    });
    renderApp('/admin/users');
    expect(await screen.findByText('خراسان رضوی • نیشابور')).toBeInTheDocument();
    // Accounts created before the field existed show a dash, never «null».
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);

    // Searching by city narrows the table down to that marketer.
    fireEvent.change(screen.getByLabelText('جستجو'), { target: { value: 'نیشابور' } });
    expect(screen.queryByText('حسن بی‌شهر')).toBeNull();

    // The edit dialog carries the residence and sends it back (null clears the pair).
    // (DataTable renders a desktop table and a mobile card list, hence «all».)
    const [editButton] = screen.getAllByRole('button', { name: `ویرایش ${withResidence.name}` });
    if (!editButton) throw new Error('edit button not rendered');
    fireEvent.click(editButton);
    const dialog = await screen.findByRole('dialog', { name: `ویرایش ${withResidence.name}` });
    expect(within(dialog).getByLabelText('محل فعالیت')).toHaveTextContent('خراسان رضوی');
    fireEvent.click(within(dialog).getByRole('button', { name: 'پاک کردن محل فعالیت' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'ذخیره' }));
    await waitFor(() =>
      expect(calls.find((c) => c.key === 'PATCH /v1/admin/users/u1')?.body).toMatchObject({
        province: null,
        city: null,
      }),
    );
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
