import { ApiError, api } from './api';

/**
 * Offline heartbeat queue (28.2 #7). Each heartbeat carries a unique Idempotency-Key, so
 * replaying the queue after reconnecting never double-counts playback on the server.
 */
interface QueuedBeat {
  sectionId: string;
  body: { positionSec: number; playedDeltaSec: number; ts: string; event?: string };
  key: string;
}
const KEY = 'ssl.beats';
const MAX = 500;

function read(): QueuedBeat[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as QueuedBeat[];
  } catch {
    return [];
  }
}
function write(list: QueuedBeat[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX)));
  } catch {
    /* quota — drop oldest silently */
  }
}

export const pendingBeats = () => read().length;

export function enqueueBeat(b: QueuedBeat) {
  write([...read(), b]);
}

let flushing = false;
/** Sends queued beats in order. Stops at the first network error (still offline). */
export async function flushBeats(): Promise<number> {
  if (flushing) return 0;
  flushing = true;
  let sent = 0;
  try {
    let list = read();
    while (list.length) {
      const b = list[0];
      if (!b) break;
      try {
        await api.post(`/me/sections/${b.sectionId}/progress`, b.body, {
          'Idempotency-Key': b.key,
        });
      } catch (e) {
        if (
          e instanceof ApiError &&
          (e.code === 'NETWORK' ||
            e.code === 'RATE_LIMIT' ||
            e.code === 'UNAUTHENTICATED' ||
            e.status >= 500)
        )
          break;
        // Validation/forbidden: the beat can never succeed — drop it.
      }
      list = read().slice(1);
      write(list);
      sent++;
    }
  } finally {
    flushing = false;
  }
  return sent;
}

export function newKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
