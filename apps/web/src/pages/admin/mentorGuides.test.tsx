import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { session } from '@/lib/session';
import type { Me, MentorGuide, MentorGuideRow } from '@/lib/types';
import { marketer } from '@/test/fixtures';
import { mockApi } from '@/test/mockApi';
import { renderApp } from '@/test/renderApp';

const admin: Me = { ...marketer, id: 'a1', name: 'ادمین', role: 'admin', teamId: null };

const box = (over: Partial<MentorGuide> = {}): MentorGuide => ({
  kind: 'product',
  targetId: 'prd-1',
  title: '',
  enabled: true,
  tone: 'coach',
  personaNote: 'مثل یک کارشناس پوست حرف بزن',
  summary: 'مخصوص پوست خشک',
  keyPoints: ['جذب سریع'],
  sellingPoints: ['ماندگاری ۲۴ ساعته'],
  objections: [{ objection: 'قیمت بالاست', answer: 'روی طول مدت مصرف تأکید کن' }],
  faq: [],
  dos: ['روی آبرسانی تأکید کن'],
  donts: ['ادعای درمانی نکن'],
  keywords: [],
  priority: 1,
  quizAnswers: 'inherit',
  updatedBy: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  ...over,
});

const rows: MentorGuideRow[] = [
  {
    key: 'brand:b1',
    kind: 'brand',
    targetId: 'b1',
    name: 'آتل',
    parentName: null,
    imageUrl: null,
    code: null,
    defined: true,
    enabled: true,
    tone: 'professional',
    priority: 1,
    quizAnswers: 'inherit',
    filled: 6,
    updatedAt: '2026-10-01T00:00:00.000Z',
    updatedBy: null,
  },
  {
    key: 'product:prd-1',
    kind: 'product',
    targetId: 'prd-1',
    name: 'کرم مرطوب کننده',
    parentName: 'آتل',
    imageUrl: null,
    code: '1024',
    defined: false,
    enabled: false,
    tone: 'friendly',
    priority: 0,
    quizAnswers: 'inherit',
    filled: 0,
    updatedAt: null,
    updatedBy: null,
  },
];

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
    'GET /v1/admin/brands': () => ({ data: [] }),
    'GET /v1/admin/products': () => ({ data: [] }),
    'GET /v1/admin/teams': () => ({ data: [] }),
    'GET /v1/admin/users': () => ({ data: [] }),
  };
};

