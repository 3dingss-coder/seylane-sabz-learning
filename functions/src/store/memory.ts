import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  StoreConflictError,
  StoreNotFoundError,
  type Data,
  type Input,
  type Doc,
  type DocStore,
  type QuerySpec,
  type TxOps,
  type Where,
} from './types';

type Row = Data;

function clone<T>(v: T): T {
  return structuredClone(v);
}

function getField(obj: Row, field: string): unknown {
  let cur: unknown = obj;
  for (const part of field.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function cmp(a: unknown, b: unknown): number {
  if (a instanceof Date) a = a.toISOString();
  if (b instanceof Date) b = b.toISOString();
  if (a === b) return 0;
  if (a === undefined || a === null) return -1;
  if (b === undefined || b === null) return 1;
  return (a as number | string) < (b as number | string) ? -1 : 1;
}

function matches(row: Row, [field, op, value]: Where): boolean {
  const v = field === '__id__' ? row.id : getField(row, field);
  switch (op) {
    case '==':
      return v === value || (v === undefined && value === null);
    case '!=':
      return v !== value && v !== undefined;
    case '<':
      return v !== undefined && v !== null && cmp(v, value) < 0;
    case '<=':
      return v !== undefined && v !== null && cmp(v, value) <= 0;
    case '>':
      return v !== undefined && v !== null && cmp(v, value) > 0;
    case '>=':
      return v !== undefined && v !== null && cmp(v, value) >= 0;
    case 'in':
      return Array.isArray(value) && value.includes(v);
    case 'array-contains':
      return Array.isArray(v) && v.includes(value);
  }
}

/** Merge like Firestore `set(..., {merge:true})` (deep for plain objects). */
function deepMerge(target: Row, src: Row): Row {
  const out: Row = { ...target };
  for (const [k, v] of Object.entries(src)) {
    const t = out[k];
    if (
      v &&
      typeof v === 'object' &&
      !Array.isArray(v) &&
      !(v instanceof Date) &&
      t &&
      typeof t === 'object' &&
      !Array.isArray(t) &&
      !(t instanceof Date)
    ) {
      out[k] = deepMerge(t as Row, v as Row);
    } else out[k] = v;
  }
  return out;
}

/** Dotted-key update like Firestore `update({"a.b": 1})`. */
function applyUpdate(target: Row, patch: Row): Row {
  const out = clone(target);
  for (const [k, v] of Object.entries(patch)) {
    const parts = k.split('.');
    let cur: Row = out;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i] as string;
      if (!cur[p] || typeof cur[p] !== 'object') cur[p] = {};
      cur = cur[p] as Row;
    }
    cur[parts[parts.length - 1] as string] = v;
  }
  return out;
}

function splitPath(p: string): { col: string; id: string } {
  const idx = p.lastIndexOf('/');
  if (idx <= 0) throw new Error(`Invalid document path: ${p}`);
  return { col: p.slice(0, idx), id: p.slice(idx + 1) };
}

/**
 * In-memory DocStore with Firestore-like semantics. Transactions are serialized through a
 * promise queue, which gives serializable isolation (stronger than needed, deterministic in tests).
 * Optional JSON persistence for the local dev server.
 */
export class MemoryStore implements DocStore {
  private cols = new Map<string, Map<string, Row>>();
  private queue: Promise<unknown> = Promise.resolve();
  private persistTimer: NodeJS.Timeout | null = null;

  constructor(private readonly persistFile?: string) {
    if (persistFile && fs.existsSync(persistFile)) {
      const raw = JSON.parse(fs.readFileSync(persistFile, 'utf8')) as Record<
        string,
        Record<string, Row>
      >;
      for (const [col, docs] of Object.entries(raw)) {
        const m = new Map<string, Row>();
        for (const [id, row] of Object.entries(docs)) {
          if (typeof row.expireAt === 'string') row.expireAt = new Date(row.expireAt);
          m.set(id, row);
        }
        this.cols.set(col, m);
      }
    }
  }

