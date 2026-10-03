// Copies the single-thread ffmpeg.wasm core into public/ffmpeg/ so the media library can compress
// video/audio in the browser, fully self-hosted (the CSP forbids third-party scripts).
// The .wasm is ~31 MB, over Cloudflare's 25 MiB per-asset limit, so it is split into 8 MB parts
// that the browser re-assembles. Output is generated (git-ignored); this script is idempotent.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, '..', 'public', 'ffmpeg');
const PART = 8 * 1024 * 1024;

let dist;
try {
  const require = createRequire(import.meta.url);
  // The ffmpeg worker is an ES-module worker, so it must load the ESM build of the core
  // (`export default createFFmpegCore`). The package "main" is the UMD build, which has no
  // default export and makes load() fail with "failed to import ffmpeg-core.js".
  dist = path.resolve(path.dirname(require.resolve('@ffmpeg/core')), '..', 'esm');
} catch {
  console.warn('[ffmpeg] @ffmpeg/core not installed - in-browser compression will be unavailable.');
  process.exit(0);
}
const js = path.join(dist, 'ffmpeg-core.js');
const wasm = path.join(dist, 'ffmpeg-core.wasm');
if (!fs.existsSync(js) || !fs.existsSync(wasm)) {
  console.warn('[ffmpeg] core files not found in', dist);
  process.exit(0);
}

const size = fs.statSync(wasm).size;
const manifestPath = path.join(out, 'manifest.json');
try {
  const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (m.size === size && m.parts.every((p) => fs.existsSync(path.join(out, p)))) process.exit(0);
} catch {
  /* regenerate */
}

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
fs.copyFileSync(js, path.join(out, 'ffmpeg-core.js'));
const buf = fs.readFileSync(wasm);
const parts = [];
for (let i = 0, n = 0; i < buf.length; i += PART, n++) {
  const name = `ffmpeg-core.wasm.part${n}`;
  fs.writeFileSync(path.join(out, name), buf.subarray(i, i + PART));
  parts.push(name);
}
fs.writeFileSync(manifestPath, JSON.stringify({ size, parts }));
console.log(
  `[ffmpeg] prepared ${parts.length} parts (${(size / 1048576).toFixed(1)} MB) in public/ffmpeg`,
);
