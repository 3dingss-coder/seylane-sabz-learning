import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CRON_JOBS, CRON_SCHEDULES, runCron } from '../src/services/cron';
import { createCtx } from './support/ctx';

/** Walks up from the test's cwd — avoids `import.meta` (the functions project compiles to CJS). */
function findUp(name: string, from = process.cwd()): string {
  let dir = from;
  for (let i = 0; i < 6; i++) {
    const p = path.join(dir, name);
    if (existsSync(p)) return p;
    dir = path.dirname(dir);
  }
  throw new Error(`${name} not found above ${from}`);
}

describe('cron wiring on the deployed worker', () => {
  const WRANGLER = findUp('wrangler.toml');

  // The block is commented out until the Cloudflare plan supports cron triggers, so the test
  // accepts either form — what it really checks is that the declared list and the dispatched
  // list never drift apart, active or dormant.
  it('every schedule the code dispatches is declared in wrangler.toml', () => {
    const toml = readFileSync(WRANGLER, 'utf8');
    const active = (() => {
      const start = toml.indexOf('[triggers]');
      return start === -1
        ? ''
        : (toml.slice(start, start + 400).match(/crons\s*=\s*\[([^\]]*)\]/)?.[1] ?? '');
    })();
    const commented = [...toml.matchAll(/^#\s*crons\s*=\s*\[([^\]]*)\]/gm)]
      .map((m) => m[1] ?? '')
      .join(',');
    const source = active.trim() !== '' ? active : commented;
    expect(
      source.trim(),
      'wrangler.toml must declare [triggers] crons (active or commented)',
    ).not.toBe('');
    const declared = [...source.matchAll(/"([^"]+)"/g)]
      .map((m) => m[1])
      .filter((s): s is string => Boolean(s));
    expect([...declared].sort()).toEqual([...CRON_SCHEDULES].sort());
  });

  it('keeps production guardrails on and the R2 migration out of scheduled jobs', () => {
    const toml = readFileSync(WRANGLER, 'utf8');
    expect(toml).toMatch(/^APP_ENV\s*=\s*"prod"$/m);
    expect(toml).toMatch(/^PLAYBACK_BUDGET\s*=\s*"on"$/m);
    expect(toml).toMatch(/^RATE_LIMIT_SCALE\s*=\s*"1"$/m);
    expect(toml).toMatch(/^R2_MIGRATE_PURGE\s*=\s*"off"$/m);
    expect(Object.values(CRON_JOBS).flat()).not.toContain('migrate-blobs');
  });

  it('dispatches the job bound to each expression and survives an unknown one', async () => {
    const ctx = await createCtx();
    for (const [cron, names] of Object.entries(CRON_JOBS)) {
      const r = await runCron(ctx.deps, cron);
      expect(Object.keys(r.jobs).sort()).toEqual([...names].sort());
      for (const n of names) expect(r.jobs[n]?.ok, `${n} failed: ${r.jobs[n]?.error}`).toBe(true);
    }
    expect((await runCron(ctx.deps, '0 0 1 1 *')).jobs).toEqual({});
  });
});
