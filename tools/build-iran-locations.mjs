#!/usr/bin/env node
/**
 * Generates the Iran province/city directory used by the sign-up form
 * («انتخاب محل سکونت» → province → city) and by the API's validation of that choice.
 *
 *   node tools/build-iran-locations.mjs                 # fetch the upstream data and (re)write both files
 *   node tools/build-iran-locations.mjs --check         # exit 1 when the checked-in files are stale
 *   node tools/build-iran-locations.mjs --source f.json # use a previously downloaded copy (offline)
 *
 * If Node cannot verify the TLS chain of the network (corporate proxy / sandbox), download the file
 * with curl and pass it to --source:
 *   curl -H "Accept: application/vnd.github.raw" -o /tmp/states.json \
 *     "https://api.github.com/repos/masterking32/iran-states-cities-districts/contents/data_states_all_in_one.json?ref=master"
 *
 * Source: masterking32/iran-states-cities-districts — data_states_all_in_one.json
 * (states + cities scraped from the Iranian Post (اداره پست) website), MIT licence. The list is
 * factual administrative data; we only keep province → city names, fix the spacing of three
 * province names, then sort and de-duplicate.
 *
 * The very same module must exist in both workspaces (the API re-validates the pair the browser
 * sends) and neither workspace can import from the other, so this script writes two identical files:
 *   - apps/web/src/lib/iranLocations.ts        (data + search helpers for the picker)
 *   - functions/src/domain/iranLocations.ts    (same module for server-side validation)
 * Both carry a "generated" header; run --check in CI to be sure they still match.
 *
 * Escaping note: the emitted module needs a few regex escapes (\u064B…, \s). To keep this script
 * readable the template uses the {{B}} placeholder, which is replaced by a single backslash on
 * write — no double-backslash juggling anywhere.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UPSTREAM = 'masterking32/iran-states-cities-districts';
const UPSTREAM_FILE = 'data_states_all_in_one.json';
const UPSTREAM_REF = 'master';
const BACKSLASH = String.fromCharCode(92);

/** The post dataset spells these without a space before «و»; fix them for display. */
const PROVINCE_NAME_FIXES = {
  'چهارمحال وبختیاری': 'چهارمحال و بختیاری',
  'سیستان وبلوچستان': 'سیستان و بلوچستان',
  'کهگیلویه وبویراحمد': 'کهگیلویه و بویراحمد',
};

const OUT_FILES = ['apps/web/src/lib/iranLocations.ts', 'functions/src/domain/iranLocations.ts'];

const argv = process.argv.slice(2);
const checkOnly = argv.includes('--check');
const localSource = argv.includes('--source') ? argv[argv.indexOf('--source') + 1] : null;

async function download() {
  // GitHub's contents API (with the raw accept header) works where raw.githubusercontent.com is blocked.
  const url = `https://api.github.com/repos/${UPSTREAM}/contents/${UPSTREAM_FILE}?ref=${UPSTREAM_REF}`;
  const res = await fetch(url, { headers: { Accept: 'application/vnd.github.raw' } });
  if (!res.ok) throw new Error(`download failed: ${res.status} ${res.statusText} (${url})`);
  return res.json();
}

const fa = new Intl.Collator('fa');

function build(rows) {
  const provinces = new Map(); // province id → display name
  for (const row of rows) {
    if (row?.type === 'province') provinces.set(row.id, PROVINCE_NAME_FIXES[row.name] ?? row.name);
  }
  const citiesByProvince = new Map([...provinces.keys()].map((id) => [id, new Set()]));
  for (const row of rows) {
    if (row?.type === 'province') continue;
    const bucket = citiesByProvince.get(row?.province);
    if (bucket) bucket.add(String(row.name).trim());
  }
  return [...provinces]
    .map(([id, name]) => ({ name, cities: [...(citiesByProvince.get(id) ?? [])].sort(fa.compare) }))
    .sort((a, b) => fa.compare(a.name, b.name));
}

const ts = (value) => JSON.stringify(value);
const wrap = (items, indent) =>
  items.length
    ? `[\n${items.map((item) => `${indent}${item},`).join('\n')}\n${indent.slice(0, -2)}]`
    : '[]';

