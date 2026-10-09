import { expect, test } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

const uniquePhone = () => `09${String(Date.now()).slice(-9)}`;

test('phone-only login does not reveal account state or issue a session', async ({ page }) => {
  await page.goto('/login');
  const phone = page.getByLabel('شماره موبایل');
  const submit = page.getByRole('button', { name: 'ورود' });

  await phone.fill('09120000001'); // seeded privileged fixture: its number is not a credential
  await submit.click();
  const knownNumberMessage = await page.getByRole('alert').textContent();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByLabel('نام و نام خانوادگی')).toHaveCount(0);

  await phone.fill('09990000000');
  await submit.click();
  await expect(page.getByRole('alert')).toHaveText(knownNumberMessage ?? '');
  await expect(page).toHaveURL(/\/login$/);
  expect(await page.evaluate(() => localStorage.getItem('ssl.refresh'))).toBeNull();
});

test('self-registration has a generic response, creates no session, and asks for no password or OTP', async ({
  page,
}) => {
  await page.goto('/register');
  await page.getByLabel('نام و نام خانوادگی').fill('آزمون مرورگر');
  await page.getByLabel('شماره موبایل').fill(uniquePhone());
  await expect(page.getByLabel(/رمز|کد تأیید/)).toHaveCount(0);

  await page.getByLabel('انتخاب محل فعالیت شما').click();
  const provinces = page.getByRole('listbox', { name: 'استان‌های ایران' });
  await expect(provinces).toBeVisible();
  await page.getByRole('combobox', { name: 'جستجوی استان' }).fill('یزد');
  await page.getByRole('option', { name: 'یزد', exact: true }).click();
  await page.getByLabel('شهر').click();
  const cities = page.getByRole('listbox', { name: 'شهرهای استان یزد' });
  await page.getByRole('combobox', { name: 'جستجوی شهر' }).fill('یزد');
  await cities.getByRole('option', { name: 'یزد', exact: true }).click();
  const submit = page.getByRole('button', { name: 'ارسال درخواست ثبت‌نام' });
  await submit.click();
  const newNumberMessage = await page.getByRole('status').textContent();
  await expect(page).toHaveURL(/\/register$/);
  await expect(page.getByRole('status')).toContainText(
    /این پاسخ وجود یا نبود حساب فعلی را نشان نمی‌دهد/,
  );
  await expect(page.getByLabel(/رمز|کد تأیید/)).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('ssl.refresh'))).toBeNull();

  await page.getByLabel('شماره موبایل').fill('09120000001'); // seeded superadmin fixture
  await submit.click();
  await expect(page.getByRole('status')).toHaveText(newNumberMessage ?? '');
  await expect(page).toHaveURL(/\/register$/);
  expect(await page.evaluate(() => localStorage.getItem('ssl.refresh'))).toBeNull();
});

test('staff panel explains the unavailable identity path instead of asking for a password', async ({
  page,
}) => {
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'پنل ادمین' })).toBeVisible();
  await expect(
    page.getByText(/شمارهٔ تلفن به‌تنهایی هویت یا نقش مدیریتی را ثابت نمی‌کند/),
  ).toBeVisible();
  await expect(page.getByLabel(/رمز|کد تأیید/)).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'رفتن به ورود بازاریاب' })).toBeVisible();
});
