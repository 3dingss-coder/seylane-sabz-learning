import type { User } from '../domain/types';
import type { Doc } from '../store/types';
import { aiHub } from '../ai/hub';
import { cosine } from '../ai/local';
import { tokenize } from './mentor';
import {
  KNOWLEDGE_COLLECTION,
  rebuildKnowledgeIndex,
  type KnowledgeItem,
  type KnowledgeKind,
} from './knowledge';
import { getPolicy, type Deps } from './context';

/**
 * Hybrid retriever (keyword BM25-lite ⊕ embeddings ⊕ RRF), scope-aware.
 *
 * Why hybrid and not "just vectors": the corpus is dominated by exact Persian product names,
 * brand names, barcodes and codes («آیس بابل»، «کد ۱۰۲۴»). Embeddings blur those; keyword search
 * nails them. Conversely, paraphrased questions («این کرم چربی پوست را کم می‌کند؟») need vectors.
 * Running both and fusing with Reciprocal Rank Fusion gives us the best of each with no training.
 */

export interface RetrievalScope {
  /** Packages the user is allowed to see; `null` means "no package filtering". */
  packageIds: Set<string> | null;
  /** Brands the user covers (marketer.brandIds); `null` = all. */
  brandIds: Set<string> | null;
  kinds?: KnowledgeKind[];
}

export interface RetrievedChunk {
  item: KnowledgeItem;
  /** Fused, normalised score used only for ranking (0..1). */
  score: number;
  /** Raw BM25-lite score — kept un-normalised because it is also the confidence signal. */
  keywordScore: number;
  /** Raw cosine similarity in [-1, 1] (clamped to >= 0) — the second confidence signal. */
  vectorScore: number;
  snippet: string;
}

export interface SearchResult {
  chunks: RetrievedChunk[];
  strategy: 'hybrid-kw-vector' | 'keyword-only' | 'exact';
  /** false → the assistant must answer «نمی‌دانم» instead of guessing. */
  confident: boolean;
  tookMs: number;
}

/**
 * Confidence gates. Max-normalisation would otherwise make *every* query look confident (the top
 * item always normalises to 1), so the decision uses the raw signals instead. Measured on the
 * fixture corpus: in-content questions land ≥ 1.3 BM25 (a single strong term) or ≥ 0.6 cosine,
 * off-topic ones score 0 keyword and < 0.4 cosine. Re-tune when the embedding provider changes.
 */
export const MIN_KEYWORD = 0.9;
export const MIN_VECTOR = 0.62;
/** Chunks weaker than this in both lanes are dropped before fusion. */
const KEYWORD_FLOOR = 0.08;
const VECTOR_FLOOR = 0.35;

/** Persian query expansion: colloquial → formal, and a few domain synonyms. */
const SYNONYMS: Record<string, string[]> = {
  چیه: ['چیست', 'چه'],
  چطوره: ['چگونه', 'چطور'],
  بخوره: ['مصرف', 'استفاده'],
  بزنم: ['استفاده', 'مصرف'],
  گندش: ['بوی', 'بو'],
  حساسیت: ['حساس', 'آلرژی'],
  رقیب: ['برند', 'محصول مشابه'],
  گرون: ['گران', 'قیمت'],
  ارزون: ['ارزان', 'قیمت'],
  جنس: ['متریال', 'ترکیبات'],
  مواد: ['ترکیبات', 'مواد مؤثره'],
  کیفیت: ['کیفیت', 'مرغوب'],
  تست: ['آزمون', 'امتحان'],
  نمره: ['نمره', 'درصد', 'قبولی'],
  مهلت: ['ددلاین', 'زمان تحویل'],
};

const STOP = new Set([
  'و',
  'در',
  'به',
  'از',
  'که',
  'این',
  'آن',
  'را',
  'با',
  'برای',
  'یک',
  'تا',
  'است',
  'هست',
  'بود',
  'شود',
  'کند',
  'می',
  'چه',
  'چی',
  'چیه',
  'چطور',
  'چگونه',
  'آیا',
  'اگر',
  'یا',
  'هم',
  'نیز',
  'ها',
  'های',
  'ای',
  'رو',
  'هر',
  'دارد',
  'دارم',
  'داره',
  'کدام',
  'کدوم',
  'باید',
  'شده',
  'کرد',
  'کن',
  'من',
  'تو',
  'ما',
  'شما',
  'او',
  'یه',
  'یکی',
  'هرچی',
  'هیچ',
  'کجا',
  'کی',
  'چند',
  'چقدر',
  'بگو',
  'بگو',
]);

