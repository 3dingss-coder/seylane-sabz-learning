#!/usr/bin/env node
// Self-healing launcher for `npm start`.
// Plain Node (no dependencies) so it works on a fresh checkout / reset sandbox:
//   1. installs dependencies if node_modules is missing or incomplete
//   2. starts the single-port dev server (web + API on :5173)
//   3. restarts the dev server automatically if it crashes
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const bin = (name) =>
  join(root, 'node_modules', '.bin', process.platform === 'win32' ? `${name}.cmd` : name);
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const required = ['tsx', 'vite'];
if (!required.every((b) => existsSync(bin(b)))) {
  console.log('[start] dependencies missing → running npm ci (first run takes ~30s) …');
  let r = spawnSync(npm, ['ci', '--no-audit', '--no-fund'], { cwd: root, stdio: 'inherit' });
  if (r.status !== 0) {
    console.log('[start] npm ci failed → trying npm install …');
    r = spawnSync(npm, ['install', '--no-audit', '--no-fund'], { cwd: root, stdio: 'inherit' });
    if (r.status !== 0) process.exit(r.status ?? 1);
  }
}

// `npm run start:prod` → build the web app once, then serve dist/.
const prod = process.argv.includes('--prod');
if (prod) {
  console.log('[start] building the production web app …');
  const r = spawnSync(npm, ['run', 'build', '-w', 'apps/web'], { cwd: root, stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

let child;
let stopping = false;
let restarts = 0;
let lastStart = 0;

function run() {
  lastStart = Date.now();
  child = spawn(bin('tsx'), ['scripts/dev-server.ts'], {
    cwd: root,
    stdio: 'inherit',
    env: prod ? { ...process.env, SERVE_BUILD: 'true' } : process.env,
  });
  child.on('exit', (code, signal) => {
    if (stopping) return process.exit(code ?? 0);
    // reset the crash counter if it ran fine for a while
    if (Date.now() - lastStart > 60_000) restarts = 0;
    if (++restarts > 5) {
      console.error('[start] dev server keeps crashing — giving up. See the log above.');
      process.exit(code ?? 1);
    }
    console.error(`[start] dev server exited (${signal ?? code}) → restarting in 2s …`);
    setTimeout(run, 2000);
  });
}

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    stopping = true;
    child?.kill(sig);
  });
}

run();
