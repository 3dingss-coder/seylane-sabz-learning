import { z } from 'zod';
import { ApiError } from '../http/errors';
import type { Deps, Actor } from './context';
import { audit, getPolicy, nowIso } from './context';
import { allBrands } from './catalog-cache';
import { normalizeFa } from './mentor';
import { itemId, type KnowledgeItem, type KnowledgeScope } from './knowledge';
import type { GroundingFact } from '../ai/handoff';
import type {
  Brand,
  MentorGuide,
  MentorGuideKind,
  MentorGuideQuizPolicy,
  MentorGuideTone,
  Package,
  Product,
} from '../domain/types';
import type { Doc } from '../store/types';

/**
 * Mentor behaviour boxes (جعبه‌ی رفتار منتور).
 *
 * An admin defines, once per brand and once per product (plus one global default), **how the
 * mentor must behave** and **what it must know** about that brand/product. The box is not a
 * prompt hack: it is normal, audited, versioned content that flows through the same two channels
 * as every other approved source:
 *
 *   1. **Knowledge** — each box becomes a `guide` knowledge item, so it is indexed, embedded,
 *      retrieved, citable and covered by the numeric-claim guard. Editing a box marks the index
 *      dirty exactly like editing a section (`knowledge.markKnowledgeDirty`).
 *   2. **Behaviour** — when a question is recognised as being about a brand/product, the box is
 *      *force-injected* as the first grounding fact **and** rendered into the system prompt. That
 *      is what makes the mentor "fully fluent": even a question the retriever scores poorly still
 *      carries the brand's approved facts, because the box is loaded by target, not by keywords.
 *
 * Nothing here can weaken the safety guardrails: a box can add obligations («ادعای درمانی ممنوع»)
 * but the code-level blocks (PII, injection, medical/legal/financial advice, other people's data)
 * always win.
 */

export const GUIDE_COLLECTION = 'mentor_guides';
export const GLOBAL_GUIDE_ID = 'global';

export const GUIDE_TONES: Array<{ value: MentorGuideTone; label: string; hint: string }> = [
  { value: 'friendly', label: 'صمیمی', hint: 'مثل یک همکار باتجربه و خودمانی' },
  { value: 'professional', label: 'رسمی و کارشناسی', hint: 'دقیق، متین، مناسب داروخانه و پخش' },
  { value: 'coach', label: 'مربی فروش', hint: 'پیگیر، انگیزشی، با قدم بعدی مشخص' },
  { value: 'brief', label: 'کوتاه و تیتروار', hint: 'حداقل کلمات، فقط نکته‌های کلیدی' },
];

export const TONE_LABEL: Record<MentorGuideTone, string> = {
  friendly: 'صمیمی',
  professional: 'رسمی و کارشناسی',
  coach: 'مربی فروش',
  brief: 'کوتاه و تیتروار',
};

export const QUIZ_POLICIES: Array<{ value: MentorGuideQuizPolicy; label: string }> = [
  { value: 'inherit', label: 'پیروی از تنظیم کلی' },
  { value: 'allow', label: 'مجاز (پاسخ را بگوید)' },
  { value: 'hide', label: 'ممنوع (فقط راهنمایی کند)' },
];

/** Empty box with safe defaults — what every brand/product starts with. */
export function emptyGuide(kind: MentorGuideKind, targetId: string | null): MentorGuide {
  const now = new Date().toISOString();
  return {
    kind,
    targetId,
    title: '',
    enabled: true,
    tone: 'friendly',
    personaNote: '',
    summary: '',
    keyPoints: [],
    sellingPoints: [],
    objections: [],
    faq: [],
    dos: [],
    donts: [],
    keywords: [],
    priority: 1,
    quizAnswers: 'inherit',
    updatedBy: null,
    createdAt: now,
    updatedAt: now,
  };
}

