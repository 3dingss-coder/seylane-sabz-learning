/*
 * Single-port dev server for previews: the in-memory API (/v1) and the Vite web app are both served
 * on one port (default 5173). Preview tools that pick "the first open port" can therefore never land
 * on the raw JSON API.
 *
 *   npm start          (PORT=5173 by default; RESEED=true to wipe and re-seed)
 */
import http from 'node:http';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { createApp } from '../functions/src/app';
import { loadConfig } from '../functions/src/config';
import { buildMemoryDeps } from '../functions/src/deps';
import { runSeed } from '../functions/src/seed/seed';

const repoRoot = path.resolve(__dirname, '..');
const webRoot = path.join(repoRoot, 'apps', 'web');

async function main() {
  // Mirror logos / product images / icons into apps/web/public (same as `npm run dev`).
  execFileSync(process.execPath, [path.join(webRoot, 'scripts', 'sync-assets.mjs')], {
    cwd: webRoot,
    stdio: 'inherit',
  });

  const config = loadConfig({
    ...process.env,
    DATA_BACKEND: 'memory',
    APP_ENV: process.env.APP_ENV ?? 'dev',
    // Local data lives where `functions/src/local.ts` keeps it.
    LOCAL_DATA_DIR: process.env.LOCAL_DATA_DIR ?? path.join(repoRoot, 'functions', '.local-data'),
  });
  const deps = buildMemoryDeps(config, { persist: process.env.LOCAL_PERSIST !== 'false' });
  const brands = await deps.store.query({ collection: 'brands', limit: 1 });
  if (!brands.length || process.env.RESEED === 'true') {
    console.info('[dev] seeding catalog + demo data …');
    const report = await runSeed(deps, { repoRoot, demo: true, linkLocalFiles: true });
    console.info(`[dev] seed done: ${report.brands} brands, ${report.packages} packages`);
  }
  const api = createApp(deps);

  const app = express();
  const server = http.createServer(app);
  const vite = await createViteServer({
    root: webRoot,
    configFile: path.join(webRoot, 'vite.config.ts'),
    server: { middlewareMode: true, hmr: { server }, allowedHosts: true },
    appType: 'spa',
  });
  // /v1 → API (keeps its own security headers + JSON 404); everything else → Vite.
  app.use((req, res, next) => {
    if (req.url === '/v1' || req.url.startsWith('/v1/')) api(req, res, next);
    else vite.middlewares(req, res, next);
  });

  const port = Number(process.env.PORT ?? 5173);
  server.listen(port, '0.0.0.0', () =>
    console.info(`[dev] web + API on http://0.0.0.0:${port}  (API health: /v1/health)`),
  );
  const stop = () => {
    deps.store.flush();
    void vite.close().finally(() => process.exit(0));
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
