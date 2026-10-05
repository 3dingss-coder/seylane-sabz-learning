import { z } from 'zod';
import { ApiError } from '../http/errors';
import { isoDate, text } from '../http/validate';
import { extractYoutubeId } from '../lib/ids';
import { EXT, MEDIA_RULES, mp4DurationFromBuffer, sniff, type MediaKind } from '../lib/media';
import type { Doc } from '../store/types';
import type {
  Assignment,
  Brand,
  MediaAsset,
  Package,
  Product,
  Question,
  Quiz,
  Section,
  SectionProgress,
  SectionSummary,
} from '../domain/types';
import { audit, nowIso, track, type Actor, type Deps } from './context';
import { allBrands, invalidateBrands } from './catalog-cache';

const notFound = (what: string) => new ApiError('NOT_FOUND', `${what} پیدا نشد.`);

export async function holdingLogoUrl(d: Deps): Promise<string> {
  const s = await d.store.get<{ holdingLogoUrl: string }>('settings/branding');
  return s?.holdingLogoUrl ?? '';
}

// ─── Brands ─────────────────────────────────────────────────────────────────
export const brandSchema = z.object({
  name: text(2, 60, 'نام برند'),
  nameLatin: z.string().trim().max(60).nullable().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
});
export const brandPatchSchema = brandSchema
  .partial()
  .extend({ archived: z.boolean().optional(), logoMediaId: z.string().max(80).optional() });

export async function listBrandsAdmin(d: Deps) {
  const [brands, products, packages] = await Promise.all([
    d.store.query<Brand>({ collection: 'brands' }),
    d.store.query<Product>({ collection: 'products', where: [['archived', '==', false]] }),
    d.store.query<Package>({ collection: 'packages' }),
  ]);
  return brands
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'fa'))
    .map((b) => ({
      ...b,
      productCount: products.filter((p) => p.brandId === b.id).length,
      packageCount: packages.filter((p) => p.brandId === b.id && p.status !== 'archived').length,
    }));
}

async function assertUniqueBrandName(d: Deps, name: string, exceptId?: string) {
  const same = await d.store.query<Brand>({ collection: 'brands', where: [['name', '==', name]] });
  if (same.some((b) => b.id !== exceptId))
    throw new ApiError('CONFLICT', 'برندی با این نام وجود دارد.');
}

export async function createBrand(d: Deps, actor: Actor, input: z.infer<typeof brandSchema>) {
  await assertUniqueBrandName(d, input.name);
  const id = `brand-${d.store.newId().slice(0, 10).toLowerCase()}`;
  const now = nowIso(d);
  const brands = await allBrands(d);
  const brand: Brand = {
    name: input.name,
    nameLatin: input.nameLatin ?? null,
    logoUrl: await holdingLogoUrl(d),
    logoPath: null,
    logoIsFallback: true,
    sortOrder: input.sortOrder ?? brands.length + 1,
    archived: false,
    source: 'admin',
    createdAt: now,
    updatedAt: now,
  };
  await d.store.set(`brands/${id}`, brand as unknown as Record<string, unknown>);
  invalidateBrands(d);
  await audit(d, actor, 'brand.created', 'brands', id, null, brand);
  return { id, ...brand };
}

export async function updateBrand(
  d: Deps,
  actor: Actor,
  id: string,
  input: z.infer<typeof brandPatchSchema>,
) {
  const brand = await d.store.get<Brand>(`brands/${id}`);
  if (!brand) throw notFound('برند');
  if (input.name && input.name !== brand.name) await assertUniqueBrandName(d, input.name, id);
  const { logoMediaId, ...rest } = input;
  const patch: Partial<Brand> = { ...rest, updatedAt: nowIso(d) } as Partial<Brand>;
  if (logoMediaId) {
    const media = await readyMedia(d, logoMediaId, 'image');
    if (media.target.type !== 'brand_logo' || media.target.id !== id)
      throw new ApiError('VALIDATION', 'این تصویر برای لوگوی این برند آپلود نشده است.');
    patch.logoPath = media.path;
    patch.logoUrl = await d.blob.publicUrl(media.path);
    patch.logoIsFallback = false;
  }
  await d.store.update(`brands/${id}`, patch as Record<string, unknown>);
  invalidateBrands(d);
  await audit(
    d,
    actor,
    logoMediaId ? 'brand.logo_updated' : 'brand.updated',
    'brands',
    id,
    brand,
    patch,
  );
  return { ...brand, ...patch, id };
}

// ─── Products ───────────────────────────────────────────────────────────────
export const productSchema = z.object({
  brandId: z.string().min(1, 'برند را انتخاب کنید.').max(80),
  name: text(2, 120, 'نام محصول'),
  code: z.string().trim().max(40).nullable().optional(),
  category: z.string().trim().max(60).nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
});
export const productPatchSchema = productSchema
  .partial()
  .extend({ archived: z.boolean().optional(), imageMediaId: z.string().max(80).optional() });

export async function listProductsAdmin(
  d: Deps,
  f: { brandId?: string; q?: string; archived?: boolean },
) {
  const where: Array<[string, '==', unknown]> = [];
  if (f.brandId) where.push(['brandId', '==', f.brandId]);
  if (f.archived !== undefined) where.push(['archived', '==', f.archived]);
  let list = await d.store.query<Product>({ collection: 'products', where });
  if (f.q)
    list = list.filter((p) => p.name.includes(f.q ?? '') || (p.code ?? '').includes(f.q ?? ''));
  return list.sort((a, b) => a.name.localeCompare(b.name, 'fa'));
}

