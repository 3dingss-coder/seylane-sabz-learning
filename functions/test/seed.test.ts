import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { runSeed, type SeedReport } from '../src/seed/seed';
import type { Brand, Package, Product } from '../src/domain/types';
import { catalogPaths, loadCatalog } from '../src/seed/catalog-source';
import { createCtx, passQuiz, watchSection, type TestCtx } from './support/ctx';

const repoRoot = path.resolve(__dirname, '..', '..');
let ctx: TestCtx;
let report: SeedReport;
const hasSourceAssets =
  fs.existsSync(path.join(repoRoot, 'لوگو برندها و تصاویر محصولات', 'لوگو برندها')) &&
  fs.existsSync(path.join(repoRoot, 'لوگو برندها و تصاویر محصولات', 'تصاویر محصولات')) &&
  fs.existsSync(path.join(repoRoot, 'آموزش کامل محصول فورمی.mp4'));

beforeAll(async () => {
  if (!hasSourceAssets) return;
  ctx = await createCtx();
  report = await runSeed(ctx.deps, { repoRoot, demo: true, linkLocalFiles: true });
}, 120_000);

describe.skipIf(!hasSourceAssets)('real catalog seed (PROMPT 003/004)', () => {
  it('seeds 12 catalog + 4 reactivated brands and every product verbatim', async () => {
    const cat = loadCatalog(catalogPaths(repoRoot));
    expect(report.brands).toBe(16);
    expect(report.products).toBe(cat.products.length + 4 + 1);
    for (const b of cat.brands)
      expect((await ctx.deps.store.get<Brand>(`brands/${b.id}`))?.name).toBe(b.name);
    for (const p of cat.products.slice(0, 400))
      expect((await ctx.deps.store.get<Product>(`products/${p.id}`))?.name).toBe(p.name);
  });

  it('every brand has a logo and every product an image (fallback only where documented)', async () => {
    const brands = await ctx.deps.store.query<Brand>({ collection: 'brands' });
    expect(brands.every((b) => !!b.logoUrl)).toBe(true);
    expect(
      brands
        .filter((b) => b.logoIsFallback)
        .map((b) => b.id)
        .sort(),
    ).toEqual(['brand-sb-atl', 'brand-sb-formi', 'brand-sb-icebubble']);
    const products = await ctx.deps.store.query<Product>({ collection: 'products' });
    expect(products.every((p) => !!p.imageUrl)).toBe(true);
    expect(
      products
        .filter((p) => p.imageIsFallback)
        .map((p) => p.id)
        .sort(),
    ).toEqual(['sb-220306101', 'sb-pixel-stick-sunscreen']);
  });

  it('creates the 8 sample packages under the agreed brand/product (7 published, دارت unassigned draft)', async () => {
    const pk = await ctx.deps.store.query<Package>({ collection: 'packages' });
    expect(pk).toHaveLength(8);
    const byId = new Map(pk.map((p) => [p.id, p]));
    expect(byId.get('seed-pkg-comeon-heel')?.productId).toBe('sb-300123101');
    expect(byId.get('seed-pkg-pixel-stick')?.productId).toBe('sb-pixel-stick-sunscreen');
    expect(byId.get('seed-pkg-icebal')?.brandId).toBe('brand-sb-10');
    expect(byId.get('seed-pkg-icebal')?.productId).toBeNull();
    expect(byId.get('seed-pkg-dart')?.brandId).toBeNull();
    expect(byId.get('seed-pkg-dart')?.status).toBe('draft');
    expect(pk.filter((p) => p.status === 'published')).toHaveLength(7);
    const withMedia = report.training.filter((t) => t.durationSec > 300);
    expect(withMedia).toHaveLength(13);
  });

  it('is idempotent (second run changes nothing)', async () => {
    const again = await runSeed(ctx.deps, { repoRoot, demo: true, linkLocalFiles: true });
    expect(again.brands).toBe(report.brands);
    expect(await ctx.deps.store.query({ collection: 'packages' })).toHaveLength(8);
    const users = await ctx.deps.store.query({ collection: 'users' });
    expect(users).toHaveLength(7);
  });

  it('a demo marketer can complete a real seeded section end-to-end', async () => {
    const login = await ctx
      .api()
      .post('/v1/auth/login', { identifier: '09120000004', password: 'demo1234' });
    expect(login.status).toBe(200);
    const token = login.body.data.idToken as string;
    const home = await ctx.api(token).get('/v1/me/home');
    expect(home.body.data.packages.length).toBe(7);
    const pkg = await ctx.api(token).get('/v1/me/packages/seed-pkg-vitas');
    const s = pkg.body.data.sections[0];
    await watchSection(ctx, token, s.id, s.durationSec);
    const quiz = await ctx.api(token).get(`/v1/me/quizzes/${s.quizId}`);
    expect(quiz.body.data.questions).toHaveLength(5);
    // grade server-side using the stored keys (test only)
    const qs = await ctx.deps.store.query<{ answerKey: string }>({
      collection: `quizzes/${s.quizId}/questions`,
    });
    const answers = Object.fromEntries(qs.map((q) => [q.id, q.answerKey]));
    const r = await passQuiz(ctx, token, s.quizId, answers);
    expect(r.body.data.passed).toBe(true);
  });

  it('serves real logo files from local storage', async () => {
    const b = await ctx.deps.store.get<Brand>('brands/brand-sb-5');
    const res = await ctx.api().get(new URL(b?.logoUrl ?? '', 'http://x').pathname);
    expect(res.status).toBe(200);
    expect(Number(res.headers['content-length'])).toBeGreaterThan(1000);
    expect(fs.existsSync(path.join(repoRoot, 'data', 'catalog-supplement.json'))).toBe(true);
  });
});
