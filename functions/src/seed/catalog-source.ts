/**
 * TypeScript port of scripts/lib/catalog-source.mjs for the seed (same deterministic rules):
 *  • brand → logo: basename of `لوگو` column must exist in «لوگو برندها»
 *  • product → image: basename of URL-decoded `لینک تصویر` must exist in «تصاویر محصولات»;
 *    fallback: exactly ONE file named `<code>_*`. Otherwise unmatched (reported, never guessed).
 */
import fs from 'node:fs';
import path from 'node:path';

export interface CatalogPaths {
  root: string;
  catalogDir: string;
  logosDir: string;
  imagesDir: string;
}

export function catalogPaths(repoRoot: string): CatalogPaths {
  const assets = path.join(repoRoot, 'لوگو برندها و تصاویر محصولات');
  return {
    root: repoRoot,
    catalogDir: path.join(repoRoot, 'لیست برندها و محصولات سیلانه سبز'),
    logosDir: path.join(assets, 'لوگو برندها'),
    imagesDir: path.join(assets, 'تصاویر محصولات'),
  };
}

export function parseCsv(text: string): Array<Record<string, string>> {
  const src = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
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
  if (!header) return [];
  return body.map((r) =>
    Object.fromEntries(header.map((h, idx) => [h.trim(), (r[idx] ?? '').trim()])),
  );
}

function basenameFromUrl(url: string): string {
  if (!url) return '';
  const last = url.split('/').pop() ?? '';
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

export interface SourceBrand {
  id: string;
  name: string;
  nameLatin: string | null;
  sortOrder: number;
  logoFile: string | null;
}
export interface SourceProduct {
  id: string;
  code: string;
  barcode: string | null;
  name: string;
  brandId: string | null;
  category: string | null;
  description: string | null;
  imageFile: string | null;
}
export interface HiddenProduct {
  id: string;
  code: string;
  name: string;
  brandName: string;
}

export function loadCatalog(p: CatalogPaths) {
  const read = (n: string) => parseCsv(fs.readFileSync(path.join(p.catalogDir, n), 'utf8'));
  // Asset binaries are distributed separately to keep source imports lightweight. Catalog
  // records still seed without local files; production images come from Firebase Storage.
  const safeReadDir = (dir: string) => (fs.existsSync(dir) ? fs.readdirSync(dir) : []);
  const logoFiles = new Set(safeReadDir(p.logosDir));
  const imageFiles = safeReadDir(p.imagesDir);
  const imageSet = new Set(imageFiles);
  const matchImage = (code: string, url: string) => {
    const f = basenameFromUrl(url);
    if (f && imageSet.has(f)) return f;
    const byCode = imageFiles.filter((x) => x.startsWith(`${code}_`));
    return byCode.length === 1 ? (byCode[0] ?? null) : null;
  };
  const brands: SourceBrand[] = read('brands.csv').map((r) => {
    const logo = basenameFromUrl(r['لوگو'] ?? '');
    const latin = r['نام لاتین'] ?? '';
    return {
      id: r['شناسه برند'] ?? '',
      name: r['نام برند'] ?? '',
      nameLatin: latin && latin !== '—' ? latin : null,
      sortOrder: Number(r['ردیف']),
      logoFile: logoFiles.has(logo) ? logo : null,
    };
  });
  const brandByName = new Map(brands.map((b) => [b.name, b]));
  const products: SourceProduct[] = read('products.csv').map((r) => {
    const code = r['کد محصول'] ?? '';
    return {
      id: r['شناسه محصول'] ?? '',
      code,
      barcode: r['بارکد'] || null,
      name: r['نام محصول'] ?? '',
      brandId: brandByName.get(r['برند'] ?? '')?.id ?? null,
      category: r['دسته‌بندی'] || null,
      description: r['توضیحات'] || null,
      imageFile: matchImage(code, r['لینک تصویر'] ?? ''),
    };
  });
  const hidden: HiddenProduct[] = read('hidden-products.csv').map((r) => ({
    id: r['شناسه محصول'] ?? '',
    code: r['کد محصول'] ?? '',
    name: r['نام محصول'] ?? '',
    brandName: r['برند'] ?? '',
  }));
  return { brands, products, hidden, matchImage, logoFiles };
}