export async function createProduct(d: Deps, actor: Actor, input: z.infer<typeof productSchema>) {
  const brand = await d.store.get<Brand>(`brands/${input.brandId}`);
  if (!brand || brand.archived) throw new ApiError('VALIDATION', 'برند انتخاب‌شده معتبر نیست.');
  const id = input.code
    ? `sb-${input.code.replace(/[^\w-]/g, '')}`
    : `prd-${d.store.newId().slice(0, 12).toLowerCase()}`;
  if (await d.store.get(`products/${id}`))
    throw new ApiError('CONFLICT', 'محصولی با این کد وجود دارد.');
  const now = nowIso(d);
  const product: Product = {
    brandId: input.brandId,
    name: input.name,
    code: input.code ?? null,
    barcode: null,
    category: input.category ?? null,
    description: input.description ?? null,
    imageUrl: brand.logoUrl,
    imagePath: null,
    imageIsFallback: true,
    archived: false,
    source: 'admin',
    createdAt: now,
    updatedAt: now,
  };
  await d.store.set(`products/${id}`, product as unknown as Record<string, unknown>);
  await audit(d, actor, 'product.created', 'products', id, null, product);
  return { id, ...product };
}

export async function updateProduct(
  d: Deps,
  actor: Actor,
  id: string,
  input: z.infer<typeof productPatchSchema>,
) {
  const product = await d.store.get<Product>(`products/${id}`);
  if (!product) throw notFound('محصول');
  const { imageMediaId, ...rest } = input;
  if (rest.brandId && rest.brandId !== product.brandId) {
    const b = await d.store.get<Brand>(`brands/${rest.brandId}`);
    if (!b) throw new ApiError('VALIDATION', 'برند انتخاب‌شده معتبر نیست.');
  }
  const patch: Partial<Product> = { ...rest, updatedAt: nowIso(d) } as Partial<Product>;
  if (imageMediaId) {
    const media = await readyMedia(d, imageMediaId, 'image');
    if (media.target.type !== 'product_image' || media.target.id !== id)
      throw new ApiError('VALIDATION', 'این تصویر برای این محصول آپلود نشده است.');
    patch.imagePath = media.path;
    patch.imageUrl = await d.blob.publicUrl(media.path);
    patch.imageIsFallback = false;
  }
  await d.store.update(`products/${id}`, patch as Record<string, unknown>);
  await audit(
    d,
    actor,
    imageMediaId ? 'product.image_updated' : 'product.updated',
    'products',
    id,
    product,
    patch,
  );
  return { ...product, ...patch, id };
}

// ─── Media (D28) ────────────────────────────────────────────────────────────
export const uploadUrlSchema = z.object({
  kind: z.enum(['video', 'audio', 'image']),
  fileName: z.string().trim().min(1).max(200),
  mime: z.string().trim().max(100),
  sizeBytes: z.number().int().positive(),
  target: z
    .object({
      type: z.enum(['section', 'brand_logo', 'product_image']),
      id: z.string().max(80).nullable().optional(),
    })
    .optional(),
});

export async function createUploadUrl(
  d: Deps,
  actor: Actor,
  input: z.infer<typeof uploadUrlSchema>,
) {
  const rule = MEDIA_RULES[input.kind];
  const mime = input.mime.toLowerCase();
  if (!rule.mimes.includes(mime))
    throw new ApiError('VALIDATION', `نوع فایل ${rule.label} پشتیبانی نمی‌شود.`, {
      allowed: rule.mimes,
    });
  if (input.sizeBytes > rule.maxBytes)
    throw new ApiError(
      'VALIDATION',
      `حجم فایل ${rule.label} حداکثر ${Math.round(rule.maxBytes / 1024 / 1024)} مگابایت است.`,
    );
  const target = input.target ?? { type: 'section' as const, id: null };
  if (target.type !== 'section' && input.kind !== 'image')
    throw new ApiError('VALIDATION', 'برای لوگو و تصویر محصول فقط تصویر مجاز است.');
  if (target.type === 'brand_logo' && !(target.id && (await d.store.get(`brands/${target.id}`))))
    throw notFound('برند');
  if (
    target.type === 'product_image' &&
    !(target.id && (await d.store.get(`products/${target.id}`)))
  )
    throw notFound('محصول');
  const id = d.store.newId();
  const ext = EXT[mime] ?? 'bin';
  // Random names / private paths (spec §24). Catalog images live under brands/ & products/ (public read).
  const path =
    target.type === 'brand_logo'
      ? `brands/${target.id}/logo-${id}.${ext}`
      : target.type === 'product_image'
        ? `products/${target.id}/main-${id}.${ext}`
        : `media/${input.kind}/${id}.${ext}`;
  const asset: MediaAsset = {
    kind: input.kind,
    status: 'pending',
    path,
    declaredMime: mime,
    mime: null,
    sizeBytes: null,
    declaredSize: input.sizeBytes,
    originalName: input.fileName.replace(/[^\p{L}\p{N}._\- ]/gu, '_'),
    durationSec: null,
    target: { type: target.type, id: target.id ?? null },
    createdBy: actor.id,
    createdAt: nowIso(d),
    rejectReason: null,
  };
  await d.store.set(`media/${id}`, asset as unknown as Record<string, unknown>);
  const ticket = await d.blob.createUploadUrl(path, mime, rule.maxBytes);
  return { mediaId: id, upload: ticket };
}

