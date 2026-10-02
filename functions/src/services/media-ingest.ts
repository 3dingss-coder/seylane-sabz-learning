import { VISION_EXTRACT_SYSTEM } from '../ai/prompts';
import { aiHub } from '../ai/hub';
import { AllProvidersFailed } from '../ai/hub';
import type { MediaPart } from '../ai/types';
import type { Package, Product, Section } from '../domain/types';
import type { Doc } from '../store/types';
import { DAY } from '../lib/time';
import type { Deps } from './context';
import { splitBody } from './knowledge';
import {
  EXTRACTOR_VERSION,
  hashSource,
  type MediaExtraction,
  type MediaSourceKind,
} from './knowledge';
import { parseJsonLoose } from './mentor-ai';

/**
 * Multimodal ingestion: the mentor must master *every* content type on the site, not just the text
 * an admin happened to type into a transcript field.
 *
 *   video/audio (file) → Gemini video understanding when the file is small, otherwise Groq Whisper
 *                        transcription → structured facts
 *   YouTube            → Gemini native URL understanding (no download, no ffmpeg)
 *   product images     → Gemini vision (packaging text, claims, usage)
 *   PDF                → Gemini document understanding
 *   text               → structured facts (admin paste / future sources)
 *
 * Every result is cached in `media_extractions` keyed by path+EXTRACTOR_VERSION, so bumping the
 * extractor version re-reads the files and a normal day costs zero provider calls.
 */

export const MEDIA_EXTRACTIONS = 'media_extractions';
/** Video above this size goes through speech-only analysis (inline multimodal has a request cap). */
export const VISION_MAX_BYTES = 6 * 1024 * 1024;
/** How many assets one sweep may process — a free-tier courtesy brake. */
export const DEFAULT_EXTRACT_LIMIT = 8;

export interface IngestLink {
  brandId?: string | null;
  productId?: string | null;
  packageId?: string | null;
  sectionId?: string | null;
  ref?: string;
}

export interface ExtractInput {
  sourceKind: MediaSourceKind;
  /** Deterministic cache key (blob path or `youtube:<id>` / `product-image:<id>`). */
  path: string;
  /** Real blob path when it differs from the cache key (e.g. product images). */
  blobPath?: string;
  sourceName: string;
  mime: string;
  sizeBytes: number | null;
  bytes?: Buffer;
  /** Set instead of `bytes` for YouTube sources (Gemini reads the URL directly). */
  fileUri?: string;
  link?: IngestLink;
  /** Extra context handed to the model (section title, product name …). */
  hint?: string;
}

interface ExtractedJson {
  title: string;
  kind: string;
  brand: string;
  productName: string;
  summary: string;
  facts: string[];
  keywords: string[];
  audience: string;
  durationSec: number;
}

const schema = {
  parse(raw: unknown, fallbackTitle: string): { json: ExtractedJson; raw: string } {
    const text = typeof raw === 'string' ? raw : '';
    const parsed = parseJsonLoose(text);
    const o = (parsed && typeof parsed === 'object' ? parsed : {}) as Record<string, unknown>;
    const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
    const list = (v: unknown, max: number, itemMax: number) =>
      Array.isArray(v)
        ? v
            .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
            .map((x) => x.trim().slice(0, itemMax))
            .slice(0, max)
        : [];
    return {
      raw: text,
      json: {
        title: str(o.title, 160) || fallbackTitle,
        kind: str(o.kind, 40) || 'other',
        brand: str(o.brand, 120),
        productName: str(o.productName, 160),
        summary: str(o.summary, 800),
        facts: list(o.facts, 40, 400),
        keywords: list(o.keywords, 30, 60),
        audience: str(o.audience, 20) || 'marketer',
        durationSec:
          typeof o.durationSec === 'number' && o.durationSec > 0 ? Math.round(o.durationSec) : 0,
      },
    };
  },
};

/** Title/summary/facts for prompts that only get plain text (Whisper transcripts). */
function transcriptPrompt(transcript: string, hint?: string): string {
  return `${hint ? `زمینه: ${hint}\n` : ''}متن پیاده‌شده‌ی فایل آموزشی (فارسی) را به دانش ساختیافته تبدیل کن. این متن را عیناً در فیلد transcript هم لحاظ کن.
<transcript>
${transcript.slice(0, 12000)}
</transcript>`;
}

