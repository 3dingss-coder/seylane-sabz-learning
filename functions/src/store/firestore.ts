import type { Firestore, Query, DocumentData, Transaction } from 'firebase-admin/firestore';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import {
  StoreConflictError,
  StoreNotFoundError,
  type Data,
  type Input,
  type Doc,
  type DocStore,
  type QuerySpec,
  type TxOps,
} from './types';

/** Timestamps → ISO strings on read (domain uses ISO strings; TTL `expireAt` stays internal). */
function fromFs(data: DocumentData): Data {
  const out: Data = {};
  for (const [k, v] of Object.entries(data)) {
    if (v instanceof Timestamp) out[k] = v.toDate().toISOString();
    else if (v && typeof v === 'object' && !Array.isArray(v)) out[k] = fromFs(v as DocumentData);
    else if (Array.isArray(v))
      out[k] = v.map((x) =>
        x && typeof x === 'object' && !(x instanceof Timestamp)
          ? fromFs(x)
          : x instanceof Timestamp
            ? x.toDate().toISOString()
            : x,
      );
    else out[k] = v;
  }
  return out;
}

function stripId(data: Input): Data {
  const { id: _id, ...rest } = data as Data;
  // Firestore rejects `undefined` values.
  return JSON.parse(
    JSON.stringify(rest, (_k, v) => (v instanceof Date ? { __date: v.toISOString() } : v)),
    (_k, v) => (v && typeof v === 'object' && '__date' in v ? new Date(v.__date as string) : v),
  ) as Data;
}

function isAlreadyExists(err: unknown): boolean {
  const code = (err as { code?: number | string }).code;
  return code === 6 || code === 'already-exists' || code === 'ALREADY_EXISTS';
}
function isNotFound(err: unknown): boolean {
  const code = (err as { code?: number | string }).code;
  return code === 5 || code === 'not-found' || code === 'NOT_FOUND';
}

export class FirestoreStore implements DocStore {
  constructor(private readonly db: Firestore) {}

  private buildQuery(q: QuerySpec): Query {
    let ref: Query = q.group
      ? this.db.collectionGroup(q.collection)
      : this.db.collection(q.collection);
    for (const [f, op, v] of q.where ?? []) ref = ref.where(f, op, v);
    for (const [f, dir] of q.orderBy ?? []) ref = ref.orderBy(f, dir);
    if (q.limit !== undefined) ref = ref.limit(q.limit);
    return ref;
  }

  async get<T>(path: string): Promise<Doc<T> | null> {
    const snap = await this.db.doc(path).get();
    return snap.exists ? ({ ...fromFs(snap.data() ?? {}), id: snap.id } as Doc<T>) : null;
  }
  async getMany<T>(paths: string[]): Promise<Array<Doc<T> | null>> {
    if (paths.length === 0) return [];
    const snaps = await this.db.getAll(...paths.map((p) => this.db.doc(p)));
    return snaps.map((s) =>
      s.exists ? ({ ...fromFs(s.data() ?? {}), id: s.id } as Doc<T>) : null,
    );
  }
  async query<T>(q: QuerySpec): Promise<Doc<T>[]> {
    const snap = await this.buildQuery(q).get();
    return snap.docs.map((d) => ({ ...fromFs(d.data()), id: d.id }) as Doc<T>);
  }
  async set(path: string, data: Input, opts?: { merge?: boolean }) {
    await this.db.doc(path).set(stripId(data), { merge: !!opts?.merge });
  }
  async create(path: string, data: Input) {
    try {
      await this.db.doc(path).create(stripId(data));
    } catch (e) {
      if (isAlreadyExists(e)) throw new StoreConflictError(path);
      throw e;
    }
  }
  async update(path: string, data: Input) {
    try {
      await this.db.doc(path).update(stripId(data));
    } catch (e) {
      if (isNotFound(e)) throw new StoreNotFoundError(path);
      throw e;
    }
  }
  async delete(path: string) {
    await this.db.doc(path).delete();
  }
  async increment(path: string, field: string, by: number) {
    await this.db.doc(path).set({ [field]: FieldValue.increment(by) }, { merge: true });
  }
  newId() {
    return this.db.collection('_').doc().id;
  }
  async batchSet(items: Array<{ path: string; data: Input; merge?: boolean }>) {
    for (let i = 0; i < items.length; i += 400) {
      const batch = this.db.batch();
      for (const it of items.slice(i, i + 400))
        batch.set(this.db.doc(it.path), stripId(it.data), { merge: !!it.merge });
      await batch.commit();
    }
  }
  async runTransaction<R>(fn: (tx: TxOps) => Promise<R>): Promise<R> {
    try {
      return await this.db.runTransaction(async (t: Transaction) => {
        const ops: TxOps = {
          get: async <T>(path: string) => {
            const s = await t.get(this.db.doc(path));
            return s.exists ? ({ ...fromFs(s.data() ?? {}), id: s.id } as Doc<T>) : null;
          },
          query: async <T>(q: QuerySpec) => {
            const s = await t.get(this.buildQuery(q));
            return s.docs.map((d) => ({ ...fromFs(d.data()), id: d.id }) as Doc<T>);
          },
          set: (path, data, o) =>
            void t.set(this.db.doc(path), stripId(data), { merge: !!o?.merge }),
          create: (path, data) => void t.create(this.db.doc(path), stripId(data)),
          update: (path, data) => void t.update(this.db.doc(path), stripId(data)),
        };
        return fn(ops);
      });
    } catch (e) {
      if (isAlreadyExists(e)) throw new StoreConflictError('transaction');
      throw e;
    }
  }
}
