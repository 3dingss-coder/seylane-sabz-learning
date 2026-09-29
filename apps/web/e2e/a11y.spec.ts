import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * §16 accessibility / §28 "axe — WCAG AA" on the real seed, in a real browser (includes colour
 * contrast, which jsdom cannot evaluate — see src/pages/a11y.test.tsx for the structural checks).
 */
test.describe.configure({ mode: 'serial' });

const PASS = 'demo1234';

async function login(page: Page, identifier: string) {
  await page.goto('/login');
  await page.getByLabel(/شماره موبایل/).fill(identifier);
  const pw = page.getByLabel('رمز عبور');
  if (await pw.isVisible()) await pw.fill(PASS);
  await page.getByRole('button', { name: 'ورود' }).click();
  await expect(page).not.toHaveURL(/\/login$/, { timeout: 15_000 });
}

async function expectNoViolations(page: Page) {
  // Let entry animations finish so contrast is measured on final colours.
  await page.waitForTimeout(400);
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    // Third-party YouTube iframe content is outside our control.
    .exclude('iframe')
    .analyze();
  const summary = violations.map(
    (v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`,
  );
  expect(summary, summary.join('\n')).toEqual([]);
}

test('login page', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('button', { name: 'ورود' })).toBeVisible();
  await expectNoViolations(page);
});

test('marketer: home, catalog, package page', async ({ page }) => {
  // User 05 has demo progress, so cards, progress bars and badges are all rendered.
  await login(page, '09120000005');
  await expect(page.getByTestId('next-item')).toBeVisible();
  await expectNoViolations(page);
  await page.getByTestId('package-card').first().click();
  await expect(page.getByTestId('section-row').first()).toBeVisible();
  await expectNoViolations(page);
});

test('manager dashboard', async ({ page }) => {
  await login(page, '09120000003');
  await expect(page).toHaveURL(/\/manager/);
  await expect(page.getByRole('heading').first()).toBeVisible();
  await expectNoViolations(page);
});

test('admin dashboard and content list', async ({ page }) => {
  await login(page, '09120000002');
  await expect(page).toHaveURL(/\/admin/);
  await expect(page.getByRole('heading').first()).toBeVisible();
  await expectNoViolations(page);
});
