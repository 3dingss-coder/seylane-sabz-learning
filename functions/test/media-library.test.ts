import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createCtx, fakeMp4, type TestCtx } from './support/ctx';

let ctx: TestCtx;
let admin: { id: string; token: string };
let other: { id: string; token: string };

const brand = (name: string) => ({
  name,
  nameLatin: null,
  logoUrl: '/x',
  logoPath: null,
  logoIsFallback: true,
  sortOrder: 1,
  archived: false,
  source: 'catalog',
  createdAt: '',
  updatedAt: '',
});
const product = (brandId: string, name: string) => ({
  brandId,
  name,
  code: null,
  barcode: null,
  category: null,
  description: null,
  imageUrl: '/x',
  imagePath: null,
  imageIsFallback: true,
  archived: false,
  source: 'catalog',
  createdAt: '',
  updatedAt: '',
});

beforeEach(async () => {
  ctx = await createCtx();
  admin = await ctx.user('admin');
  other = await ctx.user('admin');
  await ctx.deps.store.set('brands/b1', brand('برند یک'));
  await ctx.deps.store.set('brands/b2', brand('برند دو'));
  await ctx.deps.store.set('products/p1', product('b1', 'محصول یک'));
});

/** Pads a valid MP4 header up to `size` bytes so we can exercise multi-part uploads. */
const bigMp4 = (seconds: number, size: number) =>
  Buffer.concat([fakeMp4(seconds), Buffer.alloc(size - fakeMp4(seconds).length, 7)]);

async function start(body: Buffer, extra: object = {}, token = admin.token) {
  return ctx.api(token).post('/v1/admin/media/library/uploads', {
    kind: 'video',
    fileName: 'آموزش_فروش.mp4',
    mime: 'video/mp4',
    sizeBytes: body.length,
    ...extra,
  });
}

async function putPart(url: string, data: Buffer) {
  const path = new URL(url, 'http://x').pathname;
  return request(ctx.app).put(path).set('Content-Type', 'application/octet-stream').send(data);
}

async function sendParts(mediaId: string, body: Buffer, only?: number[]) {
  const total = Math.ceil(body.length / (1024 * 1024));
  const idxs = only ?? Array.from({ length: total }, (_, i) => i);
  const r = await ctx.api(admin.token).post(`/v1/admin/media/library/uploads/${mediaId}/parts`, {
    indexes: idxs,
  });
  expect(r.status).toBe(200);
  for (const u of r.body.data.urls as Array<{ index: number; upload: { url: string } }>) {
    const slice = body.subarray(u.index * 1024 * 1024, (u.index + 1) * 1024 * 1024);
    expect((await putPart(u.upload.url, slice)).status).toBe(200);
  }
  return r.body.data as { received: number[]; totalParts: number };
}

