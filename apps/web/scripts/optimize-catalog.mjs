// Shrinks the mirrored catalog images in public/catalog (git-ignored build output).
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

let before = 0;
let after = 0;
let changed = 0;
for (const file of walk(CATALOG)) {
  try {
    const input = fs.readFileSync(file);
    before += input.length;
    const img = sharp(input);
    const meta = await img.metadata();
    const tooBig = (meta.width ?? 0) > MAX_SIDE || (meta.height ?? 0) > MAX_SIDE;
    if (!tooBig && input.length < 60_000) {
      after += input.length;
      continue;
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
    if (out.length < input.length) {
      fs.writeFileSync(file, out);
      after += out.length;
      changed++;
    } else {
      after += input.length;
    }
  } catch (err) {
    console.warn(`[optimize-catalog] skipped ${path.basename(file)}: ${err.message}`);
  }
}
console.info(
  `[optimize-catalog] optimized=${changed} ${(before / 1048576).toFixed(1)} MB -> ${(after / 1048576).toFixed(1)} MB`,
);
