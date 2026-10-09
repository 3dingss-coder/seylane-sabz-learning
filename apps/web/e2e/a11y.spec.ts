import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/** Public auth and staff-boundary flows; authenticated panel E2E requires an approved IdP/session. */
async function expectNoViolations(page: Page) {
  await page.waitForTimeout(400);
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .exclude('iframe')
    .analyze();
  const summary = violations.map(
    (violation) =>
      `${violation.id} (${violation.impact}): ${violation.nodes.map((node) => node.target.join(' ')).join(' | ')}`,
  );
  expect(summary, summary.join('\n')).toEqual([]);
}

test('phone-only login page discloses its identity limitation accessibly', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('button', { name: 'ورود' })).toBeVisible();
  await expect(page.getByText(/شمارهٔ تلفن به‌تنهایی هویت را ثابت نمی‌کند/)).toBeVisible();
  await expect(page.getByLabel(/رمز|کد تأیید/)).toHaveCount(0);
  await expectNoViolations(page);
});

test('sign-up page explains the unverified phone and residence picker', async ({ page }) => {
  await page.goto('/register');
  await expect(page.getByRole('button', { name: 'ارسال درخواست ثبت‌نام' })).toBeVisible();
  await expect(page.getByText(/شماره تأیید نمی‌شود/)).toBeVisible();
  await expectNoViolations(page);

  await page.getByLabel('انتخاب محل فعالیت شما').click();
  await expect(page.getByRole('listbox', { name: 'استان‌های ایران' })).toBeVisible();
  await expectNoViolations(page);

  await page.getByRole('combobox', { name: 'جستجوی استان' }).fill('یزد');
  await page.getByRole('option', { name: 'یزد', exact: true }).click();
  await page.getByLabel('شهر').click();
  await expect(page.getByRole('listbox', { name: 'شهرهای استان یزد' })).toBeVisible();
  await expectNoViolations(page);
});

test('unauthenticated admin panel shows no password/OTP form', async ({ page }) => {
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'پنل ادمین' })).toBeVisible();
  await expect(page.getByLabel(/رمز|کد تأیید/)).toHaveCount(0);
  await expectNoViolations(page);
});