/** The vision/transcript pipeline for one asset. Never throws — failures are stored as `failed`. */
export async function extractAsset(d: Deps, input: ExtractInput): Promise<MediaExtraction> {
  const id = extractionId(input);
  const hub = aiHub(d);
  const now = d.clock().toISOString();
  const base: MediaExtraction = {
    path: input.path,
    sourceKind: input.sourceKind,
    sourceName: input.sourceName,
    mime: input.mime,
    sizeBytes: input.sizeBytes,
    status: 'pending',
    title: input.sourceName,
    summary: '',
    facts: [],
    keywords: [],
    brandId: input.link?.brandId ?? null,
    productId: input.link?.productId ?? null,
    packageId: input.link?.packageId ?? null,
    sectionId: input.link?.sectionId ?? null,
    ref: input.link?.ref ?? '/',
    extractorVersion: EXTRACTOR_VERSION,
    updatedAt: now,
  };

  try {
    let transcript: string | undefined;
    let raw: unknown;

    if (input.sourceKind === 'audio' || input.sourceKind === 'video') {
      // 1) Speech first — it is the cheapest lane (Groq Whisper free tier) and works for every size.
      const bytes = input.bytes;
      if (bytes) {
        try {
          const stt = await hub.transcribe({
            base64: bytes.toString('base64'),
            mime: input.mime,
            language: 'fa',
            prompt: input.hint,
          });
          transcript = stt.value.text;
        } catch (e) {
          if (!(e instanceof AllProvidersFailed)) throw e;
        }
      }
      // 2) Small videos additionally get visual understanding (packaging, demo, on-screen text).
      const useVision =
        input.sourceKind === 'video' &&
        (input.bytes?.byteLength ?? Number.MAX_SAFE_INTEGER) <= VISION_MAX_BYTES;
      if (useVision && input.bytes) {
        raw = await callVision(
          d,
          [
            {
              kind: 'video',
              mime: input.mime,
              base64: input.bytes.toString('base64'),
              label: input.sourceName,
            },
          ],
          input.hint,
        );
      } else if (transcript) {
        raw = await callStructurer(d, transcriptPrompt(transcript, input.hint));
      }
      if (raw === undefined && !transcript)
        throw new Error('هیچ خروجی‌ای از سرویس صوتی/تصویری برنگشت.');
    } else if (input.sourceKind === 'image' || input.sourceKind === 'pdf') {
      if (!input.bytes) throw new Error('فایل برای تحلیل تصویری خوانده نشد.');
      raw = await callVision(
        d,
        [
          {
            kind: input.sourceKind,
            mime: input.mime,
            base64: input.bytes.toString('base64'),
            label: input.sourceName,
          },
        ],
        input.hint,
      );
    } else if (input.fileUri) {
      // YouTube (and pre-uploaded provider URIs): Gemini accepts the URL directly.
      raw = await callVision(
        d,
        [{ kind: 'video', mime: input.mime || 'video/mp4', base64: '', label: input.sourceName }],
        `${input.hint ? `${input.hint}\n` : ''}این ویدیو از این نشانی است: ${input.fileUri}`,
      );
    } else {
      throw new Error('نوع فایل پشتیبانی نمی‌شود.');
    }

    if (raw === undefined) throw new Error('خروجی مدل خالی بود.');
    const { json } = schema.parse(raw, input.sourceName);
    const body = [json.summary, json.facts.join('\n'), transcript ?? '']
      .filter((x) => x.trim())
      .join('\n');
    const keywords = [...json.keywords, json.brand, json.productName].filter(
      (k) => k.trim().length > 0,
    );
    const extraction: MediaExtraction = {
      ...base,
      status: body.trim().length > 40 ? 'ready' : 'skipped',
      title: json.title,
      summary: json.summary,
      facts: [...json.facts, ...splitBody(json.summary, 400).slice(1)],
      keywords: keywords.slice(0, 30),
      ...(transcript ? { transcript } : {}),
      updatedAt: d.clock().toISOString(),
    };
    await d.store.set(
      `${MEDIA_EXTRACTIONS}/${id}`,
      extraction as unknown as Record<string, unknown>,
    );
    await trackExtract(d, extraction, id);
    return extraction;
  } catch (e) {
    const failed: MediaExtraction = {
      ...base,
      status: 'failed',
      error: (e as Error).message.slice(0, 300),
      updatedAt: d.clock().toISOString(),
    };
    await d.store.set(`${MEDIA_EXTRACTIONS}/${id}`, failed as unknown as Record<string, unknown>);
    await trackExtract(d, failed, id);
    return failed;
  }
}

