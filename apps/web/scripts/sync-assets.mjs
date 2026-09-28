// Mirrors client-provided assets into apps/web/public (git-ignored) so the dev server/PWA
// can serve REAL brand logos, product images and app icons. Originals stay in the repo folders.
// In deployed environments the canonical URLs are Firebase Storage URLs written by the seed
// script (PROMPT 003); this mirror is the local/offline equivalent — never placeholders.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LOGOS_DIR,
  PRODUCT_IMAGES_DIR,
  UI_KIT_DIR,
  loadCatalog,
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

// App icons: Seylane Sabz holding mark from the UI helper kit.
const iconSrc = path.join(UI_KIT_DIR, 'اپ مشتری', 'لوگو و آیکون');
for (const [src, dest] of [
  ['icon-192.png', 'icon-192.png'],
  ['icon-512.png', 'icon-512.png'],
  ['logo-full.png', 'logo-full.png'],
  ['logo-mark-transparent.png', 'logo-mark.png'],
]) {
  const source = path.join(iconSrc, src);
  const target = path.join(ICONS_OUT, dest);
  // The source UI kit is an optional, separately archived binary bundle. Keep the
  // small PWA icon copies already checked into public/ when that bundle is absent.
  if (fs.existsSync(source) && copyIfChanged(source, target)) copied++;
}

console.info(
  `[sync-assets] brands=${brands.length} products=${products.length} copied=${copied} ` +
    `unmatchedBrands=${catalog.unmatched.brands.length} unmatchedProducts=${catalog.unmatched.products.length}`,
);
