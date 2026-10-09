/**
 * Lighthouse CI for public routes only. The app intentionally has no public sign-in factor;
 * authenticated pages are not reachable through a demo password or phone-only shortcut.
 */
module.exports = {
  ci: {
    collect: {
      startServerCommand: 'npx vite preview --host 127.0.0.1 --port 4173 --strictPort',
      startServerReadyPattern: '4173',
      url: ['http://127.0.0.1:4173/login', 'http://127.0.0.1:4173/register'],
      numberOfRuns: 3,
      chromePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
      puppeteerLaunchOptions: { args: ['--no-sandbox'] },
      settings: {
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
    upload: { target: 'filesystem', outputDir: './.lighthouseci' },
  },
};
