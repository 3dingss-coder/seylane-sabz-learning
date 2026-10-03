/**
 * Repeatable catalog + training seed (PROMPT 003/004). Runs against any Deps backend:
 * memory (local/tests), Firestore emulator, or production Firestore/Storage.
 *
 *  • Names are copied verbatim from the client files (never edited).
 *  • Idempotent: deterministic ids; existing packages are not overwritten (admin edits win)
 *    unless `force` is set. Logos replaced from the admin panel are preserved.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { LocalBlobStore } from '../blob/local';
import { DEFAULT_POLICY } from '../domain/policy';
import type { Brand, MediaAsset, Package, Product, Question, Quiz, Section } from '../domain/types';
import { createPlaceholderMp4, mp4DurationFromBuffer, sniff } from '../lib/media';
import { DAY } from '../lib/time';
import { audit, type Actor, type Deps } from '../services/context';
import { refreshPackageSummary, validatePublish } from '../services/content';
import { invalidateBrands } from '../services/catalog-cache';
import { DEFAULT_BADGES } from '../services/rewards';
import { catalogPaths, loadCatalog } from './catalog-source';

export { createPlaceholderMp4 };

const SEED: Actor = { id: 'seed', role: 'system' };

interface SupplementSection {
  file: string;
  title: string;
  mediaType: 'audio' | 'video';
}
interface SupplementPackage {
  id: string;
  title: string;
  brandId: string | null;
  productId: string | null;
  deadlineDays: number | null;
  publish: boolean;
  /** Key into data/skincare-products-quiz.json; null → sample fallback questions. */
  quizKey: string | null;
  sections: SupplementSection[];
}
interface BankQuestion {
  stem: string;
  options: string[];
  answer: string;
  explanation: string;
}
interface BankProduct {
  key: string;
  nameFa: string;
  nameEn: string;
  questions: BankQuestion[];
}
interface QuizBank {
  products: BankProduct[];
}
interface Supplement {
  holdingLogo: string;
  reactivatedBrands: Array<{
    id: string;
    name: string;
    nameLatin: string | null;
    logoFile: string | null;
    decision: string;
  }>;
  reactivatedProducts: Array<{ id: string; brandId: string }>;
  newProducts: Array<{
    id: string;
    brandId: string;
    name: string;
    code: string | null;
    category: string | null;
    description: string | null;
    imageFile: string | null;
    decision: string;
  }>;
  trainingPackages: SupplementPackage[];
}

export interface SeedOptions {
  repoRoot: string;
  demo?: boolean;
  force?: boolean;
  /** Local blob store: hard-link repo files instead of copying. */
  linkLocalFiles?: boolean;
  log?: (msg: string) => void;
}

export interface SeedReport {
  brands: number;
  products: number;
  packages: number;
  brandRows: Array<{ id: string; name: string; logo: string; fallback: boolean }>;
  productImages: { matched: number; fallback: string[] };
  training: Array<{
    file: string;
    brand: string;
    product: string;
    packageId: string;
    packageTitle: string;
    part: number;
    sectionId: string;
    durationSec: number;
    status: string;
    quizSource: 'client-quiz-bank' | 'sample' | 'none';
  }>;
  demoUsers: Array<{ role: string; name: string; phone: string; password: string }>;
}

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

async function putFile(d: Deps, objectPath: string, file: string, mime: string, link: boolean) {
  if (d.blob instanceof LocalBlobStore && link) d.blob.linkFrom(objectPath, file, mime);
  else await d.blob.put(objectPath, fs.readFileSync(file), mime);
}

const short = (s: string) => createHash('sha1').update(s).digest('hex').slice(0, 12);

