/**
 * Lighthouse CI puppeteer script (runs before every audited URL, storage is kept):
 * - `/login` is audited signed-out (session cleared);
 * - every other URL is audited as the seeded demo marketer 09120000005 (has demo progress).
 */
module.exports = async (browser, context) => {
  const target = new URL(context.url);
  const page = await browser.newPage();
  try {
    await page.goto(`${target.origin}/login`, { waitUntil: 'networkidle0' });
    if (target.pathname === '/login') {
      await page.evaluate(() => localStorage.clear());
      return;
    }
    const hasSession = await page.evaluate(() => !!localStorage.getItem('ssl.refresh'));
    if (hasSession) return;
    await page.type('input[autocomplete="username"]', '09120000005');
    await page.type('input[type="password"]', 'demo1234');
    await Promise.all([
      page.waitForFunction(() => location.pathname !== '/login', { timeout: 20000 }),
      page.click('button[type="submit"]'),
    ]);
  } finally {
    await page.close();
  }
};
