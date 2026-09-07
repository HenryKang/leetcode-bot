// Slash-command routing + handlers.

import {
  deferEphemeral,
  editOriginalResponse,
  ephemeralReply,
  InteractionResponseType,
  InteractionType,
  mention,
} from "./discord.js";
import {
  deactivateMember,
  getMember,
  listActiveMembers,
  setGoal,
  statsSince,
  upsertMember,
  weeklyUniqueCount,
} from "./db.js";
import { getRecentSolves, getUserStats } from "./leetcode.js";
import { currentWeekKey, nowSeconds } from "./week.js";
import type { Env } from "./types.js";

// ---- Discord interaction payload shapes (only the fields we use) ----
interface CommandOption {
  name: string;
  type: number;
  value?: string | number;
}
interface Interaction {
  type: number;
  token: string;
  data?: { name: string; options?: CommandOption[] };
  member?: { user: { id: string; username: string } };
  user?: { id: string; username: string };
  guild_id?: string;
}

function invokerId(i: Interaction): string {
  return i.member?.user.id ?? i.user?.id ?? "";
}

function optString(i: Interaction, name: string): string | undefined {
  const o = i.data?.options?.find((o) => o.name === name);
  return o?.value as string | undefined;
}
function optInt(i: Interaction, name: string): number | undefined {
  const o = i.data?.options?.find((o) => o.name === name);
  return o?.value as number | undefined;
}

/**
 * Handle a verified interaction. Returns the immediate JSON response. For
 * commands that must call LeetCode, we return a deferred ACK and finish the work
 * on `ctx.waitUntil`.
 */
export async function handleInteraction(i: Interaction, env: Env, ctx: ExecutionContext) {
  if (i.type === InteractionType.PING) {
    return { type: InteractionResponseType.PONG };
  }
  if (i.type !== InteractionType.APPLICATION_COMMAND || !i.data) {
    return ephemeralReply("Unsupported interaction.");
  }

  switch (i.data.name) {
    case "link":
      // Needs a live LeetCode fetch -> defer, then edit the reply.
      ctx.waitUntil(doLink(i, env));
      return deferEphemeral();
    case "unlink":
      return handleUnlink(i, env);
    case "setgoal":
      return handleSetGoal(i, env);
    case "stats":
      return handleStats(i, env);
    case "committed":
      return handleCommitted(i, env);
    case "leaderboard":
      return handleLeaderboard(i, env);
    default:
      return ephemeralReply(`Unknown command: ${i.data.name}`);
  }
}

async function doLink(i: Interaction, env: Env): Promise<void> {
  const username = (optString(i, "username") ?? "").trim();
  const discordId = invokerId(i);
  if (!username) {
    await editOriginalResponse(env, i.token, "Please provide your LeetCode username.");
    return;
  }
  try {
    const stats = await getUserStats(username);
    if (!stats) {
      await editOriginalResponse(
        env,
        i.token,
        `No LeetCode user named **${username}** found. Double-check the exact username (not your display name).`
      );
      return;
    }
    // Set the start line: only solves newer than this are ever counted/announced.
    const recents = await getRecentSolves(stats.username, 20);
    const latestTs = recents.length ? Math.max(...recents.map((r) => r.timestamp)) : nowSeconds();

    await upsertMember(env.DB, {
      discordUserId: discordId,
      guildId: i.guild_id ?? env.GUILD_ID ?? null,
      leetcodeUsername: stats.username,
      linkedAt: nowSeconds(),
      baseAll: stats.all,
      baseEasy: stats.easy,
      baseMedium: stats.medium,
      baseHard: stats.hard,
      lastSeenTs: latestTs,
    });

    const hiddenWarning =
      recents.length === 0
        ? "\n\n⚠️ Your **recent submissions look hidden**. Turn on “Recent AC” visibility in LeetCode → Settings → Privacy, or your solves can't be announced or counted."
        : "";
    await editOriginalResponse(
      env,
      i.token,
      `✅ Linked to **${stats.username}**. Tracking starts **now** — only problems you solve from here on count. ` +
        `Set a weekly goal with \`/setgoal\`.${hiddenWarning}`
    );
  } catch (e) {
    console.log(`doLink error: ${e}`);
    await editOriginalResponse(
      env,
      i.token,
      "Something went wrong reaching LeetCode. Try again in a minute."
    );
  }
}