const SEED_MEDIA_DURATIONS: Record<string, number> = {
  'معرفی کلی محصول فورمی.m4a': 419,
  'آموزش کامل محصول فورمی.mp4': 527,
  'معرفی کلی بابل.m4a': 333,
  'کتابچه_جامع_فروش_BUBBLE.mp4': 564,
  'ای_تی_ال_پادزهر_دردهای_دیجیتال.m4a': 454,
  'آموزش_ویدیویی_ATL.mp4': 564,
  'معرفی کلی ویت آس.m4a': 430,
  'آموزش_کرم_ترک_پای__WITH_US_.mp4': 571,
  'معرفی کلی ضدآفتاب استیکی پیکسل.m4a': 393,
  'آموزش کامل ضدآفتاب پیکسل.mp4': 602,
  'معرفی کلی آیس بال.m4a': 419,
  'آموزش_فروش_آیس_بال.mp4': 608,
  'معرفی کلی‌ دارت.m4a': 347,
};

export async function runSeed(d: Deps, opts: SeedOptions): Promise<SeedReport> {
  const log = opts.log ?? (() => undefined);
  const link = !!opts.linkLocalFiles;
  const paths = catalogPaths(opts.repoRoot);
  const cat = loadCatalog(paths);
  const sup = JSON.parse(
    fs.readFileSync(path.join(opts.repoRoot, 'data', 'catalog-supplement.json'), 'utf8'),
  ) as Supplement;
  const bank = JSON.parse(
    fs.readFileSync(path.join(opts.repoRoot, 'data', 'skincare-products-quiz.json'), 'utf8'),
  ) as QuizBank;
  const quizAssign = distributeBankQuestions(sup.trainingPackages, bank);
  const quizSourceFor = (
    sp: SupplementPackage,
    i: number,
  ): SeedReport['training'][number]['quizSource'] =>
    quizAssign.has(`${sp.id}|${i}`) ? 'client-quiz-bank' : sp.brandId ? 'sample' : 'none';
  const now = d.clock();
  const iso = now.toISOString();
  const report: SeedReport = {
    brands: 0,
    products: 0,
    packages: 0,
    brandRows: [],
    productImages: { matched: 0, fallback: [] },
    training: [],
    demoUsers: [],
  };

  // 1) Holding logo (D34 fallback)
  const holdingPath = 'branding/holding-logo.png';
  await putFile(d, holdingPath, path.join(opts.repoRoot, sup.holdingLogo), 'image/png', link);
  const holdingLogoUrl = await d.blob.publicUrl(holdingPath);
  await d.store.set(
    'settings/branding',
    { holdingLogoUrl, holdingLogoPath: holdingPath, updatedAt: iso },
    { merge: true },
  );

  // 2) Brands (CSV + reactivated)
  const brandInputs = [
    ...cat.brands.map((b) => ({ ...b, source: 'catalog' as const })),
    ...sup.reactivatedBrands.map((b, i) => ({
      id: b.id,
      name: b.name,
      nameLatin: b.nameLatin,
      sortOrder: 100 + i,
      logoFile: b.logoFile && cat.logoFiles.has(b.logoFile) ? b.logoFile : null,
      source: 'reactivated' as const,
    })),
  ];
  const brandLogo = new Map<string, string>();
  for (const b of brandInputs) {
    const existing = await d.store.get<Brand>(`brands/${b.id}`);
    let logoUrl = holdingLogoUrl;
    let logoPath: string | null = null;
    let fallback = true;
    if (b.logoFile) {
      const ext = path.extname(b.logoFile).toLowerCase();
      logoPath = `brands/${b.id}/logo${ext}`;
      await putFile(
        d,
        logoPath,
        path.join(paths.logosDir, b.logoFile),
        MIME_BY_EXT[ext] ?? 'image/png',
        link,
      );
      logoUrl = await d.blob.publicUrl(logoPath);
      fallback = false;
    }
    // Keep a logo uploaded later from the admin panel.
    const keepAdminLogo =
      existing &&
      !existing.logoIsFallback &&
      existing.logoPath &&
      !existing.logoPath.startsWith(`brands/${b.id}/logo.`);
    const doc: Partial<Brand> = {
      name: b.name,
      nameLatin: b.nameLatin,
      sortOrder: b.sortOrder,
      archived: existing?.archived ?? false,
      source: b.source,
      createdAt: existing?.createdAt ?? iso,
      updatedAt: iso,
      ...(keepAdminLogo ? {} : { logoUrl, logoPath, logoIsFallback: fallback }),
    };
    await d.store.set(`brands/${b.id}`, doc as Record<string, unknown>, { merge: true });
    brandLogo.set(b.id, keepAdminLogo && existing ? existing.logoUrl : logoUrl);
    report.brandRows.push({
      id: b.id,
      name: b.name,
      logo: b.logoFile ?? '(holding logo — D34)',
      fallback,
    });
  }
  report.brands = brandInputs.length;
  invalidateBrands(d);
  log(`brands: ${report.brands}`);

  // 3) Products (CSV active + reactivated hidden + supplement)
  const hiddenById = new Map(cat.hidden.map((h) => [h.id, h]));
  const productInputs = [
    ...cat.products.filter((p) => p.brandId).map((p) => ({ ...p, source: 'catalog' as const })),
    ...sup.reactivatedProducts.map((r) => {
      const h = hiddenById.get(r.id);
      if (!h) throw new Error(`Reactivated product ${r.id} not in hidden-products.csv`);
      return {
        id: h.id,
        code: h.code,
        barcode: null,
        name: h.name,
        brandId: r.brandId,
        category: null,
        description: null,
        imageFile: cat.matchImage(h.code, ''),
        source: 'reactivated' as const,
      };
    }),
    ...sup.newProducts.map((p) => ({
      id: p.id,
      code: p.code ?? '',
      barcode: null,
      name: p.name,
      brandId: p.brandId,
      category: p.category,
      description: p.description,
      imageFile: p.imageFile,
      source: 'supplement' as const,
    })),
  ];
  const writes: Array<{ path: string; data: Record<string, unknown>; merge: boolean }> = [];
  for (const p of productInputs) {
    const brandId = p.brandId ?? '';
    const existing = await d.store.get<Product>(`products/${p.id}`);
    let imageUrl = brandLogo.get(brandId) ?? holdingLogoUrl;
    let imagePath: string | null = null;
    let fallback = true;
    if (p.imageFile) {
      const ext = path.extname(p.imageFile).toLowerCase();
      imagePath = `products/${p.id}/main${ext}`;
      await putFile(
        d,
        imagePath,
        path.join(paths.imagesDir, p.imageFile),
        MIME_BY_EXT[ext] ?? 'image/png',
        link,
      );
      imageUrl = await d.blob.publicUrl(imagePath);
      fallback = false;
      report.productImages.matched++;
    } else report.productImages.fallback.push(`${p.id} ${p.name}`);
    const keepAdminImage =
      existing &&
      !existing.imageIsFallback &&
      existing.imagePath &&
      !existing.imagePath.startsWith(`products/${p.id}/main.`);
    writes.push({
      path: `products/${p.id}`,
      merge: true,
      data: {
        brandId,
        name: p.name,
        code: p.code || null,
        barcode: p.barcode,
        category: p.category,
        description: p.description,
        archived: existing?.archived ?? false,
        source: p.source,
        createdAt: existing?.createdAt ?? iso,
        updatedAt: iso,
        ...(keepAdminImage ? {} : { imageUrl, imagePath, imageIsFallback: fallback }),
      },
    });
  }
  await d.store.batchSet(writes);
  report.products = productInputs.length;
  log(`products: ${report.products} (images ${report.productImages.matched})`);

  // 4) Policies + badges (only if missing)
  if (!(await d.store.get('policies/global')))
    await d.store.set('policies/global', { ...DEFAULT_POLICY, updatedAt: iso, updatedBy: 'seed' });
  for (const b of DEFAULT_BADGES) {
    const { id, ...rest } = b;
    if (!(await d.store.get(`badges/${id}`)))
      await d.store.set(`badges/${id}`, rest as unknown as Record<string, unknown>);
  }

  // 5) Training packages from the sample files
  const brandsById = new Map(brandInputs.map((b) => [b.id, b]));
  const productsById = new Map(productInputs.map((p) => [p.id, p]));
  const publishedIds: string[] = [];
  for (const sp of sup.trainingPackages) {
    const pkgPath = `packages/${sp.id}`;
    const exists = await d.store.get<Package>(pkgPath);
    const brand = sp.brandId ? brandsById.get(sp.brandId) : undefined;
    const product = sp.productId ? productsById.get(sp.productId) : undefined;
    if (sp.brandId && !brand) throw new Error(`Seed package ${sp.id}: unknown brand ${sp.brandId}`);
    if (sp.productId && !product)
      throw new Error(`Seed package ${sp.id}: unknown product ${sp.productId}`);
    if (exists && !opts.force) {
      for (const [i, s] of sp.sections.entries()) {
        const sec = exists.sections.find((x) => x.id === `${sp.id}-s${i + 1}`);
        report.training.push({
          file: s.file,
          brand: brand?.name ?? '— (بدون تخصیص)',
          product: product?.name ?? (brand ? '— (سطح برند)' : '—'),
          packageId: sp.id,
          packageTitle: exists.title,
          part: i + 1,
          sectionId: sec?.id ?? '',
          durationSec: sec?.durationSec ?? 0,
          status: exists.status,
          quizSource: quizSourceFor(sp, i),
        });
      }
      if (exists.status === 'published') publishedIds.push(sp.id);
      continue;
    }
    const pkg: Package = {
      brandId: sp.brandId,
      productId: sp.productId,
      title: sp.title,
      description: buildDescription(sp, brand?.name, product),
      status: 'draft',
      deadlineAt: sp.deadlineDays
        ? new Date(now.getTime() + sp.deadlineDays * DAY).toISOString()
        : null,
      estimatedMinutes: 0,
      coverUrl: null,
      sections: [],
      createdBy: 'seed',
      publishedAt: null,
      seedTag: 'sample-training-v1',
      createdAt: iso,
      updatedAt: iso,
    };
    await d.store.set(pkgPath, pkg as unknown as Record<string, unknown>);
    for (const [i, s] of sp.sections.entries()) {
      const file = path.join(opts.repoRoot, s.file);
      const existsOnDisk = fs.existsSync(file);
      const fallbackDur = SEED_MEDIA_DURATIONS[s.file] ?? (s.mediaType === 'audio' ? 360 : 480);
      const buf = existsOnDisk
        ? fs.readFileSync(file)
        : createPlaceholderMp4(s.mediaType === 'audio', fallbackDur);
      const detected = sniff(buf.subarray(0, 64));
      const durationSec = mp4DurationFromBuffer(buf) ?? fallbackDur;
      const mime = s.mediaType === 'audio' ? 'audio/mp4' : (detected?.mime ?? 'video/mp4');
      const ext =
        path.extname(s.file).replace(/^\./, '').toLowerCase() ||
        (s.mediaType === 'audio' ? 'm4a' : 'mp4');
      const mediaId = `seed-media-${short(s.file)}`;
      const objectPath = `media/${s.mediaType}/${mediaId}.${ext}`;
      if (existsOnDisk) {
        await putFile(d, objectPath, file, mime, link);
      } else {
        await d.blob.put(objectPath, buf, mime);
      }
      const asset: MediaAsset = {
        kind: s.mediaType,
        status: 'ready',
        path: objectPath,
        declaredMime: mime,
        mime,
        sizeBytes: buf.length,
        declaredSize: buf.length,
        originalName: s.file,
        durationSec,
        target: { type: 'section', id: null },
        createdBy: 'seed',
        createdAt: iso,
        rejectReason: null,
      };
      await d.store.set(`media/${mediaId}`, asset as unknown as Record<string, unknown>);
      const sectionId = `${sp.id}-s${i + 1}`;
      const quizId = `${sectionId}-quiz`;
      const section: Section = {
        packageId: sp.id,
        order: i + 1,
        title: s.title,
        description:
          i === 0 && s.mediaType === 'audio'
            ? 'معرفی کلی صوتی — می‌توانید در مسیر گوش بدهید.'
            : 'آموزش کامل ویدیویی محصول برای فروش.',
        transcript: '',
        mediaType: s.mediaType,
        mediaSource: 'file',
        youtubeUrl: null,
        youtubeId: null,
        mediaId,
        mediaPath: objectPath,
        mediaMime: mime,
        mediaSizeBytes: buf.length,
        durationSec,
        quizId,
        archived: false,
        createdAt: iso,
        updatedAt: iso,
      };
      await d.store.set(
        `${pkgPath}/sections/${sectionId}`,
        section as unknown as Record<string, unknown>,
      );
      await d.store.set(`section_index/${sectionId}`, { packageId: sp.id });
      const bankQs = quizAssign.get(`${sp.id}|${i}`);
      const questions =
        bankQs && bankQs.length
          ? bankQs
          : sp.brandId
            ? sampleQuestions(sp, s, brand?.name ?? '', product, productInputs, brandInputs)
            : [];
      const quizSource = quizSourceFor(sp, i);
      const quiz: Quiz = {
        sectionId,
        packageId: sp.id,
        passScore: null,
        maxAttempts: null,
        version: 1,
        active: true,
        questionCount: questions.length,
        needsReview: quizSource !== 'client-quiz-bank',
        createdAt: iso,
        updatedAt: iso,
      };
      await d.store.set(`quizzes/${quizId}`, quiz as unknown as Record<string, unknown>);
      for (const [qi, q] of questions.entries()) {
        const doc: Question = {
          ...q,
          order: qi + 1,
          version: 1,
          archived: false,
          createdAt: iso,
          updatedAt: iso,
        };
        await d.store.set(
          `quizzes/${quizId}/questions/q${qi + 1}`,
          doc as unknown as Record<string, unknown>,
        );
      }
      report.training.push({
        file: s.file,
        brand: brand?.name ?? '— (بدون تخصیص)',
        product: product?.name ?? (brand ? '— (سطح برند)' : '—'),
        packageId: sp.id,
        packageTitle: sp.title,
        part: i + 1,
        sectionId,
        durationSec,
        status: sp.publish ? 'published' : 'draft',
        quizSource,
      });
    }
    await refreshPackageSummary(d, sp.id);
    if (sp.publish) {
      const fresh = await d.store.get<Package>(pkgPath);
      const issues = fresh ? await validatePublish(d, fresh) : ['missing'];
      if (issues.length)
        throw new Error(`Seed package ${sp.id} not publishable: ${issues.join(' | ')}`);
      await d.store.update(pkgPath, { status: 'published', publishedAt: iso });
      publishedIds.push(sp.id);
    }
    await audit(d, SEED, 'package.seeded', 'packages', sp.id, null, {
      title: sp.title,
      publish: sp.publish,
    });
  }
  report.packages = sup.trainingPackages.length;

  // 6) Global assignment of the sample packages (idempotent id)
  if (publishedIds.length) {
    const prev = await d.store.get<{ packageIds: string[]; createdAt: string }>(
      'assignments/seed-global',
    );
    await d.store.set('assignments/seed-global', {
      type: 'global',
      targetId: null,
      packageIds: [...new Set([...(prev?.packageIds ?? []), ...publishedIds])].sort(),
      createdBy: 'seed',
      createdAt: prev?.createdAt ?? iso,
      revokedAt: null,
      revokedBy: null,
    });
  }
  await d.store.set(
    'learning_paths/seed-path-onboarding',
    {
      name: 'مسیر آشنایی با محصولات نمونه',
      description: 'ترتیب پیشنهادی آموزش‌های نمونه برای بازاریاب‌های جدید.',
      scope: 'global',
      targetId: null,
      startAt: null,
      items: publishedIds.map((id, i) => ({
        packageId: id,
        order: i + 1,
        deadlineOffsetDays: null,
      })),
      archived: false,
      createdAt: iso,
      updatedAt: iso,
    },
    { merge: true },
  );

  if (opts.demo) report.demoUsers = await (await import('./demo')).seedDemo(d);
  log('seed complete');
  return report;
}