export const guideDocId = (kind: MentorGuideKind, targetId: string | null | undefined) =>
  kind === 'global' ? GLOBAL_GUIDE_ID : `${kind}:${targetId ?? ''}`;

/** `brand:sb-x` → { kind, targetId }. Anything else is the global box. */
export function parseGuideDocId(
  id: string,
): { kind: MentorGuideKind; targetId: string | null } | null {
  if (id === GLOBAL_GUIDE_ID) return { kind: 'global', targetId: null };
  const idx = id.indexOf(':');
  if (idx <= 0) return null;
  const kind = id.slice(0, idx);
  const targetId = id.slice(idx + 1);
  if (!targetId) return null;
  if (kind === 'brand' || kind === 'product') return { kind, targetId };
  return null;
}

// ─── Validation ──────────────────────────────────────────────────────────────
const str = (max: number) => z.string().trim().max(max);
const strList = (max: number, per: number) => z.array(str(per).min(1)).max(max);

/** Accepts both `{ question, answer }` and `{ objection, answer }` shapes. */
const objectionList = (max: number) =>
  z
    .array(
      z.object({
        objection: str(300).optional(),
        question: str(300).optional(),
        answer: str(1200).optional(),
      }),
    )
    .max(max)
    .transform((rows) =>
      rows
        .map((r) => ({
          objection: (r.objection ?? r.question ?? '').trim(),
          answer: (r.answer ?? '').trim(),
        }))
        .filter((r) => r.objection.length > 0 || r.answer.length > 0),
    );

const faqList = (max: number) =>
  z
    .array(
      z.object({
        question: str(300).optional(),
        q: str(300).optional(),
        answer: str(1200).optional(),
      }),
    )
    .max(max)
    .transform((rows) =>
      rows
        .map((r) => ({
          question: (r.question ?? r.q ?? '').trim(),
          answer: (r.answer ?? '').trim(),
        }))
        .filter((r) => r.question.length > 0 || r.answer.length > 0),
    );

export const guideSchema = z.object({
  title: str(120).optional().default(''),
  enabled: z.boolean().optional().default(true),
  tone: z.enum(['friendly', 'professional', 'coach', 'brief']).optional().default('friendly'),
  personaNote: str(400).optional().default(''),
  summary: str(4000).optional().default(''),
  keyPoints: strList(30, 400).optional().default([]),
  sellingPoints: strList(30, 400).optional().default([]),
  objections: objectionList(20).optional().default([]),
  faq: faqList(20).optional().default([]),
  dos: strList(20, 300).optional().default([]),
  donts: strList(20, 300).optional().default([]),
  keywords: strList(40, 80).optional().default([]),
  priority: z.number().min(0).max(2).optional().default(1),
  quizAnswers: z.enum(['inherit', 'allow', 'hide']).optional().default('inherit'),
});
export type GuideInput = z.infer<typeof guideSchema>;

export const guideListQuery = z.object({
  kind: z.enum(['global', 'brand', 'product', 'all']).optional(),
  q: z.string().trim().max(80).optional(),
  onlyDefined: z.enum(['true', 'false']).optional(),
});

// ─── Read / write ────────────────────────────────────────────────────────────
async function loadGuide(
  d: Deps,
  kind: MentorGuideKind,
  targetId: string | null,
): Promise<Doc<MentorGuide> | null> {
  const doc = await d.store.get<MentorGuide>(`${GUIDE_COLLECTION}/${guideDocId(kind, targetId)}`);
  if (!doc) return null;
  const parsed = parseGuideDocId(doc.id);
  if (!parsed) return null;
  return doc;
}

export function guideScore(g: MentorGuide): number {
  let n = 0;
  if (g.summary.trim()) n += 2;
  n += g.keyPoints.length + g.sellingPoints.length + g.objections.length + g.faq.length;
  n += g.dos.length + g.donts.length;
  if (g.personaNote.trim()) n += 1;
  return n;
}

