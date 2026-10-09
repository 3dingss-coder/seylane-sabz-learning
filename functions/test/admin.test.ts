import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createCtx, fakeMp4, type TestCtx } from './support/ctx';
import { FcmHttpPushSender } from '../src/push/fcm-http';

let ctx: TestCtx;
let admin: { id: string; token: string };
let sa: { id: string; token: string };
beforeEach(async () => {
  ctx = await createCtx();
  admin = await ctx.user('admin');
  sa = await ctx.user('superadmin');
  await ctx.deps.store.set('brands/b1', {
    name: 'برند تست',
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
});

async function upload(
  kind: 'video' | 'audio' | 'image',
  mime: string,
  body: Buffer,
  target?: object,
) {
  const r = await ctx.api(admin.token).post('/v1/admin/media/upload-url', {
    kind,
    fileName: 'f',
    mime,
    sizeBytes: body.length,
    target,
  });
  expect(r.status).toBe(201);
  const url = new URL(r.body.data.upload.url, 'http://x').pathname;
  const put = await request(ctx.app).put(url).set('Content-Type', mime).send(body);
  expect(put.status).toBe(200);
  return {
    mediaId: r.body.data.mediaId as string,
    fin: await ctx.api(admin.token).post(`/v1/admin/media/${r.body.data.mediaId}/finalize`, {}),
  };
}

describe('media upload (D28, §21)', () => {
  it('accepts a real MP4 and reads its duration', async () => {
    const { fin } = await upload('video', 'video/mp4', fakeMp4(95));
    expect(fin.status).toBe(200);
    expect(fin.body.data.durationSec).toBe(95);
  });

  it('accepts m4a audio', async () => {
    const { fin } = await upload('audio', 'audio/mp4', fakeMp4(30, true));
    expect(fin.status).toBe(200);
  });

  it('rejects content that does not match magic bytes (renamed HTML)', async () => {
    const { fin } = await upload(
      'video',
      'video/mp4',
      Buffer.from('<html><script>alert(1)</script></html>'.repeat(3)),
    );
    expect(fin.status).toBe(400);
    expect(fin.body.error.message).toMatch(/مطابقت ندارد/);
  });

  it('rejects disallowed MIME up front', async () => {
    const r = await ctx.api(admin.token).post('/v1/admin/media/upload-url', {
      kind: 'image',
      fileName: 'x.svg',
      mime: 'image/svg+xml',
      sizeBytes: 100,
    });
    expect(r.status).toBe(400);
  });

  it('replaces a brand logo (D34) and serves it publicly', async () => {
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(64),
    ]);
    const { mediaId, fin } = await upload('image', 'image/png', png, {
      type: 'brand_logo',
      id: 'b1',
    });
    expect(fin.status).toBe(200);
    const p = await ctx.api(admin.token).patch('/v1/admin/brands/b1', { logoMediaId: mediaId });
    expect(p.status).toBe(200);
    expect(p.body.data.logoIsFallback).toBe(false);
    const img = await request(ctx.app).get(new URL(p.body.data.logoUrl, 'http://x').pathname);
    expect(img.status).toBe(200);
    expect(img.headers['content-type']).toBe('image/png');
  });
});

describe('content & publish validation (PROMPT 004/005)', () => {
  it('cannot publish an empty package; errors are listed in Persian', async () => {
    const pkg = await ctx.api(admin.token).post('/v1/admin/packages', {
      title: 'بسته خالی',
      description: 'توضیح',
      brandId: 'b1',
      productId: null,
    });
    const r = await ctx.api(admin.token).post(`/v1/admin/packages/${pkg.body.data.id}/publish`);
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.body.error)).toMatch(/قسمت/);
  });

  it('question validation: 4 options and a valid answer key', async () => {
    const pkg = await ctx.api(admin.token).post('/v1/admin/packages', {
      title: 'بسته',
      description: 'توضیح',
      brandId: 'b1',
      productId: null,
    });
    const sec = await ctx.api(admin.token).post(`/v1/admin/packages/${pkg.body.data.id}/sections`, {
      title: 'قسمت ۱',
      description: 'توضیح',
      mediaType: 'video',
      mediaSource: 'youtube',
      youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
      durationSec: 120,
    });
    expect(sec.status).toBe(201);
    const bad = await ctx
      .api(admin.token)
      .post(`/v1/admin/quizzes/${sec.body.data.quizId}/questions`, {
        stem: 'سؤال؟',
        options: ['الف', 'ب'],
        answerKey: 'e',
      });
    expect(bad.status).toBe(400);
  });

  it('content tree exposes the unassigned drafts group (D33)', async () => {
    await ctx.api(admin.token).post('/v1/admin/packages', {
      title: 'محتوای نامشخص',
      description: 'بدون برند',
      brandId: null,
      productId: null,
    });
    const tree = await ctx.api(admin.token).get('/v1/admin/content/tree');
    expect(tree.status).toBe(200);
    expect(tree.body.data.unassignedCount).toBe(1);
    const list = await ctx.api(admin.token).get('/v1/admin/packages?unassigned=true');
    expect(list.body.data.map((p: { title: string }) => p.title)).toEqual(['محتوای نامشخص']);
  });
});