function buildDescription(
  sp: SupplementPackage,
  brandName: string | undefined,
  product: { name: string; description: string | null } | undefined,
): string {
  if (!brandName)
    return 'محتوای نمونه «دارت» — برند و محصول آن هنوز مشخص نشده است (بدون تخصیص، D33).';
  if (!product) return `آموزش سطح برند ${brandName}: معرفی کلی برند و نکات فروش محصولات آن.`;
  return product.description ?? `آموزش معرفی و فروش «${product.name}» از برند ${brandName}.`;
}

type QInput = Pick<Question, 'stem' | 'options' | 'answerKey' | 'explanation'>;

function bankToQInput(q: BankQuestion): QInput {
  const keys = ['a', 'b', 'c', 'd'];
  return {
    stem: q.stem,
    options: q.options.map((text, i) => ({ key: keys[i] ?? 'a', text })),
    answerKey: q.answer.trim().toLowerCase(),
    explanation: q.explanation,
  };
}

/**
 * Split each quiz-bank product's question set across every section of the packages tagged with
 * that quizKey (supplement order, contiguous chunks). A product's full bank therefore appears
 * exactly once on the site — e.g. «WITH US» 10 questions split 5/5 between the ویت آس audio and
 * video packages; single-section packages (زِن) get the whole 10.
 */