/** Fills in the fields older documents lack so a partial record can never crash the pipeline. */
function normalize(g: Partial<MentorGuide> & { id?: string }): MentorGuide {
  const base = emptyGuide(g.kind ?? 'global', g.targetId ?? null);
  return {
    ...base,
    ...g,
    keyPoints: g.keyPoints ?? [],
    sellingPoints: g.sellingPoints ?? [],
    objections: g.objections ?? [],
    faq: g.faq ?? [],
    dos: g.dos ?? [],
    donts: g.donts ?? [],
    keywords: g.keywords ?? [],
  } as MentorGuide;
}

/** Admin list: every brand and product with its box (defined or not) — one screen, one place. */
export async function listGuides(
  d: Deps,
  query: z.infer<typeof guideListQuery> = {},
): Promise<
  Array<{
    key: string;
    kind: MentorGuideKind;
    targetId: string | null;
    name: string;
    parentName: string | null;
    imageUrl: string | null;
    code: string | null;
    defined: boolean;
    enabled: boolean;
    tone: MentorGuideTone;
    priority: number;
    quizAnswers: MentorGuideQuizPolicy;
    filled: number;
    updatedAt: string | null;
    updatedBy: string | null;
  }>
> {
  const kind = query.kind ?? 'all';
  const [brands, products, docs] = await Promise.all([
    allBrands(d),
    d.store.query<Product>({ collection: 'products' }),
    d.store.query<MentorGuide>({ collection: GUIDE_COLLECTION }),
  ]);
  const byId = new Map(docs.map((doc) => [doc.id, doc]));
  const brandName = new Map(brands.map((b) => [b.id, b.name]));
  const q = query.q ? normalizeFa(query.q.toLowerCase()) : '';
  const out: Array<{
    key: string;
    kind: MentorGuideKind;
    targetId: string | null;
    name: string;
    parentName: string | null;
    imageUrl: string | null;
    code: string | null;
    defined: boolean;
    enabled: boolean;
    tone: MentorGuideTone;
    priority: number;
    quizAnswers: MentorGuideQuizPolicy;
    filled: number;
    updatedAt: string | null;
    updatedBy: string | null;
  }> = [];

  const add = (args: {
    kind: MentorGuideKind;
    targetId: string | null;
    name: string;
    parentName?: string | null;
    imageUrl?: string | null;
    code?: string | null;
  }) => {
    const id = guideDocId(args.kind, args.targetId);
    const doc = byId.get(id);
    const g = doc ? normalize(doc) : null;
    const defined = !!g;
    if (query.onlyDefined === 'true' && !defined) return;
    if (query.onlyDefined === 'false' && defined) return;
    if (
      q &&
      !normalizeFa(
        `${args.name} ${args.parentName ?? ''} ${args.code ?? ''}`.toLowerCase(),
      ).includes(q)
    )
      return;
    out.push({
      key: id,
      kind: args.kind,
      targetId: args.targetId,
      name: args.name,
      parentName: args.parentName ?? null,
      imageUrl: args.imageUrl ?? null,
      code: args.code ?? null,
      defined,
      enabled: g ? g.enabled : false,
      tone: g?.tone ?? 'friendly',
      priority: g?.priority ?? 0,
      quizAnswers: g?.quizAnswers ?? 'inherit',
      filled: g ? guideScore(g) : 0,
      updatedAt: g?.updatedAt ?? null,
      updatedBy: g?.updatedBy ?? null,
    });
  };

  if (kind === 'global' || kind === 'all') {
    const doc = byId.get(GLOBAL_GUIDE_ID);
    const g = doc ? normalize(doc) : null;
    if (query.onlyDefined !== 'true' || g) {
      out.push({
        key: GLOBAL_GUIDE_ID,
        kind: 'global',
        targetId: null,
        name: 'رفتار پیش‌فرض منتور',
        parentName: null,
        imageUrl: null,
        code: null,
        defined: !!g,
        enabled: g ? g.enabled : false,
        tone: g?.tone ?? 'friendly',
        priority: g?.priority ?? 0,
        quizAnswers: g?.quizAnswers ?? 'inherit',
        filled: g ? guideScore(g) : 0,
        updatedAt: g?.updatedAt ?? null,
        updatedBy: g?.updatedBy ?? null,
      });
    }
  }
  if (kind === 'brand' || kind === 'all')
    for (const b of brands)
      add({
        kind: 'brand',
        targetId: b.id,
        name: b.name,
        imageUrl: b.logoUrl,
        code: b.nameLatin,
      });
  if (kind === 'product' || kind === 'all')
    for (const p of products) {
      if (p.archived && !byId.has(guideDocId('product', p.id))) continue;
      add({
        kind: 'product',
        targetId: p.id,
        name: p.name,
        parentName: p.brandId ? (brandName.get(p.brandId) ?? null) : null,
        imageUrl: p.imageUrl,
        code: p.code,
      });
    }
  return out;
}

