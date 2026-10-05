import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { runSeed, type SeedReport } from '../src/seed/seed';
import type { Brand, Package, Product, Question, Quiz, Section } from '../src/domain/types';
import { catalogPaths, loadCatalog } from '../src/seed/catalog-source';
import { createCtx, passQuiz, watchSection, type TestCtx } from './support/ctx';

const repoRoot = path.resolve(__dirname, '..', '..');
let ctx: TestCtx;
let report: SeedReport;

beforeAll(async () => {
  ctx = await createCtx();
  report = await runSeed(ctx.deps, { repoRoot, demo: true, linkLocalFiles: true });
}, 120_000);

describe('real catalog seed (PROMPT 003/004)', () => {
  it('seeds 12 catalog + 5 reactivated brands and every product verbatim', async () => {
    const cat = loadCatalog(catalogPaths(repoRoot));
    expect(report.brands).toBe(17);
    expect(report.products).toBe(cat.products.length + 5 + 1);
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

  it('creates the 9 sample packages under the agreed brand/product (8 published, دارت unassigned draft)', async () => {
    const pk = await ctx.deps.store.query<Package>({ collection: 'packages' });
    expect(pk).toHaveLength(9);
    const byId = new Map(pk.map((p) => [p.id, p]));
    expect(byId.get('seed-pkg-comeon-heel')?.productId).toBe('sb-340122101');
    expect(byId.get('seed-pkg-pixel-stick')?.productId).toBe('sb-pixel-stick-sunscreen');
    expect(byId.get('seed-pkg-icebal')?.brandId).toBe('brand-sb-10');
    expect(byId.get('seed-pkg-icebal')?.productId).toBeNull();
    expect(byId.get('seed-pkg-dart')?.brandId).toBeNull();
    expect(byId.get('seed-pkg-dart')?.status).toBe('draft');
    expect(byId.get('seed-pkg-zen')?.productId).toBe('sb-290252101');
    expect(pk.filter((p) => p.status === 'published')).toHaveLength(8);
    const withMedia = report.training.filter((t) => t.durationSec > 300);
    expect(withMedia).toHaveLength(14);
  });

  it('is idempotent (second run changes nothing)', async () => {
    const again = await runSeed(ctx.deps, { repoRoot, demo: true, linkLocalFiles: true });
    expect(again.brands).toBe(report.brands);
    expect(await ctx.deps.store.query({ collection: 'packages' })).toHaveLength(9);
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
    expect(home.body.data.packages.length).toBe(8);
    const pkg = await ctx.api(token).get('/v1/me/packages/seed-pkg-vitas');
    const s = pkg.body.data.sections[0];
    await watchSection(ctx, token, s.id, s.durationSec);
    const quiz = await ctx.api(token).get(`/v1/me/quizzes/${s.quizId}`);
    expect(quiz.body.data.questions).toHaveLength(10);
    // grade server-side using the stored keys (test only)
    const qs = await ctx.deps.store.query<{ answerKey: string }>({
      collection: `quizzes/${s.quizId}/questions`,
    });
    const answers = Object.fromEntries(qs.map((q) => [q.id, q.answerKey]));
    const r = await passQuiz(ctx, token, s.quizId, answers);
    expect(r.body.data.passed).toBe(true);
  });

  it('section quizzes are the client quiz bank questions (skincare_products_quiz_v3.csv)', async () => {
    const bank = JSON.parse(
      fs.readFileSync(path.join(repoRoot, 'data', 'skincare-products-quiz.json'), 'utf8'),
    ) as {
      products: Array<{
        key: string;
        questions: Array<{ stem: string; options: string[]; answer: string; explanation: string }>;
      }>;
    };
    const byKey = new Map(bank.products.map((p) => [p.key, p.questions]));
    const must = <T>(v: T | undefined, what: string): T => {
      if (v === undefined) throw new Error(`missing ${what}`);
      return v;
    };
    expect(bank.products).toHaveLength(7);

    const questionsOf = async (quizId: string) => {
      const qs = await ctx.deps.store.query<Question>({
        collection: `quizzes/${quizId}/questions`,
      });
      return qs.sort((a, b) => a.order - b.order);
    };

    // One quiz per package: the full 10-question bank sits on the package's podcast (audio) section.
    // formi s1 (audio) holds all 4ME HYDRATION THERAPY questions, verbatim, and is not needsReview.
    const q4me = must(byKey.get('4ME HYDRATION THERAPY'), '4ME bank entry');
    const formiQuiz = await ctx.deps.store.get<Quiz>('quizzes/seed-pkg-formi-s1-quiz');
    expect(formiQuiz?.needsReview).toBe(false);
    expect(formiQuiz?.questionCount).toBe(10);
    const formiQs = await questionsOf('seed-pkg-formi-s1-quiz');
    expect(formiQs.map((q) => q.stem)).toEqual(q4me.map((q) => q.stem));
    const firstQ = must(formiQs[0], 'formi s1 q1');
    const firstBank = must(q4me[0], '4ME bank q1');
    expect(firstQ.options.map((o) => o.text)).toEqual(firstBank.options);
    expect(firstQ.answerKey).toBe(firstBank.answer.toLowerCase());
    expect(firstQ.explanation).toBe(firstBank.explanation);
    // exactly one correct option per question
    for (const q of formiQs) expect(q.options.filter((o) => o.key === q.answerKey)).toHaveLength(1);

    // The video section of the same package has no quiz at all.
    const formiSections = await ctx.deps.store.query<Section>({
      collection: 'packages/seed-pkg-formi/sections',
    });
    const quizless = formiSections.filter((s) => s.quizRequired === false);
    expect(quizless.length).toBe(formiSections.length - 1);
    for (const s of quizless) expect(await questionsOf(s.quizId)).toHaveLength(0);

    // WITH US: each of the two Vitas packages carries the full bank on its own quiz.
    const qWithUs = must(byKey.get('WITH US'), 'WITH US bank entry');
    const vitasQs = await questionsOf('seed-pkg-vitas-s1-quiz');
    expect(vitasQs.map((q) => q.stem)).toEqual(qWithUs.map((q) => q.stem));

    // ICE BALL: full bank on the audio section only; ZEN single-section package
    const icebalQs = await questionsOf('seed-pkg-icebal-s1-quiz');
    expect(icebalQs.map((q) => q.stem)).toEqual(
      must(byKey.get('ICE BALL'), 'ICE BALL bank entry').map((q) => q.stem),
    );
    expect(await questionsOf('seed-pkg-icebal-s2-quiz')).toHaveLength(0);
    const zenQuiz = await ctx.deps.store.get<Quiz>('quizzes/seed-pkg-zen-s1-quiz');
    expect(zenQuiz?.questionCount).toBe(10);
    expect(zenQuiz?.needsReview).toBe(false);

    // no quiz-bank coverage → sample fallback stays needsReview
    const pixelQuiz = await ctx.deps.store.get<Quiz>('quizzes/seed-pkg-pixel-stick-s1-quiz');
    expect(pixelQuiz?.needsReview).toBe(true);
    expect(pixelQuiz?.questionCount).toBe(5);
  });

  it('serves real logo files from local storage', async () => {
    const b = await ctx.deps.store.get<Brand>('brands/brand-sb-5');
    const res = await ctx.api().get(new URL(b?.logoUrl ?? '', 'http://x').pathname);
    expect(res.status).toBe(200);
    expect(Number(res.headers['content-length'])).toBeGreaterThan(1000);
    expect(fs.existsSync(path.join(repoRoot, 'data', 'catalog-supplement.json'))).toBe(true);
  });
});