function distributeBankQuestions(
  packages: SupplementPackage[],
  bank: QuizBank,
): Map<string, QInput[]> {
  const out = new Map<string, QInput[]>();
  for (const p of bank.products) {
    const questions = p.questions.map(bankToQInput);
    const targets: string[] = [];
    for (const sp of packages)
      if (sp.quizKey === p.key) sp.sections.forEach((_, i) => targets.push(`${sp.id}|${i}`));
    if (!targets.length || !questions.length) continue;
    const base = Math.floor(questions.length / targets.length);
    let extra = questions.length % targets.length;
    let idx = 0;
    for (const t of targets) {
      const n = base + (extra-- > 0 ? 1 : 0);
      out.set(t, questions.slice(idx, idx + n));
      idx += n;
    }
  }
  return out;
}

/** Deterministic pick of `n` distinct items, excluding `exclude`. */
function pick<T>(list: T[], n: number, seed: string, exclude: (x: T) => boolean): T[] {
  const pool = list.filter((x) => !exclude(x));
  const h = parseInt(short(seed).slice(0, 8), 16);
  const out: T[] = [];
  for (let i = 0; out.length < n && i < pool.length * 2; i++) {
    const item = pool[(h + i * 7919) % pool.length];
    if (item !== undefined && !out.includes(item)) out.push(item);
  }
  return out;
}

