// Daily summary job: post a public recap of problems solved on the day that just
// ended (ET), listing every active member — including those who solved nothing.

import { listActiveMembers, rangeUniqueCount } from "./db.js";
import { mention, postMessage } from "./discord.js";
import { previousEtDayRange, type DayRange } from "./week.js";
import type { Env } from "./types.js";

export interface DailySummary {
  day: string;
  members: number;
  totalSolved: number;
}

/**
 * Post the daily recap. `dayOverride` (a DayRange) is for testing a specific day;
 * by default it summarizes the ET day that just ended.
 */
export async function runDailySummary(env: Env, dayOverride?: DayRange): Promise<DailySummary> {
  const day = dayOverride ?? previousEtDayRange();
  const members = await listActiveMembers(env.DB);

  const rows: { id: string; count: number }[] = [];
  for (const m of members) {
    rows.push({
      id: m.discord_user_id,
      count: await rangeUniqueCount(env.DB, m.discord_user_id, day.startTs, day.endTs),
    });
  }
  // Solvers first (desc), then the zeros.
  rows.sort((a, b) => b.count - a.count);

  const total = rows.reduce((s, r) => s + r.count, 0);
  const header = `📅 **Daily recap — ${day.label}**\n_Problems solved today._\n`;

  let body: string;
  if (rows.length === 0) {
    body = "No one is linked yet. Run `/link` to join!";
  } else {
    const lines = rows.map((r) =>
      r.count > 0
        ? `✅ ${mention(r.id)} — **${r.count}**`
        : `😴 ${mention(r.id)} — 0`
    );
    const solvers = rows.filter((r) => r.count > 0).length;
    body =
      lines.join("\n") +
      `\n\n**${solvers}/${rows.length}** solved something today · **${total}** total.`;
  }

  await postMessage(env, env.ANNOUNCE_CHANNEL_ID, { content: header + body });
  return { day: day.label, members: rows.length, totalSolved: total };
}
