import type { Package, Policy, Product, Question, Quiz, Section } from '../domain/types';
import { allBrands } from './catalog-cache';
import { aiHub } from '../ai/hub';
import { getPolicy, type Deps } from './context';
import { DAY } from '../lib/time';

/**
 * Knowledge fabric — one searchable index over *every* content type the site holds:
 *
 *   brands · products (name/code/barcode/category/description) · packages · sections
 *   (title/description/transcript) · quiz stems + explanations (never answer keys) · company
 *   policies · sales plays (objection handling) · FAQ · and everything extracted from media
 *   (product images, PDFs, audio and video files) by the multimodal ingestion job.
 *
 * Two invariants matter more than retrieval cleverness:
 *  1. **Provenance**: every item carries `ref` (a deep link the marketer can open) and the source
 *     collection, so an answer can always show *where* it came from.
 *  2. **Scope**: an item knows which brand/product/package it belongs to. A marketer never sees
 *     knowledge from a package that is not assigned to them (enforced in services/retrieval.ts).
 */
export type KnowledgeKind =
  'brand' | 'product' | 'package' | 'section' | 'quiz' | 'policy' | 'play' | 'faq' | 'media';

export interface KnowledgeScope {
  brandId: string | null;
  productId: string | null;
  packageId: string | null;
  sectionId: string | null;
  /** null = visible to every marketer (policies, FAQ, generic plays). */
  brandIds: string[] | null;
}

export interface KnowledgeItem {
  id: string;
  kind: KnowledgeKind;
  title: string;
  body: string;
  keywords: string[];
  /** In-app deep link (`/sections/s3`) so the mentor can cite an openable source. */
  ref: string;
  scope: KnowledgeScope;
  /** Content hash of the source fields — drives incremental rebuilds. */
  sourceHash: string;
  /** Vector + the provider that produced it (vectors from different providers never mix). */
  embedding: number[] | null;
  embeddingProvider: string | null;
  archived: boolean;
  updatedAt: string;
}

export interface KnowledgeIndexMeta {
  builtAt: string;
  itemCount: number;
  embeddingProvider: string | null;
  byKind: Record<string, number>;
  /** Bumped whenever the extraction prompt changes so media is re-read. */
  extractorVersion: string;
}

export const KNOWLEDGE_COLLECTION = 'knowledge_items';
export const KNOWLEDGE_META = 'knowledge_meta/index';
export const EXTRACTOR_VERSION = '2026-09-1';

/** Stable, human-readable id — makes debugging the index a matter of reading ids. */
export const itemId = (kind: KnowledgeKind, sourceId: string) => `${kind}:${sourceId}`;

export function hashSource(input: unknown): string {
  const s = typeof input === 'string' ? input : JSON.stringify(input);
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619);
    h2 = Math.imul(h2 + c, 2246822519);
  }
  return `${(h1 >>> 0).toString(36)}${(h2 >>> 0).toString(36)}`;
}

