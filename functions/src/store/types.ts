/**
 * DocStore — the persistence port (D37). Mirrors the Firestore data model (collections,
 * sub-collections, documents, simple queries, transactions) so business services are written
 * once and run on Firestore (prod/dev) or in memory (tests / local run without emulator).
 *
 * Conventions:
 *  • Paths are slash-separated: "users/u1", "packages/p1/sections/s1".
 *  • Timestamps are ISO-8601 UTC strings. TTL fields (`expireAt`) are JS Dates
 *    (Firestore adapter persists them as Timestamps so TTL policies apply).
 *  • `create` fails with StoreConflictError if the document exists → used for uniqueness.
 */
export type WhereOp = '==' | '!=' | '<' | '<=' | '>' | '>=' | 'in' | 'array-contains';
export type Where = [field: string, op: WhereOp, value: unknown];
export type OrderBy = [field: string, dir: 'asc' | 'desc'];

export interface QuerySpec {
  /** Collection path ("users", "packages/p1/sections") or collection id when `group`. */
  collection: string;
  group?: boolean;
  where?: Where[];
  orderBy?: OrderBy[];
  limit?: number;
}

export type Doc<T> = T & { id: string };
export type Data = Record<string, unknown>;
/** Any plain object (domain interfaces lack index signatures). */
export type Input = object;

export class StoreConflictError extends Error {
  constructor(path: string) {
    super(`Document already exists: ${path}`);
  }
}
export class StoreNotFoundError extends Error {
  constructor(path: string) {
    super(`Document not found: ${path}`);
  }
}

export interface TxOps {
  get<T>(path: string): Promise<Doc<T> | null>;
  query<T>(q: QuerySpec): Promise<Doc<T>[]>;
  set(path: string, data: Input, opts?: { merge?: boolean }): void;
  create(path: string, data: Input): void;
  update(path: string, data: Input): void;
}

/**
 * Per-request timing the D1 store fills in while it serves one request's calls. It is passed in
 * explicitly (Workers has no request-local storage without extra compatibility flags), so each
 * request sees only its own queue wait and D1 time.
 */
export interface OpTrace {
  requestId: string;
  /** Absolute epoch-ms deadline for NEW D1 work started by this request; null = none. */
  deadlineAtMs: number | null;
  /** Time spent waiting behind other calls/transactions in the isolate. */
  queueWaitMs: number;
  /** Time spent inside D1 calls. */
  d1DurationMs: number;
  d1Calls: number;
  /** D1 calls that hit the per-call time limit. */
  d1Timeouts: number;
  /** Waits that gave up on a predecessor that never finished (slow or abandoned request). */
  queueTimeouts: number;
  /** Transaction attempts that lost an optimistic-concurrency check and were re-run. */
  txRetries: number;
  /** D1 calls that finished only after their caller had already been told they timed out. */
  lateCompletions: number;
}

export function newOpTrace(requestId: string, deadlineAtMs: number | null = null): OpTrace {
  return {
    requestId,
    deadlineAtMs,
    queueWaitMs: 0,
    d1DurationMs: 0,
    d1Calls: 0,
    d1Timeouts: 0,
    queueTimeouts: 0,
    txRetries: 0,
    lateCompletions: 0,
  };
}

export interface DocStore {
  /** Optional: a view of this store that records timing for one request into `trace`. */
  scoped?(trace: OpTrace): DocStore;
  get<T>(path: string): Promise<Doc<T> | null>;
  getMany<T>(paths: string[]): Promise<Array<Doc<T> | null>>;
  query<T>(q: QuerySpec): Promise<Doc<T>[]>;
  set(path: string, data: Input, opts?: { merge?: boolean }): Promise<void>;
  create(path: string, data: Input): Promise<void>;
  update(path: string, data: Input): Promise<void>;
  /** Physical delete — only for technical docs (tokens, rate counters). Never for content/users. */
  delete(path: string): Promise<void>;
  /** Atomically add `by` to a numeric field (creates doc/field if missing). */
  increment(path: string, field: string, by: number): Promise<void>;
  /**
   * Optional (D1 only, used by the event archive): raw rows of `collection` whose `ts` is before
   * `beforeIso`, oldest first, at most `limit`. `data` is the stored JSON text, unparsed.
   */
  selectOlderThan?(
    collection: string,
    beforeIso: string,
    limit: number,
  ): Promise<Array<{ id: string; data: string; updatedAt: string }>>;
  /** Optional (D1 only): physically delete these ids of `collection`. Returns how many went. */
  deleteByIds?(collection: string, ids: string[]): Promise<number>;
  newId(): string;
  runTransaction<R>(fn: (tx: TxOps) => Promise<R>): Promise<R>;
  /** Batched writes for bulk operations (≤ 400 per chunk handled by adapter). */
  batchSet(items: Array<{ path: string; data: Input; merge?: boolean }>): Promise<void>;
}
