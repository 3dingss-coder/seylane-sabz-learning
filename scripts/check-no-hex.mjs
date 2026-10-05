#!/usr/bin/env node
/**
 * PHASE-8 §8.4.2 rule 1 — «هیچ هگز در کد. فقط نام توکن.»
 *
 *   node scripts/check-no-hex.mjs
 *
 * What is allowed, and why:
 *  • `apps/web/src/styles/index.css` — this IS the token source; the @theme block must hold hex.
 *  • `apps/web/src/components/character/**` — the cast palette is artwork, not UI colour
 *    (explicitly allowlisted by §8.4.2).
 *  • hex inside a `mask-image` gradient — those stops are alpha, not colour.
 *  • comment lines — documentation may quote the old value.
 *
 * Everything else fails, because a hex in a component is a colour with no role (R-03) and no
 * contrast guarantee.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// `new URL('..')` keeps the trailing slash — strip it or every relative path is wrong
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const SRC = join(ROOT, 'apps/web/src');
const TOKEN_FILE = 'apps/web/src/styles/index.css';
const ALLOWED_DIRS = ['apps/web/src/components/character/'];
const HEX = /#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|css)$/.test(name)) out.push(p);
  }
  return out;
}

const rel = (p) => p.replace(`${ROOT}/`, '');
const offenders = [];

for (const file of walk(SRC)) {
  const r = rel(file);
  if (r === TOKEN_FILE || ALLOWED_DIRS.some((d) => r.startsWith(d))) continue;
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    // documentation may quote a value
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;
    // mask stops are alpha ramps, not colour choices
    const withoutMasks = line.replace(/mask-image:[^;}]*/g, '');
    const found = withoutMasks.match(HEX);
    if (found) offenders.push(`${r}:${i + 1}  ${found.join(', ')}  — ${trimmed.slice(0, 90)}`);
  });
}

if (offenders.length) {
  console.error(`[no-hex] FAILED — ${offenders.length} hardcoded colour(s) outside the token source:`);
  for (const o of offenders) console.error(`  ${o}`);
  console.error(
    '\nUse a token from styles/index.css (§8.4.2). A new colour needs a semantic role (R-03)\n' +
      'and a registered pair in docs/design-system/tools/contrast.py.',
  );
  process.exit(1);
}
console.log('[no-hex] ok — no hardcoded hex outside the token source and the cast palette.');
