/*
 * Single-port dev server for previews: the in-memory API (/v1) and the Vite web app are both served
 * on one port (default 5173). Preview tools that pick "the first open port" can therefore never land
 * on the raw JSON API.
 *
 *   npm start          (PORT=3000 by default; RESEED=true to wipe and re-seed)
 *   npm run start:prod (SERVE_BUILD=true: serves the production build in apps/web/dist — the same
 *                       files users get, incl. the legacy-browser bundle — instead of Vite dev)
 */
import fs from 'node:fs';
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

/** Loads functions/.env.local and functions/.env (git-ignored), e.g. GEMINI_API_KEY for the mentor. */
function loadLocalEnv() {
  for (const f of ['.env.local', '.env']) {
    const file = path.join(repoRoot, 'functions', f);
    if (!fs.existsSync(file)) continue;
    process.loadEnvFile(file); // never overrides variables already set in the environment
    console.info(`[dev] loaded functions/${f}`);
  }
}

async function main() {
  loadLocalEnv();
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
  const [brands, pkgs] = await Promise.all([
    deps.store.query({ collection: 'brands', limit: 1 }),
    deps.store.query({ collection: 'packages', limit: 1 }),
  ]);
  if (!brands.length || !pkgs.length || process.env.RESEED === 'true') {
    console.info('[dev] seeding catalog + demo data …');
    const report = await runSeed(deps, { repoRoot, demo: true, linkLocalFiles: true });
    console.info(`[dev] seed done: ${report.brands} brands, ${report.packages} packages`);
  }
  const api = createApp(deps);
  console.info(
    config.geminiApiKey
      ? `[dev] mentor: Gemini (${config.geminiModel})`
      : '[dev] mentor: no GEMINI_API_KEY — answers are quoted from training content (add the key to functions/.env.local for AI replies)',
  );

  const app = express();
  const server = http.createServer(app);
  const serveBuild = process.env.SERVE_BUILD === 'true';
  const dist = path.join(webRoot, 'dist');
  if (serveBuild && !fs.existsSync(path.join(dist, 'index.html'))) {
    throw new Error(
      'SERVE_BUILD=true but apps/web/dist is missing — run `npm run build -w apps/web`',
    );
  }
  const vite = serveBuild
    ? null
    : await createViteServer({
        root: webRoot,
        configFile: path.join(webRoot, 'vite.config.ts'),
        server: { middlewareMode: true, hmr: { server }, allowedHosts: true },
        appType: 'spa',
      });
  const web: express.Handler = vite
    ? vite.middlewares
    : (() => {
        const files = express.static(dist, {
          index: false,
          setHeaders: (res, file) => {
            // hashed assets never change; index.html / sw.js must always be re-checked
            if (file.includes(`${path.sep}assets${path.sep}`))
              res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            else res.setHeader('Cache-Control', 'no-cache');
          },
        });
        return (req, res, next) =>
          files(req, res, () => {
            if (req.method !== 'GET' && req.method !== 'HEAD') return next();
            // missing files (e.g. an old chunk after a redeploy) must 404, not return HTML
            if (/\.[a-z0-9]+$/i.test(req.path)) return res.status(404).end();
            res.setHeader('Cache-Control', 'no-cache');
            res.sendFile(path.join(dist, 'index.html')); // SPA fallback
          });
      })();
  // /v1 → API (keeps its own security headers + JSON 404); everything else → Vite.
  app.use((req, res, next) => {
    if (req.url === '/v1' || req.url.startsWith('/v1/')) {
      // Compact access log (helps diagnose proxies that drop auth headers). No token values.
      const auth = [
        req.headers.authorization ? 'authz' : '',
        req.headers['x-access-token'] ? 'x-token' : '',
      ]
        .filter(Boolean)
        .join('+');
      res.on('finish', () =>
        console.info(`[api] ${req.method} ${req.url} → ${res.statusCode} (${auth || 'no-auth'})`),
      );
      api(req, res, next);
    } else web(req, res, next);
  });

  // In AI Studio / Cloud Run, PORT is set to 8080 for the platform ingress,
  // while the preview iframe expects the user dev server on port 3000.
  const port = 3000;
  server.listen(port, '0.0.0.0', () =>
    console.info(
      `[dev] web${serveBuild ? ' (production build)' : ''} + API on http://0.0.0.0:${port}  (API health: /v1/health)`,
    ),
  );
  const stop = () => {
    deps.store.flush();
    void (vite ? vite.close() : Promise.resolve()).finally(() => process.exit(0));
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