export const finalizeSchema = z.object({
  durationSec: z
    .number()
    .positive()
    .max(6 * 3600)
    .optional(),
});

export async function finalizeMedia(
  d: Deps,
  actor: Actor,
  mediaId: string,
  input: z.infer<typeof finalizeSchema>,
) {
  const asset = await d.store.get<MediaAsset>(`media/${mediaId}`);
  if (!asset) throw notFound('فایل');
  if (asset.status === 'ready') return publicMedia(asset);
  const stat = await d.blob.stat(asset.path);
  if (!stat) throw new ApiError('CONFLICT', 'فایل هنوز آپلود نشده است. دوباره تلاش کنید.');
  const rule = MEDIA_RULES[asset.kind];
  const reject = async (reason: string) => {
    await d.store.update(`media/${mediaId}`, { status: 'rejected', rejectReason: reason });
    await d.blob.delete(asset.path);
    throw new ApiError('VALIDATION', reason);
  };
  if (stat.size > rule.maxBytes) await reject(`حجم فایل ${rule.label} بیش از حد مجاز است.`);
  if (stat.size === 0) await reject('فایل خالی است.');
  const head = await d.blob.readRange(asset.path, 0, 63);
  const detected = sniff(head);
  if (!detected || !detected.kinds.includes(asset.kind))
    await reject(`محتوای فایل با نوع ${rule.label} مطابقت ندارد یا فرمت آن پشتیبانی نمی‌شود.`);
  let duration = input.durationSec ?? null;
  if (
    !duration &&
    asset.kind !== 'image' &&
    detected &&
    ['video/mp4', 'audio/mp4', 'video/quicktime', 'video/3gpp'].includes(detected.mime)
  ) {
    const headBig = await d.blob.readRange(asset.path, 0, Math.min(stat.size, 2 * 1024 * 1024) - 1);
    duration = mp4DurationFromBuffer(headBig);
    if (!duration && stat.size > 2 * 1024 * 1024) {
      const tail = await d.blob.readRange(
        asset.path,
        Math.max(0, stat.size - 4 * 1024 * 1024),
        stat.size - 1,
      );
      duration = mp4DurationFromBuffer(tail);
    }
  }
  const mime =
    detected?.mime === 'video/mp4' && asset.kind === 'audio'
      ? 'audio/mp4'
      : (detected?.mime ?? asset.declaredMime);
  const patch = { status: 'ready' as const, mime, sizeBytes: stat.size, durationSec: duration };
  await d.store.update(`media/${mediaId}`, patch);
  await audit(d, actor, 'media.uploaded', 'media', mediaId, null, {
    kind: asset.kind,
    mime,
    size: stat.size,
  });
  await track(d, 'admin_media_uploaded', actor.id, { type: asset.kind });
  return publicMedia({ ...asset, ...patch, id: mediaId });
}

function publicMedia(a: Doc<MediaAsset>) {
  return {
    id: a.id,
    kind: a.kind,
    status: a.status,
    mime: a.mime,
    sizeBytes: a.sizeBytes,
    durationSec: a.durationSec,
    originalName: a.originalName,
    target: a.target,
  };
}

async function readyMedia(d: Deps, id: string, kind: MediaKind): Promise<Doc<MediaAsset>> {
  const m = await d.store.get<MediaAsset>(`media/${id}`);
  if (!m || m.status !== 'ready')
    throw new ApiError('VALIDATION', 'فایل انتخاب‌شده آماده نیست. دوباره آپلود کنید.');
  if (m.kind !== kind) throw new ApiError('VALIDATION', 'نوع فایل با نوع قسمت مطابقت ندارد.');
  return m;
}

// ─── Packages ───────────────────────────────────────────────────────────────
export const packageSchema = z.object({
  title: text(3, 120, 'عنوان بسته'),
  description: z.string().trim().max(3000).optional().default(''),
  brandId: z.string().max(80).nullable().optional(),
  productId: z.string().max(80).nullable().optional(),
  deadlineAt: isoDate('مهلت').nullable().optional(),
  /** Personal learning window in hours, counted from each marketer's own start. */
  deadlineHours: z
    .number({ message: 'مهلت یادگیری را به ساعت وارد کنید.' })
    .int('مهلت یادگیری باید عدد صحیح باشد.')
    .min(1, 'مهلت یادگیری حداقل ۱ ساعت است.')
    .max(24 * 365, 'مهلت یادگیری بیش از حد طولانی است.')
    .nullable()
    .optional(),
  estimatedMinutes: z.number().int().min(0).max(1000).optional(),
  coverUrl: z.string().url().max(500).nullable().optional(),
});
export const packagePatchSchema = packageSchema.partial();

async function validateLinks(
  d: Deps,
  brandId: string | null | undefined,
  productId: string | null | undefined,
) {
  let brand = brandId ?? null;
  if (productId) {
    const p = await d.store.get<Product>(`products/${productId}`);
    if (!p) throw new ApiError('VALIDATION', 'محصول انتخاب‌شده معتبر نیست.');
    if (brand && brand !== p.brandId)
      throw new ApiError('VALIDATION', 'محصول به برند انتخاب‌شده تعلق ندارد.');
    brand = p.brandId;
  }
  if (brand && !(await d.store.get(`brands/${brand}`)))
    throw new ApiError('VALIDATION', 'برند انتخاب‌شده معتبر نیست.');
  return { brandId: brand, productId: productId ?? null };
}

