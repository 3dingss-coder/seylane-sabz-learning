/**
 * Repeatable seed — catalog (brands/products/logos/images) + sample training packages.
 *
 *   Emulator : FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
 *              FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:9199 GCLOUD_PROJECT=demo-seylane \
 *              STORAGE_BUCKET=demo-seylane.appspot.com npm run seed -- --demo
 *   Prod/dev : GOOGLE_APPLICATION_CREDENTIALS=sa.json GCLOUD_PROJECT=<id> STORAGE_BUCKET=<bucket> \
 *              FIREBASE_WEB_API_KEY=<key> npm run seed [-- --superadmin-phone 09..]
 *   Memory   : npm run seed -- --memory --demo   (writes functions/.local-data, used by the local API)
 *
 * SECURITY: --superadmin-phone only provisions/resolves a role record. Phone ownership is not
 * verified, no password/OTP credential or login/session is created, and existing records are not
 * elevated. Use only from an owner-controlled environment; never treat seeded phones as credentials.
 * Flags: --demo (demo teams/users), --force (overwrite seeded packages), --report <file.md>
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../functions/src/config';
import { buildFirebaseDeps, buildMemoryDeps } from '../functions/src/deps';
import { runSeed, type SeedReport } from '../functions/src/seed/seed';
import { ensureUser } from '../functions/src/services/users';
import type { Deps } from '../functions/src/services/context';

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(`--${n}`);
const value = (n: string) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : undefined;
};

function reportMarkdown(r: SeedReport): string {
  const lines = [
    '# Seed report',
    '',
    `Brands: ${r.brands} • Products: ${r.products} (real images: ${r.productImages.matched}) • Training packages: ${r.packages}`,
    '',
    '## Training file → brand → product → package / part',
    '',
    '| File | Brand | Product | Package | Part | Section id | Duration | Quiz | Status |',
    '|---|---|---|---|---|---|---|---|---|',
    ...r.training.map(
      (t) =>
        `| \`${t.file}\` | ${t.brand} | ${t.product} | ${t.packageTitle} (\`${t.packageId}\`) | ${t.part} | \`${t.sectionId}\` | ${Math.round(t.durationSec)}s | ${t.quizSource} | ${t.status} |`,
    ),
    '',
    '## Brand logos',
    '',
    '| Brand id | Name | Logo file |',
    '|---|---|---|',
    ...r.brandRows.map((b) => `| \`${b.id}\` | ${b.name} | ${b.logo} |`),
    '',
    `## Products using the brand logo as image (no product photo in client files)`,
    '',
    ...(r.productImages.fallback.length
      ? r.productImages.fallback.map((f) => `- ${f}`)
      : ['- none']),
  ];
  return `${lines.join('\n')}\n`;
}

async function main() {
  const repoRoot = path.resolve(__dirname, '..');
  const memory = flag('memory');
  const config = loadConfig({
    ...process.env,
    DATA_BACKEND: memory ? 'memory' : 'firestore',
    LOCAL_DATA_DIR: path.join(repoRoot, 'functions', '.local-data'),
  });
  let deps: Deps;
  if (memory) deps = buildMemoryDeps(config, { persist: true, llm: null });
  else deps = await buildFirebaseDeps(config);
  const report = await runSeed(deps, {
    repoRoot,
    demo: flag('demo'),
    force: flag('force'),
    linkLocalFiles: memory,
    log: (m) => console.info(`[seed] ${m}`),
  });
  const phone = value('superadmin-phone');
  if (phone) {
    console.warn(
      '[seed] SECURITY: this phone is not verified; no password/OTP credential or login/session is created.',
    );
    const u = await ensureUser(deps, {
      name: value('superadmin-name') ?? 'مدیر ارشد سیستم',
      phone,
      role: 'superadmin',
    });
    console.info(
      `[seed] requested superadmin phone resolved to record ${u.id} (role=${u.role}, status=${u.status}); ensureUser does not elevate existing records.`,
    );
  }
  if (memory && 'flush' in deps.store) (deps.store as { flush: () => void }).flush();
  const out = value('report');
  if (out) fs.writeFileSync(path.resolve(out), reportMarkdown(report));
  console.info(
    `[seed] done — brands ${report.brands}, products ${report.products}, packages ${report.packages}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
