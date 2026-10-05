import { z } from 'zod';
import type { Brand, Package, Product, User } from '../domain/types';
import type { Doc } from '../store/types';
import { getPolicy, type Deps } from './context';

/** What the marketer is looking at when they ask. Sent by the app, never trusted as a fact source. */
export const pageContextSchema = z
  .object({
    kind: z.enum(['learn', 'brand', 'package', 'section', 'quiz', 'mentor']).optional(),
    brandId: z.string().max(80).nullable().optional(),
    brandName: z.string().max(160).nullable().optional(),
    productId: z.string().max(80).nullable().optional(),
    productName: z.string().max(160).nullable().optional(),
    packageId: z.string().max(80).nullable().optional(),
    packageTitle: z.string().max(200).nullable().optional(),
    sectionId: z.string().max(80).nullable().optional(),
    sectionTitle: z.string().max(200).nullable().optional(),
    progressPercent: z.number().min(0).max(100).nullable().optional(),
    activity: z.array(z.string().max(240)).max(12).optional(),
  })
  .partial();

export type PageContext = z.infer<typeof pageContextSchema>;

export function pageHasSubject(page: PageContext | null | undefined): boolean {
  if (!page) return false;
  return Boolean(
    page.brandId ||
    page.productId ||
    (page.brandName ?? '').trim() ||
    (page.productName ?? '').trim() ||
    (page.packageTitle ?? '').trim(),
  );
}

/**
 * Client page ids are hints. Names and activity text are never copied into the prompt:
 * a marketer can put anything in those fields. Names come from the catalog. When the
 * policy restricts the catalog to assigned brands, a foreign brand id is dropped.
 */
export async function resolvePageContext(
  d: Deps,
  user: Doc<User>,
  page: PageContext | null | undefined,
): Promise<PageContext | null> {
  if (!page?.brandId && !page?.productId && !page?.packageId) return null;
  const policy = await getPolicy(d);
  const assigned =
    policy.mentorCatalogScope === 'assigned' && user.brandIds.length
      ? new Set(user.brandIds)
      : null;
  let brandId = page.brandId || null;
  let productId = page.productId || null;
  if (assigned && brandId && !assigned.has(brandId)) {
    brandId = null;
    productId = null;
  }
  const product = productId ? await d.store.get<Product>(`products/${productId}`) : null;
  if (!product || product.archived) productId = null;
  if (product?.brandId) brandId = product.brandId;
  // A client-supplied id must not load another brand's box when the catalog is restricted.
  if (assigned && brandId && !assigned.has(brandId)) {
    brandId = null;
    productId = null;
  }
  const brand = brandId ? await d.store.get<Brand>(`brands/${brandId}`) : null;
  if (!brand || brand.archived) brandId = null;
  let pkg = page.packageId ? await d.store.get<Package>(`packages/${page.packageId}`) : null;
  if (assigned && pkg && (!pkg.brandId || !assigned.has(pkg.brandId))) pkg = null;
  if (!brandId && !productId && !pkg) return null;
  return {
    kind: page.kind ?? (productId ? 'package' : brandId ? 'brand' : 'package'),
    brandId,
    brandName: brand?.name ?? null,
    productId,
    productName: product?.name ?? null,
    packageId: pkg ? pkg.id : null,
    packageTitle: pkg?.title ?? null,
    sectionId: pkg && page.sectionId ? page.sectionId : null,
    sectionTitle: null,
    progressPercent: typeof page.progressPercent === 'number' ? page.progressPercent : null,
    activity: [],
  };
}

/** Prompt block. Deictic questions («این محصول») must resolve to this page. */
export function renderPageBlock(page: PageContext | null | undefined): string {
  if (!pageHasSubject(page)) return '';
  const brand = (page?.brandName || '').trim();
  const product = (page?.productName || '').trim();
  const pkg = (page?.packageTitle || '').trim();
  const lines = [
    'زمینهٔ صفحه‌ای که کاربر همین حالا در آن است. اگر گفت «این محصول»، «این برند»، «مزیتش»، «این آموزش» یا هر اشاره‌ی مشابه، منظورش همین مورد است — هرگز نپرس منظورت کدام محصول یا برند است:',
  ];
  if (brand) lines.push(`- برند: ${brand}`);
  if (product) lines.push(`- محصول: ${product}`);
  if (pkg) lines.push(`- آموزش باز: ${pkg}`);
  if (typeof page?.progressPercent === 'number')
    lines.push(`- پیشرفت این قسمت: ${Math.round(page.progressPercent)} درصد`);
  if (page?.kind === 'brand' && !product) lines.push('- کاربر صفحه‌ی همین برند را باز کرده است');
  return lines.join('\n');
}
