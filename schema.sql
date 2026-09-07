-- KIG LeetCode bot — D1 schema.
-- Apply with:  npm run db:init         (remote)
--              npm run db:init:local   (local dev)

CREATE TABLE IF NOT EXISTS members (
  discord_user_id   TEXT PRIMARY KEY,
  guild_id          TEXT,
  leetcode_username TEXT NOT NULL,
  linked_at         INTEGER NOT NULL,       -- unix seconds
  -- cumulative solved counts snapshotted at link time (reference / integrity backstop)
  base_all          INTEGER NOT NULL DEFAULT 0,
  base_easy         INTEGER NOT NULL DEFAULT 0,
  base_medium       INTEGER NOT NULL DEFAULT 0,
  base_hard         INTEGER NOT NULL DEFAULT 0,
  weekly_goal       INTEGER,                -- null = no goal set
  last_seen_ts      INTEGER NOT NULL DEFAULT 0, -- newest submission timestamp already processed
  active            INTEGER NOT NULL DEFAULT 1
);

-- One row per accepted submission observed AFTER linking. Source of truth for all counts.
-- Dedup is by submission_id (PK); weekly/total uniqueness is computed with DISTINCT title_slug.
CREATE TABLE IF NOT EXISTS solves (
  submission_id   TEXT PRIMARY KEY,
  discord_user_id TEXT NOT NULL,
  title_slug      TEXT NOT NULL,
  title           TEXT,
  difficulty      TEXT,                     -- Easy | Medium | Hard | Unknown
  solved_at       INTEGER NOT NULL,         -- unix seconds
  week_key        TEXT NOT NULL,            -- ISO week in ET, e.g. "2026-W37"
  announced       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_solves_user_week ON solves(discord_user_id, week_key);
CREATE INDEX IF NOT EXISTS idx_solves_user ON solves(discord_user_id);

-- Difficulty cache so we only look up each problem once.
CREATE TABLE IF NOT EXISTS problem_meta (
  title_slug  TEXT PRIMARY KEY,
  difficulty  TEXT,
  frontend_id TEXT,
  title       TEXT
);

-- Snapshot of each finalized week (drives history + the future streak-of-weeks feature).
CREATE TABLE IF NOT EXISTS weekly_summary (
  week_key        TEXT NOT NULL,
  discord_user_id TEXT NOT NULL,
  unique_count    INTEGER NOT NULL,
  goal            INTEGER,
  met             INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (week_key, discord_user_id)
);
