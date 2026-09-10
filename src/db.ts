// D1 query helpers. All SQL lives here.

import type { DifficultyBreakdown, Member, ProblemMeta } from "./types.js";

export async function getMember(db: D1Database, discordUserId: string): Promise<Member | null> {
  return db
    .prepare("SELECT * FROM members WHERE discord_user_id = ?")
    .bind(discordUserId)
    .first<Member>();
}

export async function listActiveMembers(db: D1Database): Promise<Member[]> {
  const res = await db
    .prepare("SELECT * FROM members WHERE active = 1")
    .all<Member>();
  return res.results ?? [];
}

export interface LinkInput {
  discordUserId: string;
  guildId: string | null;
  leetcodeUsername: string;
  linkedAt: number;
  baseAll: number;
  baseEasy: number;
  baseMedium: number;
  baseHard: number;
  lastSeenTs: number;
}

/** Insert or re-link a member. Preserves an existing weekly_goal on re-link. */
export async function upsertMember(db: D1Database, m: LinkInput): Promise<void> {
  await db
    .prepare(
      `INSERT INTO members
         (discord_user_id, guild_id, leetcode_username, linked_at,
          base_all, base_easy, base_medium, base_hard, last_seen_ts, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
       ON CONFLICT(discord_user_id) DO UPDATE SET
         guild_id = excluded.guild_id,
         leetcode_username = excluded.leetcode_username,
         linked_at = excluded.linked_at,
         base_all = excluded.base_all,
         base_easy = excluded.base_easy,
         base_medium = excluded.base_medium,
         base_hard = excluded.base_hard,
         last_seen_ts = excluded.last_seen_ts,
         active = 1`
    )
    .bind(
      m.discordUserId,
      m.guildId,
      m.leetcodeUsername,
      m.linkedAt,
      m.baseAll,
      m.baseEasy,
      m.baseMedium,
      m.baseHard,
      m.lastSeenTs
    )
    .run();
}

export async function deactivateMember(db: D1Database, discordUserId: string): Promise<boolean> {
  const res = await db
    .prepare("UPDATE members SET active = 0 WHERE discord_user_id = ?")
    .bind(discordUserId)
    .run();
  return (res.meta.changes ?? 0) > 0;
}

export async function setGoal(db: D1Database, discordUserId: string, goal: number): Promise<boolean> {
  const res = await db
    .prepare("UPDATE members SET weekly_goal = ? WHERE discord_user_id = ? AND active = 1")
    .bind(goal, discordUserId)
    .run();
  return (res.meta.changes ?? 0) > 0;
}

export async function updateLastSeen(db: D1Database, discordUserId: string, ts: number): Promise<void> {
  await db
    .prepare("UPDATE members SET last_seen_ts = ? WHERE discord_user_id = ?")
    .bind(ts, discordUserId)
    .run();
}

export async function getProblemMeta(db: D1Database, slug: string): Promise<ProblemMeta | null> {
  return db
    .prepare("SELECT * FROM problem_meta WHERE title_slug = ?")
    .bind(slug)
    .first<ProblemMeta>();
}

export async function upsertProblemMeta(db: D1Database, meta: ProblemMeta): Promise<void> {
  await db
    .prepare(
      `INSERT INTO problem_meta (title_slug, difficulty, frontend_id, title)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(title_slug) DO UPDATE SET
         difficulty = excluded.difficulty,
         frontend_id = excluded.frontend_id,
         title = excluded.title`
    )
    .bind(meta.title_slug, meta.difficulty, meta.frontend_id, meta.title)
    .run();
}

export interface SolveInput {
  submissionId: string;
  discordUserId: string;
  titleSlug: string;
  title: string;
  difficulty: string;
  solvedAt: number;
  weekKey: string;
}

