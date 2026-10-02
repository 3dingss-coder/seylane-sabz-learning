import { z } from 'zod';
import { ApiError } from '../http/errors';
import { EXT, MEDIA_RULES } from '../lib/media';
import type { Brand, MediaAsset, Package, Product, Section } from '../domain/types';
import type { Doc } from '../store/types';
import { audit, nowIso, type Actor, type Deps } from './context';
import { finalizeMedia } from './content';

/**
 * Media library (admin): resumable chunked uploads + organisation by brand / product.
 *
 * Upload protocol (each step is idempotent, so any network failure can simply be retried):
 *   1. POST uploads            → creates a pending media doc, returns partSize + totalParts
 *   2. POST uploads/:id/parts  → returns which parts already arrived + signed PUT tickets
 *                                for the requested ones (re-callable to resume after a drop)
 *   3. POST uploads/:id/complete → verifies every part, assembles the file, sniffs + finalises
 */
export const PART_SIZE = 1024 * 1024;
export const LIBRARY_MAX_BYTES = 64 * 1024 * 1024;
const MAX_PARTS = Math.ceil(LIBRARY_MAX_BYTES / PART_SIZE);

const notFound = (what: string) => new ApiError('NOT_FOUND', `${what} پیدا نشد.`);
const partPath = (mediaId: string, idx: number) => `uploads/${mediaId}/${idx}`;

export const libraryUploadSchema = z.object({
  kind: z.enum(['video', 'audio']),
  fileName: z.string().trim().min(1).max(200),
  mime: z.string().trim().max(100),
  sizeBytes: z.number().int().positive(),
  title: z.string().trim().max(160).optional(),
  brandId: z.string().max(80).nullable().optional(),
  productId: z.string().max(80).nullable().optional(),
});

export const partUrlsSchema = z.object({
  indexes: z.array(z.number().int().min(0).max(MAX_PARTS)).max(16).default([]),
});

export const libraryCompleteSchema = z.object({
  durationSec: z
    .number()
    .positive()
    .max(6 * 3600)
    .optional(),
});

export const libraryPatchSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  brandId: z.string().max(80).nullable().optional(),
  productId: z.string().max(80).nullable().optional(),
});

export const libraryQuerySchema = z.object({
  kind: z.enum(['video', 'audio']).optional(),
  brandId: z.string().max(80).optional(),
  productId: z.string().max(80).optional(),
  unassigned: z.enum(['true', 'false']).optional(),
  q: z.string().max(80).optional(),
});

const baseName = (n: string) =>
  n
    .replace(/\.[^.]+$/, '')
    .replace(/[_]+/g, ' ')
    .trim() || n;

/** Resolve + validate a brand/product pair; a product implies its brand. */
async function resolveAssignment(
  d: Deps,
  brandId: string | null | undefined,
  productId: string | null | undefined,
): Promise<{ brandId: string | null; productId: string | null }> {
  let b = brandId ?? null;
  const p = productId ?? null;
  if (p) {
    const product = await d.store.get<Product>(`products/${p}`);
    if (!product) throw notFound('محصول');
    if (b && b !== product.brandId)
      throw new ApiError('VALIDATION', 'محصول انتخاب‌شده متعلق به این برند نیست.');
    b = product.brandId;
  }
  if (b && !(await d.store.get<Brand>(`brands/${b}`))) throw notFound('برند');
  return { brandId: b, productId: p };
}

async function ownedPending(d: Deps, actor: Actor, id: string): Promise<Doc<MediaAsset>> {
  const m = await d.store.get<MediaAsset>(`media/${id}`);
  if (!m || !m.library) throw notFound('آپلود');
  if (m.createdBy !== actor.id) throw new ApiError('FORBIDDEN');
  return m;
}

const expectedPartSize = (m: MediaAsset, idx: number) =>
  idx < (m.totalParts ?? 0) - 1
    ? PART_SIZE
    : m.declaredSize - PART_SIZE * ((m.totalParts ?? 1) - 1);