export async function getGuide(
  d: Deps,
  kind: MentorGuideKind,
  targetId: string | null,
): Promise<{ guide: MentorGuide; defined: boolean; name: string }> {
  if (kind !== 'global' && !targetId)
    throw new ApiError('VALIDATION', 'شناسه‌ی برند یا محصول الزامی است.');
  const doc = await loadGuide(d, kind, targetId);
  const name = await targetName(d, kind, targetId);
  return { guide: doc ? normalize(doc) : emptyGuide(kind, targetId), defined: !!doc, name };
}

async function targetName(
  d: Deps,
  kind: MentorGuideKind,
  targetId: string | null,
): Promise<string> {
  if (kind === 'global') return 'رفتار پیش‌فرض منتور';
  if (!targetId) return '';
  if (kind === 'brand') {
    const b = await d.store.get<Brand>(`brands/${targetId}`);
    return b?.name ?? '';
  }
  const p = await d.store.get<Product>(`products/${targetId}`);
  return p?.name ?? '';
}

export async function upsertGuide(
  d: Deps,
  actor: Actor,
  kind: MentorGuideKind,
  targetId: string | null,
  input: GuideInput,
): Promise<{ guide: MentorGuide; name: string }> {
  if (kind !== 'global' && !targetId)
    throw new ApiError('VALIDATION', 'شناسه‌ی برند یا محصول الزامی است.');
  if (targetId) await assertTargetExists(d, kind, targetId);
  const existing = await loadGuide(d, kind, targetId);
  const now = nowIso(d);
  const next: MentorGuide = {
    ...emptyGuide(kind, targetId),
    ...(existing ? normalize(existing) : {}),
    ...input,
    kind,
    targetId,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    updatedBy: actor.id,
  };
  await d.store.set(
    `${GUIDE_COLLECTION}/${guideDocId(kind, targetId)}`,
    next as unknown as Record<string, unknown>,
  );
  const { markKnowledgeDirty } = await import('./knowledge');
  await markKnowledgeDirty(d);
  await audit(
    d,
    actor,
    existing ? 'mentor_guide.updated' : 'mentor_guide.created',
    GUIDE_COLLECTION,
    guideDocId(kind, targetId),
    existing ?? null,
    next,
  );
  return { guide: next, name: await targetName(d, kind, targetId) };
}

export async function deleteGuide(
  d: Deps,
  actor: Actor,
  kind: MentorGuideKind,
  targetId: string | null,
): Promise<{ ok: true }> {
  if (kind === 'global')
    throw new ApiError('VALIDATION', 'جعبه‌ی پیش‌فرض حذف نمی‌شود؛ آن را خاموش کن.');
  const doc = await loadGuide(d, kind, targetId);
  if (!doc) throw new ApiError('NOT_FOUND', 'جعبه‌ای برای این مورد تعریف نشده است.');
  await d.store.delete(`${GUIDE_COLLECTION}/${doc.id}`);
  const { markKnowledgeDirty } = await import('./knowledge');
  await markKnowledgeDirty(d);
  await audit(d, actor, 'mentor_guide.deleted', GUIDE_COLLECTION, doc.id, doc, null);
  return { ok: true };
}

