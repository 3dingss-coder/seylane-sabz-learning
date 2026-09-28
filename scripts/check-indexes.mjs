#!/usr/bin/env node
/**
 * Verifies that every query shape issued by the test-suite that needs a Firestore composite
 * index is declared in firestore.indexes.json (the emulator does not enforce indexes).
 *
 *   npm run check:indexes -w functions
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const logFile = process.argv[2] ?? path.join(root, 'functions', '.query-log.jsonl');
const { indexes } = JSON.parse(fs.readFileSync(path.join(root, 'firestore.indexes.json'), 'utf8'));
const EQ = new Set(['==', 'in', 'array-contains']);

const shapes = new Map();
for (const line of fs.readFileSync(logFile, 'utf8').split('\n')) {
  if (!line.trim()) continue;
  const s = JSON.parse(line);
  shapes.set(JSON.stringify(s), s);
}

/** Returns the required index fields or null when single-field indexes suffice. */
function required(s) {
  const eq = [...new Set(s.where.filter(([, op]) => EQ.has(op)).map(([f]) => f))];
  const ranges = [...new Set(s.where.filter(([, op]) => !EQ.has(op)).map(([f]) => f))];
  const order = s.orderBy.map(([f, dir]) => ({ f, dir }));
  const tail = [...order];
  for (const r of ranges) if (!tail.some((o) => o.f === r)) tail.unshift({ f: r, dir: null });
  if (tail.length === 0) return null; // equality only → index merging
  const eqOnly = eq.filter((f) => !tail.some((t) => t.f === f));
  if (eqOnly.length === 0 && tail.length === 1) return null; // single field
  return { eq: eqOnly, tail };
}

function matches(idx, req) {
  const fields = idx.fields;
  if (fields.length !== req.eq.length + req.tail.length) return false;
  const prefix = fields
    .slice(0, req.eq.length)
    .map((f) => f.fieldPath)
    .sort();
  if (JSON.stringify(prefix) !== JSON.stringify([...req.eq].sort())) return false;
  const rest = fields.slice(req.eq.length);
  const dirOf = (f) =>
    f.order === 'DESCENDING' ? 'desc' : f.order === 'ASCENDING' ? 'asc' : 'array';
  const same = rest.every(
    (f, i) =>
      f.fieldPath === req.tail[i].f && (req.tail[i].dir === null || dirOf(f) === req.tail[i].dir),
  );
  const reversed = rest.every(
    (f, i) =>
      f.fieldPath === req.tail[i].f &&
      (req.tail[i].dir === null || dirOf(f) === (req.tail[i].dir === 'asc' ? 'desc' : 'asc')),
  );
  return same || reversed;
}

const missing = [];
for (const s of shapes.values()) {
  const req = required(s);
  if (!req) continue;
  const ok = indexes.some((i) => i.collectionGroup === s.collection && matches(i, req));
  if (!ok)
    missing.push({
      collection: s.collection,
      fields: [
        ...req.eq.map((f) => `${f} ==`),
        ...req.tail.map((t) => `${t.f} ${t.dir ?? 'range'}`),
      ],
    });
}
console.log(`query shapes: ${shapes.size}, composite-index misses: ${missing.length}`);
for (const m of missing) console.log(`  ✗ ${m.collection}: ${m.fields.join(', ')}`);
process.exit(missing.length ? 1 : 0);