async function receivedParts(d: Deps, m: Doc<MediaAsset>): Promise<number[]> {
  const total = m.totalParts ?? 0;
  const stats = await Promise.all(
    Array.from({ length: total }, (_, i) => d.blob.stat(partPath(m.id, i))),
  );
  const got: number[] = [];
  stats.forEach((s, i) => {
    if (s && s.size === expectedPartSize(m, i)) got.push(i);
  });
  return got;
}

export async function startLibraryUpload(
  d: Deps,
  actor: Actor,
  input: z.infer<typeof libraryUploadSchema>,
) {
  const rule = MEDIA_RULES[input.kind];
  const mime = input.mime.toLowerCase();
  if (!rule.mimes.includes(mime))
    throw new ApiError('VALIDATION', `نوع فایل ${rule.label} پشتیبانی نمی‌شود.`, {
      allowed: rule.mimes,
    });
  if (input.sizeBytes > LIBRARY_MAX_BYTES)
    throw new ApiError(
      'VALIDATION',
      `حجم فایل پس از فشرده‌سازی حداکثر ${Math.round(LIBRARY_MAX_BYTES / 1024 / 1024)} مگابایت است.`,
    );
  const assign = await resolveAssignment(d, input.brandId, input.productId);
  const id = d.store.newId();
  const totalParts = Math.max(1, Math.ceil(input.sizeBytes / PART_SIZE));
  const originalName = input.fileName.replace(/[^\p{L}\p{N}._\- ]/gu, '_');
  const asset: MediaAsset = {
    kind: input.kind,
    status: 'pending',
    path: `media/${input.kind}/${id}.${EXT[mime] ?? 'bin'}`,
    declaredMime: mime,
    mime: null,
    sizeBytes: null,
    declaredSize: input.sizeBytes,
    originalName,
    durationSec: null,
    target: { type: 'section', id: null },
    createdBy: actor.id,
    createdAt: nowIso(d),
    rejectReason: null,
    library: true,
    title: input.title?.trim() || baseName(originalName),
    brandId: assign.brandId,
    productId: assign.productId,
    partSize: PART_SIZE,
    totalParts,
    archived: false,
  };
  await d.store.set(`media/${id}`, asset);
  return { mediaId: id, partSize: PART_SIZE, totalParts };
}

export async function libraryPartUrls(
  d: Deps,
  actor: Actor,
  mediaId: string,
  input: z.infer<typeof partUrlsSchema>,
) {
  const m = await ownedPending(d, actor, mediaId);
  if (m.status !== 'pending') throw new ApiError('CONFLICT', 'این آپلود دیگر فعال نیست.');
  const received = await receivedParts(d, m);
  const have = new Set(received);
  const total = m.totalParts ?? 0;
  const urls = await Promise.all(
    input.indexes
      .filter((i) => i < total && !have.has(i))
      .map(async (index) => ({
        index,
        upload: await d.blob.createUploadUrl(
          partPath(mediaId, index),
          'application/octet-stream',
          expectedPartSize(m, index),
        ),
      })),
  );
  return { received, totalParts: total, partSize: PART_SIZE, urls };
}