/** Insert a solve; returns true only if it was new (dedup by submission_id). */
export async function insertSolveIfNew(db: D1Database, s: SolveInput): Promise<boolean> {
  const res = await db
    .prepare(
      `INSERT OR IGNORE INTO solves
         (submission_id, discord_user_id, title_slug, title, difficulty, solved_at, week_key, announced)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`
    )
    .bind(
      s.submissionId,
      s.discordUserId,
      s.titleSlug,
      s.title,
      s.difficulty,
      s.solvedAt,
      s.weekKey
    )
    .run();
  return (res.meta.changes ?? 0) > 0;
}

/** True if the member already has a solve of this problem in the given week. */
export async function memberSolvedSlugInWeek(
  db: D1Database,
  discordUserId: string,
  titleSlug: string,
  weekKey: string
): Promise<boolean> {
  const row = await db
    .prepare(
      "SELECT 1 FROM solves WHERE discord_user_id = ? AND title_slug = ? AND week_key = ? LIMIT 1"
    )
    .bind(discordUserId, titleSlug, weekKey)
    .first();
  return !!row;
}

/** Distinct problems a member solved within a given week. */
export async function weeklyUniqueCount(
  db: D1Database,
  discordUserId: string,
  weekKey: string
): Promise<number> {
  const row = await db
    .prepare(
      "SELECT COUNT(DISTINCT title_slug) AS c FROM solves WHERE discord_user_id = ? AND week_key = ?"
    )
    .bind(discordUserId, weekKey)
    .first<{ c: number }>();
  return row?.c ?? 0;
}

/** Distinct problems a member solved within a unix time range [startTs, endTs). */
export async function rangeUniqueCount(
  db: D1Database,
  discordUserId: string,
  startTs: number,
  endTs: number
): Promise<number> {
  const row = await db
    .prepare(
      "SELECT COUNT(DISTINCT title_slug) AS c FROM solves WHERE discord_user_id = ? AND solved_at >= ? AND solved_at < ?"
    )
    .bind(discordUserId, startTs, endTs)
    .first<{ c: number }>();
  return row?.c ?? 0;
}

/** Distinct problems solved since linking, broken down by difficulty. */
export async function statsSince(db: D1Database, discordUserId: string): Promise<DifficultyBreakdown> {
  const res = await db
    .prepare(
      `SELECT difficulty, COUNT(DISTINCT title_slug) AS c
         FROM solves WHERE discord_user_id = ? GROUP BY difficulty`
    )
    .bind(discordUserId)
    .all<{ difficulty: string; c: number }>();
  const out: DifficultyBreakdown = { total: 0, easy: 0, medium: 0, hard: 0 };
  for (const r of res.results ?? []) {
    if (r.difficulty === "Easy") out.easy = r.c;
    else if (r.difficulty === "Medium") out.medium = r.c;
    else if (r.difficulty === "Hard") out.hard = r.c;
    out.total += r.c;
  }
  return out;
}

export async function getJobState(db: D1Database, jobName: string): Promise<string | null> {
  const row = await db
    .prepare("SELECT last_key FROM job_state WHERE job_name = ?")
    .bind(jobName)
    .first<{ last_key: string }>();
  return row?.last_key ?? null;
}

export async function setJobState(db: D1Database, jobName: string, lastKey: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO job_state (job_name, last_key) VALUES (?, ?)
       ON CONFLICT(job_name) DO UPDATE SET last_key = excluded.last_key`
    )
    .bind(jobName, lastKey)
    .run();
}

export async function saveWeeklySummary(
  db: D1Database,
  weekKey: string,
  discordUserId: string,
  uniqueCount: number,
  goal: number | null,
  met: boolean
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO weekly_summary (week_key, discord_user_id, unique_count, goal, met)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(week_key, discord_user_id) DO UPDATE SET
         unique_count = excluded.unique_count,
         goal = excluded.goal,
         met = excluded.met`
    )
    .bind(weekKey, discordUserId, uniqueCount, goal, met ? 1 : 0)
    .run();
}