async function assertTargetExists(d: Deps, kind: MentorGuideKind, targetId: string) {
  const path = kind === 'brand' ? `brands/${targetId}` : `products/${targetId}`;
  const doc = await d.store.get(path);
  if (!doc)
    throw new ApiError('NOT_FOUND', kind === 'brand' ? 'برند پیدا نشد.' : 'محصول پیدا نشد.');
}

// ─── Knowledge items (index + embedding + citation) ──────────────────────────
const GLOBAL_SCOPE: KnowledgeScope = {
  brandId: null,
  productId: null,
  packageId: null,
  sectionId: null,
  brandIds: null,
};

function guideBody(g: MentorGuide, name: string): string {
  const lines: string[] = [];
  if (name) lines.push(`موضوع: ${name}`);
  if (g.summary.trim()) lines.push(`خلاصه‌ی تسلط: ${g.summary.trim()}`);
  if (g.keyPoints.length) lines.push(`نکات کلیدی:\n${g.keyPoints.map((x) => `- ${x}`).join('\n')}`);
  if (g.sellingPoints.length)
    lines.push(`مزیت‌ها برای مشتری:\n${g.sellingPoints.map((x) => `- ${x}`).join('\n')}`);
  if (g.objections.length)
    lines.push(
      `پاسخ به اعتراض‌های مشتری:\n${g.objections
        .map((x) => `- اعتراض: ${x.objection}\n  پاسخ تأییدشده: ${x.answer}`)
        .join('\n')}`,
    );
  if (g.faq.length)
    lines.push(
      `پرسش‌های پرتکرار:\n${g.faq.map((x) => `- ${x.question}\n  ${x.answer}`).join('\n')}`,
    );
  if (g.dos.length) lines.push(`حتماً بگو:\n${g.dos.map((x) => `- ${x}`).join('\n')}`);
  if (g.donts.length) lines.push(`هرگز نگو:\n${g.donts.map((x) => `- ${x}`).join('\n')}`);
  return lines.join('\n').slice(0, 6000);
}

/** Every enabled box becomes one searchable, citable knowledge item. */
export async function buildGuideItems(d: Deps, nowIsoValue: string): Promise<KnowledgeItem[]> {
  const [docs, brands, products] = await Promise.all([
    d.store.query<MentorGuide>({ collection: GUIDE_COLLECTION }),
    allBrands(d),
    d.store.query<Product>({ collection: 'products' }),
  ]);
  const brandName = new Map(brands.map((b) => [b.id, b.name]));
  const productById = new Map(products.map((p) => [p.id, p]));
  const nameFor = (kind: MentorGuideKind, targetId: string | null, title: string): string => {
    if (title.trim()) return title.trim();
    if (kind === 'global') return 'رفتار پیش‌فرض منتور';
    if (kind === 'brand') return targetId ? (brandName.get(targetId) ?? '') : '';
    return targetId ? (productById.get(targetId)?.name ?? '') : '';
  };
  const items: KnowledgeItem[] = [];
  for (const doc of docs) {
    const parsed = parseGuideDocId(doc.id);
    if (!parsed) continue;
    const g = normalize(doc);
    if (!g.enabled) continue;
    const name = nameFor(parsed.kind, parsed.targetId, g.title);
    const body = guideBody(g, name);
    if (!body.trim()) continue;
    const product =
      parsed.kind === 'product' && parsed.targetId ? productById.get(parsed.targetId) : undefined;
    const brandId =
      parsed.kind === 'brand'
        ? parsed.targetId
        : parsed.kind === 'product'
          ? (product?.brandId ?? null)
          : null;
    items.push({
      id: itemId('guide', doc.id),
      kind: 'guide',
      title:
        parsed.kind === 'global'
          ? 'رفتار پیش‌فرض منتور'
          : `راهنمای منتور — ${name || (parsed.kind === 'brand' ? 'برند' : 'محصول')}`,
      body,
      keywords: [
        name,
        ...(parsed.kind === 'product' && brandId ? [brandName.get(brandId) ?? ''] : []),
        ...g.keywords,
      ]
        .map((x) => (x ?? '').trim())
        .filter(Boolean),
      ref:
        parsed.kind === 'brand' && parsed.targetId
          ? `/learn?brand=${encodeURIComponent(parsed.targetId)}`
          : parsed.kind === 'product' && parsed.targetId
            ? `/learn?product=${encodeURIComponent(parsed.targetId)}`
            : '/mentor',
      // Boxes are company-wide: every marketer's mentor must be fluent in every brand/product,
      // so a guide is never filtered out by the learner's brand or package scope.
      scope: {
        ...GLOBAL_SCOPE,
        brandId: brandId ?? null,
        productId: parsed.kind === 'product' ? parsed.targetId : null,
      },
      sourceHash: hashGuide(g),
      embedding: null,
      embeddingProvider: null,
      archived: false,
      updatedAt: g.updatedAt ?? nowIsoValue,
    });
  }
  return items;
}

