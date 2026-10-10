// ═══════════════════════════════════════════════════════════════════════════
//   Layer 4 — AUTOMATION EVENTS (outbox). A business action writes one small row; the
//   engine turns it into notifications after the response.
// ═══════════════════════════════════════════════════════════════════════════
//
// Why an outbox instead of calling `fireAutomationEvent()` inline (approved analysis §5.2):
//
//   1. **Latency and blast radius.** Handling an event means reading the learner's state,
//      resolving the audience and maybe pushing. A quiz submit must not wait for that, and it must
//      not fail because push infrastructure is down.
//   2. **One event, several automations.** Twelve seeded rows listen for `quiz.failed` (the nudge,
//      the retry offer, the manager copy, …); repeating that fan-out at the call site would mean
//      importing the engine into five services.
//   3. **`waitUntil` lives in the Worker, not in `Deps`.** A request handler cannot await a
//      background job, so it writes the row and `cloudflare-worker.ts` → `backgroundJob()` drains
//      the outbox after the response, with the 15-minute cron as the guarantee.
//
// Cost discipline (prompt §4.9): most of the time *no* automation is switched on. Checking that
// costs one read, cached for 30s per `Deps` (`listeningEvents()` below), and then a quiz submit
// writes **nothing**. A user action never fans out over the whole user base either — the recipient
// list is always the caller's own (see `emitAutomationEventForUsers`).
//
// Idempotency: the document id is a hash of `event|userId` inside a daily shard, written with
// `store.create`, which throws `StoreConflictError` on a duplicate. So a double-clicked submit or a
// replayed request cannot queue a second nudge for the same person on the same day (prompt §4.2).
//
// ═══ EDIT THIS FILE TOGETHER WITH `docs/admin-push-automation-api.md` ══════════════════════════

import { dayKey } from '../lib/time';
import type { Doc } from '../store/types';
import { fireAutomationEvent } from './push-automation-engine';
import { loadRunnable } from './push-automation-governor';
import { getPolicy, track, type Deps } from './context';

/** Collection of daily outbox shards: `push_automation_events/<YYYY-MM-DD>/<hash>`. */
export const EVENTS = 'push_automation_events';
/** Past this point an event is history: a nudge nobody needed for six hours is noise. */
export const EVENT_TTL_MS = 6 * 60 * 60_000;
const LISTENERS_TTL_MS = 30_000;
/** Outbox rows evaluated per drain; the cron picks the rest up on the next tick. */
export const EVENTS_PER_RUN = 30;
/** One drain must not be monopolised by the fan-out of a single action. */
export const EVENTS_PER_USER_RUN = 4;
/** Cap on the recipients of one broadcast emit, whatever the caller passes. */
export const BROADCAST_MAX_USERS = 200;

export interface AutomationEvent {
  event: string;
  userId: string;
  vars: Record<string, string | number>;
  at: string;
  expireAt: string;
}

/**
 * The requests that can queue an automation event. The Worker drains the outbox right after one of
 * these answers successfully, which is what keeps a «you failed the quiz, want to retry?» nudge on
 * its 2-hour schedule instead of «somewhere within 15 minutes». Keep in sync with the
 * `emitAutomationEvent` call sites; `push-automation-events.test.ts` asserts that.
 */
export const AUTOMATION_EVENT_PATH =
  /^\/v1\/me\/(quizzes\/[^/]+\/attempts|attempts\/[^/]+\/submit|sections\/[^/]+\/progress)$/;

const eventShard = async (d: Deps): Promise<string> =>
  `${EVENTS}/${dayKey(d.clock(), (await getPolicy(d)).timezone)}`;

const hash = (s: string): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
};

// ─── Who is listening? ───────────────────────────────────────────────────────

const listenersCache = new WeakMap<Deps, { at: number; events: Set<string> }>();

/**
 * Events with at least one enabled, non-gate automation. Empty while the engine is paused
 * (`loadRunnable` returns nothing then), which means a pause also stops the queueing — the same
 * trade-off `fireAutomationEvent` already makes: follow-ups are re-derived from state, not replayed.
 */
export async function listeningEvents(d: Deps): Promise<Set<string>> {
  const cached = listenersCache.get(d);
  const now = d.clock().getTime();
  if (cached && now - cached.at < LISTENERS_TTL_MS) return cached.events;
  const events = new Set<string>();
  try {
    const { automations } = await loadRunnable(d);
    for (const a of automations) {
      if (a.trigger.kind === 'event' || a.trigger.kind === 'event_delay') {
        if (a.trigger.event) events.add(a.trigger.event);
      }
    }
  } catch {
    // An unreadable catalogue must not break the request that triggered it: treating everything as
    // unattended costs a nudge, never a submission.
    return events;
  }
  listenersCache.set(d, { at: now, events });
  return events;
}