  private schedulePersist() {
    if (!this.persistFile || this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      this.flush();
    }, 300);
  }

  flush() {
    if (!this.persistFile) return;
    const out: Record<string, Record<string, Row>> = {};
    for (const [col, docs] of this.cols) out[col] = Object.fromEntries(docs);
    fs.mkdirSync(path.dirname(this.persistFile), { recursive: true });
    fs.writeFileSync(this.persistFile, JSON.stringify(out));
  }

  private col(name: string): Map<string, Row> {
    let c = this.cols.get(name);
    if (!c) {
      c = new Map();
      this.cols.set(name, c);
    }
    return c;
  }

  private read<T>(p: string): Doc<T> | null {
    const { col, id } = splitPath(p);
    const row = this.cols.get(col)?.get(id);
    return row ? (clone({ ...row, id }) as Doc<T>) : null;
  }

  private write(p: string, data: Input, mode: 'set' | 'merge' | 'create' | 'update') {
    const { col, id } = splitPath(p);
    const c = this.col(col);
    const existing = c.get(id);
    const clean = clone(data) as Row;
    delete clean.id;
    if (mode === 'create') {
      if (existing) throw new StoreConflictError(p);
      c.set(id, clean);
    } else if (mode === 'update') {
      if (!existing) throw new StoreNotFoundError(p);
      c.set(id, applyUpdate(existing, clean));
    } else if (mode === 'merge') {
      c.set(id, existing ? deepMerge(existing, clean) : clean);
    } else c.set(id, clean);
    this.schedulePersist();
  }

  private runQuery<T>(q: QuerySpec): Doc<T>[] {
    let rows: Array<Row & { id: string }> = [];
    if (q.group) {
      for (const [name, docs] of this.cols) {
        const last = name.split('/').pop();
        if (last === q.collection && name.includes('/')) {
          for (const [id, r] of docs) rows.push({ ...r, id });
        }
      }
    } else {
      for (const [id, r] of this.cols.get(q.collection) ?? []) rows.push({ ...r, id });
    }
    for (const w of q.where ?? []) rows = rows.filter((r) => matches(r, w));
    const order = q.orderBy ?? [];
    if (order.length) {
      rows.sort((a, b) => {
        for (const [f, dir] of order) {
          const c = cmp(getField(a, f), getField(b, f));
          if (c !== 0) return dir === 'asc' ? c : -c;
        }
        return a.id < b.id ? -1 : 1;
      });
    }
    if (q.limit !== undefined) rows = rows.slice(0, q.limit);
    return clone(rows) as Doc<T>[];
  }

  async get<T>(p: string) {
    return this.read<T>(p);
  }
  async getMany<T>(paths: string[]) {
    return paths.map((p) => this.read<T>(p));
  }
  async query<T>(q: QuerySpec) {
    return this.runQuery<T>(q);
  }
  async set(p: string, data: Input, opts?: { merge?: boolean }) {
    this.write(p, data, opts?.merge ? 'merge' : 'set');
  }
  async create(p: string, data: Input) {
    this.write(p, data, 'create');
  }
  async update(p: string, data: Input) {
    this.write(p, data, 'update');
  }
  async delete(p: string) {
    const { col, id } = splitPath(p);
    this.cols.get(col)?.delete(id);
    this.schedulePersist();
  }
  async increment(p: string, field: string, by: number) {
    const cur = this.read<Row>(p);
    const prev = cur ? Number(getField(cur, field) ?? 0) : 0;
    this.write(p, { [field]: prev + by }, cur ? 'update' : 'merge');
  }
  newId() {
    return randomBytes(10).toString('base64url').replace(/[-_]/g, 'x').slice(0, 20);
  }
  async batchSet(items: Array<{ path: string; data: Input; merge?: boolean }>) {
    for (const it of items) this.write(it.path, it.data, it.merge ? 'merge' : 'set');
  }

  runTransaction<R>(fn: (tx: TxOps) => Promise<R>): Promise<R> {
    const run = async () => {
      const writes: Array<() => void> = [];
      const tx: TxOps = {
        get: async <T>(p: string) => this.read<T>(p),
        query: async <T>(q: QuerySpec) => this.runQuery<T>(q),
        set: (p, d, o) => writes.push(() => this.write(p, d, o?.merge ? 'merge' : 'set')),
        create: (p, d) => {
          // Fail fast like Firestore would at commit.
          if (this.read(p)) throw new StoreConflictError(p);
          writes.push(() => this.write(p, d, 'create'));
        },
        update: (p, d) => {
          if (!this.read(p)) throw new StoreNotFoundError(p);
          writes.push(() => this.write(p, d, 'update'));
        },
      };
      const result = await fn(tx);
      for (const w of writes) w();
      return result;
    };
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => undefined);
    return next;
  }
}
