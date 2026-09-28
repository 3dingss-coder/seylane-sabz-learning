/**
 * Lighthouse CI puppeteer script: signs in as a seeded demo marketer (user 05 has demo progress)
 * before `/` is audited. Runs before every URL; skips when a session already exists.
 */
module.exports = async (browser, context) => {
  const origin = new URL(context.url).origin;
  const page = await browser.newPage();
  try {
    await page.goto(`${origin}/login`, { waitUntil: 'networkidle0' });
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
