import { ApiError } from '../api';
import type { LibraryKind } from './plan';
import type { LibraryItem, UploadTicket } from './types';

/** Everything the uploader needs from the outside world — injected so it is unit-testable. */
export interface UploadDeps {
  post<T>(path: string, body?: unknown): Promise<T>;
  del<T>(path: string): Promise<T>;
  putPart(ticket: UploadTicket, blob: Blob, onProgress: (loaded: number) => void): Promise<void>;
  sleep(ms: number): Promise<void>;
}

export interface ResumableInput {
  blob: Blob;
  kind: LibraryKind;
  fileName: string;
  mime: string;
  title?: string;
  brandId?: string | null;
  productId?: string | null;
  durationSec?: number | null;
}

export interface ResumableOptions {
  /** 0..1 of bytes safely stored on the server. */
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
  /** Called as soon as the server created the upload, so a failed job can be resumed later. */
  onStarted?: (mediaId: string) => void;
  /** Resume an earlier upload instead of creating a new one. */
  resumeMediaId?: string;
}

interface PartsReply {
  received: number[];
  totalParts: number;
  partSize: number;
  urls: Array<{ index: number; upload: UploadTicket }>;
}

const BATCH = 6;
const POOL = 3;
const MAX_STALLED_ROUNDS = 6;

const backoff = (attempt: number) => Math.min(8000, 700 * 2 ** attempt);

/** Network blips and server hiccups are worth retrying; validation/permission errors are not. */
export function isRetryable(e: unknown): boolean {
  if (e instanceof ApiError)
    return e.code === 'NETWORK' || e.code === 'INTERNAL' || e.code === 'RATE_LIMIT' || e.status >= 500;
  return true;
}

function abortError() {
  return new DOMException('Upload aborted', 'AbortError');
}

export async function uploadResumable(
  input: ResumableInput,
  deps: UploadDeps,
  opts: ResumableOptions = {},
): Promise<LibraryItem> {
  const { signal } = opts;
  const check = () => {
    if (signal?.aborted) throw abortError();
  };

  async function retry<T>(fn: () => Promise<T>, tries = 5): Promise<T> {
    for (let a = 0; ; a++) {
      check();
      try {
        return await fn();
      } catch (e) {
        if (!isRetryable(e) || a >= tries - 1) throw e;
        await deps.sleep(backoff(a));
      }
    }
  }

  let mediaId = opts.resumeMediaId ?? '';
  let total = 0;
  let partSize = 0;
  if (!mediaId) {
    const s = await retry(() =>
      deps.post<{ mediaId: string; partSize: number; totalParts: number }>(
        '/admin/media/library/uploads',
        {
          kind: input.kind,
          fileName: input.fileName,
          mime: input.mime,
          sizeBytes: input.blob.size,
          title: input.title || undefined,
          brandId: input.brandId ?? undefined,
          productId: input.productId ?? undefined,
        },
      ),
    );
    mediaId = s.mediaId;
    total = s.totalParts;
    partSize = s.partSize;
    opts.onStarted?.(mediaId);
  }
  const partsPath = `/admin/media/library/uploads/${mediaId}/parts`;

  let received = new Set<number>();
  if (!total) {
    const probe = await retry(() => deps.post<PartsReply>(partsPath, { indexes: [] }));
    total = probe.totalParts;
    partSize = probe.partSize;
    received = new Set(probe.received);
  }

  const sizeOf = (i: number) => (i < total - 1 ? partSize : input.blob.size - partSize * (total - 1));
  const inflight = new Map<number, number>();
  const report = () => {
    let bytes = 0;
    for (const i of received) bytes += sizeOf(i);
    for (const [i, loaded] of inflight) if (!received.has(i)) bytes += Math.min(loaded, sizeOf(i));
    opts.onProgress?.(Math.min(1, bytes / Math.max(1, input.blob.size)));
  };

  try {
    let stalled = 0;
    for (;;) {
      check();
      report();
      const missing = Array.from({ length: total }, (_, i) => i).filter((i) => !received.has(i));
      if (!missing.length) {
        try {
          const item = await retry(() =>
            deps.post<LibraryItem>(`/admin/media/library/uploads/${mediaId}/complete`, {
              durationSec: input.durationSec || undefined,
            }),
          );
          opts.onProgress?.(1);
          return item;
        } catch (e) {
          // Server says some parts are not really there (e.g. storage hiccup): go around again.
          const lost = (e as ApiError).details as { missing?: number[] } | undefined;
          if (e instanceof ApiError && e.code === 'CONFLICT' && lost?.missing?.length) {
            for (const i of lost.missing) received.delete(i);
            if (++stalled >= MAX_STALLED_ROUNDS) throw e;
            continue;
          }
          throw e;
        }
      }

      const reply = await retry(() => deps.post<PartsReply>(partsPath, { indexes: missing.slice(0, BATCH) }));
      received = new Set(reply.received);
      const before = received.size;
      report();

      const queue = [...reply.urls];
      const worker = async () => {
        for (let u = queue.shift(); u; u = queue.shift()) {
          const idx = u.index;
          const slice = input.blob.slice(idx * partSize, idx * partSize + sizeOf(idx));
          for (let a = 0; a < 3; a++) {
            check();
            try {
              await deps.putPart(u.upload, slice, (loaded) => {
                inflight.set(idx, loaded);
                report();
              });
              received.add(idx);
              break;
            } catch (e) {
              inflight.delete(idx);
              if (signal?.aborted) throw abortError();
              if (a < 2) await deps.sleep(backoff(a));
              // after 3 failures the round ends; the next round re-asks the server what it has
              else if (!isRetryable(e) && e instanceof ApiError && e.status === 413) throw e;
            }
          }
          inflight.delete(idx);
          report();
        }
      };
      await Promise.all(Array.from({ length: Math.min(POOL, queue.length) }, worker));

      if (received.size === before) {
        if (++stalled >= MAX_STALLED_ROUNDS)
          throw new ApiError('NETWORK', 'اتصال اینترنت ناپایدار است. آپلود ادامه پیدا نکرد؛ دوباره تلاش کنید.', 0);
        await deps.sleep(backoff(stalled));
      } else stalled = 0;
    }
  } catch (e) {
    if (signal?.aborted || (e instanceof DOMException && e.name === 'AbortError')) {
      await deps.del(`/admin/media/library/uploads/${mediaId}`).catch(() => {});
    }
    throw e;
  }
}
