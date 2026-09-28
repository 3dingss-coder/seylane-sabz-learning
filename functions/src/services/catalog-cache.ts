import type { Brand, Product } from '../domain/types';
import type { Doc } from '../store/types';
import type { Deps } from './context';

const brandCache = new WeakMap<Deps, { at: number; brands: Doc<Brand>[] }>();

export async function allBrands(d: Deps): Promise<Doc<Brand>[]> {
  const c = brandCache.get(d);
  const now = d.clock().getTime();
  if (c && now - c.at < 60_000) return c.brands;
  const brands = await d.store.query<Brand>({ collection: 'brands' });
  brands.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'fa'));
  brandCache.set(d, { at: now, brands });
  return brands;
}
export function invalidateBrands(d: Deps) {
  brandCache.delete(d);
}

export async function productsById(d: Deps, idsList: string[]): Promise<Map<string, Doc<Product>>> {
  const uniq = [...new Set(idsList.filter(Boolean))];
  const docs = await d.store.getMany<Product>(uniq.map((id) => `products/${id}`));
  const m = new Map<string, Doc<Product>>();
  for (const p of docs) if (p) m.set(p.id, p);
  return m;
}