describe('admin: رفتار منتور (behaviour boxes)', () => {
  it('lists every brand and product with a defined / default badge', async () => {
    mockApi({ ...asAdmin(), 'GET /v1/admin/mentor/guides': () => ({ data: rows }) });
    renderApp('/admin/mentor');
    expect(await screen.findByRole('heading', { name: 'رفتار منتور' })).toBeInTheDocument();

    const cards = await screen.findAllByTestId('guide-row');
    const brandCard = cards.find((c) => c.dataset.guideKey === 'brand:b1') as HTMLElement;
    expect(within(brandCard).getByText('رسمی و کارشناسی')).toBeInTheDocument();
    expect(
      within(brandCard).getByRole('button', { name: 'ویرایش رفتار منتور' }),
    ).toBeInTheDocument();

    const productCard = cards.find((c) => c.dataset.guideKey === 'product:prd-1') as HTMLElement;
    expect(within(productCard).getByText('پیش‌فرض منتور')).toBeInTheDocument();
    expect(
      within(productCard).getByRole('button', { name: 'تعریف رفتار منتور' }),
    ).toBeInTheDocument();
  });

  it('opens the editor for a product and saves the box to /admin/mentor/guides/product/:id', async () => {
    let saved: unknown = null;
    mockApi({
      ...asAdmin(),
      'GET /v1/admin/mentor/guides': () => ({ data: rows }),
      'GET /v1/admin/mentor/guides/product/prd-1': () => ({
        data: { guide: box(), defined: false, name: 'کرم مرطوب کننده' },
      }),
      'PUT /v1/admin/mentor/guides/product/prd-1': (body) => {
        saved = body;
        return { data: { guide: box(), defined: true, name: 'کرم مرطوب کننده' } };
      },
    });
    renderApp('/admin/mentor');
    const productCard = (await screen.findAllByTestId('guide-row')).find(
      (c) => c.dataset.guideKey === 'product:prd-1',
    ) as HTMLElement;
    fireEvent.click(within(productCard).getByRole('button', { name: 'تعریف رفتار منتور' }));

    const dialog = await screen.findByRole('dialog', {
      name: 'رفتار منتور — کرم مرطوب کننده',
    });
    expect(within(dialog).getByDisplayValue('مثل یک کارشناس پوست حرف بزن')).toBeInTheDocument();
    expect(within(dialog).getByDisplayValue('ادعای درمانی نکن')).toBeInTheDocument();
    expect(within(dialog).getByDisplayValue('قیمت بالاست')).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'ذخیره' }));
    await screen.findByText('جعبه‌ی رفتار منتور ذخیره شد.');
    expect(saved).toMatchObject({
      tone: 'coach',
      donts: ['ادعای درمانی نکن'],
      objections: [{ objection: 'قیمت بالاست', answer: 'روی طول مدت مصرف تأکید کن' }],
    });
  });

  it('shows a readable preview of exactly what the mentor will receive', async () => {
    mockApi({
      ...asAdmin(),
      'GET /v1/admin/mentor/guides': () => ({ data: rows }),
      'GET /v1/admin/mentor/guides/brand/b1': () => ({
        data: { guide: box({ kind: 'brand', targetId: 'b1' }), defined: true, name: 'آتل' },
      }),
    });
    renderApp('/admin/mentor');
    const brandCard = (await screen.findAllByTestId('guide-row')).find(
      (c) => c.dataset.guideKey === 'brand:b1',
    ) as HTMLElement;
    fireEvent.click(within(brandCard).getByRole('button', { name: 'ویرایش رفتار منتور' }));
    const dialog = await screen.findByRole('dialog', { name: 'رفتار منتور — آتل' });
    fireEvent.click(
      within(dialog).getByRole('button', { name: /پیش‌نمایش: متنی که به منتور داده می‌شود/ }),
    );
    expect(await within(dialog).findByText(/هرگز نگو: ادعای درمانی نکن/)).toBeInTheDocument();
    expect(within(dialog).getByText(/لحن گفتار: مربی فروش/)).toBeInTheDocument();
  });

  it('reaches the global default box from the top card', async () => {
    mockApi({
      ...asAdmin(),
      'GET /v1/admin/mentor/guides': () => ({ data: rows }),
      'GET /v1/admin/mentor/guides/global': () => ({
        data: {
          guide: box({ kind: 'global', targetId: null }),
          defined: false,
          name: 'رفتار پیش‌فرض منتور',
        },
      }),
    });
    renderApp('/admin/mentor');
    fireEvent.click(await screen.findByRole('button', { name: 'تعریف کن' }));
    expect(await screen.findByRole('dialog', { name: 'رفتار پیش‌فرض منتور' })).toBeInTheDocument();
    // The global box is the fallback — it must never be deletable.
    expect(screen.queryByRole('button', { name: 'حذف جعبه' })).not.toBeInTheDocument();
  });
});

describe('mentor page is chat only', () => {
  it('shows the chat and no analysis / tips tabs', async () => {
    localStorage.setItem('ssl.refresh', 'r1');
    mockApi({
      'POST /v1/auth/refresh': () => ({
        data: { user: marketer, idToken: 't1', refreshToken: 'r2', expiresIn: 3600 },
      }),
      'GET /v1/me': () => ({ data: marketer }),
      'GET /v1/me/mentor/history': () => ({ data: [] }),
      'GET /v1/me/home': () => ({
        data: {
          nextItem: null,
          totalProgress: 0,
          counts: { inProgress: 0, new: 0, completed: 0, overdue: 0 },
          pointsBalance: 0,
          packages: [],
        },
      }),
      'GET /v1/me/notifications': () => ({ data: { unread: 0, items: [] } }),
      'GET /v1/me/messages': () => ({ data: [] }),
    });
    renderApp('/mentor');
    expect(await screen.findByRole('heading', { name: 'منتور' })).toBeInTheDocument();
    expect(screen.getByLabelText('سؤال شما')).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'تحلیل عملکرد' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'پیشنهادها' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'چت با منتور' })).not.toBeInTheDocument();
  });
});
