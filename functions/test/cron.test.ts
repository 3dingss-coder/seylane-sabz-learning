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

  it('every schedule the code dispatches is declared in wrangler.toml', () => {
    const toml = readFileSync(WRANGLER, 'utf8');
    const start = toml.indexOf('[triggers]');
    expect(start, 'wrangler.toml must declare [triggers] crons').toBeGreaterThan(-1);
    const crons = /crons\s*=\s*\[([^\]]*)\]/.exec(toml.slice(start))?.[1] ?? '';
    const declared = [...crons.matchAll(/"([^"]+)"/g)]
      .map((m) => m[1])
      .filter((s): s is string => Boolean(s));
    expect([...declared].sort()).toEqual([...CRON_SCHEDULES].sort());
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
