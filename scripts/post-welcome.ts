// Post a one-time welcome / how-to-use card to the #leetcode channel, as the bot.
// Usage:  npm run welcome                 (uses ANNOUNCE_CHANNEL_ID from .dev.vars/env)
//         npm run welcome -- <channelId>  (explicit channel)
// Reads DISCORD_BOT_TOKEN from .dev.vars or the environment.

import { readFileSync } from "node:fs";

function loadDevVars(): Record<string, string> {
  const env: Record<string, string> = { ...process.env } as Record<string, string>;
  try {
    const text: string = readFileSync(".dev.vars", "utf8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim();
      if (!(key in process.env)) env[key] = val;
    }
  } catch {
    /* rely on process.env */
  }
  return env;
}

const embed = {
  title: "🧩 LeetCode Accountability Bot",
  description:
    "Link your LeetCode account and this channel keeps you honest: every problem you solve gets announced here, " +
    "and each week there's a leaderboard showing who hit their goal.\n\n" +
    "**Get started (2 steps):**\n" +
    "1. `/link username:<your-leetcode-username>` — starts tracking now (past solves don't count)\n" +
    "2. `/setgoal count:7` — set your weekly target\n\n" +
    "Then just grind — solves appear here within ~15 min. 🔥",
  color: 0x5865f2,
  fields: [
    {
      name: "Commands",
      value:
        "`/link` — link your account\n" +
        "`/setgoal` — set your weekly goal\n" +
        "`/stats [member]` — totals since linking + this week\n" +
        "`/leaderboard` — this week's standings\n" +
        "`/committed` — everyone tracked + their totals\n" +
        "`/unlink` — stop tracking",
    },
    {
      name: "Heads up",
      value:
        "Your LeetCode recent submissions must be visible (they're public by default). " +
        "`/link` will warn you if it can't see them.",
    },
  ],
  footer: { text: "New week, fresh start every Monday." },
};

async function main() {
  const env = loadDevVars();
  const token = env.DISCORD_BOT_TOKEN;
  const channelId = process.argv[2] || env.ANNOUNCE_CHANNEL_ID;
  if (!token) {
    console.error("Missing DISCORD_BOT_TOKEN (set it in .dev.vars or the environment).");
    process.exit(1);
  }
  if (!channelId) {
    console.error("No channel id. Pass one: npm run welcome -- <channelId>  (or set ANNOUNCE_CHANNEL_ID).");
    process.exit(1);
  }

  const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bot ${token}` },
    body: JSON.stringify({ embeds: [embed], allowed_mentions: { parse: [] } }),
  });

  if (!res.ok) {
    console.error(`Failed to post: ${res.status}\n${await res.text()}`);
    process.exit(1);
  }
  console.log(`✅ Posted welcome card to channel ${channelId}. Pin it so members can always find it.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