export async function completeLibraryUpload(
  d: Deps,
  actor: Actor,
  mediaId: string,
  input: z.infer<typeof libraryCompleteSchema>,
) {
  const m = await ownedPending(d, actor, mediaId);
  if (m.status === 'ready') return toItem(d, m, await usageIndex(d));
  if (m.status !== 'pending') throw new ApiError('CONFLICT', 'این آپلود دیگر فعال نیست.');
  const received = await receivedParts(d, m);
  const total = m.totalParts ?? 0;
  if (received.length !== total) {
    const have = new Set(received);
    const missing = Array.from({ length: total }, (_, i) => i).filter((i) => !have.has(i));
    throw new ApiError('CONFLICT', 'بعضی بخش‌های فایل هنوز آپلود نشده‌اند.', { missing });
  }
  // Assemble into ONE preallocated buffer (peak memory = file size, not 2x) — Workers have 128 MB.
  const whole = Buffer.allocUnsafe(m.declaredSize);
  let offset = 0;
  for (let i = 0; i < total; i++) {
    const size = expectedPartSize(m, i);
    const part = await d.blob.readRange(partPath(mediaId, i), 0, size - 1);
    if (part.length !== size || offset + size > whole.length)
      throw new ApiError('CONFLICT', 'اندازه‌ی فایل با آپلود هم‌خوانی ندارد. دوباره تلاش کنید.');
    part.copy(whole, offset);
    offset += size;
  }
  if (offset !== m.declaredSize)
    throw new ApiError('CONFLICT', 'اندازه‌ی فایل با آپلود هم‌خوانی ندارد. دوباره تلاش کنید.');
  await d.blob.put(m.path, whole, m.declaredMime);
  await finalizeMedia(
    d,
    actor,
    mediaId,
    input.durationSec ? { durationSec: input.durationSec } : {},
  );
  await Promise.all(
    Array.from({ length: total }, (_, i) => d.blob.delete(partPath(mediaId, i)).catch(() => {})),
  );
  const fresh = await d.store.get<MediaAsset>(`media/${mediaId}`);
  if (!fresh) throw notFound('فایل');
  return toItem(d, fresh, await usageIndex(d));
}

export async function abortLibraryUpload(d: Deps, actor: Actor, mediaId: string) {
  const m = await ownedPending(d, actor, mediaId);
  if (m.status === 'ready') throw new ApiError('CONFLICT', 'این فایل قبلاً آپلود شده است.');
  await Promise.all(
    Array.from({ length: m.totalParts ?? 0 }, (_, i) =>
      d.blob.delete(partPath(mediaId, i)).catch(() => {}),
    ),
  );
  await d.store.update(`media/${mediaId}`, {
    status: 'rejected',
    rejectReason: 'آپلود لغو شد.',
    archived: true,
  });
  return { ok: true };
}

// ─── Library listing / organisation ────────────────────────────────────────

interface Usage {
  packageId: string;
  packageTitle: string;
  sectionId: string;
  sectionTitle: string;
  brandId: string | null;
  productId: string | null;
}

/** mediaId / mediaPath → sections that play it (archived sections and packages excluded). */
async function usageIndex(d: Deps): Promise<Map<string, Usage[]>> {
  const packages = await d.store.query<Package>({ collection: 'packages' });
  const out = new Map<string, Usage[]>();
  const add = (key: string | null, u: Usage) => {
    if (!key) return;
    const list = out.get(key) ?? [];
    list.push(u);
    out.set(key, list);
  };
  await Promise.all(
    packages
      .filter((p) => p.status !== 'archived')
      .map(async (p) => {
        const sections = await d.store.query<Section>({ collection: `packages/${p.id}/sections` });
        for (const s of sections) {
          if (s.archived) continue;
          const u: Usage = {
            packageId: p.id,
            packageTitle: p.title,
            sectionId: s.id,
            sectionTitle: s.title,
            brandId: p.brandId ?? null,
            productId: p.productId ?? null,
          };
          add(s.mediaId, u);
          if (s.mediaPath && s.mediaPath !== s.mediaId) add(`path:${s.mediaPath}`, u);
        }
      }),
  );
  return out;
}

function usageOf(m: Doc<MediaAsset>, idx: Map<string, Usage[]>): Usage[] {
  const seen = new Map<string, Usage>();
  for (const u of [...(idx.get(m.id) ?? []), ...(idx.get(`path:${m.path}`) ?? [])])
    seen.set(u.sectionId, u);
  return [...seen.values()];
}

async function toItem(d: Deps, m: Doc<MediaAsset>, idx: Map<string, Usage[]>) {
  const usedBy = usageOf(m, idx);
  const inferred = usedBy.find((u) => u.brandId);
  const brandId = m.brandId ?? inferred?.brandId ?? null;
  const productId = m.productId ?? (m.brandId ? null : (inferred?.productId ?? null));
  const [brand, product] = await Promise.all([
    brandId ? d.store.get<Brand>(`brands/${brandId}`) : null,
    productId ? d.store.get<Product>(`products/${productId}`) : null,
  ]);
  return {
    id: m.id,
    kind: m.kind as 'video' | 'audio',
    title: m.title ?? baseName(m.originalName),
    originalName: m.originalName,
    mime: m.mime,
    sizeBytes: m.sizeBytes,
    durationSec: m.durationSec,
    createdAt: m.createdAt,
    brandId,
    productId,
    brandName: brand?.name ?? null,
    productName: product?.name ?? null,
    assignmentInferred: !m.brandId && !m.productId && Boolean(brandId),
    usedBy: usedBy.map(({ packageId, packageTitle, sectionId, sectionTitle }) => ({
      packageId,
      packageTitle,
      sectionId,
      sectionTitle,
    })),
  };
}

