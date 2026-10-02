import { ffmpegArgs, extOf, type LibraryKind } from './plan';

/**
 * In-browser compression with ffmpeg.wasm (single-thread core, self-hosted under /ffmpeg/ — the CSP
 * forbids third-party scripts). Runs in a Web Worker owned by the ffmpeg library, so the page stays
 * responsive. Any failure rejects with `TranscodeUnavailable` / `TranscodeFailed`; the caller then
 * falls back to uploading the original file when it is small enough.
 */
export class TranscodeUnavailable extends Error {}
export class TranscodeFailed extends Error {}

interface FFmpegLike {
  load(cfg: { coreURL: string; wasmURL: string }): Promise<boolean>;
  exec(args: string[], timeout?: number, opts?: { signal?: AbortSignal }): Promise<number>;
  writeFile(path: string, data: Uint8Array): Promise<boolean>;
  readFile(path: string): Promise<Uint8Array | string>;
  deleteFile(path: string): Promise<boolean>;
  on(event: 'progress', cb: (e: { progress: number; time: number }) => void): void;
  off(event: 'progress', cb: (e: { progress: number; time: number }) => void): void;
  terminate(): void;
}

let wasmUrl: Promise<string> | null = null;

/** Download the split wasm parts once per page load and glue them into one blob URL. */
async function loadWasmUrl(): Promise<string> {
  const manifestRes = await fetch('/ffmpeg/manifest.json', { cache: 'force-cache' });
  if (!manifestRes.ok) throw new TranscodeUnavailable('ffmpeg core not deployed');
  const manifest = (await manifestRes.json()) as { size: number; parts: string[] };
  const buffers: ArrayBuffer[] = [];
  for (const name of manifest.parts) {
    const res = await fetch(`/ffmpeg/${name}`, { cache: 'force-cache' });
    if (!res.ok) throw new TranscodeUnavailable(`missing ${name}`);
    buffers.push(await res.arrayBuffer());
  }
  const blob = new Blob(buffers, { type: 'application/wasm' });
  if (blob.size !== manifest.size) throw new TranscodeUnavailable('ffmpeg core is incomplete');
  return URL.createObjectURL(blob);
}

let current: FFmpegLike | null = null;

async function createFFmpeg(): Promise<FFmpegLike> {
  const { FFmpeg } = await import('@ffmpeg/ffmpeg');
  wasmUrl ??= loadWasmUrl().catch((e) => {
    wasmUrl = null;
    throw e;
  });
  const ff = new FFmpeg() as unknown as FFmpegLike;
  try {
    await ff.load({ coreURL: '/ffmpeg/ffmpeg-core.js', wasmURL: await wasmUrl });
  } catch (e) {
    ff.terminate();
    throw new TranscodeUnavailable(e instanceof Error ? e.message : 'ffmpeg failed to load');
  }
  return ff;
}

/** Cancels the running job (terminates the worker; the next job loads a fresh instance). */
export function cancelTranscode(): void {
  current?.terminate();
  current = null;
}

export interface TranscodeOptions {
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

export async function transcode(
  file: File,
  kind: LibraryKind,
  outExt: string,
  outMime: string,
  opts: TranscodeOptions = {},
): Promise<Blob> {
  if (typeof Worker === 'undefined' || typeof WebAssembly === 'undefined')
    throw new TranscodeUnavailable('browser has no WebAssembly/Worker support');
  const ff = await createFFmpeg();
  current = ff;
  const inName = `in.${extOf(file.name) || 'bin'}`;
  const outName = `out.${outExt}`;
  const onProgress = ({ progress }: { progress: number }) => {
    if (Number.isFinite(progress)) opts.onProgress?.(Math.max(0, Math.min(0.99, progress)));
  };
  const onAbort = () => cancelTranscode();
  opts.signal?.addEventListener('abort', onAbort);
  try {
    await ff.writeFile(inName, new Uint8Array(await file.arrayBuffer()));
    ff.on('progress', onProgress);
    const code = await ff.exec(ffmpegArgs(kind, inName, outName));
    if (opts.signal?.aborted) throw new DOMException('aborted', 'AbortError');
    if (code !== 0) throw new TranscodeFailed(`ffmpeg exited with code ${code}`);
    const data = await ff.readFile(outName);
    if (typeof data === 'string' || data.byteLength === 0) throw new TranscodeFailed('empty output');
    opts.onProgress?.(1);
    return new Blob([data as BlobPart], { type: outMime });
  } catch (e) {
    if (opts.signal?.aborted) throw new DOMException('aborted', 'AbortError');
    if (e instanceof TranscodeFailed || e instanceof TranscodeUnavailable) throw e;
    throw new TranscodeFailed(e instanceof Error ? e.message : 'transcode failed');
  } finally {
    opts.signal?.removeEventListener('abort', onAbort);
    try {
      ff.off('progress', onProgress);
      await ff.deleteFile(inName).catch(() => {});
      await ff.deleteFile(outName).catch(() => {});
    } catch {
      /* worker already terminated */
    }
    ff.terminate();
    if (current === ff) current = null;
  }
}
