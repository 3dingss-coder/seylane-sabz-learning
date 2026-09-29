import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

/**
 * §28.2 key journeys on the real seed (catalog from «لیست برندها و محصولات سیلانه سبز» +
 * sample training packages + demo users). Media playback is simulated through the same
 * heartbeat API the player uses (headless Chromium lacks AAC/H.264 codecs).
 */
test.describe.configure({ mode: 'serial' });

const API = 'http://127.0.0.1:5001/v1';
const PASS = 'demo1234';
const ADMIN = '09120000002';
const MANAGER = '09120000003';
const MARKETER = '09120000004';
const FRESH_MARKETER = '09120000007';

// API tokens are cached per user: login is rate-limited to 10/min per IP (spec §21).
const tokens = new Map<string, string>();
async function token(request: APIRequestContext, identifier: string) {
  const cached = tokens.get(identifier);
  if (cached) return cached;
  const r = await request.post(`${API}/auth/login`, { data: { identifier, password: PASS } });
  expect(r.ok(), await r.text()).toBeTruthy();
  const t = ((await r.json()) as { data: { idToken: string } }).data.idToken;
  tokens.set(identifier, t);
  return t;
}

async function login(page: Page, identifier: string) {
  await page.goto('/login');
  await page.getByLabel(/شماره موبایل/).fill(identifier);
  const pw = page.getByLabel('رمز عبور');
  if (await pw.isVisible()) await pw.fill(PASS);
  await page.getByRole('button', { name: 'ورود' }).click();
  // Wait until the session is established before navigating (avoids racing the login call).
  await expect(page).not.toHaveURL(/\/login$/, { timeout: 15_000 });
}

async function expectImagesLoaded(page: Page, selector: string, min: number) {
  const imgs = page.locator(selector);
  await expect(imgs.first()).toBeVisible();
  const all = await imgs.all();
  expect(all.length).toBeGreaterThanOrEqual(min);
  for (const img of all) {
    await expect
      .poll(() =>
        img.evaluate(
          (el) => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0,
        ),
      )
      .toBe(true);
  }
}

test('marketer: home → section → (played) → quiz pass → next section unlocked', async ({
  page,
  request,
}) => {
  await login(page, MARKETER);
  const next = page.getByTestId('next-item');
  await expect(next).toBeVisible();
  await expectImagesLoaded(page, '[data-testid="package-card"] img', 1);

  const t = await token(request, MARKETER);
  const auth = { Authorization: `Bearer ${t}` };
  const home = (await (await request.get(`${API}/me/home`, { headers: auth })).json()) as {
    data: { nextItem: { sectionId: string; packageId: string } };
  };
  const { sectionId, packageId } = home.data.nextItem;

  await next.getByRole('button').click();
  await expect(page).toHaveURL(new RegExp(`/sections/${sectionId}$`));
  await expect(page.getByText('پیشرفت این قسمت')).toBeVisible();

  // Simulate continuous playback with playedDeltaSec heartbeats (+ idempotency keys).
  const sec = (await (
    await request.get(`${API}/me/sections/${sectionId}`, { headers: auth })
  ).json()) as {
    data: { section: { durationSec: number; quizId: string } };
  };
  const dur = sec.data.section.durationSec;
  let pos = 0;
  let completed = false;
  for (let i = 0; i < 19 && !completed; i++) {
    pos = Math.min(dur, pos + 60);
    const r = await request.post(`${API}/me/sections/${sectionId}/progress`, {
      headers: { ...auth, 'Idempotency-Key': `e2e-${sectionId}-${i}` },
      data: { positionSec: pos, playedDeltaSec: 60, ts: new Date().toISOString() },
    });
    expect(r.ok(), `heartbeat ${i}: ${r.status()} ${await r.text()}`).toBeTruthy();
    completed = ((await r.json()) as { data: { completed: boolean } }).data.completed;
  }
  expect(completed).toBe(true);

  // Correct answers come from the admin API only (never shipped to the marketer client).
  const at = await token(request, ADMIN);
  const quiz = (await (
    await request.get(`${API}/admin/quizzes/${sec.data.section.quizId}`, {
      headers: { Authorization: `Bearer ${at}` },
    })
  ).json()) as {
    data: {
      questions: Array<{
        stem: string;
        options: Array<{ key: string; text: string }>;
        answerKey: string;
      }>;
    };
  };

  await page.reload();
  await page.getByTestId('start-quiz').click();
  await page.getByTestId('quiz-start').click();
  for (const q of quiz.data.questions) {
    await expect(page.locator('legend', { hasText: q.stem })).toBeVisible();
    const correct = q.options.find((o) => o.key === q.answerKey)?.text ?? '';
    await page
      .locator('label')
      .filter({ has: page.getByText(correct, { exact: true }) })
      .first()
      .click();
    const nextBtn = page.getByRole('button', { name: /بعدی/ });
    if (await nextBtn.isVisible()) await nextBtn.click();
  }
  await page.getByTestId('quiz-submit').click();
  await page.getByTestId('quiz-confirm').click();
  await expect(page.getByTestId('quiz-result')).toContainText('قبول شدی');

  // Sequential lock: the next section of the package is now open.
  await page.goto(`/packages/${packageId}`);
  const rows = page.getByTestId('section-row');
  await expect(rows.nth(0)).toContainText('تکمیل', { timeout: 15_000 });
  await expect(rows.nth(1)).toBeVisible();
});

