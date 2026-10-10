import { describe, expect, it } from 'vitest';
import type { R2BucketLike } from '../src/blob/cloudflare';
import { D1Store } from '../src/store/d1';
import { archiveOldEvents } from '../src/services/retention';
import { createSqliteD1 } from './support/sqlite-d1';
import { createCtx } from './support/ctx';

const DAY = 86_400_000;

class FakeR2 implements R2BucketLike {
  objects = new Map<string, Uint8Array>();
  corrupt = false;
  async put(key: string, value: ArrayBuffer | Uint8Array) {
    const v = new Uint8Array(value);
    this.objects.set(key, this.corrupt ? v.slice(0, Math.max(0, v.length - 5)) : v);
  }
  async head(key: string) {
    const o = this.objects.get(key);
    return o ? { size: o.byteLength } : null;
  }
  async get(key: string) {
    const o = this.objects.get(key);
    if (!o) return null;
    return {
      size: o.byteLength,
      arrayBuffer: async () =>
        o.buffer.slice(o.byteOffset, o.byteOffset + o.byteLength) as ArrayBuffer,
    };
  }
  async delete(key: string) {
    this.objects.delete(key);
  }
}

async function setup(prune: boolean) {
  const ctx = await createCtx();
  const store = new D1Store(createSqliteD1());
  const bucket = new FakeR2();
  ctx.deps.store = store;
  ctx.deps.archive = { bucket, prune };
  const now = ctx.deps.clock().getTime();
  const iso = (daysAgo: number) => new Date(now - daysAgo * DAY).toISOString();
  return { ctx, store, bucket, iso };
}

const ids = async (store: D1Store, col: string) =>
  (await store.query({ collection: col })).map((x) => x.id).sort();

describe('event archive', () => {
  it('copy-only (default): archives old rows to R2 and leaves D1 untouched', async () => {
    const { ctx, store, bucket, iso } = await setup(false);
    for (let i = 0; i < 3; i++)
      await store.set(`analytics_events/old${i}`, { name: 'x', ts: iso(40) });
    await store.set('analytics_events/recent', { name: 'x', ts: iso(5) });
    await store.set('playback_events/oldp', { userId: 'u', ts: iso(45) });
    const r = await archiveOldEvents(ctx.deps);
    expect(r).toMatchObject({ prune: false });
    expect(bucket.objects.size).toBe(2);
    expect([...bucket.objects.keys()].every((k) => k.startsWith('archive/events/'))).toBe(true);
    expect(await ids(store, 'analytics_events')).toEqual(['old0', 'old1', 'old2', 'recent']);
    expect(await ids(store, 'playback_events')).toEqual(['oldp']);
    // running again rewrites the same objects instead of piling up copies
    await archiveOldEvents(ctx.deps);
    expect(bucket.objects.size).toBe(2);
  });

  it('prune on: removes exactly the verified old rows, keeps recent rows and other collections', async () => {
    const { ctx, store, bucket, iso } = await setup(true);
    for (let i = 0; i < 5; i++)
      await store.set(`analytics_events/old${i}`, { name: 'x', ts: iso(60) });
    await store.set('analytics_events/recent', { name: 'x', ts: iso(29) });
    await store.set('mentor_nudges/keep', { ts: iso(400) });
    await store.set('section_progress/keep', { ts: iso(400) });
    const r = await archiveOldEvents(ctx.deps);
    expect(r).toMatchObject({ report: { analytics_events: { archived: 5, removedFromD1: 5 } } });
    expect(await ids(store, 'analytics_events')).toEqual(['recent']);
    expect(await store.get('mentor_nudges/keep')).not.toBeNull();
    expect(await store.get('section_progress/keep')).not.toBeNull();
    // every removed row is recoverable from R2
    const [key] = [...bucket.objects.keys()];
    const stream = new Blob([bucket.objects.get(key ?? '') as unknown as ArrayBuffer])
      .stream()
      .pipeThrough(new DecompressionStream('gzip'));
    const lines = (await new Response(stream).text()).split('\n').map((l) => JSON.parse(l));
    expect(lines.map((l) => l.id).sort()).toEqual(['old0', 'old1', 'old2', 'old3', 'old4']);
    expect(JSON.parse(lines[0].data).name).toBe('x');
  });

  it('keeps every D1 row when the copy cannot be verified', async () => {
    const { ctx, store, bucket, iso } = await setup(true);
    bucket.corrupt = true;
    for (let i = 0; i < 4; i++)
      await store.set(`analytics_events/old${i}`, { name: 'x', ts: iso(60) });
    const r = await archiveOldEvents(ctx.deps);
    expect(r).toMatchObject({ failed: true });
    expect((await ids(store, 'analytics_events')).length).toBe(4);
  });

  it('handles more rows than one batch, and stops at the deadline', async () => {
    const { ctx, store, iso } = await setup(true);
    await store.batchSet(
      Array.from({ length: 2300 }, (_, i) => ({
        path: `analytics_events/e${String(i).padStart(5, '0')}`,
        data: { name: 'x', ts: iso(50) },
      })),
    );
    const stopped = await archiveOldEvents(ctx.deps, Date.now() - 1);
    expect(stopped).toMatchObject({ partial: true });
    expect((await ids(store, 'analytics_events')).length).toBe(2300);
    const r = await archiveOldEvents(ctx.deps);
    expect(r).toMatchObject({
      report: { analytics_events: { archived: 2300, removedFromD1: 2300 } },
    });
    expect((await ids(store, 'analytics_events')).length).toBe(0);
  });

  it('is a no-op without an archive bucket', async () => {
    const { ctx } = await setup(true);
    ctx.deps.archive = undefined;
    expect(await archiveOldEvents(ctx.deps)).toEqual({ skipped: true });
  });
});
