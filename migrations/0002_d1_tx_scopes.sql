-- Additive per-scope optimistic-commit clocks for independent D1 transactions.
-- Existing global transactions continue to use d1_tx_clock; no existing data is rewritten.
CREATE TABLE IF NOT EXISTS d1_tx_scopes (
  scope TEXT PRIMARY KEY,
  version INTEGER NOT NULL DEFAULT 0,
  owner TEXT NOT NULL DEFAULT ''
);