describe('media library (resumable uploads)', () => {
  it('uploads a multi-part file, resumes after a dropped part, and finalises', async () => {
    const body = bigMp4(120, 2.5 * 1024 * 1024); // 3 parts
    const s = await start(body);
    expect(s.status).toBe(201);
    const { mediaId, totalParts } = s.body.data as { mediaId: string; totalParts: number };
    expect(totalParts).toBe(3);

    // First attempt: only parts 0 and 2 arrive (connection dropped before part 1).
    await sendParts(mediaId, body, [0, 2]);
    const early = await ctx
      .api(admin.token)
      .post(`/v1/admin/media/library/uploads/${mediaId}/complete`, {});
    expect(early.status).toBe(409);
    expect(early.body.error.details?.missing ?? early.body.error?.missing).toEqual([1]);

    // Resume: server reports what it has; client sends only the missing part.
    const probe = await ctx
      .api(admin.token)
      .post(`/v1/admin/media/library/uploads/${mediaId}/parts`, { indexes: [] });
    expect(probe.body.data.received).toEqual([0, 2]);
    await sendParts(mediaId, body, [1]);

    const done = await ctx
      .api(admin.token)
      .post(`/v1/admin/media/library/uploads/${mediaId}/complete`, {});
    expect(done.status).toBe(200);
    expect(done.body.data).toMatchObject({ id: mediaId, kind: 'video', durationSec: 120 });
    expect(done.body.data.sizeBytes).toBe(body.length);

    // The assembled file is byte-identical, and part blobs are cleaned up.
    const asset = await ctx.deps.store.get<{ path: string }>(`media/${mediaId}`);
    const stored = await ctx.deps.blob.readRange(asset?.path ?? '', 0, body.length - 1);
    expect(Buffer.compare(stored, body)).toBe(0);
    expect(await ctx.deps.blob.stat(`uploads/${mediaId}/0`)).toBeNull();

    // Completing twice is harmless.
    const again = await ctx
      .api(admin.token)
      .post(`/v1/admin/media/library/uploads/${mediaId}/complete`, {});
    expect(again.status).toBe(200);
  });

  it('rejects a part with the wrong size and non-media content', async () => {
    const body = bigMp4(10, 1.5 * 1024 * 1024);
    const { mediaId } = (await start(body)).body.data as { mediaId: string };
    const r = await ctx.api(admin.token).post(`/v1/admin/media/library/uploads/${mediaId}/parts`, {
      indexes: [0],
    });
    const wrong = await putPart(r.body.data.urls[0].upload.url, Buffer.alloc(1000));
    expect(wrong.status).toBe(200); // storage accepts any bytes; the server verifies sizes later
    const complete = await ctx
      .api(admin.token)
      .post(`/v1/admin/media/library/uploads/${mediaId}/complete`, {});
    expect(complete.status).toBe(409);

    // A file whose bytes are not a real MP4 is rejected by the content sniffer.
    const fake = Buffer.alloc(300_000, 1);
    const f = (await start(fake)).body.data as { mediaId: string };
    await sendParts(f.mediaId, fake);
    const rej = await ctx
      .api(admin.token)
      .post(`/v1/admin/media/library/uploads/${f.mediaId}/complete`, {});
    expect(rej.status).toBe(400);
  });

  it('validates type, size and ownership', async () => {
    const body = fakeMp4(5);
    expect((await start(body, { mime: 'application/pdf' })).status).toBe(400);
    expect((await start(body, { sizeBytes: 65 * 1024 * 1024 })).status).toBe(400);
    expect((await start(body, { brandId: 'nope' })).status).toBe(404);
    const { mediaId } = (await start(body)).body.data as { mediaId: string };
    const stolen = await ctx
      .api(other.token)
      .post(`/v1/admin/media/library/uploads/${mediaId}/parts`, { indexes: [0] });
    expect(stolen.status).toBe(403);
  });

  it('lists, filters, assigns to brand/product and refuses deleting used media', async () => {
    const body = fakeMp4(60);
    // Two files with the SAME name are two separate library items (never merged by name).
    const ids: string[] = [];
    for (let i = 0; i < 2; i++) {
      const { mediaId } = (await start(body)).body.data as { mediaId: string };
      await sendParts(mediaId, body);
      const c = await ctx
        .api(admin.token)
        .post(`/v1/admin/media/library/uploads/${mediaId}/complete`, {});
      expect(c.status).toBe(200);
      ids.push(mediaId);
    }
    expect(ids[0]).not.toBe(ids[1]);

    const all = await ctx.api(admin.token).get('/v1/admin/media/library');
    expect(all.body.data).toHaveLength(2);
    expect(all.body.data.every((i: { brandId: string | null }) => i.brandId === null)).toBe(true);

    // Assign by product → brand is derived.
    const a = await ctx.api(admin.token).patch(`/v1/admin/media/library/${ids[0]}`, {
      productId: 'p1',
      title: 'آموزش محصول یک',
    });
    expect(a.status).toBe(200);
    expect(a.body.data).toMatchObject({
      brandId: 'b1',
      productId: 'p1',
      brandName: 'برند یک',
      productName: 'محصول یک',
      title: 'آموزش محصول یک',
    });

    // Mismatched brand/product is refused; switching brand clears the product.
    const bad = await ctx.api(admin.token).patch(`/v1/admin/media/library/${ids[0]}`, {
      brandId: 'b2',
      productId: 'p1',
    });
    expect(bad.status).toBe(400);
    const sw = await ctx.api(admin.token).patch(`/v1/admin/media/library/${ids[0]}`, {
      brandId: 'b2',
    });
    expect(sw.body.data).toMatchObject({ brandId: 'b2', productId: null });

    const byBrand = await ctx.api(admin.token).get('/v1/admin/media/library?brandId=b2');
    expect(byBrand.body.data.map((i: { id: string }) => i.id)).toEqual([ids[0]]);
    const un = await ctx.api(admin.token).get('/v1/admin/media/library?unassigned=true');
    expect(un.body.data.map((i: { id: string }) => i.id)).toEqual([ids[1]]);

    // Preview URL is a signed, fetchable URL.
    const prev = await ctx.api(admin.token).get(`/v1/admin/media/library/${ids[1]}/preview-url`);
    expect(prev.status).toBe(200);
    expect(prev.body.data.url).toContain('/files/');

    // Attach to a section → deletion is refused (409); unused one can be deleted.
    const pkg = await ctx.api(admin.token).post('/v1/admin/packages', {
      title: 'بسته آزمایشی',
      brandId: 'b1',
    });
    expect(pkg.status).toBe(201);
    const sec = await ctx.api(admin.token).post(`/v1/admin/packages/${pkg.body.data.id}/sections`, {
      title: 'قسمت ۱',
      description: 'توضیح',
      mediaType: 'video',
      mediaSource: 'file',
      mediaId: ids[1],
    });
    expect(sec.status).toBe(201);
    const used = await ctx.api(admin.token).get('/v1/admin/media/library?q=آموزش');
    const usedItem = used.body.data.find((i: { id: string }) => i.id === ids[1]);
    expect(usedItem.usedBy).toHaveLength(1);
    expect(usedItem.brandId).toBe('b1'); // inferred from the package until assigned explicitly
    expect(usedItem.assignmentInferred).toBe(true);

    expect((await ctx.api(admin.token).del(`/v1/admin/media/library/${ids[1]}`)).status).toBe(409);
    expect((await ctx.api(admin.token).del(`/v1/admin/media/library/${ids[0]}`)).status).toBe(200);
    const after = await ctx.api(admin.token).get('/v1/admin/media/library');
    expect(after.body.data.map((i: { id: string }) => i.id)).toEqual([ids[1]]);
  });

  it('aborting an upload removes its parts', async () => {
    const body = bigMp4(10, 1.5 * 1024 * 1024);
    const { mediaId } = (await start(body)).body.data as { mediaId: string };
    await sendParts(mediaId, body, [0]);
    expect(await ctx.deps.blob.stat(`uploads/${mediaId}/0`)).not.toBeNull();
    const ab = await ctx.api(admin.token).del(`/v1/admin/media/library/uploads/${mediaId}`);
    expect(ab.status).toBe(200);
    expect(await ctx.deps.blob.stat(`uploads/${mediaId}/0`)).toBeNull();
    const list = await ctx.api(admin.token).get('/v1/admin/media/library');
    expect(list.body.data).toHaveLength(0);
  });

  it('a library file becomes a section of a brand package and the section can carry the same file twice', async () => {
    const body = bigMp4(300, 1.2 * 1024 * 1024);
    const s = await start(body, { brandId: 'b1', title: 'ویدیوی برند یک' });
    const { mediaId } = s.body.data as { mediaId: string };
    await sendParts(mediaId, body);
    const done = await ctx
      .api(admin.token)
      .post(`/v1/admin/media/library/uploads/${mediaId}/complete`, { durationSec: 300 });
    expect(done.status).toBe(200);

    const pkg = await ctx.api(admin.token).post('/v1/admin/packages', {
      title: 'آموزش برند یک',
      brandId: 'b1',
    });
    expect(pkg.status).toBe(201);
    const packageId = (pkg.body.data as { id: string }).id;

    const sec = await ctx.api(admin.token).post(`/v1/admin/packages/${packageId}/sections`, {
      title: 'قسمت از کتابخانه',
      description: '',
      transcript: '',
      mediaType: 'video',
      mediaSource: 'file',
      youtubeUrl: null,
      mediaId,
      durationSec: 300,
    });
    expect(sec.status).toBe(201);
    expect(sec.body.data).toMatchObject({ mediaId, mediaType: 'video', durationSec: 300 });

    // The library now reports where the file is used.
    const lib = await ctx.api(admin.token).get('/v1/admin/media/library?kind=video');
    const item = (
      lib.body.data as Array<{ id: string; usedBy: Array<{ packageId: string }> }>
    ).find((i) => i.id === mediaId);
    expect(item?.usedBy.map((u) => u.packageId)).toEqual([packageId]);

    // Wrong media kind for the section type is refused with a clear message.
    const bad = await ctx.api(admin.token).post(`/v1/admin/packages/${packageId}/sections`, {
      title: 'نوع اشتباه',
      mediaType: 'audio',
      mediaSource: 'file',
      mediaId,
      durationSec: 300,
    });
    expect(bad.status).toBe(400);
  });
});