async function callVision(d: Deps, parts: MediaPart[], hint?: string): Promise<unknown> {
  const hub = aiHub(d);
  const run = await hub.vision({
    system: VISION_EXTRACT_SYSTEM,
    prompt: `${hint ? `زمینه: ${hint}\n` : ''}این فایل را طبق ساختار JSON استخراج کن.`,
    parts,
    maxTokens: 900,
    json: true,
  });
  return run.value.text;
}

async function callStructurer(d: Deps, prompt: string): Promise<unknown> {
  const hub = aiHub(d);
  const run = await hub.chat({
    system: VISION_EXTRACT_SYSTEM,
    prompt,
    maxTokens: 900,
    temperature: 0.1,
    json: true,
  });
  return run.value.text;
}

async function trackExtract(d: Deps, e: MediaExtraction, id: string): Promise<void> {
  const { track } = await import('./context');
  await track(d, 'mentor_media_extracted', null, {
    id,
    status: e.status,
    kind: e.sourceKind,
    chars: (e.summary?.length ?? 0) + (e.transcript?.length ?? 0),
    error: e.error ?? null,
  });
}

export function extractionId(input: Pick<ExtractInput, 'path' | 'sourceKind'>): string {
  return `mx-${hashSource([input.sourceKind, input.path, EXTRACTOR_VERSION])}`;
}

/** Has this asset already been read by the current extractor version? */
export async function extractionFor(d: Deps, input: Pick<ExtractInput, 'path' | 'sourceKind'>) {
  return d.store.get<MediaExtraction>(`${MEDIA_EXTRACTIONS}/${extractionId(input)}`);
}

export interface SweepResult {
  scanned: number;
  extracted: number;
  skipped: number;
  failed: number;
  /** Sample of what was processed, for the admin screen. */
  items: Array<{
    id: string;
    title: string;
    status: MediaExtraction['status'];
    sourceKind: MediaSourceKind;
  }>;
}

/**
 * Walks everything the site stores and turns unprocessed media into knowledge:
 * sections (uploaded + YouTube), product images and admin-uploaded documents.
 */