export function expandQuery(query: string): string[] {
  const base = tokenize(query);
  const out = new Set(base);
  for (const t of base) {
    for (const syn of SYNONYMS[t] ?? []) for (const s of tokenize(syn)) out.add(s);
    // Light stemming keeps «کرمها» matched to «کرم» (tokenize already trims «ها»).
  }
  return [...out].filter((t) => t.length >= 2 && !STOP.has(t));
}

/** Damerau–Levenshtein ≤ 1 (substitution, insertion, deletion, adjacent swap): «کلامین» ≈ «کالمین». */
export function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0;
  while (i < la && i < lb && a[i] === b[i]) i++;
  if (la === lb) {
    if (a.slice(i + 1) === b.slice(i + 1)) return true; // one substitution
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2); // swap
  }
  return la > lb ? a.slice(i + 1) === b.slice(i) : b.slice(i + 1) === a.slice(i);
}

/** Adds the known brand/product/package vocabulary words that a (mis)spelled query word is one edit from. */
export function fuzzyExpand(tokens: string[], vocab: Set<string>): string[] {
  const out = new Set(tokens);
  for (const t of tokens) {
    if (t.length < 4 || vocab.has(t)) continue;
    for (const v of vocab) if (v.length >= 4 && withinOneEdit(t, v)) out.add(v);
  }
  return [...out];
}

const indexCache = new WeakMap<Deps, { at: number; items: KnowledgeItem[] }>();

/**
 * First-run self-healing. The index is normally built by the `knowledge-reindex` job, but a fresh
 * deploy (or a wiped local store) would otherwise answer «نمی‌دانم» to everything until 08:30
 * Tehran. So the first request that finds an empty index builds it inline — once per process per
 * cooldown, never in parallel — and every later request just reads the result.
 */
const bootstrapState = new WeakMap<Deps, { at: number; running: Promise<void> | null }>();
export const BOOTSTRAP_COOLDOWN_MS = 10 * 60_000;

async function bootstrapIndex(d: Deps): Promise<void> {
  const now = d.clock().getTime();
  const state = bootstrapState.get(d) ?? { at: 0, running: null };
  bootstrapState.set(d, state);
  if (state.running) return state.running;
  if (now - state.at < BOOTSTRAP_COOLDOWN_MS) return;
  state.at = now;
  state.running = rebuildKnowledgeIndex(d)
    .then(() => {
      indexCache.delete(d);
    })
    .catch((e: unknown) => {
      console.warn('[retrieval] index bootstrap failed', (e as Error).message);
    })
    .finally(() => {
      state.running = null;
    });
  return state.running;
}

async function refreshIfDirty(_d: Deps): Promise<void> {
  // Do not rebuild the knowledge index inside a user request. A full rebuild reads and writes
  // every knowledge row; on Cloudflare's free plan that exceeds the 50-subrequest cap and the
  // same invocation then fails the marketer's question. The `knowledge-reindex` cron owns the
  // rebuild. Brand/product answers do not wait for it — selectGuides loads the behaviour box
  // directly from D1.
  return;
}

export async function loadIndex(d: Deps, maxAgeMs = 60_000): Promise<KnowledgeItem[]> {
  const cached = indexCache.get(d);
  const now = d.clock().getTime();
  if (cached && now - cached.at < maxAgeMs) return cached.items;
  await refreshIfDirty(d);
  const items = await d.store.query<KnowledgeItem>({ collection: KNOWLEDGE_COLLECTION });
  let live = items.filter((i) => !i.archived);
  if (!live.length && !items.length) {
    await bootstrapIndex(d);
    const rebuilt = await d.store.query<KnowledgeItem>({ collection: KNOWLEDGE_COLLECTION });
    live = rebuilt.filter((i) => !i.archived);
  }
  indexCache.set(d, { at: now, items: live });
  return live;
}

export function invalidateIndexCache(d: Deps) {
  indexCache.delete(d);
}