async function handleUnlink(i: Interaction, env: Env) {
  const ok = await deactivateMember(env.DB, invokerId(i));
  return ephemeralReply(
    ok ? "Unlinked. You're no longer being tracked." : "You weren't linked."
  );
}

async function handleSetGoal(i: Interaction, env: Env) {
  const goal = optInt(i, "count");
  if (goal === undefined || goal < 1) {
    return ephemeralReply("Give a weekly goal of at least 1, e.g. `/setgoal count:7`.");
  }
  const ok = await setGoal(env.DB, invokerId(i), goal);
  return ephemeralReply(
    ok
      ? `🎯 Weekly goal set to **${goal}** problem${goal === 1 ? "" : "s"}.`
      : "Link your LeetCode account first with `/link`."
  );
}

async function handleStats(i: Interaction, env: Env) {
  // Optional target user; defaults to the invoker.
  const target = optString(i, "member") ?? invokerId(i);
  const m = await getMember(env.DB, target);
  if (!m || m.active !== 1) {
    const who = target === invokerId(i) ? "You haven't" : "That member hasn't";
    return ephemeralReply(`${who} linked a LeetCode account.`);
  }
  const since = await statsSince(env.DB, m.discord_user_id);
  const week = await weeklyUniqueCount(env.DB, m.discord_user_id, currentWeekKey());
  const goalLine =
    m.weekly_goal && m.weekly_goal > 0
      ? `This week: **${week}/${m.weekly_goal}** ${week >= m.weekly_goal ? "✅" : "⏳"}`
      : `This week: **${week}** (no goal set)`;
  return ephemeralReply(
    `📊 **${m.leetcode_username}** — since linking\n` +
      `Total: **${since.total}**  🟢 ${since.easy}  🟡 ${since.medium}  🔴 ${since.hard}\n` +
      goalLine
  );
}

async function handleCommitted(i: Interaction, env: Env) {
  const members = await listActiveMembers(env.DB);
  if (members.length === 0) {
    return ephemeralReply("No one is linked yet. Be the first with `/link`!");
  }
  const lines: string[] = [];
  for (const m of members) {
    const s = await statsSince(env.DB, m.discord_user_id);
    lines.push(
      `${mention(m.discord_user_id)} — **${s.total}** (🟢 ${s.easy} 🟡 ${s.medium} 🔴 ${s.hard}) · \`${m.leetcode_username}\``
    );
  }
  return {
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content: `**Committed members (${members.length})** — problems solved since signing up:\n${lines.join("\n")}`,
      allowed_mentions: { parse: [] as string[] },
    },
  };
}

async function handleLeaderboard(i: Interaction, env: Env) {
  const week = currentWeekKey();
  const members = await listActiveMembers(env.DB);
  if (members.length === 0) {
    return ephemeralReply("No one is linked yet. Be the first with `/link`!");
  }
  const rows: { id: string; name: string; count: number; goal: number | null }[] = [];
  for (const m of members) {
    rows.push({
      id: m.discord_user_id,
      name: m.leetcode_username,
      count: await weeklyUniqueCount(env.DB, m.discord_user_id, week),
      goal: m.weekly_goal,
    });
  }
  rows.sort((a, b) => b.count - a.count);
  const body = rows
    .map((r, idx) => {
      const rank = ["🥇", "🥈", "🥉"][idx] ?? `${idx + 1}.`;
      const goal =
        r.goal && r.goal > 0 ? (r.count >= r.goal ? `✅ ${r.count}/${r.goal}` : `${r.count}/${r.goal}`) : `${r.count}`;
      return `${rank} ${mention(r.id)} — ${goal}`;
    })
    .join("\n");
  return {
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content: `📈 **This week's leaderboard** (unique problems)\n${body}`,
      allowed_mentions: { parse: [] as string[] },
    },
  };
}
