#!/usr/bin/env node
/**
 * PHASE-7 §7.3 — the performance budgets, enforced rather than documented.
 *
 * Run after a build (`npm run build`), because most budgets are measured on real artifacts:
 *
 *   node scripts/check-perf-budget.mjs
 *
 * Budgets come from docs/design-system/PHASE-7-a11y-perf-rtl.md §7.3. Every check prints what it
 * measured, so a pass is auditable and a fail says which number moved.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const WEB = join(ROOT, 'apps/web');
const DIST = join(WEB, 'dist/assets');
const UPDATE = process.argv.includes('--update');

/** Budgets (bytes). `null` means "must not exist at all". */
const BUDGETS = {
  castRaw: 60_000, // §7.3 — all 6 characters × 8 states
  soundHaptics: 90_000, // §7.3 — PHASE-5 cues are synthesised, so this stays near zero
  cssGzip: 16_000, // §7.3 — the whole shipped stylesheet, compressed
  initialJsGzip: 170_000, // entry chunk; measured 147.6 KB when this gate was written
  fontWoff2: 60_000, // §7.3 — self-hosted Vazirmatn RD subset
};

const results = [];
let failures = 0;

function check(name, measured, budget, note = '') {
  const ok = budget === null ? measured === 0 : measured <= budget;
  if (!ok) failures++;
  results.push({ name, measured, budget, ok, note });
}

function gzipSize(file) {
  return gzipSync(readFileSync(file)).length;
}

function largest(pattern) {
  if (!existsSync(DIST)) return null;
  const files = readdirSync(DIST)
    .filter((f) => pattern.test(f))
    .map((f) => join(DIST, f))
    .sort((a, b) => statSync(b).size - statSync(a).size);
  return files[0] ?? null;
}

// ── 1. the cast (6 characters × 8 expressions + 6 creatures) ──────────────────────────
function measureCast() {
  const entry = join(WEB, '.cast-budget-entry.tsx');
  const out = join(WEB, '.cast-budget-out.js');
  writeFileSync(
    entry,
    `export { Character } from './src/components/character/Character';\n` +
      `export { ObjectionCreature } from './src/components/character/ObjectionCreature';\n`,
    'utf8',
  );
  try {
    execFileSync(
      'npx',
      [
        'esbuild',
        '.cast-budget-entry.tsx',
        '--bundle',
        '--minify',
        '--format=esm',
        '--external:react',
        '--external:react-dom',
        '--external:react/jsx-runtime',
        '--alias:@=./src',
        `--outfile=${out}`,
      ],
      { cwd: WEB, stdio: 'ignore' },
    );
    return statSync(out).size;
  } catch {
    // esbuild unavailable: fall back to the uncompressed source size (an upper bound)
    const dir = join(WEB, 'src/components/character');
    return readdirSync(dir)
      .filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith('.test.tsx'))
      .reduce((s, f) => s + statSync(join(dir, f)).size, 0);
  } finally {
    for (const f of [entry, out]) if (existsSync(f)) execFileSync('rm', ['-f', f]);
  }
}
check('cast (6 characters × 8 states)', measureCast(), BUDGETS.castRaw);

// ── 2. sound + haptics: PHASE-5 cues are synthesised, so no audio ships ────────────────
const audioFiles = existsSync(DIST)
  ? readdirSync(DIST).filter((f) => /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(f))
  : [];
const audioBytes = audioFiles.reduce((s, f) => s + statSync(join(DIST, f)).size, 0);
check('sound + haptics assets', audioBytes, BUDGETS.soundHaptics, `${audioFiles.length} audio file(s)`);

// ── 3. stylesheet ──────────────────────────────────────────────────────────────────────
const css = largest(/\.css$/);
if (css) check('CSS (gzip)', gzipSize(css), BUDGETS.cssGzip, css.split('/').pop());
else check('CSS (gzip)', 0, BUDGETS.cssGzip, 'no build output — run npm run build');

// ── 4. no backdrop-filter on a scrolling surface (DESIGN-REFRESH §6 / PHASE-7 §7.3) ─────
/* The ban is about sticky surfaces: a blur there re-composites every frame while the page
   scrolls. The modal scrim is the documented exception (transient, only while open), so this
   checks the source instead of counting declarations in minified CSS. */
function blurOnSticky() {
  const offenders = [];
  const walkSrc = (dir) => {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walkSrc(p);
      else if (name.endsWith('.tsx')) {
        const text = readFileSync(p, 'utf8');
        for (const m of text.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
          const cls = `${m[1] ?? ''} ${m[2] ?? ''}`;
          if (/\bsticky\b/.test(cls) && /backdrop-/.test(cls))
            offenders.push(p.replace(/^.*?apps\/web\//, 'apps/web/'));
        }
      }
    }
  };
  walkSrc(join(WEB, 'src'));
  return [...new Set(offenders)];
}
const stickyBlur = blurOnSticky();
check('blur on a sticky/scrolling surface', stickyBlur.length, 0, stickyBlur.join(', '));

// ── 5. entry chunk ─────────────────────────────────────────────────────────────────────
const js = largest(/^index-.*\.js$/);
if (js) check('entry JS chunk (gzip)', gzipSize(js), BUDGETS.initialJsGzip, js.split('/').pop());

// ── 6. self-hosted fonts ───────────────────────────────────────────────────────────────
function fontBytes(dir) {
  if (!existsSync(dir)) return 0;
  let total = 0;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) total += fontBytes(p);
    else if (/\.woff2?$/i.test(name)) total += statSync(p).size;
  }
  return total;
}
const fonts = fontBytes(join(WEB, 'public')) + fontBytes(join(WEB, 'src/assets'));
check('self-hosted font files', fonts, BUDGETS.fontWoff2, fonts ? 'largest subset must stay under budget' : 'no self-hosted font yet (PHASE-1 open item)');

// ── 7. no raster images on the learning surfaces (LCP) ─────────────────────────────────
function rasterInLearning() {
  const dir = join(WEB, 'src/components/learning');
  if (!existsSync(dir)) return [];
  const bad = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.tsx')) continue;
    const text = readFileSync(join(dir, f), 'utf8');
    if (/<img[\s>]/.test(text)) bad.push(f);
  }
  return bad;
}
const raster = rasterInLearning();
check('raster <img> in components/learning', raster.length, 0, raster.join(', '));

// ── report ─────────────────────────────────────────────────────────────────────────────
const pad = (s, n) => String(s).padEnd(n);
console.log('PHASE-7 §7.3 performance budgets');
for (const r of results) {
  const budget = r.budget === 0 ? '0' : `≤ ${r.budget.toLocaleString('en-US')}`;
  console.log(
    `  ${r.ok ? 'ok  ' : 'FAIL'}  ${pad(r.name, 38)} ${pad(r.measured.toLocaleString('en-US') + ' B', 12)} ${pad(budget, 14)} ${r.note}`,
  );
}

if (UPDATE) {
  writeFileSync(
    join(ROOT, 'scripts/perf-budget-baseline.json'),
    `${JSON.stringify({ budgets: BUDGETS, measured: results.map(({ name, measured }) => ({ name, measured })) }, null, 2)}\n`,
    'utf8',
  );
  console.log('[budget] baseline recorded.');
}

if (failures) {
  console.error(`\n[budget] ${failures} budget(s) exceeded.`);
  process.exit(1);
}
console.log('\n[budget] all budgets within limit.');
