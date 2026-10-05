/**
 * Lighthouse CI (spec PROMPT 008 DoD + §37: Lighthouse ≥ 90; §27: LCP < 3s).
 * Runs against the production build (`vite preview`, /v1 proxied to the seeded local API).
 * `/` is the marketer Home («کار بعدی») — the login script signs in first and storage is kept.
 */
const path = require('node:path');

module.exports = {
  ci: {
    collect: {
      startServerCommand: 'npx vite preview --host 127.0.0.1 --port 4173 --strictPort',
      startServerReadyPattern: '4173',
      url: ['http://127.0.0.1:4173/login', 'http://127.0.0.1:4173/'],
      numberOfRuns: 3,
      puppeteerScript: './scripts/lhci-login.cjs',
      // puppeteer-core has no bundled browser: use the runner's Chrome (CI exports CHROME_PATH).
      chromePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
      puppeteerLaunchOptions: { args: ['--no-sandbox'] },
      settings: {
        // Keep the session created by the login script.
        disableStorageReset: true,
        locale: 'fa',
        chromeFlags: '--no-sandbox',
      },
    },
    assert: {
      assertions: {
        'categories:performance': ['error', { minScore: 0.9 }],
        'categories:accessibility': ['error', { minScore: 0.9 }],
        'categories:best-practices': ['error', { minScore: 0.9 }],
        'largest-contentful-paint': ['error', { maxNumericValue: 3000 }],
      },
    },
    // Absolute: a relative outputDir resolves against the CWD of whatever runs lhci, so the
    // reports landed somewhere the workflow's upload step never looked and every run — including
    // the green ones — warned "No files were found: apps/web/.lighthouseci". That warning hid the
    // one artifact that says *which* assertion failed and by how much.
    upload: { target: 'filesystem', outputDir: path.join(__dirname, '.lighthouseci') },
  },
};
