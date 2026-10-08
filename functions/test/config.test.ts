import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config';

describe('runtime safety configuration', () => {
  it('ignores test-only playback and rate-limit bypasses in production', () => {
    const config = loadConfig({
      APP_ENV: 'prod',
      DATA_BACKEND: 'd1',
      PLAYBACK_BUDGET: 'off',
      RATE_LIMIT_SCALE: '20',
    } as NodeJS.ProcessEnv);
    expect(config.playbackBudget).toBe(true);
    expect(config.rateLimitScale).toBe(1);
  });

  it('keeps playback and rate-limit overrides available to disposable local/E2E backends', () => {
    const config = loadConfig({
      APP_ENV: 'test',
      DATA_BACKEND: 'memory',
      PLAYBACK_BUDGET: 'off',
      RATE_LIMIT_SCALE: '5',
    } as NodeJS.ProcessEnv);
    expect(config.playbackBudget).toBe(false);
    expect(config.rateLimitScale).toBe(5);
  });
});
