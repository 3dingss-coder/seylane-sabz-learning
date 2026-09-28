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

export interface DocStore {
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
  newId(): string;
  runTransaction<R>(fn: (tx: TxOps) => Promise<R>): Promise<R>;
  /** Batched writes for bulk operations (≤ 400 per chunk handled by adapter). */
  batchSet(items: Array<{ path: string; data: Input; merge?: boolean }>): Promise<void>;
}
