#!/usr/bin/env node
/*
 * One command for a working local/preview environment: starts the in-memory API (port 5001)
 * and the Vite dev server (port 5173, proxies /v1 to the API). Without the API the web app
 * loads but every screen fails, which looks like a "broken preview".
 *
 *   npm start            (or: npm run dev:all)
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

const procs = [
  { name: 'api', cmd: npx, args: ['tsx', 'src/local.ts'], cwd: path.join(root, 'functions') },
  { name: 'web', cmd: npm, args: ['run', 'dev', '-w', 'apps/web'], cwd: root },
];

const children = procs.map(({ name, cmd, args, cwd }) => {
  const child = spawn(cmd, args, { cwd, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  const prefix = (chunk) =>
    chunk
      .toString()
      .split('\n')
      .filter((l) => l.length > 0)
      .map((l) => `[${name}] ${l}`)
      .join('\n') + '\n';
  child.stdout.on('data', (c) => process.stdout.write(prefix(c)));
  child.stderr.on('data', (c) => process.stderr.write(prefix(c)));
  child.on('exit', (code) => {
    console.error(`[${name}] exited with code ${code}`);
    shutdown(code ?? 1);
  });
  return child;
});

let stopping = false;
function shutdown(code) {
  if (stopping) return;
  stopping = true;
  for (const c of children) if (c.exitCode === null) c.kill('SIGTERM');
  setTimeout(() => process.exit(code), 500);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