test('fresh marketer can open later sections without finishing earlier ones', async ({
  page,
  request,
}) => {
  await login(page, FRESH_MARKETER);
  await page.goto('/learn');
  await page.getByRole('tab', { name: /جدید/ }).click();
  await expect(page.getByTestId('package-card').first()).toBeVisible();
  // Multi-part package (فورمی): no sequential lock, part 2 is open from the start.
  await page.goto('/packages/seed-pkg-formi');
  await expect(page.getByTestId('section-row').nth(1)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/ابتدا قسمت قبل را کامل کنید/)).toHaveCount(0);

  const t = await token(request, FRESH_MARKETER);
  const pk = (await (
    await request.get(`${API}/me/packages/seed-pkg-formi`, {
      headers: { Authorization: `Bearer ${t}` },
    })
  ).json()) as {
    data: { sections: Array<{ quizId: string; state: string }> };
  };
  expect(pk.data.sections.some((s) => s.state === 'locked')).toBe(false);
  // Quizzes are open too: a later section's quiz can be started right away.
  const later = pk.data.sections[1];
  const r = await request.post(`${API}/me/quizzes/${later?.quizId}/attempts`, {
    headers: { Authorization: `Bearer ${t}` },
  });
  expect([200, 201]).toContain(r.status());
});

test('manager: team dashboard, completion report and CSV export', async ({ page }) => {
  await login(page, MANAGER);
  await expect(page).toHaveURL(/\/manager$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('تیم');
  await page.goto('/manager/reports');
  await expect(page.getByText(/ردیف/)).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'خروجی CSV' }).click();
  expect((await download).suggestedFilename()).toMatch(/^completion-report-.*\.csv$/);
});

test('admin: brands with real logos, unassigned tab, package editor', async ({ page }) => {
  await login(page, ADMIN);
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto('/admin/content');
  await expectImagesLoaded(page, '[data-testid="brand-card"] img', 12);
  await page.getByRole('tab', { name: /بدون تخصیص/ }).click();
  await expect(page.getByText(/دارت/).first()).toBeVisible();
  await page.goto('/admin/packages/seed-pkg-formi');
  await expect(page.getByRole('heading', { name: 'آموزش کیت درمانی فورمی' })).toBeVisible();
  await expect(page.getByRole('link', { name: /آزمون/ }).first()).toBeVisible();
});

test('RBAC: marketer cannot use the admin panel (explanation + switch account)', async ({
  page,
}) => {
  await login(page, FRESH_MARKETER);
  await page.goto('/admin/users');
  await expect(page.getByRole('heading', { name: 'پنل ادمین' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'ورود با حساب ادمین' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'کاربران' })).toHaveCount(0);
});