export async function listLibrary(d: Deps, f: z.infer<typeof libraryQuerySchema>) {
  const docs = await d.store.query<MediaAsset>({
    collection: 'media',
    where: [['status', '==', 'ready']],
  });
  const idx = await usageIndex(d);
  const q = f.q?.trim();
  const items = await Promise.all(
    docs
      .filter(
        (m) =>
          (m.kind === 'video' || m.kind === 'audio') &&
          m.target?.type === 'section' &&
          !m.archived &&
          (!f.kind || m.kind === f.kind),
      )
      .map((m) => toItem(d, m, idx)),
  );
  return items
    .filter((i) => (f.brandId ? i.brandId === f.brandId : true))
    .filter((i) => (f.productId ? i.productId === f.productId : true))
    .filter((i) => (f.unassigned === 'true' ? !i.brandId : true))
    .filter((i) => (q ? `${i.title} ${i.originalName}`.includes(q) : true))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

async function readyLibraryDoc(d: Deps, id: string): Promise<Doc<MediaAsset>> {
  const m = await d.store.get<MediaAsset>(`media/${id}`);
  if (!m || m.status !== 'ready' || m.archived || m.target?.type !== 'section')
    throw notFound('فایل');
  return m;
}

export async function updateLibraryItem(
  d: Deps,
  actor: Actor,
  id: string,
  input: z.infer<typeof libraryPatchSchema>,
) {
  const m = await readyLibraryDoc(d, id);
  const patch: Record<string, unknown> = {};
  if (input.title !== undefined) patch.title = input.title;
  if (input.brandId !== undefined || input.productId !== undefined) {
    // Changing (or clearing) the brand clears the product unless a product is sent explicitly;
    // a product always pins its brand.
    const curBrand = m.brandId ?? null;
    const brandChanged = input.brandId !== undefined && input.brandId !== curBrand;
    const newBrand = input.brandId !== undefined ? input.brandId : curBrand;
    const newProduct =
      input.productId !== undefined ? input.productId : brandChanged ? null : (m.productId ?? null);
    const a = await resolveAssignment(d, newBrand, newProduct);
    patch.brandId = a.brandId;
    patch.productId = a.productId;
  }
  if (!Object.keys(patch).length) return toItem(d, m, await usageIndex(d));
  await d.store.update(`media/${id}`, patch);
  await audit(
    d,
    actor,
    'media.library_updated',
    'media',
    id,
    { title: m.title ?? null, brandId: m.brandId ?? null, productId: m.productId ?? null },
    patch,
  );
  return toItem(d, { ...m, ...patch } as Doc<MediaAsset>, await usageIndex(d));
}

export async function deleteLibraryItem(d: Deps, actor: Actor, id: string) {
  const m = await readyLibraryDoc(d, id);
  const usedBy = usageOf(m, await usageIndex(d));
  if (usedBy.length)
    throw new ApiError('CONFLICT', `این فایل در ${usedBy.length} قسمت آموزشی استفاده شده است.`, {
      usedBy,
    });
  await d.blob.delete(m.path);
  await d.store.update(`media/${id}`, { archived: true });
  await audit(d, actor, 'media.library_deleted', 'media', id, { path: m.path }, null);
  return { ok: true };
}

export async function libraryPreviewUrl(d: Deps, id: string) {
  const m = await readyLibraryDoc(d, id);
  return { url: await d.blob.signedReadUrl(m.path, 15 * 60), mime: m.mime, kind: m.kind };
}