function withCorrect(
  correct: string,
  distractors: string[],
  seed: string,
): { options: Question['options']; answerKey: string } {
  const keys = ['a', 'b', 'c', 'd'];
  const pos = parseInt(short(seed).slice(0, 2), 16) % 4;
  const texts = [...distractors.slice(0, 3)];
  texts.splice(pos, 0, correct);
  return {
    options: texts.map((t, i) => ({ key: keys[i] ?? 'a', text: t })),
    answerKey: keys[pos] ?? 'a',
  };
}

/**
 * Fallback sample 5-question quizzes built only from catalog facts (brand, product, category) +
 * generic sales-process questions — used solely for products without a client quiz bank entry in
 * data/skincare-products-quiz.json. Marked needsReview=true: the admin replaces them with content
 * questions.
 */
function sampleQuestions(
  sp: SupplementPackage,
  s: SupplementSection,
  brandName: string,
  product: { id: string; name: string; category: string | null } | undefined,
  products: Array<{ id: string; name: string; brandId: string | null; category: string | null }>,
  brands: Array<{ id: string; name: string }>,
): QInput[] {
  const seed = `${sp.id}|${s.file}`;
  const qs: QInput[] = [];
  const otherBrands = pick(brands, 3, `${seed}|b`, (b) => b.id === sp.brandId).map((b) => b.name);
  if (product) {
    const others = pick(
      products,
      3,
      `${seed}|p`,
      (p) => p.brandId === sp.brandId || p.id === product.id,
    ).map((p) => p.name);
    qs.push({
      stem: 'این قسمت آموزشی درباره کدام محصول است؟',
      ...withCorrect(product.name, others, `${seed}|1`),
      explanation: `این آموزش مربوط به «${product.name}» است.`,
    });
    qs.push({
      stem: `«${product.name}» محصول کدام برند است؟`,
      ...withCorrect(brandName, otherBrands, `${seed}|2`),
      explanation: `این محصول متعلق به برند ${brandName} است.`,
    });
  } else {
    const own = products.filter((p) => p.brandId === sp.brandId);
    const ownPick = pick(own, 1, `${seed}|own`, () => false)[0];
    const others = pick(products, 3, `${seed}|p`, (p) => p.brandId === sp.brandId).map(
      (p) => p.name,
    );
    qs.push({
      stem: 'این آموزش درباره کدام برند است؟',
      ...withCorrect(brandName, otherBrands, `${seed}|1`),
      explanation: `این آموزش سطح برند ${brandName} است.`,
    });
    if (ownPick)
      qs.push({
        stem: `کدام محصول متعلق به برند ${brandName} است؟`,
        ...withCorrect(ownPick.name, others, `${seed}|2`),
        explanation: `«${ownPick.name}» از محصولات ${brandName} است.`,
      });
  }
  qs.push({
    stem: 'هدف اصلی این قسمت آموزشی چیست؟',
    ...withCorrect(
      'آشنایی با محصول و مزیت‌های آن برای معرفی به مشتری',
      ['آموزش حسابداری فروشگاه', 'آموزش نصب اپلیکیشن سفارش', 'آشنایی با قوانین مرخصی'],
      `${seed}|3`,
    ),
    explanation: 'هر قسمت آموزشی برای شناخت محصول و فروش بهتر آن است.',
  });
  qs.push({
    stem: 'بهترین شروع برای معرفی محصول به مشتری کدام است؟',
    ...withCorrect(
      'پرسیدن نیاز مشتری و گفتن مزیت اصلی محصول',
      ['گفتن قیمت قبل از هر توضیحی', 'مقایسه منفی با برندهای دیگر', 'اصرار به خرید تعداد زیاد'],
      `${seed}|4`,
    ),
    explanation: 'اول نیاز مشتری را بشناس، بعد مزیت متناسب را بگو.',
  });
  qs.push({
    stem: 'اگر مشتری سؤالی پرسید که پاسخش را در آموزش ندیده‌اید، چه باید کرد؟',
    ...withCorrect(
      'صادقانه بگویید بررسی می‌کنید و از مدیر یا منتور بپرسید',
      ['یک پاسخ حدسی بدهید', 'سؤال را نادیده بگیرید', 'بگویید این محصول مشکلی ندارد'],
      `${seed}|5`,
    ),
    explanation: 'اطلاعات نادرست اعتماد مشتری را از بین می‌برد.',
  });
  return qs;
}
