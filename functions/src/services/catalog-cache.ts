import type { Brand, Product } from '../domain/types';
import type { Doc } from '../store/types';
import type { Deps } from './context';

const brandCache = new WeakMap<Deps, { at: number; brands: Doc<Brand>[] }>();

export async function allBrands(d: Deps): Promise<Doc<Brand>[]> {
  const c = brandCache.get(d);
  const now = d.clock().getTime();
  if (c && now - c.at < 60_000) return c.brands;
  const brands = await d.store.query<Brand>({ collection: 'brands' });
  brands.sort(
    (a, b) =>
      (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
      (a.name ?? '').localeCompare(b.name ?? '', 'fa'),
  );
  brandCache.set(d, { at: now, brands });
  return brands;
}
export function invalidateBrands(d: Deps) {
  brandCache.delete(d);
}

const productCache = new WeakMap<Deps, { at: number; products: Doc<Product>[] }>();

/** One products scan per minute per isolate. Mentor name-matching used to scan this table on every question. */
export async function allProducts(d: Deps): Promise<Doc<Product>[]> {
  const c = productCache.get(d);
  const now = d.clock().getTime();
  if (c && now - c.at < 60_000) return c.products;
  const products = await d.store.query<Product>({ collection: 'products' });
  productCache.set(d, { at: now, products });
  return products;
}

export function invalidateProducts(d: Deps) {
  productCache.delete(d);
}

export async function productsById(d: Deps, idsList: string[]): Promise<Map<string, Doc<Product>>> {
  const uniq = [...new Set(idsList.filter(Boolean))];
  const docs = await d.store.getMany<Product>(uniq.map((id) => `products/${id}`));
  const m = new Map<string, Doc<Product>>();
  for (const p of docs) if (p) m.set(p.id, p);
  return m;
}
