#!/usr/bin/env node
/**
 * PHASE-6 §6.4/DoD 2 — «هیچ رشتهٔ hardcoded فارسی در JSX باقی نماند».
 *
 * The honest version of that goal: the app has 1400+ Persian lines today and migrating every one of
 * them in a single pass would be reckless, so this script turns the goal into a **ratchet** — the
 * count is recorded in `scripts/copy-baseline.json` and may only go down. New UI must take its
 * strings from `apps/web/src/lib/copy/fa.ts`; touching an old file is fine, adding new hardcoded
 * copy is not.
 *
 *   node scripts/check-hardcoded-copy.mjs            # fail when the count grew
 *   node scripts/check-hardcoded-copy.mjs --update   # re-record the baseline after a migration
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SRC = join(ROOT, 'apps/web/src');
const BASELINE = join(ROOT, 'scripts/copy-baseline.json');
const PERSIAN = /[\u0600-\u06FF]/;
/**
 * Marketer-facing surfaces are the ones §6.2 specifies reference copy for.
 *
 * Matched as whole path segments (`pages/m/…`), never as bare prefixes: `pages/m` used to swallow
 * `pages/manager/…` too, which silently counted 50 lines of manager-panel copy as marketer-facing
 * and made the reported number a lie. Same trap would catch a future `components/ui-kit`.
 */
const MARKETER_DIRS = ['pages/m', 'components/learning', 'components/ui', 'components/character'];
const isMarketer = (rel) =>
  MARKETER_DIRS.some((d) => rel.startsWith(`apps/web/src/${d}/`) || rel === `apps/web/src/${d}`);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (name.endsWith('.tsx') && !name.endsWith('.test.tsx')) out.push(p);
  }
  return out;
}

const perFile = {};
let total = 0;
let marketer = 0;
for (const file of walk(SRC)) {
  const rel = relative(ROOT, file);
  const lines = readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => PERSIAN.test(l)).length;
  if (!lines) continue;
  perFile[rel] = lines;
  total += lines;
  if (isMarketer(rel)) marketer += lines;
}

const update = process.argv.includes('--update');
if (update) {
  writeFileSync(
    BASELINE,
    `${JSON.stringify({ generatedBy: 'scripts/check-hardcoded-copy.mjs', total, marketer, perFile }, null, 2)}\n`,
    'utf8',
  );
  console.log(
    `[copy] baseline recorded: total=${total} marketer=${marketer} files=${Object.keys(perFile).length}`,
  );
  process.exit(0);
}

let base = { total: 0, marketer: 0, perFile: {} };
try {
  base = JSON.parse(readFileSync(BASELINE, 'utf8'));
} catch {
  console.error('[copy] no baseline found — run: node scripts/check-hardcoded-copy.mjs --update');
  process.exit(2);
}

const grew = [];
for (const [file, n] of Object.entries(perFile)) {
  const before = base.perFile[file] ?? 0;
  if (n > before) grew.push(`  ${file}: ${before} → ${n}`);
}

console.log(
  `[copy] hardcoded Persian lines: total ${total} (baseline ${base.total}), marketer-facing ${marketer} (baseline ${base.marketer})`,
);
if (grew.length) {
  console.error('[copy] FAILED — new hardcoded copy. Use apps/web/src/lib/copy/fa.ts instead:');
  for (const line of grew) console.error(line);
  process.exit(1);
}
if (total < base.total)
  console.log(
    `[copy] down by ${base.total - total} lines — run with --update to lock the new low.`,
  );
console.log('[copy] ok — no file added hardcoded Persian copy.');
