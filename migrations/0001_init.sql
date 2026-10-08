-- Cloudflare D1 initial schema for Seylane Academy (آکادمی سیلانه)
-- Additive/idempotent only: safe to apply to an existing database. No table or row is dropped.

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

-- Shared optimistic-commit clock for atomic D1Store transactions across Worker isolates.
CREATE TABLE IF NOT EXISTS d1_tx_clock (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  version INTEGER NOT NULL,
  owner TEXT NOT NULL
);
INSERT OR IGNORE INTO d1_tx_clock (id, version, owner) VALUES (1, 0, '');

-- Short-lived, hashed rate-limit keys (only the caller's key hash is stored).
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL,
  reset_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rate_limits_reset_at ON rate_limits (reset_at);