function render(data) {
  const cityCount = data.reduce((n, p) => n + p.cities.length, 0);
  const built = data
    .map(
      (p) =>
        `  {\n    name: ${ts(p.name)},\n    cities: ${wrap(p.cities.map(ts), '      ')},\n  },`,
    )
    .join('\n');
  const template = `/**
 * Iran province/city directory — **generated file, do not edit by hand**.
 * Regenerate with: node tools/build-iran-locations.mjs (see that script for the upstream source,
 * its MIT licence and why this module exists in both workspaces).
 * ${data.length} provinces, ${cityCount} cities.
 */
export interface IranProvince {
  /** Province name exactly as shown to the user. */
  name: string;
  /** Cities of the province: sorted (Persian collation), de-duplicated, display form. */
  cities: readonly string[];
}

export const IRAN_PROVINCES: readonly IranProvince[] = [
${built}
];

export const PROVINCE_NAMES: readonly string[] = IRAN_PROVINCES.map((p) => p.name);

/**
 * Folds the Persian/Arabic spellings users type (ي/ك, آ/ا, harakat, ZWNJ, extra spaces) so that
 * «کرمانشاه» matches «كرمانشاه» and «آباده» matches «اباده». Used for search *and* for matching the
 * value the API receives to the canonical name we store.
 */
export function normalizeLocation(input: string): string {
  return foldWaw(
    input
      .replace(/[{{B}}u064B-{{B}}u0652{{B}}u0640{{B}}u200B-{{B}}u200F{{B}}uFEFF]/g, '')
      .replace(/[يىئ]/g, 'ی')
      .replace(/[كک]/g, 'ک')
      .replace(/[أإآا]/g, 'ا')
      .replace(/[ةۀ]/g, 'ه')
      .replace(/ؤ/g, 'و')
      .replace(/{{B}}s+/g, ' ')
      .trim()
      .toLowerCase(),
  );
}

/**
 * «سیستان وبلوچستان» (the post-office spelling) and «سیستان و بلوچستان» (the display spelling) fold
 * to the same string, so a client that sends either one still matches the stored canonical name.
 * Only the conjunction «و» is glued; words that merely start/end with it («نور آباد», «ورامین»)
 * are left alone, and no two city names of a province collapse into one (asserted in the
 * iranLocations test of both workspaces).
 */
function foldWaw(value: string): string {
  const parts: string[] = [];
  for (const token of value.split(' ')) {
    if (!token) continue;
    const prev = parts[parts.length - 1];
    if (prev !== undefined && (token === 'و' || token.startsWith('و') || prev.endsWith('و'))) {
      parts[parts.length - 1] = prev + token;
    } else {
      parts.push(token);
    }
  }
  return parts.join(' ');
}

export function findProvince(name: string): IranProvince | null {
  const q = normalizeLocation(name ?? '');
  if (!q) return null;
  return IRAN_PROVINCES.find((p) => normalizeLocation(p.name) === q) ?? null;
}

/** Canonical (display) province name for whatever spelling the client sent, or null when unknown. */
export function canonicalProvince(name: string): string | null {
  return findProvince(name)?.name ?? null;
}

/** Canonical city name inside a province (matched after folding), or null when unknown. */
export function canonicalCity(province: string, city: string): string | null {
  const p = findProvince(province);
  const q = normalizeLocation(city ?? '');
  if (!p || !q) return null;
  return p.cities.find((c) => normalizeLocation(c) === q) ?? null;
}

export function isValidResidence(province: string, city: string): boolean {
  return canonicalCity(province, city) !== null;
}

/** Provinces matching a search box value, prefix matches first. Empty query → all of them. */
export function searchProvinces(query = ''): readonly string[] {
  return rank(PROVINCE_NAMES, query);
}

/** Cities of a province matching a search box value (empty/unknown province → none). */
export function searchCities(province: string, query = ''): readonly string[] {
  return rank(findProvince(province)?.cities ?? [], query);
}

function rank(items: readonly string[], query: string): readonly string[] {
  const q = normalizeLocation(query ?? '');
  if (!q) return items;
  const starts: string[] = [];
  const contains: string[] = [];
  for (const item of items) {
    const hay = normalizeLocation(item);
    if (hay.startsWith(q)) starts.push(item);
    else if (hay.includes(q)) contains.push(item);
  }
  return [...starts, ...contains];
}
`;
  return template.split('{{B}}').join(BACKSLASH);
}

/** The emitted files must pass `npm run format:check`, so they are formatted with the repo's Prettier. */
async function formatTs(code, filepath) {
  try {
    const prettier = await import('prettier');
    return await prettier.format(code, { ...(await prettier.resolveConfig(filepath)), filepath });
  } catch (e) {
    console.warn(`[format] prettier unavailable (${e.message}) — writing unformatted output`);
    return code;
  }
}

const source = localSource ? JSON.parse(fs.readFileSync(localSource, 'utf8')) : await download();
const rendered = await formatTs(render(build(source)), path.join(repoRoot, OUT_FILES[0]));

if (checkOnly) {
  const stale = OUT_FILES.filter(
    (rel) =>
      !fs.existsSync(path.join(repoRoot, rel)) ||
      fs.readFileSync(path.join(repoRoot, rel), 'utf8') !== rendered,
  );
  if (stale.length) {
    console.error(
      `stale generated file(s): ${stale.join(', ')} — run: node tools/build-iran-locations.mjs`,
    );
    process.exit(1);
  }
  console.info('iran-locations: up to date');
} else {
  for (const rel of OUT_FILES) {
    const file = path.join(repoRoot, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, rendered);
    console.info(`wrote ${rel} (${(rendered.length / 1024).toFixed(1)} kB)`);
  }
}
