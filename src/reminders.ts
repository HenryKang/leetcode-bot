// Sunday reminder job: privately DM each member who is short of their weekly goal.

import { listActiveMembers, weeklyUniqueCount } from "./db.js";
import { sendDM } from "./discord.js";
import { currentWeekKey, formatDateET, nextResetDateLabel, nowSeconds } from "./week.js";
import type { Env } from "./types.js";

export interface ReminderSummary {
  behind: number; // members under their goal
  sent: number; // DMs delivered
  failed: number; // DMs that couldn't be delivered (DMs disabled, etc.)
}

/**
 * DM members who haven't hit their weekly goal yet. `onlyUserId` restricts to one
 * member (used for safe testing so we don't DM everyone off-schedule).
 */
export async function runReminders(env: Env, onlyUserId?: string): Promise<ReminderSummary> {
  const week = currentWeekKey();
  const today = formatDateET(nowSeconds()); // e.g. "Sunday, September 7"
  const resetDate = nextResetDateLabel(); // e.g. "Monday, September 8"
  const members = await listActiveMembers(env.DB);
  const out: ReminderSummary = { behind: 0, sent: 0, failed: 0 };

  for (const m of members) {
    if (onlyUserId && m.discord_user_id !== onlyUserId) continue;
    if (!m.weekly_goal || m.weekly_goal <= 0) continue; // no goal set -> nothing to chase
    const count = await weeklyUniqueCount(env.DB, m.discord_user_id, week);
    if (count >= m.weekly_goal) continue; // already hit it 🎉

    out.behind++;
    const remaining = m.weekly_goal - count;
    const msg =
      `⏰ **Weekly LeetCode check-in** — ${today}\n` +
      `You're at **${count}/${m.weekly_goal}** this week — **${remaining} more** to hit your goal ` +
      `before the week resets **${resetDate} at 12:00 AM ET**. Still time — go get 'em! 💪`;
    const ok = await sendDM(env, m.discord_user_id, msg);
    if (ok) out.sent++;
    else out.failed++;
  }

  console.log(`[reminders] behind=${out.behind} sent=${out.sent} failed=${out.failed}`);
  return out;
}
