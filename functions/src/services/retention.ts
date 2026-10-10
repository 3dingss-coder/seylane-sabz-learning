import type { Deps } from './context';

/** Only high-volume technical logs. Never content, users or anything an admin edits. */
export const PURGE_COLLECTIONS = ['playback_events', 'analytics_events'] as const;
const BATCH = 500;
const MAX_BATCHES_PER_COLLECTION = 40; // ≤ 20 000 rows per collection per run; the rest waits for tomorrow

/** Deletes rows whose own `expireAt` has passed. A no-op on stores without `purgeExpired`. */
export async function purgeExpiredEvents(d: Deps, deadlineAtMs: number | null = null) {
  const purge = d.store.purgeExpired?.bind(d.store);
  if (!purge) return { skipped: true as const };
  const beforeIso = d.clock().toISOString();
  const deleted: Record<string, number> = {};
  for (const col of PURGE_COLLECTIONS) {
    deleted[col] = 0;
    for (let i = 0; i < MAX_BATCHES_PER_COLLECTION; i++) {
      if (deadlineAtMs !== null && Date.now() >= deadlineAtMs) return { deleted, partial: true };
      const n = await purge(col, beforeIso, BATCH);
      deleted[col] += n;
      if (n < BATCH) break;
    }
  }
  return { deleted };
}