const trim = (s: string | null | undefined, max = 2400) =>
  (s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/** Keeps only non-empty strings (TypeScript-friendly alternative to `.filter(Boolean)`). */
const nonEmpty = (...parts: Array<string | null | undefined>): string[] =>
  parts.map((x) => (x ?? '').trim()).filter((x) => x.length > 0);

const GLOBAL_SCOPE: KnowledgeScope = {
  brandId: null,
  productId: null,
  packageId: null,
  sectionId: null,
  brandIds: null,
};

/** Builds every knowledge item from the CMS + catalog. Pure read; no model calls here. */
export async function buildKnowledgeItems(
  d: Deps,
  opts: { now?: Date } = {},
): Promise<KnowledgeItem[]> {
  const now = opts.now ?? d.clock();
  const nowIso = now.toISOString();
  const items: KnowledgeItem[] = [];

  const brands = await allBrands(d);
  const brandName = new Map(brands.map((b) => [b.id, b.name]));

  // ── Brands ────────────────────────────────────────────────────────────────
  for (const b of brands) {
    if (b.archived) continue;
    items.push({
      id: itemId('brand', b.id),
      kind: 'brand',
      title: `برند ${b.name}`,
      body: `${b.name}${b.nameLatin ? ` (${b.nameLatin})` : ''}. ${trim(b.logoIsFallback ? '' : 'لوگوی برند در کاتالوگ موجود است.')}`,
      keywords: nonEmpty(b.name, b.nameLatin),
      ref: `/learn?brand=${encodeURIComponent(b.id)}`,
      scope: { ...GLOBAL_SCOPE, brandId: b.id, brandIds: [b.id] },
      sourceHash: hashSource([b.name, b.nameLatin, b.archived, b.updatedAt]),
      embedding: null,
      embeddingProvider: null,
      archived: false,
      updatedAt: b.updatedAt ?? nowIso,
    });
  }

  // ── Products (the real catalog: name, code, barcode, category, description) ─
  const products = await d.store.query<Product>({
    collection: 'products',
    where: [['archived', '==', false]],
  });
  for (const p of products) {
    const bName = p.brandId ? brandName.get(p.brandId) : '';
    const facts = nonEmpty(
      `نام محصول: ${p.name}`,
      bName ? `برند: ${bName}` : '',
      p.code ? `کد محصول: ${p.code}` : '',
      p.barcode ? `بارکد: ${p.barcode}` : '',
      p.category ? `دسته: ${p.category}` : '',
      p.description ? `توضیح: ${trim(p.description, 1200)}` : '',
    );
    items.push({
      id: itemId('product', p.id),
      kind: 'product',
      title: `${p.name}${bName ? ` — ${bName}` : ''}`,
      body: facts.join('\n'),
      keywords: nonEmpty(p.name, bName, p.code, p.barcode, p.category),
      ref: `/learn?product=${encodeURIComponent(p.id)}`,
      scope: {
        ...GLOBAL_SCOPE,
        brandId: p.brandId ?? null,
        productId: p.id,
        brandIds: p.brandId ? [p.brandId] : null,
      },
      sourceHash: hashSource([p.name, p.code, p.barcode, p.category, p.description, p.updatedAt]),
      embedding: null,
      embeddingProvider: null,
      archived: !!p.archived,
      updatedAt: p.updatedAt ?? nowIso,
    });
  }

  // ── Packages / sections / quizzes ─────────────────────────────────────────
  const packages = await d.store.query<Package>({ collection: 'packages' });
  for (const pkg of packages) {
    if (pkg.status === 'draft') continue; // drafts are never knowledge
    const bName = pkg.brandId ? brandName.get(pkg.brandId) : '';
    const productName = pkg.productId
      ? (products.find((x) => x.id === pkg.productId)?.name ?? '')
      : '';
    const header = [bName ? `برند ${bName}` : '', productName ? `محصول ${productName}` : '']
      .filter(Boolean)
      .join('، ');
    items.push({
      id: itemId('package', pkg.id),
      kind: 'package',
      title: pkg.title,
      body: `${header ? `${header}. ` : ''}${trim(pkg.description)}\nاین آموزش حدود ${pkg.estimatedMinutes} دقیقه است.`,
      keywords: nonEmpty(pkg.title, bName, productName),
      ref: `/packages/${pkg.id}`,
      scope: {
        ...GLOBAL_SCOPE,
        brandId: pkg.brandId,
        productId: pkg.productId,
        packageId: pkg.id,
        brandIds: pkg.brandId ? [pkg.brandId] : null,
      },
      sourceHash: hashSource([
        pkg.title,
        pkg.description,
        pkg.status,
        pkg.sections.length,
        pkg.updatedAt,
      ]),
      embedding: null,
      embeddingProvider: null,
      archived: pkg.status === 'archived',
      updatedAt: pkg.updatedAt ?? nowIso,
    });

    const sections = await d.store.query<Section>({
      collection: `packages/${pkg.id}/sections`,
      where: [['archived', '==', false]],
    });
    for (const s of sections) {
      const body = [s.description, s.transcript].filter((x) => x && x.trim()).join('\n');
      if (!body.trim() && !s.title) continue;
      // Long transcripts are split so one section cannot flood the context window.
      const parts = splitBody(body, 900);
      parts.forEach((part, idx) => {
        items.push({
          id: itemId('section', parts.length > 1 ? `${s.id}#${idx + 1}` : s.id),
          kind: 'section',
          title: `${s.title}${parts.length > 1 ? ` (بخش ${idx + 1})` : ''}`,
          body: `${header ? `${header}. ` : ''}آموزش «${pkg.title}» — قسمت «${s.title}».\n${part}`,
          keywords: nonEmpty(s.title, pkg.title, bName, productName),
          ref: `/sections/${s.id}`,
          scope: {
            ...GLOBAL_SCOPE,
            brandId: pkg.brandId,
            productId: pkg.productId,
            packageId: pkg.id,
            sectionId: s.id,
            brandIds: pkg.brandId ? [pkg.brandId] : null,
          },
          sourceHash: hashSource([s.title, s.description, s.transcript, s.archived, s.updatedAt]),
          embedding: null,
          embeddingProvider: null,
          archived: false,
          updatedAt: s.updatedAt ?? nowIso,
        });
      });

      const quiz = await d.store.get<Quiz>(`quizzes/${s.quizId}`);
      if (quiz) {
        const questions = await d.store.query<Question>({
          collection: `quizzes/${quiz.id}/questions`,
          where: [['archived', '==', false]],
        });
        // Stems + explanations only. Answer keys are answer-key material and never indexed.
        const qa = questions
          .map((q) => {
            const options = q.options.map((o) => `${o.key}) ${o.text}`).join(' | ');
            return `سؤال: ${q.stem}\nگزینه‌ها: ${options}\nتوضیح آموزشی: ${q.explanation}`;
          })
          .join('\n\n');
        if (qa.trim())
          items.push({
            id: itemId('quiz', s.id),
            kind: 'quiz',
            title: `آزمون «${s.title}»`,
            body: `${header ? `${header}. ` : ''}${qa}`.slice(0, 4000),
            keywords: nonEmpty(s.title, pkg.title, 'آزمون', bName),
            ref: `/quiz/${s.quizId}`,
            scope: {
              ...GLOBAL_SCOPE,
              brandId: pkg.brandId,
              productId: pkg.productId,
              packageId: pkg.id,
              sectionId: s.id,
              brandIds: pkg.brandId ? [pkg.brandId] : null,
            },
            sourceHash: hashSource([quiz.id, quiz.version, qa.length, questions.length]),
            embedding: null,
            embeddingProvider: null,
            archived: false,
            updatedAt: quiz.updatedAt ?? nowIso,
          });
      }
    }
  }

  // ── Sales plays (objection handling) — admin-authored knowledge ────────────
  const plays = await d.store.query<SalesPlay>({
    collection: 'sales_plays',
    where: [['archived', '==', false]],
  });
  for (const p of plays) {
    items.push({
      id: itemId('play', p.id),
      kind: 'play',
      title: `پلی فروش: ${p.objection}`,
      body: [
        `اعتراض مشتری: ${p.objection}`,
        p.acknowledge ? `همدلی: ${p.acknowledge}` : '',
        p.bridge ? `پل زدن: ${p.bridge}` : '',
        p.proof ? `مدرک: ${p.proof}` : '',
        p.close ? `جمع‌بندی: ${p.close}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
      keywords: nonEmpty(p.objection, p.productId, p.brandId, 'اعتراض', 'فروش'),
      ref: `/learn?play=${encodeURIComponent(p.id)}`,
      scope: {
        ...GLOBAL_SCOPE,
        brandId: p.brandId ?? null,
        productId: p.productId ?? null,
        brandIds: p.brandId ? [p.brandId] : null,
      },
      sourceHash: hashSource([p.objection, p.acknowledge, p.bridge, p.proof, p.close, p.updatedAt]),
      embedding: null,
      embeddingProvider: null,
      archived: false,
      updatedAt: p.updatedAt ?? nowIso,
    });
  }

  // ── FAQ (admin-authored short answers) ────────────────────────────────────
  const faqs = await d.store.query<FaqEntry>({
    collection: 'mentor_faq',
    where: [['archived', '==', false]],
  });
  for (const f of faqs) {
    items.push({
      id: itemId('faq', f.id),
      kind: 'faq',
      title: f.question,
      body: `پرسش: ${f.question}\nپاسخ تأییدشده: ${trim(f.answer, 1500)}`,
      keywords: [f.question, ...(f.tags ?? [])],
      ref: f.ref ?? '/',
      scope: {
        ...GLOBAL_SCOPE,
        brandId: f.brandId ?? null,
        productId: f.productId ?? null,
        brandIds: f.brandId ? [f.brandId] : null,
      },
      sourceHash: hashSource([f.question, f.answer, f.updatedAt]),
      embedding: null,
      embeddingProvider: null,
      archived: false,
      updatedAt: f.updatedAt ?? nowIso,
    });
  }

  // ── Media extractions (images / PDF / audio / video processed by Gemini) ───
  const extractions = await d.store.query<MediaExtraction>({
    collection: 'media_extractions',
    where: [['status', '==', 'ready']],
  });
  for (const e of extractions) {
    const facts = (e.facts ?? []).filter(Boolean).join('\n');
    const body = [e.summary, facts, e.transcript].filter((x) => x && x.trim()).join('\n');
    if (!body.trim()) continue;
    items.push({
      id: itemId('media', e.id),
      kind: 'media',
      title: e.title,
      body: `${body}\n(منبع: فایل ${e.sourceKind === 'image' ? 'تصویری' : e.sourceKind === 'pdf' ? 'PDF' : 'رسانه‌ای'} «${e.sourceName}»)`,
      keywords: [...(e.keywords ?? []), e.sourceName].filter(Boolean),
      ref: e.ref ?? '/',
      scope: {
        ...GLOBAL_SCOPE,
        brandId: e.brandId ?? null,
        productId: e.productId ?? null,
        packageId: e.packageId ?? null,
        sectionId: e.sectionId ?? null,
        brandIds: e.brandId ? [e.brandId] : null,
      },
      sourceHash: hashSource([e.updatedAt, EXTRACTOR_VERSION, body.length]),
      embedding: null,
      embeddingProvider: null,
      archived: false,
      updatedAt: e.updatedAt ?? nowIso,
    });
  }

  // ── Company policies (deterministic facts the assistant may quote) ─────────
  const policy = await getPolicy(d);
  items.push(policyItem(policy, nowIso));

  return items;
}

export interface SalesPlay {
  objection: string;
  acknowledge: string;
  bridge: string;
  proof: string;
  close: string;
  brandId?: string | null;
  productId?: string | null;
  packageId?: string | null;
  archived: boolean;
  source?: 'admin' | 'seed';
  updatedAt: string;
}

export interface FaqEntry {
  question: string;
  answer: string;
  tags?: string[];
  ref?: string;
  brandId?: string | null;
  productId?: string | null;
  archived: boolean;
  updatedAt: string;
}

export type MediaSourceKind = 'image' | 'pdf' | 'audio' | 'video';

export interface MediaExtraction {
  /** Blob path (Storage / local) — also the cache key with `extractorVersion`. */
  path: string;
  sourceKind: MediaSourceKind;
  sourceName: string;
  mime: string;
  sizeBytes: number | null;
  status: 'pending' | 'ready' | 'skipped' | 'failed';
  title: string;
  summary: string;
  facts: string[];
  keywords: string[];
  transcript?: string;
  brandId?: string | null;
  productId?: string | null;
  packageId?: string | null;
  sectionId?: string | null;
  ref?: string;
  extractorVersion: string;
  provider?: string;
  error?: string;
  updatedAt: string;
}

export function policyItem(policy: Policy, updatedAt: string): KnowledgeItem {
  return {
    id: itemId('policy', 'global'),
    kind: 'policy',
    title: 'سیاست‌های آموزشی شرکت',
    body: [
      `نمره قبولی آزمون: ${policy.passScore} از ۱۰۰`,
      `تعداد تلاش مجاز آزمون: ${policy.maxAttempts}`,
      `حد آستانه تکمیل بخش: ${policy.completionThreshold}٪`,
      `هشدار مهلت: ${policy.warningHours.join('، ')} ساعت قبل`,
      `ساعت آرام (بدون اعلان): ${policy.quietHours.start} تا ${policy.quietHours.end}`,
      `یادآوری بی‌فعالیتی: بعد از ${policy.reminderInactiveDays} روز`,
      `امتیازها: قبولی اولین تلاش ${policy.pointsTable.first_pass_quiz}، تکمیل بسته ${policy.pointsTable.package_completion}، تکمیل به‌موقع ${policy.pointsTable.on_time_completion}`,
    ].join('\n'),
    keywords: ['سیاست', 'قانون', 'نمره قبولی', 'مهلت', 'امتیاز'],
    ref: '/',
    scope: GLOBAL_SCOPE,
    sourceHash: hashSource(policy),
    embedding: null,
    embeddingProvider: null,
    archived: false,
    updatedAt,
  };
}

/** Splits long text on sentence-ish boundaries so a chunk stays focused. */
export function splitBody(body: string, maxLen: number): string[] {
  const clean = body.replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  if (clean.length <= maxLen) return [clean];
  const sentences = clean.split(/(?<=[.!؟?])\s+/);
  const out: string[] = [];
  let buf = '';
  for (const s of sentences) {
    if ((buf + ' ' + s).trim().length > maxLen && buf) {
      out.push(buf.trim());
      buf = s;
    } else {
      buf = `${buf} ${s}`.trim();
    }
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

export interface RebuildResult {
  items: number;
  created: number;
  updated: number;
  unchanged: number;
  removed: number;
  embedded: number;
  embeddingProvider: string | null;
  durationMs: number;
  /** Media-derived items included in this build (0 until the ingester has read some files). */
  media: number;
}

/**
 * Incremental index rebuild. Only items whose `sourceHash` changed are rewritten and re-embedded,
 * which is what keeps a full rebuild inside the free tiers of the embedding providers.
 */
export async function rebuildKnowledgeIndex(
  d: Deps,
  opts: { limit?: number; embed?: boolean; keepIds?: Set<string> } = {},
): Promise<RebuildResult> {
  const started = Date.now();
  const limit = opts.limit ?? d.config.knowledgeRebuildLimit;
  const existing = await d.store.query<KnowledgeItem>({ collection: KNOWLEDGE_COLLECTION });
  const byId = new Map(existing.map((e) => [e.id, e]));
  const built = (await buildKnowledgeItems(d)).slice(0, limit);

  const embedder = opts.embed === false ? null : pickEmbedder(d);
  const embeddingProvider = embedder?.id ?? null;

  // Embeddings are only reused when they came from the currently configured provider.
  const needEmbed = built.filter((item) => {
    const prev = byId.get(item.id);
    return (
      !prev ||
      prev.sourceHash !== item.sourceHash ||
      !prev.embedding?.length ||
      prev.embeddingProvider !== embeddingProvider
    );
  });
  let embedded = 0;
  if (embedder && needEmbed.length) {
    const dims = await embedInto(d, embedder, needEmbed);
    embedded = dims;
  }

  const writes: Array<{ path: string; data: Record<string, unknown>; merge?: boolean }> = [];
  let created = 0;
  let updated = 0;
  let unchanged = 0;
  const seen = new Set<string>();
  for (const item of built) {
    seen.add(item.id);
    const prev = byId.get(item.id);
    if (
      prev &&
      prev.sourceHash === item.sourceHash &&
      prev.embeddingProvider === embeddingProvider
    ) {
      unchanged++;
      continue;
    }
    if (prev) updated++;
    else created++;
    writes.push({
      path: `${KNOWLEDGE_COLLECTION}/${item.id}`,
      data: item as unknown as Record<string, unknown>,
      merge: true,
    });
  }

  // Items whose source disappeared (archived package, deleted FAQ…) are flagged, not deleted.
  let removed = 0;
  for (const prev of existing) {
    if (seen.has(prev.id) || prev.archived) continue;
    writes.push({
      path: `${KNOWLEDGE_COLLECTION}/${prev.id}`,
      data: { archived: true },
      merge: true,
    });
    removed++;
  }

  const chunks: Array<typeof writes> = [];
  for (let i = 0; i < writes.length; i += 300) chunks.push(writes.slice(i, i + 300));
  for (const chunk of chunks) if (chunk.length) await d.store.batchSet(chunk);

  const byKind: Record<string, number> = {};
  for (const item of built) byKind[item.kind] = (byKind[item.kind] ?? 0) + 1;
  const meta: KnowledgeIndexMeta & { expireAt: Date } = {
    builtAt: d.clock().toISOString(),
    itemCount: built.length,
    embeddingProvider,
    byKind,
    extractorVersion: EXTRACTOR_VERSION,
    expireAt: new Date(d.clock().getTime() + 730 * DAY),
  };
  await d.store.set(KNOWLEDGE_META, meta as unknown as Record<string, unknown>);

  return {
    items: built.length,
    created,
    updated,
    unchanged,
    removed,
    embedded,
    embeddingProvider,
    durationMs: Date.now() - started,
    media: built.filter((i) => i.kind === 'media').length,
  };
}

function pickEmbedder(
  d: Deps,
): { id: string; embed: (texts: readonly string[]) => Promise<number[][]> } | null {
  const hub = aiHub(d);
  const provider = hub.candidates('embed')[0];
  if (!provider) return null;
  // The hub owns the capability check; the provider id is what keeps the stored vectors and the
  // query vector consistent (cosine between two different embedding spaces is meaningless).
  return { id: provider.id, embed: (texts) => hub.embed(texts).then((r) => r.value) };
}

async function embedInto(
  d: Deps,
  embedder: { id: string; embed: (texts: readonly string[]) => Promise<number[][]> },
  items: KnowledgeItem[],
): Promise<number> {
  const BATCH = 16;
  let done = 0;
  for (let i = 0; i < items.length; i += BATCH) {
    const batch = items.slice(i, i + BATCH);
    const texts = batch.map((it) => `${it.title}\n${it.body}`.slice(0, 6000));
    try {
      const vectors = await embedder.embed(texts);
      batch.forEach((item, idx) => {
        const vec = vectors[idx];
        if (vec?.length) {
          item.embedding = vec;
          item.embeddingProvider = embedder.id;
          done++;
        }
      });
    } catch (e) {
      console.warn(
        '[knowledge] embedding batch failed, keeping keyword-only index',
        (e as Error).message,
      );
      break;
    }
  }
  return done;
}

export async function knowledgeStats(d: Deps) {
  const meta = await d.store.get<KnowledgeIndexMeta>(KNOWLEDGE_META);
  const items = await d.store.query<KnowledgeItem>({ collection: KNOWLEDGE_COLLECTION });
  const fresh = items.filter((i) => !i.archived);
  return {
    ...(meta ?? {
      builtAt: null,
      itemCount: 0,
      embeddingProvider: null,
      byKind: {},
      extractorVersion: EXTRACTOR_VERSION,
    }),
    live: fresh.length,
    embedded: fresh.filter((i) => i.embedding?.length).length,
    archived: items.length - fresh.length,
  };
}
