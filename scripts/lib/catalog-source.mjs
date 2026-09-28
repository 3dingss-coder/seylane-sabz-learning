// Single reader for the client-provided catalog + assets.
// Used by: apps/web/scripts/sync-assets.mjs (PROMPT 001) and scripts/seed-catalog.ts (PROMPT 003).
//
// Matching rules (deterministic — no guessing):
//  • brand  → logo  : basename of the `لوگو` column in brands.csv must exist in «لوگو برندها»
//  • product → image: basename of the (URL-decoded) `لینک تصویر` column in products.csv must
//                     exist in «تصاویر محصولات». Fallback: exactly ONE file whose name starts with
//                     `<productCode>_`. Anything else is reported as unmatched.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const CATALOG_DIR = path.join(REPO_ROOT, 'لیست برندها و محصولات سیلانه سبز');
export const ASSETS_DIR = path.join(REPO_ROOT, 'لوگو برندها و تصاویر محصولات');
export const LOGOS_DIR = path.join(ASSETS_DIR, 'لوگو برندها');
export const PRODUCT_IMAGES_DIR = path.join(ASSETS_DIR, 'تصاویر محصولات');
export const UI_KIT_DIR = path.join(REPO_ROOT, 'کامپوننت های کمکی برای تکمیل UI UX اپلیکیشن');

/** Minimal RFC-4180 CSV parser (quoted fields, embedded commas/newlines, BOM). */
export function parseCsv(text) {
  const src = text.replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...body] = rows.filter((r) => r.some((v) => v.trim() !== ''));
  return body.map((r) => Object.fromEntries(header.map((h, idx) => [h.trim(), (r[idx] ?? '').trim()])));
}

/** Persian text key: unify Arabic ی/ک, drop ZWNJ/extra whitespace. Used only for reporting. */
export function normalizeFa(s) {
  return String(s ?? '')
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[\u200c\u200d]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function readCsv(name) {
  return parseCsv(fs.readFileSync(path.join(CATALOG_DIR, name), 'utf8'));
}

function basenameFromUrl(url) {
  if (!url) return '';
  const last = url.split('/').pop() ?? '';
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

/**
 * Loads brands + active products and resolves their asset files.
 * @returns {{ brands: object[], products: object[], unmatched: { brands: object[], products: object[] }, unusedLogos: string[], unusedImages: string[] }}
 */
export function loadCatalog() {
  const logoFiles = new Set(fs.readdirSync(LOGOS_DIR));
  const imageFiles = fs.readdirSync(PRODUCT_IMAGES_DIR);
  const imageSet = new Set(imageFiles);

  const brands = readCsv('brands.csv').map((r) => {
    const logoFile = basenameFromUrl(r['لوگو']);
    return {
      id: r['شناسه برند'],
      name: r['نام برند'],
      nameLatin: r['نام لاتین'] === '—' ? '' : r['نام لاتین'],
      sortOrder: Number(r['ردیف']),
      categories: r['دسته‌بندی‌ها'].split('/').map((s) => s.trim()).filter(Boolean),
      logoFile: logoFiles.has(logoFile) ? logoFile : null,
    };
  });
  const brandByName = new Map(brands.map((b) => [b.name, b]));

  const products = readCsv('products.csv').map((r) => {
    const code = r['کد محصول'];
    let imageFile = basenameFromUrl(r['لینک تصویر']);
    if (!imageSet.has(imageFile)) {
      const byCode = imageFiles.filter((f) => f.startsWith(`${code}_`));
      imageFile = byCode.length === 1 ? byCode[0] : null;
    }
    const brand = brandByName.get(r['برند']);
    return {
      id: r['شناسه محصول'],
      code,
      barcode: r['بارکد'],
      name: r['نام محصول'],
      brandName: r['برند'],
      brandId: brand ? brand.id : null,
      category: r['دسته‌بندی'],
      description: r['توضیحات'],
      imageFile,
    };
  });

  const usedLogos = new Set(brands.map((b) => b.logoFile).filter(Boolean));
  const usedImages = new Set(products.map((p) => p.imageFile).filter(Boolean));
  return {
    brands,
    products,
    unmatched: {
      brands: brands.filter((b) => !b.logoFile),
      products: products.filter((p) => !p.imageFile || !p.brandId),
    },
    unusedLogos: [...logoFiles].filter((f) => !usedLogos.has(f)).sort(),
    unusedImages: imageFiles.filter((f) => !usedImages.has(f)).sort(),
  };
}