function hashGuide(g: MentorGuide): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  const s = JSON.stringify([
    g.title,
    g.enabled,
    g.tone,
    g.personaNote,
    g.summary,
    g.keyPoints,
    g.sellingPoints,
    g.objections,
    g.faq,
    g.dos,
    g.donts,
    g.keywords,
    g.priority,
    g.quizAnswers,
    g.updatedAt,
  ]);
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619);
    h2 = Math.imul(h2 + c, 2246822519);
  }
  return `${(h1 >>> 0).toString(36)}${(h2 >>> 0).toString(36)}`;
}

// ─── Pipeline integration ────────────────────────────────────────────────────
export interface GuideSelection {
  globalGuide: MentorGuide | null;
  brandGuide: MentorGuide | null;
  productGuide: MentorGuide | null;
  brandId: string | null;
  productId: string | null;
  brandName: string;
  productName: string;
}

/**
 * Decides which boxes apply to a question. Three independent signals, most specific wins:
 *   1. the package the chat is opened on (brand + product of that package),
 *   2. the brand/product of the already-retrieved facts,
 *   3. a literal mention of a brand or product name in the question.
 * Signal 3 is the important one: it is what makes the mentor answer a brand question even when
 * keyword retrieval found nothing (the «منتور کامل مسلط باشد» requirement).
 */
export async function selectGuides(
  d: Deps,
  opts: {
    question: string;
    packageId?: string | null;
    facts?: Array<{ id: string; kind: string; title: string } & Record<string, unknown>>;
  },
): Promise<GuideSelection> {
  let brandId: string | null = null;
  let productId: string | null = null;

  if (opts.packageId) {
    const pkg = await d.store.get<Package>(`packages/${opts.packageId}`);
    if (pkg) {
      brandId = pkg.brandId ?? null;
      productId = pkg.productId ?? null;
    }
  }

  for (const f of opts.facts ?? []) {
    const scope = (f as { scope?: KnowledgeScope }).scope;
    if (!scope) continue;
    if (!productId && scope.productId) productId = scope.productId;
    if (!brandId && scope.brandId) brandId = scope.brandId;
  }
  if (productId && !brandId) {
    const p = await d.store.get<Product>(`products/${productId}`);
    brandId = p?.brandId ?? null;
  }

  // Name matching: the question mentions a brand or product the retriever did not surface.
  if (!productId || !brandId) {
    const match = await matchByName(d, opts.question);
    if (match.productId && !productId) productId = match.productId;
    if (match.brandId && !brandId) brandId = match.brandId;
  }

  const [globalGuide, brandGuide, productGuide] = await Promise.all([
    loadGuide(d, 'global', null),
    brandId ? loadGuide(d, 'brand', brandId) : Promise.resolve(null),
    productId ? loadGuide(d, 'product', productId) : Promise.resolve(null),
  ]);

  const [brandName, productName] = await Promise.all([
    brandId ? targetName(d, 'brand', brandId) : Promise.resolve(''),
    productId ? targetName(d, 'product', productId) : Promise.resolve(''),
  ]);

  return {
    globalGuide: globalGuide && globalGuide.enabled ? normalize(globalGuide) : null,
    brandGuide: brandGuide && brandGuide.enabled ? normalize(brandGuide) : null,
    productGuide: productGuide && productGuide.enabled ? normalize(productGuide) : null,
    brandId,
    productId,
    brandName,
    productName,
  };
}