/**
 * Scoping rule for the mentor: assigned packages ∪ (catalog knowledge, unless restricted).
 *
 * `Policy.mentorCatalogScope = 'all'` (default) drops the brand filter entirely: the mentor is the
 * marketer's product reference and must be able to answer about *any* brand or product in the
 * holding, even one the marketer is not assigned to. Packages/sections stay scoped — those are
 * assignments, and an unassigned training is still none of this marketer's business.
 */
export async function scopeForUser(d: Deps, user: Doc<User>): Promise<RetrievalScope> {
  const { loadUserLearning } = await import('./learning-state');
  const [{ packages }, policy] = await Promise.all([loadUserLearning(d, user), getPolicy(d)]);
  const brandIds =
    policy.mentorCatalogScope === 'assigned' && user.brandIds.length
      ? new Set(user.brandIds)
      : null;
  return {
    packageIds: new Set(packages.map((p) => p.id)),
    brandIds,
  };
}

export const GLOBAL_SCOPE: RetrievalScope = { packageIds: null, brandIds: null };

export function visibleUnder(item: KnowledgeItem, scope: RetrievalScope): boolean {
  if (scope.kinds && !scope.kinds.includes(item.kind)) return false;
  const s = item.scope;
  if (scope.packageIds && s.packageId && !scope.packageIds.has(s.packageId)) return false;
  if (scope.brandIds && s.brandIds && s.brandIds.length) {
    if (!s.brandIds.some((b) => scope.brandIds?.has(b))) return false;
  }
  return true;
}

interface Scored {
  item: KnowledgeItem;
  keyword: number;
  vector: number;
}

/** BM25-lite over the in-memory index (corpus is ~10³ items — no search engine needed). */
function keywordScore(
  queryTokens: string[],
  item: KnowledgeItem,
  docFreq: Map<string, number>,
  docCount: number,
  avgLen: number,
): number {
  const tokens = tokenize(`${item.title} ${item.keywords.join(' ')} ${item.body}`);
  if (!tokens.length) return 0;
  const tf = new Map<string, number>();
  for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
  const k1 = 1.4;
  const b = 0.72;
  let score = 0;
  for (const q of new Set(queryTokens)) {
    let hit = tf.get(q) ?? 0;
    if (!hit) {
      // Prefix match catches Persian suffixes the stemmer misses (کرمها/کرمی).
      for (const [t, n] of tf) {
        if (q.length >= 4 && (t.startsWith(q) || q.startsWith(t))) hit = Math.max(hit, n * 0.6);
      }
    }
    if (!hit) continue;
    const df = docFreq.get(q) ?? 1;
    const idf = Math.log(1 + (docCount - df + 0.5) / (df + 0.5));
    score += idf * ((hit * (k1 + 1)) / (hit + k1 * (1 - b + (b * tokens.length) / avgLen)));
    // Title hits are worth much more than body hits for product questions.
    if (tokenize(item.title).includes(q)) score += 1.2 * idf;
  }
  return score;
}

function snippetFor(item: KnowledgeItem, queryTokens: string[], maxLen = 260): string {
  const body = item.body.replace(/\s+/g, ' ').trim();
  if (body.length <= maxLen) return body;
  const lower = body.toLowerCase();
  for (const t of queryTokens) {
    const idx = lower.indexOf(t);
    if (idx >= 0) {
      const start = Math.max(0, idx - Math.floor(maxLen / 3));
      return `${start > 0 ? '…' : ''}${body.slice(start, start + maxLen).trim()}${start + maxLen < body.length ? '…' : ''}`;
    }
  }
  return `${body.slice(0, maxLen).trim()}…`;
}

