import { z } from 'zod';

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

/** Prompt block. Deictic questions («این محصول») must resolve to this page. */
export function renderPageBlock(page: PageContext | null | undefined): string {
  if (!pageHasSubject(page) && !(page?.activity?.length)) return '';
  const brand = (page?.brandName || page?.brandId || '').trim();
  const product = (page?.productName || page?.productId || '').trim();
  const pkg = (page?.packageTitle || '').trim();
  const section = (page?.sectionTitle || '').trim();
  const lines = [
    'زمینهٔ صفحه‌ای که کاربر همین حالا در آن است. اگر گفت «این محصول»، «این برند»، «مزیتش»، «این آموزش» یا هر اشاره‌ی مشابه، منظورش همین مورد است — هرگز نپرس منظورت کدام محصول یا برند است:',
  ];
  if (brand) lines.push(`- برند: ${brand}`);
  if (product) lines.push(`- محصول: ${product}`);
  if (pkg) lines.push(`- آموزش باز: ${pkg}`);
  if (section) lines.push(`- قسمت: ${section}`);
  if (typeof page?.progressPercent === 'number')
    lines.push(`- پیشرفت این قسمت: ${Math.round(page.progressPercent)} درصد`);
  if (page?.activity?.length) lines.push(`- کارهای اخیر کاربر در همین صفحات: ${page.activity.join(' | ')}`);
  return lines.join('\n');
}
