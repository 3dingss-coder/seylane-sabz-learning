import { describe, expect, it, vi } from 'vitest';
import { AiHub } from '../src/ai/hub';
import { GroqProvider } from '../src/ai/groq';
import type {
  AiProvider,
  AiTask,
  ChatRequest,
  ChatResult,
  TranscribeRequest,
  TranscriptResult,
  VisionRequest,
  VisionResult,
} from '../src/ai/types';
import type { BlobStore } from '../src/blob/types';
import { base64ToBytes, bytesToBase64 } from '../src/lib/crypto';
import { extractPendingMedia } from '../src/services/media-ingest';
import { wrapPcmAsWav } from '../src/services/voice';
import { buildFixture, createCtx } from './support/ctx';

async function withoutBuffer<T>(run: () => Promise<T> | T): Promise<T> {
  const original = globalThis.Buffer;
  vi.stubGlobal('Buffer', undefined);
  try {
    return await run();
  } finally {
    vi.stubGlobal('Buffer', original);
  }
}

class EdgeMediaProvider implements AiProvider {
  readonly id = 'legacy' as const;
  readonly model = 'edge-test';
  readonly labelFa = 'Worker test provider';
  transcribedBase64 = '';
  visionBase64 = '';

  supports(task: AiTask): boolean {
    return task === 'transcribe' || task === 'vision' || task === 'chat';
  }

  async transcribe(req: TranscribeRequest): Promise<TranscriptResult> {
    this.transcribedBase64 = req.base64;
    return { text: 'رونوشت آزمایشی برای محتوای آموزشی.', model: this.model, provider: this.id };
  }

  async vision(req: VisionRequest): Promise<VisionResult> {
    this.visionBase64 = req.parts[0]?.base64 ?? '';
    return {
      text: JSON.stringify({
        title: 'آموزش آزمایشی',
        kind: 'product',
        brand: 'نمونه',
        productName: 'محصول نمونه',
        summary: 'این آموزش چند نکته‌ی کاربردی برای معرفی محصول ارائه می‌کند.',
        facts: ['محصول را روی پوست تمیز استفاده کنید.'],
        keywords: ['آموزش', 'محصول'],
        audience: 'marketer',
        durationSec: 1,
      }),
      model: this.model,
      provider: this.id,
      approxTokens: 20,
    };
  }

  async chat(_req: ChatRequest): Promise<ChatResult> {
    return { text: '{}', model: this.model, provider: this.id, approxTokens: 1 };
  }
}

describe('Cloudflare Worker byte handling without Node Buffer', () => {
  it('wraps PCM into a valid WAV using only Web APIs', () =>
    withoutBuffer(() => {
      const pcm = new Uint8Array([0, 0, 0xff, 0x7f, 0x34, 0x12]);
      const result = wrapPcmAsWav(bytesToBase64(pcm), 'audio/L16;rate=16000');
      const wav = base64ToBytes(result.base64);
      const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
      const ascii = (start: number, length: number) =>
        String.fromCharCode(...wav.subarray(start, start + length));

      expect(result.mime).toBe('audio/wav');
      expect(ascii(0, 4)).toBe('RIFF');
      expect(ascii(8, 4)).toBe('WAVE');
      expect(ascii(12, 4)).toBe('fmt ');
      expect(view.getUint32(4, true)).toBe(36 + pcm.length);
      expect(view.getUint32(24, true)).toBe(16_000);
      expect(ascii(36, 4)).toBe('data');
      expect(Array.from(wav.subarray(44))).toEqual(Array.from(pcm));
    }));

  it('uploads Groq audio as a Web Blob without Buffer', async () => {
    const payload = new Uint8Array([0, 1, 2, 127, 128, 255]);
    const originalFetch = globalThis.fetch;
    let uploaded: number[] = [];
    const fetchMock = vi.fn(async (_input: string | URL, init?: RequestInit) => {
      const form = init?.body as FormData;
      const file = form.get('file');
      if (!(file instanceof Blob)) throw new Error('Groq file field was not a Blob');
      uploaded = Array.from(new Uint8Array(await file.arrayBuffer()));
      return {
        ok: true,
        status: 200,
        json: async () => ({ text: 'رونوشت', duration: 1 }),
        text: async () => JSON.stringify({ text: 'رونوشت', duration: 1 }),
      } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      const result = await withoutBuffer(() =>
        new GroqProvider('test-only-key', 'test-model').transcribe({
          base64: bytesToBase64(payload),
          mime: 'audio/mp4',
          language: 'fa-IR',
        }),
      );
      expect(result.text).toBe('رونوشت');
      expect(uploaded).toEqual(Array.from(payload));
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.stubGlobal('fetch', originalFetch);
    }
  });

  it('extracts pending Worker media from Uint8Array bytes with Buffer absent', async () => {
    const provider = new EdgeMediaProvider();
    const ctx = await createCtx({ llm: null, ai: new AiHub([provider]) });
    await buildFixture(ctx, { sections: 1 });
    const payload = new Uint8Array([0, 1, 2, 3, 4, 5, 250, 251, 252]);
    const originalBlob = ctx.deps.blob;
    ctx.deps.blob = new Proxy(originalBlob as BlobStore, {
      get(target, property) {
        if (property === 'stat')
          return async () => ({ size: payload.length, contentType: 'video/mp4' });
        if (property === 'readRange') return async () => new Uint8Array(payload);
        const value = Reflect.get(target, property, target) as unknown;
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });

    const result = await withoutBuffer(() =>
      extractPendingMedia(ctx.deps, { only: 'sections', limit: 1 }),
    );
    expect(result.failed).toBe(0);
    expect(result.extracted).toBe(1);
    expect(base64ToBytes(provider.transcribedBase64)).toEqual(payload);
    expect(base64ToBytes(provider.visionBase64)).toEqual(payload);
  });
});
