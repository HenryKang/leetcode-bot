// Weekly summary job: post a leaderboard for the week that just ended and persist
// a weekly_summary row per member (for history + the future streak feature).

import { listActiveMembers, saveWeeklySummary, weeklyUniqueCount } from "./db.js";
import { mention, postMessage } from "./discord.js";
import { endedWeekKey, weekLabel } from "./week.js";
import type { Env } from "./types.js";

export async function runWeeklySummary(env: Env, weekOverride?: string): Promise<void> {
  const weekKey = weekOverride ?? endedWeekKey();
  const members = await listActiveMembers(env.DB);

  const rows: { id: string; name: string; count: number; goal: number | null; met: boolean }[] = [];
  for (const m of members) {
    const count = await weeklyUniqueCount(env.DB, m.discord_user_id, weekKey);
    const goal = m.weekly_goal;
    const met = !!goal && goal > 0 && count >= goal;
    rows.push({ id: m.discord_user_id, name: m.leetcode_username, count, goal, met });
    await saveWeeklySummary(env.DB, weekKey, m.discord_user_id, count, goal, met);
  }

  rows.sort((a, b) => b.count - a.count);

  const header = `🏁 **${weekLabel(weekKey)} — weekly recap**\n_Distinct LeetCode problems solved this week._\n`;
  let body: string;
  if (rows.length === 0) {
    body = "No one is linked yet. Run `/link` to join the accountability board!";
  } else {
    const metCount = rows.filter((r) => r.met).length;
    const withGoal = rows.filter((r) => r.goal && r.goal > 0).length;
    const lines = rows.map((r, idx) => {
      const rank = ["🥇", "🥈", "🥉"][idx] ?? `**${idx + 1}.**`;
      let goalTag: string;
      if (r.goal && r.goal > 0) {
        goalTag = r.met ? `✅ ${r.count}/${r.goal}` : `❌ ${r.count}/${r.goal}`;
      } else {
        goalTag = `${r.count} (no goal)`;
      }
      return `${rank} ${mention(r.id)} — ${goalTag}`;
    });
    const footer =
      withGoal > 0
        ? `\n\n**${metCount}/${withGoal}** hit their goal this week. New week, fresh start — keep the streak going! 🔥`
        : "";
    body = lines.join("\n") + footer;
  }

  await postMessage(env, env.SUMMARY_CHANNEL_ID, { content: header + body });
}
