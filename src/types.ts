// Shared types for the Worker.

export interface Env {
  DB: D1Database;
  // secrets (wrangler secret put)
  DISCORD_PUBLIC_KEY: string;
  DISCORD_BOT_TOKEN: string;
  DISCORD_APPLICATION_ID: string;
  // vars (wrangler.toml [vars])
  GUILD_ID: string;
  ANNOUNCE_CHANNEL_ID: string;
  SUMMARY_CHANNEL_ID: string;
}

export interface Member {
  discord_user_id: string;
  guild_id: string | null;
  leetcode_username: string;
  linked_at: number;
  base_all: number;
  base_easy: number;
  base_medium: number;
  base_hard: number;
  weekly_goal: number | null;
  last_seen_ts: number;
  active: number;
}

export interface ProblemMeta {
  title_slug: string;
  difficulty: string;
  frontend_id: string;
  title: string;
}

export interface DifficultyBreakdown {
  total: number;
  easy: number;
  medium: number;
  hard: number;
}

// The weekly summary cron expression (must match wrangler.toml). The poll job is
// everything else, so we only need to recognize this one.
export const WEEKLY_CRON = "0 13 * * 1";

// LeetCode difficulty -> emoji for announcements.
export const DIFF_EMOJI: Record<string, string> = {
  Easy: "🟢",
  Medium: "🟡",
  Hard: "🔴",
  Unknown: "⚪",
};
