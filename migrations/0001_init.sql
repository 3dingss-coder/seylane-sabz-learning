-- Cloudflare D1 initial schema for Seylane Academy (آکادمی سیلانه)
-- Automatically applied by D1Store on first request, and also available for `wrangler d1 migrations apply`.

CREATE TABLE IF NOT EXISTS docs (
  col TEXT NOT NULL,
  id TEXT NOT NULL,
  grp TEXT NOT NULL,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (col, id)
);

CREATE INDEX IF NOT EXISTS idx_docs_grp ON docs (grp);

CREATE TABLE IF NOT EXISTS blobs (
  path TEXT PRIMARY KEY,
  content_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  chunk_count INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS blob_chunks (
  path TEXT NOT NULL,
  idx INTEGER NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY (path, idx)
);
