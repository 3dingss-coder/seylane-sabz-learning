/* Local dev server without the Functions emulator (no Java required) — D37 memory backend. */
import path from 'node:path';
import { createApp } from './app';
import { loadConfig } from './config';
import { buildMemoryDeps } from './deps';
import { runSeed } from './seed/seed';

async function main() {
  const config = loadConfig({
    ...process.env,
    DATA_BACKEND: 'memory',
    APP_ENV: process.env.APP_ENV ?? 'dev',
  });
  const deps = buildMemoryDeps(config, { persist: process.env.LOCAL_PERSIST !== 'false' });
  const repoRoot = path.resolve(__dirname, '..', '..');
  const brands = await deps.store.query({ collection: 'brands', limit: 1 });
  if (!brands.length || process.env.RESEED === 'true') {
    console.info('[local] seeding catalog + demo data …');
    const report = await runSeed(deps, {
      repoRoot,
      demo: config.env !== 'prod',
      linkLocalFiles: true,
    });
    console.info(
      `[local] seed done: ${report.brands} brands, ${report.products} products, ${report.packages} packages`,
    );
  }
  const port = Number(process.env.PORT ?? 5001);
  // HOST=127.0.0.1 keeps the API private so preview tools only expose the web app (5173).
  const host = process.env.HOST ?? '0.0.0.0';
  createApp(deps).listen(port, host, () =>
    console.info(`API listening on http://${host}:${port}/v1/health`),
  );
  const flush = () => {
    deps.store.flush();
    process.exit(0);
  };
  process.on('SIGINT', flush);
  process.on('SIGTERM', flush);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
