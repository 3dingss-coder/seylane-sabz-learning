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
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] }, testIgnore: /journey\.spec/ },
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: [
    {
      // Real API on the in-memory store, freshly seeded with the catalog + sample packages + demo users.
      command: 'npx tsx src/local.ts',
      cwd: '../../functions',
      url: 'http://127.0.0.1:5001/v1/health',
      env: { LOCAL_PERSIST: 'false', RESEED: 'true', PORT: '5001' },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'npm run build && npx vite preview --host 127.0.0.1 --port 4173 --strictPort',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
  ],
});
