import { defineConfig } from 'vitest/config';

/**
 * Emulator suite (D37): Security Rules tests + the full API suite against the Firestore
 * emulator. Run via: npx firebase-tools emulators:exec --only firestore,storage "npm run test:emulator -w functions"
 */
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts', 'test-emulator/**/*.test.ts'],
    environment: 'node',
    env: { TEST_BACKEND: 'firestore' },
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 180_000,
  },
});
