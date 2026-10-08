// Generates functions/lib/seed-snapshot.json after `tsc -p tsconfig.build.json` so serverless
// deployments can cold-start with the curated catalog, packages, and quizzes in milliseconds
// without embedding demo identities or needing raw CSV/image folders at runtime.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const libDir = path.join(repoRoot, 'functions', 'lib');

const { loadConfig } = require(path.join(libDir, 'config.js'));
const { buildMemoryDeps } = require(path.join(libDir, 'deps.js'));
const { runSeed } = require(path.join(libDir, 'seed', 'seed.js'));

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssl-seed-snap-'));
try {
  const config = loadConfig({
    DATA_BACKEND: 'memory',
    APP_ENV: 'dev',
    LOCAL_DATA_DIR: tmpDir,
  });
  const deps = buildMemoryDeps(config, { persist: true, llm: null });
  const report = await runSeed(deps, { repoRoot, demo: false, linkLocalFiles: true });
  deps.store.flush();
  const dbPath = path.join(tmpDir, 'db.json');
  const outPath = path.join(libDir, 'seed-snapshot.json');
  fs.copyFileSync(dbPath, outPath);
  console.info(
    `[seed-snapshot] wrote functions/lib/seed-snapshot.json (brands=${report.brands}, products=${report.products}, packages=${report.packages}, demoUsers=${report.demoUsers.length})`,
  );
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
