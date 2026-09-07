// One-time (re-run on change) registration of guild slash commands.
// Usage: npm run register
// Reads DISCORD_APPLICATION_ID, DISCORD_BOT_TOKEN, GUILD_ID from the environment
// or from a local .dev.vars file (KEY=VALUE per line).

import { readFileSync } from "node:fs";

function loadDevVars(): Record<string, string> {
  const env: Record<string, string> = { ...process.env } as Record<string, string>;
  try {
    // Run via `npm run register`, so cwd is the project root.
    const text: string = readFileSync(".dev.vars", "utf8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim();
      if (!(key in process.env)) env[key] = val; // real env wins
    }
  } catch {
    // no .dev.vars — rely on process.env
  }
  return env;
}

const STRING = 3;
const INTEGER = 4;
const USER = 6;

const commands = [
  {
    name: "link",
    description: "Link your LeetCode account. Tracking starts now (past solves are ignored).",
    options: [
      { name: "username", description: "Your exact LeetCode username", type: STRING, required: true },
    ],
  },
  {
    name: "unlink",
    description: "Stop tracking your LeetCode activity.",
  },
  {
    name: "setgoal",
    description: "Set your weekly target of problems to solve.",
    options: [
      { name: "count", description: "Problems per week (e.g. 7)", type: INTEGER, required: true, min_value: 1 },
    ],
  },
  {
    name: "stats",
    description: "Show problems solved since linking (yours, or another member's).",
    options: [
      { name: "member", description: "Member to look up (defaults to you)", type: USER, required: false },
    ],
  },
  {
    name: "committed",
    description: "List everyone tracked and how many problems they've solved since signing up.",
  },
  {
    name: "leaderboard",
    description: "Show this week's leaderboard of unique problems solved.",
  },
  {
    name: "health",
    description: "Check each linked member: is their LeetCode feed visible and being tracked?",
  },
];

async function main() {
  const env = loadDevVars();
  const appId = env.DISCORD_APPLICATION_ID;
  const token = env.DISCORD_BOT_TOKEN;
  const guildId = env.GUILD_ID;
  if (!appId || !token || !guildId) {
    console.error(
      "Missing DISCORD_APPLICATION_ID, DISCORD_BOT_TOKEN, or GUILD_ID (set in .dev.vars or env)."
    );
    process.exit(1);
  }

  // Guild commands register instantly (global commands can take up to an hour).
  const url = `https://discord.com/api/v10/applications/${appId}/guilds/${guildId}/commands`;
  const res = await fetch(url, {
    method: "PUT", // bulk overwrite
    headers: { "Content-Type": "application/json", Authorization: `Bot ${token}` },
    body: JSON.stringify(commands),
  });

  if (!res.ok) {
    console.error(`Registration failed: ${res.status}\n${await res.text()}`);
    process.exit(1);
  }
  const data = (await res.json()) as { name: string }[];
  console.log(`✅ Registered ${data.length} commands in guild ${guildId}:`);
  console.log(data.map((c) => `   /${c.name}`).join("\n"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