/** Literal (normalised, longest-first) mention of a product or brand name in free text. */
export async function matchByName(
  d: Deps,
  raw: string,
): Promise<{ brandId: string | null; productId: string | null }> {
  const q = normalizeFa(raw.toLowerCase());
  if (q.length < 2) return { brandId: null, productId: null };
  const [brands, products] = await Promise.all([
    allBrands(d),
    d.store.query<Product>({ collection: 'products', where: [['archived', '==', false]] }),
  ]);
  const hay = ` ${q.replace(/[^\p{L}\p{N}\s]/gu, ' ')} `;
  let best: { brandId: string | null; productId: string | null; len: number } = {
    brandId: null,
    productId: null,
    len: 0,
  };
  for (const p of products) {
    const n = normalizeFa(p.name.toLowerCase());
    if (n.length >= 3 && hay.includes(` ${n} `) && n.length > best.len)
      best = { brandId: p.brandId ?? null, productId: p.id, len: n.length };
    const code = (p.code ?? '').trim().toLowerCase();
    if (code.length >= 3 && hay.includes(` ${code} `) && code.length + 1 > best.len)
      best = { brandId: p.brandId ?? null, productId: p.id, len: code.length + 1 };
  }
  if (best.productId) return { brandId: best.brandId, productId: best.productId };
  for (const b of brands) {
    const n = normalizeFa(b.name.toLowerCase());
    if (n.length >= 3 && hay.includes(` ${n} `) && n.length > best.len)
      best = { brandId: b.id, productId: null, len: n.length };
    const latin = normalizeFa((b.nameLatin ?? '').toLowerCase());
    if (latin.length >= 3 && hay.includes(` ${latin} `) && latin.length > best.len)
      best = { brandId: b.id, productId: null, len: latin.length };
  }
  return { brandId: best.brandId, productId: best.productId };
}

/** The behaviour block injected into the system prompt (never into the user-visible answer). */
export function renderGuideBlock(sel: GuideSelection): string {
  const blocks: string[] = [];
  const push = (label: string, g: MentorGuide, subject: string) => {
    const lines: string[] = [];
    if (subject) lines.push(`- موضوع: ${subject}`);
    lines.push(`- لحن گفتار: ${TONE_LABEL[g.tone]}`);
    if (g.personaNote.trim()) lines.push(`- نقش منتور: ${g.personaNote.trim()}`);
    if (g.summary.trim()) lines.push(`- آنچه منتور باید بداند: ${g.summary.trim()}`);
    if (g.dos.length) lines.push(`- حتماً بگو/تأکید کن: ${g.dos.join(' | ')}`);
    if (g.donts.length) lines.push(`- هرگز نگو: ${g.donts.join(' | ')}`);
    if (g.sellingPoints.length) lines.push(`- مزیت‌های اصلی: ${g.sellingPoints.join(' | ')}`);
    if (g.keyPoints.length) lines.push(`- نکات کلیدی: ${g.keyPoints.join(' | ')}`);
    if (g.objections.length)
      lines.push(
        `- اعتراض‌های مشتری و پاسخ تأییدشده:\n${g.objections
          .map((o) => `  • ${o.objection} → ${o.answer}`)
          .join('\n')}`,
      );
    if (lines.length <= 2) return;
    blocks.push(`${label}:\n${lines.join('\n')}`);
  };
  if (sel.productGuide) push('جعبه‌ی رفتار این محصول', sel.productGuide, sel.productName);
  if (sel.brandGuide) push('جعبه‌ی رفتار این برند', sel.brandGuide, sel.brandName);
  if (sel.globalGuide) push('جعبه‌ی رفتار پیش‌فرض', sel.globalGuide, '');
  if (!blocks.length) return '';
  return [
    'جعبه‌ی رفتار منتور (تعریف‌شده توسط مدیر محتوا — درباره‌ی این برند/محصول بر برداشت عمومی مقدم است، مگر در قواعد ایمنی):',
    ...blocks,
  ].join('\n\n');
}

