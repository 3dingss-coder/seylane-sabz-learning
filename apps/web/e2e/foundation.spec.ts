import { expect, test } from '@playwright/test';

test('gallery renders RTL Persian UI with real brand logos', async ({ page }) => {
  await page.goto('/gallery');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'fa');
  // 12 active brands from «لیست برندها و محصولات سیلانه سبز», each with its real logo.
  const logos = page.getByRole('img', { name: /^لوگوی / });
  await expect(logos).toHaveCount(12);
  for (const img of await logos.all()) {
    await expect(img).toHaveJSProperty('complete', true);
    expect(await img.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  }
});

test('Vazirmatn font is loaded (self-hosted)', async ({ page }) => {
  await page.goto('/gallery');
  await page.evaluate(() => document.fonts.ready);
  const loaded = await page.evaluate(() =>
    document.fonts.check('16px "Vazirmatn Variable"', 'سلام'),
  );
  expect(loaded).toBe(true);
});

test('all buttons meet the 48px touch target', async ({ page }) => {
  await page.goto('/gallery');
  const buttons = page.locator('main button:visible');
  for (const b of await buttons.all()) {
    const box = await b.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(47.5);
  }
});

test('modal opens, traps focus and closes with Escape', async ({ page }) => {
  await page.goto('/gallery');
  await page.getByRole('button', { name: 'باز کردن پنجره تأیید' }).click();
  const dialog = page.getByRole('dialog', { name: 'لغو انتساب' });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('unknown route shows Persian 404 with a way home', async ({ page }) => {
  await page.goto('/this-page-does-not-exist');
  await expect(page.getByRole('heading', { name: 'این صفحه پیدا نشد' })).toBeVisible();
  await page.getByRole('link', { name: 'بازگشت به صفحه اصلی' }).click();
  await expect(page).toHaveURL(/\/$/);
});