export async function searchKnowledge(
  d: Deps,
  opts: {
    query: string;
    scope?: RetrievalScope;
    k?: number;
    /** Force keyword-only (used when the embedding provider is rate-limited). */
    keywordOnly?: boolean;
    /** Max chunks from the same package — keeps one package from monopolising the context. */
    perPackage?: number;
    /** Characters of each source handed to the model (default 260 = a UI preview, not grounding). */
    snippetLen?: number;
  },
): Promise<SearchResult> {
  const started = Date.now();
  const k = Math.max(1, Math.min(opts.k ?? 5, 12));
  const scope = opts.scope ?? GLOBAL_SCOPE;
  const all = await loadIndex(d);
  const vocab = new Set<string>();
  for (const i of all)
    if (i.kind === 'brand' || i.kind === 'package' || i.kind === 'product')
      for (const t of tokenize(`${i.title} ${i.keywords.join(' ')}`)) vocab.add(t);
  const queryTokens = fuzzyExpand(expandQuery(opts.query), vocab);
  const items = all.filter((i) => visibleUnder(i, scope));
  if (!items.length || !queryTokens.length)
    return { chunks: [], strategy: 'keyword-only', confident: false, tookMs: Date.now() - started };

  const docFreq = new Map<string, number>();
  let totalLen = 0;
  const tokenized = new Map<string, string[]>();
  for (const item of items) {
    const tokens = tokenize(`${item.title} ${item.keywords.join(' ')} ${item.body}`);
    tokenized.set(item.id, tokens);
    totalLen += tokens.length;
    for (const t of new Set(tokens)) docFreq.set(t, (docFreq.get(t) ?? 0) + 1);
  }
  const avgLen = totalLen / items.length || 1;

  const scored: Scored[] = items.map((item) => ({
    item,
    keyword: keywordScore(queryTokens, item, docFreq, items.length, avgLen),
    vector: 0,
  }));

  // ── Vector lane ────────────────────────────────────────────────────────────
  let strategy: SearchResult['strategy'] = 'keyword-only';
  let queryVector: number[] | null = null;
  let vectorProvider: string | null = null;
  if (!opts.keywordOnly) {
    const hub = aiHub(d);
    const provider = hub.candidates('embed')[0];
    if (provider) {
      try {
        const run = await hub.embed([opts.query]);
        const vec = run.value[0];
        if (vec?.length) {
          queryVector = vec;
          vectorProvider = provider.id;
        }
      } catch (e) {
        console.warn('[retrieval] query embedding failed, keyword-only mode', (e as Error).message);
      }
    }
  }
  if (queryVector && vectorProvider) {
    strategy = 'hybrid-kw-vector';
    for (const s of scored) {
      if (s.item.embedding?.length && s.item.embeddingProvider === vectorProvider)
        s.vector = Math.max(0, cosine(queryVector, s.item.embedding));
    }
  }

  // ── Fusion: normalise each lane, then RRF-style weighted sum ───────────────
  const maxKw = Math.max(...scored.map((s) => s.keyword), 0.0001);
  const maxVec = Math.max(...scored.map((s) => s.vector), 0.0001);
  const fused = scored
    .map((s) => ({
      item: s.item,
      keywordScore: s.keyword,
      vectorScore: strategy === 'hybrid-kw-vector' ? s.vector : 0,
      score:
        strategy === 'hybrid-kw-vector'
          ? 0.55 * (s.keyword / maxKw) + 0.45 * (s.vector / maxVec)
          : s.keyword / maxKw,
    }))
    .filter((s) => s.keywordScore > KEYWORD_FLOOR || s.vectorScore >= VECTOR_FLOOR)
    .sort((a, b) => b.score - a.score);

  // ── Diversity: at most `perPackage` chunks per package, then take top-k ────
  const perPackage = opts.perPackage ?? 2;
  const seenPackage = new Map<string, number>();
  const chosen: typeof fused = [];
  for (const s of fused) {
    const key = s.item.scope.packageId ?? `kind:${s.item.kind}`;
    const used = seenPackage.get(key) ?? 0;
    if (used >= perPackage) continue;
    seenPackage.set(key, used + 1);
    chosen.push(s);
    if (chosen.length >= k) break;
  }

  const chunks: RetrievedChunk[] = chosen.map((s) => ({
    item: s.item,
    score: Math.min(1, Number(s.score.toFixed(4))),
    keywordScore: Number(s.keywordScore.toFixed(4)),
    vectorScore: Number(s.vectorScore.toFixed(4)),
    snippet: snippetFor(s.item, queryTokens, opts.snippetLen ?? 260),
  }));

  const best = chunks[0];
  // Raw-signal gate — see MIN_KEYWORD / MIN_VECTOR above. A hit must be strong in at least one
  // lane; a purely coincidental keyword overlap never clears it.
  const confident = best
    ? best.keywordScore >= MIN_KEYWORD || best.vectorScore >= MIN_VECTOR
    : false;
  return { chunks, strategy, confident, tookMs: Date.now() - started };
}
