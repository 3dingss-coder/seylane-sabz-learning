import type { Deps } from './context';
import { DAY } from '../lib/time';

/** Only high-volume technical logs. Never content, users or anything an admin edits. */
export const ARCHIVE_COLLECTIONS = ['playback_events', 'analytics_events'] as const;
/** Rows newer than this stay in D1 (admin KPIs read the last 30 days of analytics_events). */
export const ARCHIVE_AFTER_DAYS = 30;
const BATCH = 2000;
const MAX_BATCHES_PER_COLLECTION = 10;

async function gzip(text: string): Promise<Uint8Array> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzip(bytes: ArrayBuffer): Promise<string> {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

/**
 * Moves old event-log rows out of D1 without losing any of them.
 *   1. read the oldest rows (> 30 days);
 *   2. write them to R2 as gzip NDJSON, one object per UTC day (key = archive/events/<col>/<day>/…);
 *   3. read the object back and check it holds exactly those rows;
 *   4. ONLY if EVENT_ARCHIVE_PRUNE=on, delete exactly those verified rows from D1.
 * With pruning off (the default) it only copies: one batch per collection per run, re-written
 * identically (same keys) each night, so D1 is untouched. Any failure leaves D1 as it was.
 */
export async function archiveOldEvents(d: Deps, deadlineAtMs: number | null = null) {
  const arch = d.archive;
  const select = d.store.selectOlderThan?.bind(d.store);
  const remove = d.store.deleteByIds?.bind(d.store);
  if (!arch || !select || !remove) return { skipped: true as const };
  const cutoff = new Date(d.clock().getTime() - ARCHIVE_AFTER_DAYS * DAY).toISOString();
  const report: Record<string, { archived: number; removedFromD1: number; files: number }> = {};
  for (const col of ARCHIVE_COLLECTIONS) {
    const r = (report[col] = { archived: 0, removedFromD1: 0, files: 0 });
    for (let b = 0; b < MAX_BATCHES_PER_COLLECTION; b++) {
      if (deadlineAtMs !== null && Date.now() >= deadlineAtMs) return { report, partial: true };
      const rows = await select(col, cutoff, BATCH);
      if (!rows.length) break;
      const byDay = new Map<string, typeof rows>();
      for (const row of rows) {
        let ts = '';
        try {
          ts = String((JSON.parse(row.data) as { ts?: unknown }).ts ?? '');
        } catch {
          // unreadable row: archived under "unknown" so it is still preserved
        }
        const day = /^\d{4}-\d{2}-\d{2}/.test(ts) ? ts.slice(0, 10) : 'unknown';
        const list = byDay.get(day) ?? [];
        list.push(row);
        byDay.set(day, list);
      }
      let allVerified = true;
      for (const [day, list] of byDay) {
        const first = list[0]?.id ?? 'x';
        const key = `archive/events/${col}/${day}/${first}-${list.length}.ndjson.gz`;
        const body = list
          .map((x) => JSON.stringify({ id: x.id, updatedAt: x.updatedAt, data: x.data }))
          .join('\n');
        await arch.bucket.put(key, await gzip(body), {
          httpMetadata: { contentType: 'application/gzip' },
        });
        let text: string | null = null;
        try {
          const back = await arch.bucket.get(key);
          text = back ? await gunzip(await back.arrayBuffer()) : null;
        } catch {
          text = null; // unreadable copy counts as "not verified"
        }
        if (text !== body) {
          allVerified = false;
          console.error(`[archive] verification failed for ${key}; D1 rows kept`);
          break;
        }
        r.files++;
      }
      if (!allVerified) return { report, failed: true as const };
      r.archived += rows.length;
      if (!arch.prune) break; // copy-only: D1 unchanged, so do not loop on the same rows
      r.removedFromD1 += await remove(
        col,
        rows.map((x) => x.id),
      );
      if (rows.length < BATCH) break;
    }
  }
  return { report, prune: arch.prune };
}
