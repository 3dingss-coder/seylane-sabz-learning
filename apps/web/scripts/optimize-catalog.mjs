// Shrinks mirrored catalog images in public/catalog (git-ignored build output).
// Originals in the repo folders stay untouched. The UI never shows these larger than ~130 CSS px,
// but the client-provided PNGs are 600-1500 px and 200 KB-1 MB each, which makes the
// package/brand lists crawl on slow mobile networks. File names/extensions are preserved so every
// stored imageUrl / logoUrl keeps working. Idempotent; never fails the build.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG = path.join(WEB_ROOT, 'public', 'catalog');
const MAX_SIDE = 480;
// A small bounded pool speeds CI builds without spawning an unbounded number of image workers.
const WORKERS = 3;

let sharp;
try {
  ({ default: sharp } = await import('sharp'));
} catch {
  console.warn('[optimize-catalog] sharp not installed — catalog images left as-is');
  process.exit(0);
}

function* walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (/\.(png|jpe?g)$/i.test(e.name)) yield p;
  }
}

const files = [...walk(CATALOG)];
let before = 0;
let after = 0;
let changed = 0;
let next = 0;
let completed = 0;

async function optimize(file) {
  let input;
  try {
    input = fs.readFileSync(file);
    const img = sharp(input);
    const meta = await img.metadata();
    const tooBig = (meta.width ?? 0) > MAX_SIDE || (meta.height ?? 0) > MAX_SIDE;
    if (!tooBig && input.length < 60_000) {
      before += input.length;
      after += input.length;
      return;
    }
    let pipeline = img.resize({
      width: MAX_SIDE,
      height: MAX_SIDE,
      fit: 'inside',
      withoutEnlargement: true,
    });
    pipeline = /\.png$/i.test(file)
      ? pipeline.png({ palette: true, quality: 85, compressionLevel: 9, effort: 7 })
      : pipeline.jpeg({ quality: 82, mozjpeg: true });
    const out = await pipeline.toBuffer();
    before += input.length;
    if (out.length < input.length) {
      fs.writeFileSync(file, out);
      after += out.length;
      changed++;
    } else {
      after += input.length;
    }
  } catch (err) {
    if (input) {
      before += input.length;
      after += input.length;
    }
    console.warn(`[optimize-catalog] skipped ${path.basename(file)}: ${err.message}`);
  } finally {
    completed++;
    if (completed % 25 === 0 || completed === files.length) {
      console.info(`[optimize-catalog] progress ${completed}/${files.length}`);
    }
  }
}

async function worker() {
  while (true) {
    const index = next++;
    if (index >= files.length) return;
    await optimize(files[index]);
  }
}

await Promise.all(Array.from({ length: Math.min(WORKERS, files.length) }, () => worker()));
console.info(
  `[optimize-catalog] optimized=${changed} ${(before / 1048576).toFixed(1)} MB -> ${(after / 1048576).toFixed(1)} MB`,
);
