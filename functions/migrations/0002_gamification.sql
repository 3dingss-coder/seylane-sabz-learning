-- PHASE-3 — موتور انگیزش (gamification) · relational mirror of the document collections
--
-- READ THIS FIRST: the running store is the document store in `src/store/*` (memory / Firestore /
-- D1 `docs`), so the services persist these shapes as documents at the paths listed below. This
-- file is the relational equivalent for a SQL-backed deployment, kept in sync with
-- `src/domain/types.ts`. Nothing in `src/` reads it — it is schema documentation you can apply,
-- not dead code the runtime depends on.
--
-- Document paths (runtime)          → table here
--   streaks/{userId}                → streaks
--   question_memory/{uid}_{qid}     → question_memory
--   mastery/{uid}_{pkg}             → mastery
--   coin_balance/{userId}           → coins
--   coin_ledger/{uid}_{reason}_{ref}→ coin_ledger
--   coin_redemptions/{id}           → coin_redemptions
--   quests/{uid}_{day}_{kind}       → quests
--   roleplay_approvals/{uid}_{pkg}  → roleplay_approvals

-- §3.2 پیوستگی. G-03: never surfaced to a manager or admin.
CREATE TABLE IF NOT EXISTS streaks (
  user_id             TEXT PRIMARY KEY,
  current             INTEGER NOT NULL DEFAULT 0,
  longest             INTEGER NOT NULL DEFAULT 0,
  -- re-based after a break, so repeated breaks keep ramping down instead of freezing at the old high
  peak                INTEGER NOT NULL DEFAULT 0,
  -- winnable back inside repair_until (بازگردانی); 0 when no window is open
  pending_peak        INTEGER NOT NULL DEFAULT 0,
  last_day            TEXT,                        -- YYYY-MM-DD, Asia/Tehran
  shields             INTEGER NOT NULL DEFAULT 0 CHECK (shields >= 0 AND shields <= 2),
  stations_since_shield INTEGER NOT NULL DEFAULT 0,
  repair_until        TEXT,
  on_leave_until      TEXT,
  leave_taken_at      TEXT,
  updated_at          TEXT NOT NULL
);

-- §3.4 مرور هوشمند (Half-Life Regression, simplified)
CREATE TABLE IF NOT EXISTS question_memory (
  user_id        TEXT NOT NULL,
  question_id    TEXT NOT NULL,
  quiz_id        TEXT NOT NULL,
  section_id     TEXT NOT NULL,
  package_id     TEXT NOT NULL,
  correct_streak INTEGER NOT NULL DEFAULT 0,
  half_life_days REAL NOT NULL DEFAULT 1.0 CHECK (half_life_days > 0 AND half_life_days <= 90),
  seen_count     INTEGER NOT NULL DEFAULT 0,
  last_seen_at   TEXT,
  next_review_at TEXT NOT NULL,
  -- §3.5 condition 3: a successful review at ≥30 and ≥90 days of age
  milestone30    INTEGER NOT NULL DEFAULT 0,
  milestone90    INTEGER NOT NULL DEFAULT 0,
  reviews_total  INTEGER NOT NULL DEFAULT 0,
  reviews_on_time INTEGER NOT NULL DEFAULT 0,
  updated_at     TEXT NOT NULL,
  PRIMARY KEY (user_id, question_id)
);
CREATE INDEX IF NOT EXISTS idx_question_memory_due ON question_memory (user_id, next_review_at);
CREATE INDEX IF NOT EXISTS idx_question_memory_pkg ON question_memory (user_id, package_id);

-- §3.5 استادی محصول — four conditions, all four required (G-07)
CREATE TABLE IF NOT EXISTS mastery (
  user_id       TEXT NOT NULL,
  package_id    TEXT NOT NULL,
  station_done  INTEGER NOT NULL DEFAULT 0,
  duel_80_count INTEGER NOT NULL DEFAULT 0,      -- ≥80% twice, ≥7 days apart
  duel_80_last_at TEXT,
  reviews_30    INTEGER NOT NULL DEFAULT 0,
  reviews_90    INTEGER NOT NULL DEFAULT 0,
  roleplay_ok   INTEGER NOT NULL DEFAULT 0,      -- human-approved, see roleplay_approvals
  mastered_at   TEXT,
  updated_at    TEXT NOT NULL,
  PRIMARY KEY (user_id, package_id)
);

-- §3.3 سکهٔ توانمندی — spendable, buys real fulfilment only (G-04)
CREATE TABLE IF NOT EXISTS coins (
  user_id    TEXT PRIMARY KEY,
  balance    INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  lifetime   INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS coin_ledger (
  id         TEXT PRIMARY KEY,                   -- {userId}_{reason}_{refId} ⇒ exactly-once award
  user_id    TEXT NOT NULL,
  amount     INTEGER NOT NULL,
  reason     TEXT NOT NULL,
  ref_id     TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_coin_ledger_user ON coin_ledger (user_id, created_at);

CREATE TABLE IF NOT EXISTS coin_redemptions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  code       TEXT NOT NULL,
  title      TEXT NOT NULL,
  price      INTEGER NOT NULL,
  -- never silent: the user and ops can always see a pending fulfilment (G-04)
  status     TEXT NOT NULL DEFAULT 'pending_fulfilment',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_coin_redemptions_user ON coin_redemptions (user_id, created_at);

-- §3.6 مأموریت امروز — three rows per user per day
CREATE TABLE IF NOT EXISTS quests (
  user_id     TEXT NOT NULL,
  day         TEXT NOT NULL,                     -- YYYY-MM-DD, Asia/Tehran
  kind        TEXT NOT NULL,                     -- stations | perfect_duel | reviews | roleplay
  title       TEXT NOT NULL,
  progress    INTEGER NOT NULL DEFAULT 0,
  target      INTEGER NOT NULL,
  coin_reward INTEGER NOT NULL DEFAULT 0,
  done_at     TEXT,
  chest       TEXT,                              -- bronze | silver | gold
  chest_coins INTEGER NOT NULL DEFAULT 0,
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (user_id, day, kind)
);

-- §3.5 condition 4 — a recorded roleplay approved by a human (AC-04: never automatic)
CREATE TABLE IF NOT EXISTS roleplay_approvals (
  user_id     TEXT NOT NULL,
  package_id  TEXT NOT NULL,
  approved_by TEXT NOT NULL,
  approved_at TEXT NOT NULL,
  PRIMARY KEY (user_id, package_id)
);
