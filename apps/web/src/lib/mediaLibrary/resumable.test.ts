import { describe, expect, it } from 'vitest';
import { ApiError } from '../api';
import { uploadResumable, type UploadDeps } from './resumable';
import type { LibraryItem, UploadTicket } from './types';

const MB = 1024 * 1024;
const item = { id: 'm1', kind: 'video', title: 't' } as unknown as LibraryItem;

/** In-memory fake of the three library endpoints, with switchable failures. */
function fakeServer(totalSize: number) {
  const partSize = MB;
  const totalParts = Math.ceil(totalSize / partSize);
  const stored = new Set<number>();
  const log: string[] = [];
  const state = { failPut: new Set<number>(), failPartsOnce: false, completeLosesPart: false };
  const deps: UploadDeps = {
    async post<T>(path: string, body?: unknown): Promise<T> {
      if (path === '/admin/media/library/uploads') {
        log.push('start');
        return { mediaId: 'm1', partSize, totalParts } as T;
      }
      if (path.endsWith('/parts')) {
        if (state.failPartsOnce) {
          state.failPartsOnce = false;
          throw new ApiError('NETWORK', 'net', 0);
        }
        const idx = (body as { indexes: number[] }).indexes;
        return {
          received: [...stored].sort(),
          totalParts,
          partSize,
          urls: idx.filter((i) => !stored.has(i)).map((index) => ({
            index,
            upload: { url: `/p/${index}`, method: 'PUT', headers: {} },
          })),
        } as T;
      }
      if (path.endsWith('/complete')) {
        if (state.completeLosesPart) {
          state.completeLosesPart = false;
          stored.delete(1);
          throw new ApiError('CONFLICT', 'missing', 409, { missing: [1] });
        }
        log.push('complete');
        return item as T;
      }
      throw new Error(`unexpected ${path}`);
    },
    async del<T>(path: string): Promise<T> {
      log.push(`del ${path}`);
      return {} as T;
    },
    async putPart(ticket: UploadTicket, _blob: Blob, onProgress) {
      const i = Number(ticket.url.split('/').pop());
      if (state.failPut.has(i)) {
        state.failPut.delete(i); // fails once, then works
        throw new ApiError('NETWORK', 'net', 0);
      }
      onProgress(1);
      stored.add(i);
    },
    sleep: async () => {},
  };
  return { deps, stored, log, state, totalParts };
}

const input = (size: number) => ({
  blob: new Blob([new Uint8Array(size)]),
  kind: 'video' as const,
  fileName: 'a.mp4',
  mime: 'video/mp4',
});

describe('uploadResumable', () => {
  it('uploads every part and completes', async () => {
    const s = fakeServer(5.5 * MB);
    const progress: number[] = [];
    const out = await uploadResumable(input(5.5 * MB), s.deps, { onProgress: (p) => progress.push(p) });
    expect(out.id).toBe('m1');
    expect(s.stored.size).toBe(6);
    expect(progress.at(-1)).toBe(1);
    expect(progress.every((p, i) => i === 0 || p >= 0)).toBe(true);
  });

  it('survives a failed part, a failed status call, and a part the server lost', async () => {
    const s = fakeServer(4 * MB);
    s.state.failPut.add(2);
    s.state.failPartsOnce = true;
    s.state.completeLosesPart = true;
    const out = await uploadResumable(input(4 * MB), s.deps);
    expect(out.id).toBe('m1');
    expect(s.stored.size).toBe(4);
    expect(s.log.filter((l) => l === 'complete')).toHaveLength(1);
  });

  it('resumes an existing upload without creating a new one', async () => {
    const s = fakeServer(3 * MB);
    s.stored.add(0);
    s.stored.add(1);
    const out = await uploadResumable(input(3 * MB), s.deps, { resumeMediaId: 'm1' });
    expect(out.id).toBe('m1');
    expect(s.log).not.toContain('start');
    expect(s.stored.size).toBe(3);
  });

  it('gives up with a clear error when the network never recovers', async () => {
    const s = fakeServer(2 * MB);
    s.deps.putPart = async () => {
      throw new ApiError('NETWORK', 'net', 0);
    };
    await expect(uploadResumable(input(2 * MB), s.deps)).rejects.toMatchObject({ code: 'NETWORK' });
  });

  it('abort cancels the server upload', async () => {
    const s = fakeServer(3 * MB);
    const ctl = new AbortController();
    const origPut = s.deps.putPart;
    s.deps.putPart = async (t, b, p) => {
      ctl.abort();
      return origPut(t, b, p);
    };
    await expect(uploadResumable(input(3 * MB), s.deps, { signal: ctl.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(s.log.some((l) => l.startsWith('del '))).toBe(true);
  });
});
