import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { wrapPcmAsWav } from '../src/services/voice';
import { base64ToBytes, bytesToBase64 } from '../src/lib/crypto';

/**
 * The Worker runs WITHOUT `nodejs_compat` (wrangler.toml), so `Buffer` and `process` do not exist
 * there: using them throws `ReferenceError: Buffer is not defined` at runtime, which TypeScript and
 * Node-based tests never see. This test bundles the real Worker entry point and fails if any bundled
 * source module (including the cron path: cron -> knowledge-reindex -> media-ingest) uses them.
 *
 * Allowed: `typeof Buffer !== 'undefined'` guards (they never throw), listed explicitly below.
 */
const requireFromHere = createRequire(__filename);
const { build } = requireFromHere('esbuild') as typeof import('esbuild');
const root = resolve(__dirname, '..', '..');

const GUARDED = new Set(['functions/src/blob/cloudflare.ts', 'functions/src/lib/media.ts']);

async function bundledSources(): Promise<string[]> {
  const r = await build({
    entryPoints: [resolve(root, 'functions/src/cloudflare-worker.ts')],
    bundle: true,
    write: false,
    metafile: true,
    platform: 'neutral',
    format: 'esm',
    mainFields: ['module', 'main'],
    conditions: ['workerd', 'worker', 'browser'],
    loader: { '.json': 'json' },
    logLevel: 'silent',
    absWorkingDir: root,
    external: [
      'node:*',
      'firebase-admin',
      'firebase-admin/*',
      'firebase-functions',
      'firebase-functions/*',
      '@google-cloud/*',
    ],
  });
  return Object.keys(r.metafile.inputs).filter((f) => f.startsWith('functions/src/'));
}

const stripComments = (t: string) =>
  t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('Worker bundle uses no Node-only globals', () => {
  it('no bundled module references Buffer / process (except guarded typeof checks)', async () => {
    const files = await bundledSources();
    expect(files).toContain('functions/src/services/media-ingest.ts');
    expect(files).toContain('functions/src/services/cron.ts');
    const offenders: string[] = [];
    for (const f of files) {
      const code = stripComments(readFileSync(resolve(root, f), 'utf8'));
      let lines = code.split('\n');
      if (GUARDED.has(f)) {
        lines = lines.filter(
          (l) => !/typeof Buffer|Buffer\.from\(u8|: Buffer\b|as unknown as Buffer/.test(l),
        );
      }
      lines.forEach((l, i) => {
        if (/\bBuffer\b|\bprocess\.(env|cwd|nextTick|on)\b|\b__dirname\b/.test(l)) {
          // `typeof process !== 'undefined'` guarded defaults are fine.
          if (/typeof process/.test(l)) return;
          // type-only positions (`: Buffer`, `Promise<Buffer>`) are erased at build time.
          if (/(:\s*|<)Buffer\b/.test(l) && !/Buffer\.(from|alloc|concat|isBuffer)/.test(l)) return;
          offenders.push(`${f}:${i + 1}: ${l.trim()}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  it('wrapPcmAsWav produces a valid WAV without Buffer', () => {
    const pcm = new Uint8Array([1, 2, 3, 4]);
    const out = wrapPcmAsWav(bytesToBase64(pcm), 'audio/L16;rate=16000');
    expect(out.mime).toBe('audio/wav');
    const wav = base64ToBytes(out.base64);
    expect(new TextDecoder().decode(wav.slice(0, 4))).toBe('RIFF');
    expect(new TextDecoder().decode(wav.slice(8, 12))).toBe('WAVE');
    const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
    expect(view.getUint32(24, true)).toBe(16000);
    expect(view.getUint32(40, true)).toBe(4);
    expect(Array.from(wav.slice(44))).toEqual([1, 2, 3, 4]);
  });

  it('runs the media-ingest bytes path with Buffer removed from the global scope', async () => {
    const g = globalThis as { Buffer?: unknown };
    const saved = g.Buffer;
    delete g.Buffer;
    try {
      expect(typeof Buffer).toBe('undefined');
      const bytes = new Uint8Array([104, 105]);
      expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
      const out = wrapPcmAsWav(bytesToBase64(bytes), 'audio/L16;rate=24000');
      expect(out.mime).toBe('audio/wav');
    } finally {
      g.Buffer = saved;
    }
  });
});