export async function extractPendingMedia(
  d: Deps,
  opts: { limit?: number; only?: 'sections' | 'products' | 'all' } = {},
): Promise<SweepResult> {
  const limit = Math.max(1, Math.min(opts.limit ?? DEFAULT_EXTRACT_LIMIT, 50));
  const only = opts.only ?? 'all';
  const result: SweepResult = { scanned: 0, extracted: 0, skipped: 0, failed: 0, items: [] };

  const candidates: ExtractInput[] = [];
  if (only === 'all' || only === 'sections') {
    // Sections are stored per package (`packages/{id}/sections`) — walk the packages first.
    const packages = await d.store.query<Package>({ collection: 'packages' });
    for (const pkg of packages) {
      if (pkg.status === 'archived') continue;
      const sections = await d.store.query<Section>({ collection: `packages/${pkg.id}/sections` });
      for (const s of sections) {
        if (s.archived) continue;
        const link: IngestLink = {
          brandId: pkg.brandId,
          productId: pkg.productId,
          packageId: pkg.id,
          sectionId: s.id,
          ref: `/sections/${s.id}`,
        };
        const hint = `قسمت «${s.title}» از بسته‌ی «${pkg.title}». توضیح مدیر: ${s.description ?? ''}`;
        if (s.mediaSource === 'youtube' && s.youtubeUrl) {
          candidates.push({
            sourceKind: 'video',
            path: `youtube:${s.youtubeId ?? s.youtubeUrl}`,
            sourceName: s.title,
            mime: 'video/mp4',
            sizeBytes: null,
            fileUri: s.youtubeUrl,
            link,
            hint,
          });
        } else if (s.mediaPath) {
          const stat = await d.blob.stat(s.mediaPath);
          if (!stat) continue;
          const kind: MediaSourceKind = (s.mediaMime ?? stat.contentType).startsWith('audio')
            ? 'audio'
            : 'video';
          candidates.push({
            sourceKind: kind,
            path: s.mediaPath,
            sourceName: s.title,
            mime: s.mediaMime ?? stat.contentType,
            sizeBytes: stat.size,
            link,
            hint,
          });
        }
      }
    }
  }

  if (only === 'all' || only === 'products') {
    const products = await d.store.query<Product>({ collection: 'products' });
    for (const p of products) {
      if (p.archived || !p.imagePath) continue;
      candidates.push({
        sourceKind: 'image',
        path: `product-image:${p.id}`,
        blobPath: p.imagePath,
        sourceName: p.name,
        mime: 'image/png',
        sizeBytes: null,
        link: {
          brandId: p.brandId,
          productId: p.id,
          ref: `/products/${p.id}`,
        },
        hint: `تصویر محصول «${p.name}»${p.category ? ` از دسته‌ی «${p.category}»` : ''}.`,
      });
    }
  }

  for (const input of candidates) {
    if (result.extracted + result.failed >= limit) break;
    result.scanned++;
    const existing = await extractionFor(d, input);
    if (
      existing &&
      existing.extractorVersion === EXTRACTOR_VERSION &&
      existing.status === 'ready'
    ) {
      result.skipped++;
      continue;
    }
    if (input.sourceKind === 'image') {
      const blobPath = input.blobPath ?? input.path;
      const stat = await d.blob.stat(blobPath).catch(() => null as null);
      if (!stat) {
        result.skipped++;
        continue;
      }
      input.bytes = await d.blob.readRange(blobPath, 0, stat.size - 1);
      input.sizeBytes = stat.size;
      input.mime = stat.contentType;
    }
    // Bytes are read lazily, one asset at a time: loading every small file up front for the whole
    // candidate list could exhaust a Worker's memory before the first provider call.
    if (!input.bytes && input.sourceKind !== 'image' && !input.fileUri) {
      if (input.sizeBytes !== null && input.sizeBytes <= VISION_MAX_BYTES)
        input.bytes = await d.blob.readRange(input.path, 0, input.sizeBytes - 1);
    }
    const out = await extractAsset(d, input);
    const id = extractionId(input);
    if (out.status === 'ready' || out.status === 'skipped') result.extracted++;
    else result.failed++;
    result.items.push({ id, title: out.title, status: out.status, sourceKind: out.sourceKind });
  }

  if (result.extracted || result.failed) {
    const { track } = await import('./context');
    await track(d, 'mentor_media_sweep', null, {
      scanned: result.scanned,
      extracted: result.extracted,
      skipped: result.skipped,
      failed: result.failed,
    });
  }
  return result;
}

/** How much of the library is already machine-readable (admin knowledge screen). */
export async function mediaCoverage(d: Deps): Promise<{
  sections: { total: number; withTranscript: number; extracted: number };
  products: { total: number; withImage: number; extracted: number };
  failing: number;
  lastExtractAt: string | null;
}> {
  const [packages, products, extractions] = await Promise.all([
    d.store.query<Package>({ collection: 'packages' }),
    d.store.query<Product>({ collection: 'products' }),
    d.store.query<MediaExtraction>({ collection: MEDIA_EXTRACTIONS }),
  ]);
  const sections: Array<Doc<Section>> = [];
  for (const pkg of packages) {
    if (pkg.status === 'archived') continue;
    sections.push(...(await d.store.query<Section>({ collection: `packages/${pkg.id}/sections` })));
  }
  const ready = extractions.filter((e) => e.status === 'ready');
  const readyKeys = new Set(ready.map((e) => e.path));
  const bySection = new Set(ready.filter((e) => e.sectionId).map((e) => e.sectionId));
  const byProduct = new Set(
    ready.filter((e) => e.sourceKind === 'image' && e.productId).map((e) => e.productId),
  );
  const since = new Date(d.clock().getTime() - 30 * DAY).toISOString();
  void readyKeys;
  return {
    sections: {
      total: sections.filter((s) => !s.archived).length,
      withTranscript: sections.filter((s) => !s.archived && (s.transcript ?? '').trim().length > 40)
        .length,
      extracted: bySection.size,
    },
    products: {
      total: products.filter((p) => !p.archived).length,
      withImage: products.filter((p) => !p.archived && Boolean(p.imagePath)).length,
      extracted: byProduct.size,
    },
    failing: extractions.filter((e) => e.status === 'failed' && e.updatedAt >= since).length,
    lastExtractAt:
      extractions
        .map((e) => e.updatedAt)
        .sort()
        .at(-1) ?? null,
  };
}
