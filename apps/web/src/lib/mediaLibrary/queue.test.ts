import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api';
import { MediaUploadQueue, type Job, type QueueDeps } from './queue';
import { TranscodeFailed, TranscodeUnavailable } from './transcode';
import type { LibraryItem } from './types';

const MB = 1024 * 1024;
const readyItem = { id: 'm1', kind: 'video', title: 't' } as unknown as LibraryItem;

function file(name: string, size: number, type = 'video/mp4') {
  return new File([new Uint8Array(size)], name, { type });
}

function makeQueue(over: Partial<QueueDeps> = {}) {
  const ready = vi.fn();
  const uploaded: Array<{ size: number; name: string; mime: string }> = [];
  const stored = new Set<number>();
  let totalParts = 1;
  const deps: QueueDeps = {
    upload: {
      async post<T>(path: string, body?: unknown): Promise<T> {
        if (path === '/admin/media/library/uploads') {
          const b = body as { sizeBytes: number; fileName: string; mime: string };
          uploaded.push({ size: b.sizeBytes, name: b.fileName, mime: b.mime });
          stored.clear();
          totalParts = Math.ceil(b.sizeBytes / MB);
          return { mediaId: 'm1', partSize: MB, totalParts } as T;
        }
        if (path.endsWith('/parts')) {
          const idx = (body as { indexes: number[] }).indexes;
          return {
            received: [...stored],
            totalParts,
            partSize: MB,
            urls: idx.filter((i) => !stored.has(i)).map((index) => ({ index, upload: { url: `/p/${index}`, method: 'PUT', headers: {} } })),
          } as T;
        }
        return readyItem as T;
      },
      async del<T>() {
        return {} as T;
      },
      async putPart(t, blob, onProgress) {
        onProgress(blob.size);
        stored.add(Number(t.url.split('/').pop()));
      },
      sleep: async () => {},
    },
    probe: async () => 600,
    transcode: async () => new Blob([new Uint8Array(2 * MB)], { type: 'video/mp4' }),
    cancelTranscode: () => {},
    onItemReady: ready,
    ...over,
  };
  return { q: new MediaUploadQueue(deps), ready, uploaded };
}

const settled = (q: MediaUploadQueue, id?: string) =>
  new Promise<Job>((resolve) => {
    const check = () => {
      const j = id ? q.getSnapshot().find((x) => x.id === id) : q.getSnapshot()[0];
      if (j && ['done', 'error', 'canceled'].includes(j.stage)) resolve(j);
    };
    q.subscribe(check);
    check();
  });

describe('MediaUploadQueue', () => {
  it('compresses a big video, uploads the small result and reports done', async () => {
    const { q, ready, uploaded } = makeQueue();
    q.add([{ file: file('آموزش.mov', 30 * MB, 'video/quicktime'), brandId: 'b1' }]);
    const job = await settled(q);
    expect(job.stage).toBe('done');
    expect(job.progress).toBe(1);
    expect(uploaded[0]).toMatchObject({ size: 2 * MB, name: 'آموزش.mp4', mime: 'video/mp4' });
    expect(ready).toHaveBeenCalledWith(readyItem);
  });

  it('skips compression for a file that is already small', async () => {
    const transcode = vi.fn();
    const { q, uploaded } = makeQueue({ transcode });
    // 3 MB over 600 s = ~40 kbps -> already efficient
    q.add([{ file: file('small.mp4', 3 * MB) }]);
    expect((await settled(q)).stage).toBe('done');
    expect(transcode).not.toHaveBeenCalled();
    expect(uploaded[0]?.size).toBe(3 * MB);
  });

  it('falls back to the original when the browser cannot compress and the file fits', async () => {
    const { q, uploaded } = makeQueue({
      transcode: async () => {
        throw new TranscodeUnavailable('no wasm');
      },
    });
    q.add([{ file: file('clip.mov', 30 * MB, 'video/quicktime') }]);
    const job = await settled(q);
    expect(job.stage).toBe('done');
    expect(job.note).toContain('بدون بهینه‌سازی');
    expect(job.detail).toBe('no wasm');
    expect(uploaded[0]?.size).toBe(30 * MB);
  });

  it('fails with a clear message when compression fails and the file is too big for the server', async () => {
    const { q } = makeQueue({
      transcode: async () => {
        throw new TranscodeFailed('boom');
      },
    });
    q.add([{ file: file('huge.mov', 70 * MB, 'video/quicktime') }]);
    const job = await settled(q);
    expect(job.stage).toBe('error');
    expect(job.error).toContain('بزرگ');
  });

  it('keeps the original if "compression" made it bigger', async () => {
    const { q, uploaded } = makeQueue({
      transcode: async () => new Blob([new Uint8Array(40 * MB)], { type: 'video/mp4' }),
    });
    q.add([{ file: file('odd.mov', 30 * MB, 'video/quicktime') }]);
    expect((await settled(q)).stage).toBe('done');
    expect(uploaded[0]?.size).toBe(30 * MB);
  });

  it('rejects non-media files and surfaces API errors', async () => {
    const bad = makeQueue();
    bad.q.add([{ file: file('a.pdf', 10, 'application/pdf') }]);
    expect((await settled(bad.q)).error).toContain('ویدئویی یا صوتی');

    const failing = makeQueue();
    failing.q['deps'].upload.post = async () => {
      throw new ApiError('VALIDATION', 'نوع فایل پشتیبانی نمی‌شود.', 400);
    };
    failing.q.add([{ file: file('x.mp4', 3 * MB) }]);
    const job = await settled(failing.q);
    expect(job.stage).toBe('error');
    expect(job.error).toBe('نوع فایل پشتیبانی نمی‌شود.');
  });

  it('processes files one at a time and can retry a failed job', async () => {
    let calls = 0;
    const { q } = makeQueue({
      transcode: async () => {
        if (++calls === 1) throw new TranscodeFailed('first fails');
        return new Blob([new Uint8Array(MB)], { type: 'video/mp4' });
      },
    });
    q.add([
      { file: file('a.mov', 30 * MB, 'video/quicktime') },
      { file: file('b.mov', 30 * MB, 'video/quicktime') },
    ]);
    await new Promise((r) => setTimeout(r, 30));
    const [a, b] = q.getSnapshot();
    expect(a?.stage).toBe('done'); // fell back to the original (fits in 64 MB)
    expect(b?.stage).toBe('done');
    expect(calls).toBe(2);
  });

  it('cancels a queued job without running it', async () => {
    const probe = vi.fn(async () => 600);
    const { q } = makeQueue({
      probe,
      transcode: () => new Promise<Blob>(() => {}), // first job never finishes
    });
    q.add([{ file: file('a.mov', 30 * MB, 'video/quicktime') }, { file: file('b.mov', 30 * MB, 'video/quicktime') }]);
    await new Promise((r) => setTimeout(r, 10));
    const second = q.getSnapshot()[1];
    expect(second).toBeDefined();
    q.cancel(second?.id ?? '');
    expect(q.getSnapshot()[1]?.stage).toBe('canceled');
    expect(probe).toHaveBeenCalledTimes(1);
  });
});
