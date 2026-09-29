import fs from 'node:fs';
import path from 'node:path';
import {
  InMemoryStore,
  applyUpdate,
  clone,
  cmp,
  deepMerge,
  getField,
  matches,
  splitPath,
} from './helpers';
import type { Data } from './types';

export { InMemoryStore, applyUpdate, clone, cmp, deepMerge, getField, matches, splitPath };

/**
 * In-memory DocStore with optional JSON file persistence for local dev.
 */
export class MemoryStore extends InMemoryStore {
  private persistTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly persistFile?: string,
    initialData?: Record<string, Record<string, Data>>,
  ) {
    super(initialData);
    if (!initialData && persistFile && fs.existsSync(persistFile)) {
      const raw = JSON.parse(fs.readFileSync(persistFile, 'utf8')) as Record<
        string,
        Record<string, Data>
      >;
      this.loadSnapshot(raw);
    }
  }

  protected override onMutate(): void {
    if (!this.persistFile || this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      this.flush();
    }, 300);
  }

  flush() {
    if (!this.persistFile) return;
    const out: Record<string, Record<string, Data>> = {};
    for (const [col, docs] of this.cols) out[col] = Object.fromEntries(docs);
    fs.mkdirSync(path.dirname(this.persistFile), { recursive: true });
    fs.writeFileSync(this.persistFile, JSON.stringify(out));
  }
}
