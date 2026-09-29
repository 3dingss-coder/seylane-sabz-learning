// Mirrors client-provided assets into apps/web/public (git-ignored) so the dev server/PWA
// can serve REAL brand logos, product images and app icons. Originals stay in the repo folders.
// In deployed environments the canonical URLs are Firebase Storage URLs written by the seed
// script (PROMPT 003); this mirror is the local/offline equivalent — never placeholders.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CATALOG_DIR,
  LOGOS_DIR,
  PRODUCT_IMAGES_DIR,
  REPO_ROOT,
  UI_KIT_DIR,
  loadCatalog,
  parseCsv,
} from '../../../scripts/lib/catalog-source.mjs';

const WEB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(WEB_ROOT, 'public', 'catalog');
const ICONS_OUT = path.join(WEB_ROOT, 'public', 'icons');

function copyIfChanged(src, dest) {
  if (fs.existsSync(dest) && fs.statSync(dest).size === fs.statSync(src).size) return false;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  return true;
}

const catalog = loadCatalog();
let copied = 0;

const brands = catalog.brands
  .filter((b) => b.logoFile)
  .map((b) => {
    const ext = path.extname(b.logoFile);
    const rel = `brands/${b.id}/logo${ext}`;
    if (copyIfChanged(path.join(LOGOS_DIR, b.logoFile), path.join(OUT, rel))) copied++;
    return {
      id: b.id,
      name: b.name,
      nameLatin: b.nameLatin,
      sortOrder: b.sortOrder,
      logoUrl: `/catalog/${rel}`,
    };
  });

const products = catalog.products
  .filter((p) => p.imageFile && p.brandId)
  .map((p) => {
    const ext = path.extname(p.imageFile);
    const rel = `products/${p.id}/main${ext}`;
    if (copyIfChanged(path.join(PRODUCT_IMAGES_DIR, p.imageFile), path.join(OUT, rel))) copied++;
    return { id: p.id, brandId: p.brandId, name: p.name, imageUrl: `/catalog/${rel}` };
  });

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({ brands, products }, null, 2));

// Also mirror reactivated brands/products from data/catalog-supplement.json so static CDN
// deployments (e.g. Netlify) can serve their logos and product images directly from /catalog/.
const supPath = path.join(REPO_ROOT, 'data', 'catalog-supplement.json');
if (fs.existsSync(supPath)) {
  const sup = JSON.parse(fs.readFileSync(supPath, 'utf8'));
  const imageFiles = fs.readdirSync(PRODUCT_IMAGES_DIR);
  for (const b of sup.reactivatedBrands ?? []) {
    if (!b.logoFile) continue;
    const srcFile = path.join(LOGOS_DIR, b.logoFile);
    if (!fs.existsSync(srcFile)) continue;
    const ext = path.extname(b.logoFile).toLowerCase();
    if (copyIfChanged(srcFile, path.join(OUT, `brands/${b.id}/logo${ext}`))) copied++;
  }
  const hiddenPath = path.join(CATALOG_DIR, 'hidden-products.csv');
  if (fs.existsSync(hiddenPath)) {
    const hiddenById = new Map(
      parseCsv(fs.readFileSync(hiddenPath, 'utf8')).map((r) => [r['شناسه محصول'], r['کد محصول']]),
    );
    for (const rp of sup.reactivatedProducts ?? []) {
      const code = hiddenById.get(rp.id);
      if (!code) continue;
      const byCode = imageFiles.filter((f) => f.startsWith(`${code}_`));
      if (byCode.length !== 1) continue;
      const ext = path.extname(byCode[0]).toLowerCase();
      if (
        copyIfChanged(
          path.join(PRODUCT_IMAGES_DIR, byCode[0]),
          path.join(OUT, `products/${rp.id}/main${ext}`),
        )
      ) {
        copied++;
      }
    }
  }
}

// App icons: Seylane Sabz holding mark from the UI helper kit.
const iconSrc = path.join(UI_KIT_DIR, 'اپ مشتری', 'لوگو و آیکون');
for (const [src, dest] of [
  ['icon-192.png', 'icon-192.png'],
  ['icon-512.png', 'icon-512.png'],
  ['logo-full.png', 'logo-full.png'],
  ['logo-mark-transparent.png', 'logo-mark.png'],
]) {
  if (copyIfChanged(path.join(iconSrc, src), path.join(ICONS_OUT, dest))) copied++;
}

console.info(
  `[sync-assets] brands=${brands.length} products=${products.length} copied=${copied} ` +
    `unmatchedBrands=${catalog.unmatched.brands.length} unmatchedProducts=${catalog.unmatched.products.length}`,
);