describe('users & roles (PROMPT 007)', () => {
  it('admin cannot grant admin roles; superadmin can', async () => {
    const u = await ctx.user('marketer');
    expect(
      (await ctx.api(admin.token).patch(`/v1/admin/users/${u.id}`, { role: 'admin' })).status,
    ).toBe(403);
    expect(
      (await ctx.api(sa.token).patch(`/v1/admin/users/${u.id}`, { role: 'admin' })).status,
    ).toBe(200);
  });

  it('nobody can change their own role/status (protects the last superadmin)', async () => {
    const r = await ctx.api(sa.token).patch(`/v1/admin/users/${sa.id}`, { role: 'admin' });
    expect(r.status).toBe(403);
  });

  it('admin sees, searches by and can correct the residence of a user', async () => {
    const reg = await ctx.api().post('/v1/auth/phone-register', {
      name: 'مهدی',
      phone: '09365554433',
      province: 'خراسان رضوی',
      city: 'نیشابور',
    });
    expect(reg.status).toBe(201);
    const id = reg.body.data.user.id as string;

    // The list the admin panel reads carries the residence…
    const list = await ctx.api(admin.token).get('/v1/admin/users?q=نیشابور');
    expect(list.body.data.map((u: { id: string }) => u.id)).toEqual([id]);
    expect((await ctx.api(admin.token).get('/v1/admin/users?q=خراسان')).body.data).toHaveLength(1);

    // …and the user detail (used by both the admin and the manager member view) as well.
    const detail = await ctx.api(admin.token).get(`/v1/admin/users/${id}`);
    expect(detail.body.data.user.province).toBe('خراسان رضوی');
    expect(detail.body.data.user.city).toBe('نیشابور');

    // A city that is not in the selected province is refused with a field error.
    const bad = await ctx.api(admin.token).patch(`/v1/admin/users/${id}`, {
      province: 'تهران',
      city: 'نیشابور',
    });
    expect(bad.status).toBe(400);
    expect(bad.body.error.details.some((d: { field: string }) => d.field === 'city')).toBe(true);

    // Correcting it through the panel works (and clears the old pair when both are null).
    const ok = await ctx.api(admin.token).patch(`/v1/admin/users/${id}`, {
      province: 'اصفهان',
      city: 'کاشان',
    });
    expect(ok.status).toBe(200);
    expect(ok.body.data.user.city).toBe('کاشان');
    const cleared = await ctx.api(admin.token).patch(`/v1/admin/users/${id}`, {
      province: null,
      city: null,
    });
    expect(cleared.body.data.user.province).toBeNull();
    expect(cleared.body.data.user.city).toBeNull();
  });

  it('policy changes are validated and audited', async () => {
    const current = (await ctx.api(admin.token).get('/v1/admin/policies')).body.data;
    const bad = await ctx.api(sa.token).put('/v1/admin/policies', { ...current, passScore: 150 });
    expect(bad.status).toBe(400);
    const ok = await ctx.api(sa.token).put('/v1/admin/policies', { ...current, passScore: 70 });
    expect(ok.status).toBe(200);
    const logs = await ctx.api(sa.token).get('/v1/admin/audit-logs?action=policy.updated');
    expect(logs.body.data).toHaveLength(1);
  });
});

describe('admin push provider status', () => {
  it('requires an admin session and returns only a boolean', async () => {
    const unauthorized = await ctx.api().get('/v1/admin/push-provider-status');
    expect(unauthorized.status).toBe(401);

    const response = await ctx.api(admin.token).get('/v1/admin/push-provider-status');
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ configured: false });
    expect(JSON.stringify(response.body)).not.toContain('private_key');
  });

  it('reports configured when the Worker has the real FCM sender type', async () => {
    ctx.deps.push = new FcmHttpPushSender({
      project_id: 'test-project',
      client_email: 'test@example.invalid',
      private_key: 'not-a-real-key',
    });
    const response = await ctx.api(admin.token).get('/v1/admin/push-provider-status');
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ configured: true });
  });
});