/**
 * Whether an event has a listener. A call site that has to do real work first (query the learners of
 * a package) checks this before it spends the query; `emitAutomationEvent` needs no such check.
 */
export async function isListening(d: Deps, event: string): Promise<boolean> {
  try {
    return (await listeningEvents(d)).has(event);
  } catch {
    return false;
  }
}

// ─── Emit ────────────────────────────────────────────────────────────────────

/**
 * Record that something happened to one user. Never rejects, and a duplicate for the same person,
 * event and day is silently dropped — callers can `await` it without a try/catch.
 */
export async function emitAutomationEvent(
  d: Deps,
  event: string,
  userId: string,
  vars: Record<string, string | number> = {},
): Promise<boolean> {
  try {
    if (!(await listeningEvents(d)).has(event)) return false;
    const at = d.clock().toISOString();
    await d.store.create(`${await eventShard(d)}/${hash(`${event}|${userId}`)}`, {
      event,
      userId,
      vars,
      at,
      expireAt: new Date(Date.parse(at) + EVENT_TTL_MS).toISOString(),
    } as AutomationEvent);
    return true;
  } catch {
    return false; // `StoreConflictError` (already queued) or a storage hiccup
  }
}

/**
 * The same event for a list of users — an edited package and its learners. One write each, and no
 * user outside the list is reached. Returns how many rows were queued.
 */
export async function emitAutomationEventForUsers(
  d: Deps,
  event: string,
  userIds: string[],
  vars: Record<string, string | number> = {},
): Promise<number> {
  let queued = 0;
  try {
    if (!(await listeningEvents(d)).has(event) || !userIds.length) return 0;
    const at = d.clock().toISOString();
    const expireAt = new Date(Date.parse(at) + EVENT_TTL_MS).toISOString();
    const shard = await eventShard(d);
    for (const userId of userIds.slice(0, BROADCAST_MAX_USERS)) {
      try {
        await d.store.create(`${shard}/${hash(`${event}|${userId}`)}`, {
          event,
          userId,
          vars,
          at,
          expireAt,
        } as AutomationEvent);
        queued++;
      } catch {
        /* already queued for this person today */
      }
    }
    if (userIds.length > BROADCAST_MAX_USERS)
      await track(d, 'automation_event_truncated', 'system', { event, recipients: userIds.length });
  } catch {
    /* as above: a notification queue must never break an admin action */
  }
  return queued;
}

/** Learners who have any progress on a package — the only people a content change is about. */
export async function packageLearnerIds(d: Deps, packageId: string): Promise<string[]> {
  const rows = await d.store.query<{ userId: string }>({
    collection: 'section_progress',
    where: [['packageId', '==', packageId]],
  });
  return [...new Set(rows.map((r) => r.userId))];
}

// ─── Drain ───────────────────────────────────────────────────────────────────

export interface EventDrainResult {
  scanned: number;
  sent: number;
  dropped: number;
  failed: number;
}

/**
 * Turn queued rows into notifications. Never throws: this runs once a response has already gone out,
 * and the cron runs it again, so a failure only delays a nudge.
 *
 * A row is consumed whether or not something was sent — a push skipped for a real reason (cap, quiet
 * hours, opt-out) must not be retried until it lands in the next hour.
 */
export async function drainAutomationEvents(
  d: Deps,
  opts: { limit?: number } = {},
): Promise<EventDrainResult> {
  const out: EventDrainResult = { scanned: 0, sent: 0, dropped: 0, failed: 0 };
  const limit = opts.limit ?? EVENTS_PER_RUN;
  let shard: string;
  let rows: Array<Doc<AutomationEvent>>;
  try {
    shard = await eventShard(d);
    rows = await d.store.query<AutomationEvent>({ collection: shard });
  } catch {
    return out;
  }
  const now = d.clock().getTime();
  const perUser = new Map<string, number>();
  for (const row of rows) {
    if (out.scanned >= limit) break;
    if (Date.parse(row.expireAt) <= now) {
      out.dropped++;
      await d.store.delete(`${shard}/${row.id}`);
      continue;
    }
    const seen = perUser.get(row.userId) ?? 0;
    if (seen >= EVENTS_PER_USER_RUN) continue; // a fan-out cannot monopolise one drain
    out.scanned++;
    perUser.set(row.userId, seen + 1);
    try {
      const r = await fireAutomationEvent(d, row.event, row.userId, row.vars ?? {});
      out.sent += r.sent;
    } catch (e) {
      out.failed++;
      await track(d, 'automation_event_failed', 'system', {
        event: row.event,
        error: (e as Error).message?.slice(0, 160),
      });
    }
    await d.store.delete(`${shard}/${row.id}`);
  }
  if (rows.length > out.scanned)
    await track(d, 'automation_events_backlog', 'system', { left: rows.length - out.scanned });
  return out;
}
