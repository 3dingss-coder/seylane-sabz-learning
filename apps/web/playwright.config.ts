import { defineConfig, devices } from '@playwright/test';

// E2E runs against the production build served by `vite preview` (real synced assets).
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    locale: 'fa-IR',
    trace: 'retain-on-failure',
  },
  projects: [
    // Seeded journeys mutate server state → run them once (desktop) against a fresh seed.
    // Seeded journeys + axe run once (desktop); foundation checks run on every engine.
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 7'] },
      testIgnore: /(journey|a11y)\.spec/,
    },
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    // iOS is supported as a PWA (spec §22) → Safari engine on an iPhone profile.
    { name: 'mobile-webkit', use: { ...devices['iPhone 13'] }, testMatch: /foundation\.spec/ },
  ],
  webServer: [
    {
      // Real API on the in-memory store, freshly seeded with the catalog + sample packages + demo users.
      command: 'npx tsx src/local.ts',
      cwd: '../../functions',
      url: 'http://127.0.0.1:5001/v1/health',
      // PLAYBACK_BUDGET=off: journeys simulate minutes of playback in seconds (memory backend only).
      // RATE_LIMIT_SCALE: every spec logs in from 127.0.0.1 (login is 10/min/IP) — memory backend only.
      env: {
        LOCAL_PERSIST: 'false',
        RESEED: 'true',
        PORT: '5001',
        PLAYBACK_BUDGET: 'off',
        RATE_LIMIT_SCALE: '5',
      },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      // CI builds in a dedicated workflow step (like the Lighthouse job) so a slow runner can't
      // eat the server start-up budget ("Timed out waiting from config.webServer"). Locally the
      // build still runs here so `npm run test:e2e` works from a clean checkout.
      command: process.env.CI
        ? 'npx vite preview --host 127.0.0.1 --port 4173 --strictPort'
        : 'npm run build && npx vite preview --host 127.0.0.1 --port 4173 --strictPort',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: !process.env.CI,
      timeout: 300_000,
    },
  ],
});