export const adminPackageQuery = z.object({
  brandId: z.string().max(80).optional(),
  productId: z.string().max(80).optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
  unassigned: z.enum(['true', 'false']).optional(),
  q: z.string().max(80).optional(),
});

export async function listPackagesAdmin(d: Deps, f: z.infer<typeof adminPackageQuery>) {
  const where: Array<[string, '==', unknown]> = [];
  if (f.status) where.push(['status', '==', f.status]);
  if (f.productId) where.push(['productId', '==', f.productId]);
  else if (f.brandId) where.push(['brandId', '==', f.brandId]);
  if (f.unassigned === 'true') where.push(['brandId', '==', null]);
  let list = await d.store.query<Package>({ collection: 'packages', where });
  if (f.q) list = list.filter((p) => p.title.includes(f.q ?? ''));
  return list.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export async function getPackageAdmin(d: Deps, id: string) {
  const pkg = await d.store.get<Package>(`packages/${id}`);
  if (!pkg) throw notFound('بسته');
  const sections = (await d.store.query<Section>({ collection: `packages/${id}/sections` })).sort(
    (a, b) => a.order - b.order,
  );
  const quizzes = await d.store.getMany<Quiz>(sections.map((s) => `quizzes/${s.quizId}`));
  return {
    package: pkg,
    sections: sections.map((s, i) => ({
      ...s,
      quiz: quizzes[i]
        ? {
            id: quizzes[i]?.id,
            questionCount: quizzes[i]?.questionCount ?? 0,
            needsReview: quizzes[i]?.needsReview ?? false,
            version: quizzes[i]?.version ?? 1,
          }
        : null,
    })),
    publishIssues: await validatePublish(d, pkg, sections),
  };
}

export async function createPackage(
  d: Deps,
  actor: Actor,
  input: z.infer<typeof packageSchema>,
  seedTag: string | null = null,
) {
  const links = await validateLinks(d, input.brandId, input.productId);
  const id = d.store.newId();
  const now = nowIso(d);
  const pkg: Package = {
    ...links,
    title: input.title,
    description: input.description ?? '',
    status: 'draft',
    deadlineAt: input.deadlineAt ?? null,
    deadlineHours: input.deadlineHours ?? null,
    estimatedMinutes: input.estimatedMinutes ?? 0,
    coverUrl: input.coverUrl ?? null,
    sections: [],
    createdBy: actor.id,
    publishedAt: null,
    seedTag,
    createdAt: now,
    updatedAt: now,
  };
  await d.store.set(`packages/${id}`, pkg as unknown as Record<string, unknown>);
  await audit(d, actor, 'package.created', 'packages', id, null, pkg);
  await track(d, 'admin_package_created', actor.id, { packageId: id });
  return { id, ...pkg };
}

export async function updatePackage(
  d: Deps,
  actor: Actor,
  id: string,
  input: z.infer<typeof packagePatchSchema>,
) {
  const pkg = await d.store.get<Package>(`packages/${id}`);
  if (!pkg) throw notFound('بسته');
  const patch: Record<string, unknown> = { ...input, updatedAt: nowIso(d) };
  if (input.brandId !== undefined || input.productId !== undefined) {
    const links = await validateLinks(
      d,
      input.brandId !== undefined ? input.brandId : pkg.brandId,
      input.productId !== undefined ? input.productId : pkg.productId,
    );
    if (pkg.status === 'published' && !links.brandId)
      throw new ApiError('VALIDATION', 'بسته منتشرشده باید برند داشته باشد.');
    Object.assign(patch, links);
  }
  if (
    pkg.status === 'published' &&
    (input.deadlineAt !== undefined || input.deadlineHours !== undefined)
  ) {
    const nextAt = input.deadlineAt !== undefined ? input.deadlineAt : pkg.deadlineAt;
    const nextHours = input.deadlineHours !== undefined ? input.deadlineHours : pkg.deadlineHours;
    if (!nextAt && !nextHours)
      throw new ApiError('VALIDATION', 'بسته منتشرشده باید مهلت داشته باشد.');
  }
  await d.store.update(`packages/${id}`, patch);
  await audit(d, actor, 'package.updated', 'packages', id, pkg, patch);
  await track(d, 'admin_package_updated', actor.id, { packageId: id });
  return { ...pkg, ...patch, id };
}

/** Publish rules (spec §18.2 / §20.2). Returns Persian issues; empty = publishable. */
export async function validatePublish(
  d: Deps,
  pkg: Package,
  sectionsIn?: Array<Doc<Section>>,
): Promise<string[]> {
  const issues: string[] = [];
  if (!pkg.brandId) issues.push('برند بسته مشخص نشده است (پیش‌نویس بدون تخصیص).');
  // A deadline is optional. When an absolute one is set it must still lie in the future.
  if (!pkg.deadlineHours && pkg.deadlineAt && pkg.deadlineAt <= d.clock().toISOString())
    issues.push('مهلت بسته باید در آینده باشد.');
  const sections = (
    sectionsIn ??
    (await d.store.query<Section>({ collection: `packages/${(pkg as Doc<Package>).id}/sections` }))
  ).filter((s) => !s.archived);
  if (!sections.length) issues.push('بسته باید حداقل یک قسمت داشته باشد.');
  for (const s of sections) {
    const label = `قسمت «${s.title}»`;
    if (!(s.durationSec > 0)) issues.push(`${label}: مدت زمان مشخص نیست.`);
    if (s.mediaSource === 'youtube' && !s.youtubeId)
      issues.push(`${label}: لینک یوتیوب معتبر نیست.`);
    if (s.mediaSource === 'file' && !s.mediaPath)
      issues.push(`${label}: فایل رسانه آپلود نشده است.`);
    if (s.quizRequired === false) continue; // the package quiz lives on another section
    const qs = await d.store.query<Question>({
      collection: `quizzes/${s.quizId}/questions`,
      where: [['archived', '==', false]],
    });
    if (qs.length < 3) issues.push(`${label}: آزمون باید حداقل ۳ سؤال داشته باشد.`);
    if (qs.some((q) => !q.options.some((o) => o.key === q.answerKey)))
      issues.push(`${label}: برای برخی سؤال‌ها گزینه صحیح انتخاب نشده است.`);
  }
  return issues;
}

/**
 * `defaultAudience` (admin UI default): if no active assignment covers the package, give it the
 * global audience so «published» really means «visible to marketers». Internal callers keep the
 * strict spec behaviour (published ∩ assigned) unless they opt in.
 */
export async function publishPackage(
  d: Deps,
  actor: Actor,
  id: string,
  opts: { defaultAudience?: boolean } = {},
) {
  const pkg = await d.store.get<Package>(`packages/${id}`);
  if (!pkg) throw notFound('بسته');
  if (pkg.status === 'published') return pkg;
  const issues = await validatePublish(d, pkg);
  if (issues.length)
    throw new ApiError('VALIDATION', 'بسته هنوز کامل نیست و منتشر نمی‌شود.', { issues });
  const now = nowIso(d);
  const publishedAt = pkg.publishedAt ?? now;
  await d.store.update(`packages/${id}`, {
    status: 'published',
    publishedAt,
    updatedAt: now,
  });
  await audit(
    d,
    actor,
    'package.published',
    'packages',
    id,
    { status: pkg.status },
    { status: 'published' },
  );
  await track(d, 'admin_package_published', actor.id, { packageId: id });
  const { notifyAssignedUsers, ensureDefaultAudience } = await import('./assignments');
  if (opts.defaultAudience) await ensureDefaultAudience(d, actor, id);
  const { notified, recipients } = await notifyAssignedUsers(d, [id]);
  // Return the stored document (not the pre-publish one) so callers can trust publishedAt/status.
  const fresh = await d.store.get<Package>(`packages/${id}`);
  return { ...(fresh ?? pkg), status: 'published' as const, notified, recipients, id };
}

export async function unpublishPackage(d: Deps, actor: Actor, id: string) {
  const pkg = await d.store.get<Package>(`packages/${id}`);
  if (!pkg) throw notFound('بسته');
  const started = await d.store.query<SectionProgress>({
    collection: 'section_progress',
    where: [['packageId', '==', id]],
    limit: 1,
  });
  if (started.length)
    throw new ApiError(
      'CONFLICT',
      'بعضی کاربران این بسته را شروع کرده‌اند؛ به‌جای لغو انتشار، آن را بایگانی کنید.',
    );
  await d.store.update(`packages/${id}`, { status: 'draft', updatedAt: nowIso(d) });
  await audit(
    d,
    actor,
    'package.unpublished',
    'packages',
    id,
    { status: pkg.status },
    { status: 'draft' },
  );
  return { ...pkg, status: 'draft' as const, id };
}

export async function archivePackage(d: Deps, actor: Actor, id: string) {
  const pkg = await d.store.get<Package>(`packages/${id}`);
  if (!pkg) throw notFound('بسته');
  await d.store.update(`packages/${id}`, { status: 'archived', updatedAt: nowIso(d) });
  await audit(
    d,
    actor,
    'package.archived',
    'packages',
    id,
    { status: pkg.status },
    { status: 'archived' },
  );
  await track(d, 'admin_package_archived', actor.id, { packageId: id });
  const assignments = await d.store.query<Assignment>({
    collection: 'assignments',
    where: [['revokedAt', '==', null]],
  });
  return {
    ...pkg,
    status: 'archived' as const,
    id,
    /** Active assignments that referenced it — they keep the (now invisible) package. */
    affectedAssignments: assignments.filter((a) => a.packageIds.includes(id)).length,
  };
}

/**
 * Restores an archived package. It goes back to `published` only when it still passes the publish
 * rules (a deadline that expired while it was archived must be fixed first) — otherwise to `draft`.
 */
export async function unarchivePackage(
  d: Deps,
  actor: Actor,
  id: string,
  opts: { defaultAudience?: boolean } = {},
) {
  const pkg = await d.store.get<Package>(`packages/${id}`);
  if (!pkg) throw notFound('بسته');
  if (pkg.status !== 'archived') return { ...pkg, id, publishIssues: [] as string[] };
  const issues = await validatePublish(d, pkg);
  const status = issues.length ? ('draft' as const) : ('published' as const);
  await d.store.update(`packages/${id}`, { status, updatedAt: nowIso(d) });
  await audit(d, actor, 'package.unarchived', 'packages', id, { status: pkg.status }, { status });
  await track(d, 'admin_package_unarchived', actor.id, { packageId: id, status });
  if (status === 'published') {
    const { notifyAssignedUsers, ensureDefaultAudience } = await import('./assignments');
    if (opts.defaultAudience) await ensureDefaultAudience(d, actor, id);
    await notifyAssignedUsers(d, [id]);
  }
  const fresh = await d.store.get<Package>(`packages/${id}`);
  return { ...(fresh ?? pkg), status, id, publishIssues: issues };
}

// ─── Sections ───────────────────────────────────────────────────────────────
export const sectionSchema = z
  .object({
    title: text(2, 120, 'عنوان قسمت'),
    description: z.string().trim().max(3000).optional().default(''),
    transcript: z.string().trim().max(20000).optional().default(''),
    mediaType: z.enum(['video', 'audio']),
    mediaSource: z.enum(['youtube', 'file']),
    youtubeUrl: z.string().trim().max(300).nullable().optional(),
    mediaId: z.string().max(80).nullable().optional(),
    durationSec: z
      .number()
      .positive('مدت زمان باید بیشتر از صفر باشد.')
      .max(6 * 3600)
      .optional(),
  })
  .refine((s) => !(s.mediaType === 'audio' && s.mediaSource === 'youtube'), {
    message: 'قسمت صوتی فقط با فایل آپلودی ممکن است.',
    path: ['mediaSource'],
  });

export const sectionPatchSchema = z.object({
  title: text(2, 120, 'عنوان قسمت').optional(),
  description: z.string().trim().max(3000).optional(),
  transcript: z.string().trim().max(20000).optional(),
  mediaType: z.enum(['video', 'audio']).optional(),
  mediaSource: z.enum(['youtube', 'file']).optional(),
  youtubeUrl: z.string().trim().max(300).nullable().optional(),
  mediaId: z.string().max(80).nullable().optional(),
  durationSec: z
    .number()
    .positive()
    .max(6 * 3600)
    .optional(),
  archived: z.boolean().optional(),
});

async function resolveMedia(
  d: Deps,
  s: {
    mediaType: 'video' | 'audio';
    mediaSource: 'youtube' | 'file';
    youtubeUrl?: string | null;
    mediaId?: string | null;
    durationSec?: number;
  },
) {
  if (s.mediaSource === 'youtube') {
    const yid = s.youtubeUrl ? extractYoutubeId(s.youtubeUrl) : null;
    if (!yid)
      throw new ApiError(
        'VALIDATION',
        'لینک یوتیوب معتبر نیست. نمونه: https://youtu.be/xxxxxxxxxxx',
        { field: 'youtubeUrl' },
      );
    if (!s.durationSec)
      throw new ApiError('VALIDATION', 'مدت زمان ویدیو را وارد کنید.', { field: 'durationSec' });
    return {
      youtubeUrl: s.youtubeUrl ?? null,
      youtubeId: yid,
      mediaId: null,
      mediaPath: null,
      mediaMime: null,
      mediaSizeBytes: null,
      durationSec: s.durationSec,
    };
  }
  if (!s.mediaId)
    throw new ApiError('VALIDATION', 'فایل رسانه را آپلود کنید.', { field: 'mediaId' });
  const m = await readyMedia(d, s.mediaId, s.mediaType);
  const durationSec = s.durationSec ?? m.durationSec ?? 0;
  if (!(durationSec > 0))
    throw new ApiError('VALIDATION', 'مدت زمان فایل مشخص نشد؛ آن را وارد کنید.', {
      field: 'durationSec',
    });
  return {
    youtubeUrl: null,
    youtubeId: null,
    mediaId: m.id,
    mediaPath: m.path,
    mediaMime: m.mime,
    mediaSizeBytes: m.sizeBytes,
    durationSec,
  };
}

export async function refreshPackageSummary(d: Deps, packageId: string) {
  const sections = (
    await d.store.query<Section>({ collection: `packages/${packageId}/sections` })
  ).sort((a, b) => a.order - b.order);
  const summary: SectionSummary[] = sections.map((s) => ({
    id: s.id,
    order: s.order,
    title: s.title,
    mediaType: s.mediaType,
    durationSec: s.durationSec,
    quizId: s.quizId,
    quizRequired: s.quizRequired !== false,
    archived: s.archived,
  }));
  const minutes = Math.round(
    sections.filter((s) => !s.archived).reduce((a, s) => a + s.durationSec, 0) / 60,
  );
  await d.store.update(`packages/${packageId}`, {
    sections: summary,
    estimatedMinutes: Math.max(1, minutes),
    updatedAt: nowIso(d),
  });
}

export async function createSection(
  d: Deps,
  actor: Actor,
  packageId: string,
  input: z.infer<typeof sectionSchema>,
) {
  const pkg = await d.store.get<Package>(`packages/${packageId}`);
  if (!pkg) throw notFound('بسته');
  if (pkg.status === 'archived')
    throw new ApiError('CONFLICT', 'بسته بایگانی‌شده قابل ویرایش نیست.');
  const media = await resolveMedia(d, input);
  const existing = await d.store.query<Section>({ collection: `packages/${packageId}/sections` });
  const id = d.store.newId();
  const quizId = d.store.newId();
  const now = nowIso(d);
  const section: Section = {
    packageId,
    order: existing.reduce((m, s) => Math.max(m, s.order), 0) + 1,
    title: input.title,
    description: input.description ?? '',
    transcript: input.transcript ?? '',
    mediaType: input.mediaType,
    mediaSource: input.mediaSource,
    ...media,
    quizId,
    archived: false,
    createdAt: now,
    updatedAt: now,
  };
  const quiz: Quiz = {
    sectionId: id,
    packageId,
    passScore: null,
    maxAttempts: null,
    version: 1,
    active: true,
    questionCount: 0,
    needsReview: false,
    createdAt: now,
    updatedAt: now,
  };
  await d.store.set(
    `packages/${packageId}/sections/${id}`,
    section as unknown as Record<string, unknown>,
  );
  await d.store.set(`section_index/${id}`, { packageId });
  await d.store.set(`quizzes/${quizId}`, quiz as unknown as Record<string, unknown>);
  await refreshPackageSummary(d, packageId);
  await audit(d, actor, 'section.created', 'sections', id, null, section);
  return { id, ...section };
}

export async function updateSection(
  d: Deps,
  actor: Actor,
  packageId: string,
  sectionId: string,
  input: z.infer<typeof sectionPatchSchema>,
) {
  const path = `packages/${packageId}/sections/${sectionId}`;
  const s = await d.store.get<Section>(path);
  if (!s) throw notFound('قسمت');
  const patch: Record<string, unknown> = { updatedAt: nowIso(d) };
  for (const k of ['title', 'description', 'transcript', 'archived'] as const)
    if (input[k] !== undefined) patch[k] = input[k];
  const mediaTouched = ['mediaType', 'mediaSource', 'youtubeUrl', 'mediaId', 'durationSec'].some(
    (k) => (input as Record<string, unknown>)[k] !== undefined,
  );
  if (mediaTouched) {
    const merged = {
      mediaType: input.mediaType ?? s.mediaType,
      mediaSource: input.mediaSource ?? s.mediaSource,
      youtubeUrl: input.youtubeUrl !== undefined ? input.youtubeUrl : s.youtubeUrl,
      mediaId: input.mediaId !== undefined ? input.mediaId : s.mediaId,
      durationSec: input.durationSec ?? s.durationSec,
    };
    if (merged.mediaType === 'audio' && merged.mediaSource === 'youtube')
      throw new ApiError('VALIDATION', 'قسمت صوتی فقط با فایل آپلودی ممکن است.');
    Object.assign(
      patch,
      { mediaType: merged.mediaType, mediaSource: merged.mediaSource },
      await resolveMedia(d, merged),
    );
  }
  // Restoring an archived section puts it at the END of the list: keeping its old `order` would
  // collide with the section that took its place while it was archived.
  if (input.archived === false && s.archived) {
    const live = await d.store.query<Section>({ collection: `packages/${packageId}/sections` });
    patch.order =
      live.reduce((m, x) => (x.id === sectionId || x.archived ? m : Math.max(m, x.order)), 0) + 1;
  }
  await d.store.update(path, patch);
  await refreshPackageSummary(d, packageId);
  await audit(
    d,
    actor,
    input.archived ? 'section.archived' : 'section.updated',
    'sections',
    sectionId,
    s,
    patch,
  );
  return { ...s, ...patch, id: sectionId };
}

export const reorderSchema = z.object({ ids: z.array(z.string().max(80)).min(1).max(200) });

export async function reorderSections(
  d: Deps,
  actor: Actor,
  packageId: string,
  orderIds: string[],
) {
  const sections = (
    await d.store.query<Section>({ collection: `packages/${packageId}/sections` })
  ).filter((s) => !s.archived);
  const known = new Set(sections.map((s) => s.id));
  if (orderIds.length !== sections.length || orderIds.some((id) => !known.has(id)))
    throw new ApiError('VALIDATION', 'ترتیب ارسالی با قسمت‌های بسته مطابقت ندارد.');
  await d.store.batchSet(
    orderIds.map((id, i) => ({
      path: `packages/${packageId}/sections/${id}`,
      data: { order: i + 1 },
      merge: true,
    })),
  );
  await refreshPackageSummary(d, packageId);
  await audit(
    d,
    actor,
    'section.reordered',
    'packages',
    packageId,
    sections.map((s) => s.id),
    orderIds,
  );
  return { ok: true };
}

// ─── Quiz builder (PROMPT 005) ──────────────────────────────────────────────
const OPTION_KEYS = ['a', 'b', 'c', 'd'];
export const questionSchema = z
  .object({
    stem: text(3, 500, 'متن سؤال'),
    options: z.array(text(1, 200, 'گزینه')).length(4, 'هر سؤال باید ۴ گزینه داشته باشد.'),
    answerKey: z.enum(['a', 'b', 'c', 'd'], {
      errorMap: () => ({ message: 'گزینه صحیح انتخاب نشده است.' }),
    }),
    explanation: z.string().trim().max(500).optional().default(''),
  })
  .refine((q) => new Set(q.options.map((o) => o.trim())).size === q.options.length, {
    message: 'گزینه‌های تکراری مجاز نیست.',
    path: ['options'],
  });

export const quizSettingsSchema = z.object({
  passScore: z.number().int().min(1).max(100).nullable().optional(),
  maxAttempts: z.number().int().min(1).max(10).nullable().optional(),
  needsReview: z.boolean().optional(),
});

export async function getQuizAdmin(d: Deps, quizId: string) {
  const quiz = await d.store.get<Quiz>(`quizzes/${quizId}`);
  if (!quiz) throw notFound('آزمون');
  const questions = (
    await d.store.query<Question>({ collection: `quizzes/${quizId}/questions` })
  ).sort((a, b) => a.order - b.order);
  return {
    quiz,
    questions: questions.filter((q) => !q.archived),
    archivedCount: questions.filter((q) => q.archived).length,
  };
}

async function bumpQuiz(d: Deps, quizId: string) {
  const qs = await d.store.query<Question>({
    collection: `quizzes/${quizId}/questions`,
    where: [['archived', '==', false]],
  });
  const quiz = await d.store.get<Quiz>(`quizzes/${quizId}`);
  await d.store.update(`quizzes/${quizId}`, {
    version: (quiz?.version ?? 1) + 1,
    questionCount: qs.length,
    // Any admin edit of the questions IS the review that `flagQuestion` asked for; leaving the
    // flag on forever made the «بازبینی» banner meaningless in the quiz builder.
    needsReview: false,
    updatedAt: nowIso(d),
  });
}

export async function addQuestion(
  d: Deps,
  actor: Actor,
  quizId: string,
  input: z.infer<typeof questionSchema>,
) {
  const quiz = await d.store.get<Quiz>(`quizzes/${quizId}`);
  if (!quiz) throw notFound('آزمون');
  const existing = await d.store.query<Question>({
    collection: `quizzes/${quizId}/questions`,
    where: [['archived', '==', false]],
  });
  if (existing.length >= 20) throw new ApiError('VALIDATION', 'هر آزمون حداکثر ۲۰ سؤال دارد.');
  const id = d.store.newId();
  const now = nowIso(d);
  const q: Question = {
    order: existing.reduce((m, x) => Math.max(m, x.order), 0) + 1,
    stem: input.stem,
    options: input.options.map((t, i) => ({ key: OPTION_KEYS[i] ?? String(i), text: t })),
    answerKey: input.answerKey,
    explanation: input.explanation ?? '',
    version: 1,
    archived: false,
    createdAt: now,
    updatedAt: now,
  };
  await d.store.set(`quizzes/${quizId}/questions/${id}`, q as unknown as Record<string, unknown>);
  await bumpQuiz(d, quizId);
  await audit(d, actor, 'question.created', 'questions', id, null, q);
  await track(d, existing.length === 0 ? 'admin_quiz_created' : 'admin_quiz_updated', actor.id, {
    quizId,
  });
  return { id, ...q };
}

/** Editing creates a new version; attempts keep their own snapshot so old results stay valid. */
export async function updateQuestion(
  d: Deps,
  actor: Actor,
  quizId: string,
  questionId: string,
  input: z.infer<typeof questionSchema>,
) {
  const path = `quizzes/${quizId}/questions/${questionId}`;
  const q = await d.store.get<Question>(path);
  if (!q || q.archived) throw notFound('سؤال');
  const patch = {
    stem: input.stem,
    options: input.options.map((t, i) => ({ key: OPTION_KEYS[i] ?? String(i), text: t })),
    answerKey: input.answerKey,
    explanation: input.explanation ?? '',
    version: q.version + 1,
    updatedAt: nowIso(d),
  };
  await d.store.update(path, patch);
  await bumpQuiz(d, quizId);
  await audit(d, actor, 'question.updated', 'questions', questionId, q, patch);
  await track(d, 'admin_quiz_updated', actor.id, { quizId });
  return { ...q, ...patch, id: questionId };
}

export async function archiveQuestion(d: Deps, actor: Actor, quizId: string, questionId: string) {
  const path = `quizzes/${quizId}/questions/${questionId}`;
  const q = await d.store.get<Question>(path);
  if (!q) throw notFound('سؤال');
  await d.store.update(path, { archived: true, updatedAt: nowIso(d) });
  await bumpQuiz(d, quizId);
  await audit(d, actor, 'question.archived', 'questions', questionId, q, { archived: true });
}

export async function reorderQuestions(d: Deps, actor: Actor, quizId: string, orderIds: string[]) {
  const qs = await d.store.query<Question>({
    collection: `quizzes/${quizId}/questions`,
    where: [['archived', '==', false]],
  });
  const known = new Set(qs.map((q) => q.id));
  if (orderIds.length !== qs.length || orderIds.some((id) => !known.has(id)))
    throw new ApiError('VALIDATION', 'ترتیب ارسالی با سؤال‌های آزمون مطابقت ندارد.');
  await d.store.batchSet(
    orderIds.map((id, i) => ({
      path: `quizzes/${quizId}/questions/${id}`,
      data: { order: i + 1 },
      merge: true,
    })),
  );
  await audit(d, actor, 'question.reordered', 'quizzes', quizId, null, orderIds);
  return { ok: true };
}

export async function updateQuizSettings(
  d: Deps,
  actor: Actor,
  quizId: string,
  input: z.infer<typeof quizSettingsSchema>,
) {
  const quiz = await d.store.get<Quiz>(`quizzes/${quizId}`);
  if (!quiz) throw notFound('آزمون');
  const patch = { ...input, updatedAt: nowIso(d) };
  await d.store.update(`quizzes/${quizId}`, patch);
  await audit(d, actor, 'quiz.settings_updated', 'quizzes', quizId, quiz, patch);
  return { ...quiz, ...patch, id: quizId };
}

export async function contentTree(d: Deps) {
  const [brands, products, packages] = await Promise.all([
    d.store.query<Brand>({ collection: 'brands', where: [['archived', '==', false]] }),
    d.store.query<Product>({ collection: 'products', where: [['archived', '==', false]] }),
    d.store.query<Package>({ collection: 'packages' }),
  ]);
  const livePk = packages.filter((p) => p.status !== 'archived');
  return {
    brands: brands
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((b) => ({
        id: b.id,
        name: b.name,
        logoUrl: b.logoUrl,
        logoIsFallback: b.logoIsFallback,
        productCount: products.filter((p) => p.brandId === b.id).length,
        brandLevelPackages: livePk.filter((p) => p.brandId === b.id && !p.productId).length,
        packageCount: livePk.filter((p) => p.brandId === b.id).length,
      })),
    unassignedCount: livePk.filter((p) => !p.brandId).length,
  };
}