/** `true` when the mentor may quote the answer key for the current question. */
export function quizAnswersAllowed(sel: GuideSelection, policyQuizAccess: boolean): boolean {
  const chain = [sel.productGuide, sel.brandGuide, sel.globalGuide];
  for (const g of chain) {
    if (!g) continue;
    if (g.quizAnswers === 'allow') return true;
    if (g.quizAnswers === 'hide') return false;
  }
  return policyQuizAccess;
}

/**
 * Turns the selected boxes into grounding facts, so their content is inside `<context>`: the
 * model can cite them and the numeric-claim guard validates the reply against them.
 */
export function guideFacts(sel: GuideSelection): GroundingFact[] {
  const out: GroundingFact[] = [];
  const add = (g: MentorGuide | null, subject: string, ref: string) => {
    if (!g) return;
    const body = guideBody(g, subject);
    if (!body.trim()) return;
    out.push({
      id: `guide:${guideDocId(g.kind, g.targetId)}`,
      kind: 'guide',
      title: `راهنمای تأییدشده${subject ? ` — ${subject}` : ''}`,
      text: body,
      ref,
      // Boxes lead the context on purpose: the mentor must master them before anything else.
      score: 1 + (g.priority ?? 1) / 10,
    });
  };
  add(
    sel.productGuide,
    sel.productName,
    sel.productId ? `/learn?product=${encodeURIComponent(sel.productId)}` : '/mentor',
  );
  add(
    sel.brandGuide,
    sel.brandName,
    sel.brandId ? `/learn?brand=${encodeURIComponent(sel.brandId)}` : '/mentor',
  );
  add(sel.globalGuide, '', '/mentor');
  return out;
}

export interface GuideContext {
  selection: GuideSelection;
  /** Rendered behaviour block for the system prompt ('' when no box applies). */
  block: string;
  /** Boxes as grounding facts, ready to be prepended to a `GroundingPacket`. */
  facts: GroundingFact[];
  /** May the mentor quote the quiz answer key for this question? */
  quizAnswers: boolean;
}

/** Neutral context: no box applies (small talk, or nothing recognised). */
export const EMPTY_GUIDE_CONTEXT: GuideContext = {
  selection: {
    globalGuide: null,
    brandGuide: null,
    productGuide: null,
    brandId: null,
    productId: null,
    brandName: '',
    productName: '',
  },
  block: '',
  facts: [],
  quizAnswers: false,
};

/** Convenience wrapper used by the answer, converse, voice and coach pipelines. */
export async function guideContext(
  d: Deps,
  opts: {
    question: string;
    packageId?: string | null;
    facts?: Array<{ id: string; kind: string; title: string } & Record<string, unknown>>;
  },
): Promise<GuideContext> {
  const policy = await getPolicy(d);
  const selection = await selectGuides(d, opts);
  return {
    selection,
    block: renderGuideBlock(selection),
    facts: guideFacts(selection),
    quizAnswers: quizAnswersAllowed(selection, policy.mentorQuizAnswerAccess),
  };
}
