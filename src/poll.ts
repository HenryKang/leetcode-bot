// Poll job: for each active member, detect accepted submissions newer than what
// we've already processed, log them, and announce each new one.

import {
  getProblemMeta,
  insertSolveIfNew,
  listActiveMembers,
  memberSolvedSlugInWeek,
  updateLastSeen,
  upsertProblemMeta,
} from "./db.js";
import { getQuestionInfo, getRecentSolves, type RecentSolve } from "./leetcode.js";
import { mention, postMessage } from "./discord.js";
import { weekKeyForTs } from "./week.js";
import { DIFF_EMOJI, type Env, type Member, type ProblemMeta } from "./types.js";

async function resolveMeta(env: Env, s: RecentSolve): Promise<ProblemMeta> {
  const cached = await getProblemMeta(env.DB, s.titleSlug);
  if (cached) return cached;
  let meta: ProblemMeta = {
    title_slug: s.titleSlug,
    difficulty: "Unknown",
    frontend_id: "",
    title: s.title,
  };
  try {
    const info = await getQuestionInfo(s.titleSlug);
    if (info) {
      meta = {
        title_slug: s.titleSlug,
        difficulty: info.difficulty,
        frontend_id: info.frontendId,
        title: info.title || s.title,
      };
    }
  } catch (e) {
    console.log(`difficulty lookup failed for ${s.titleSlug}: ${e}`);
  }
  await upsertProblemMeta(env.DB, meta);
  return meta;
}

async function announce(env: Env, m: Member, s: RecentSolve, meta: ProblemMeta): Promise<void> {
  const emoji = DIFF_EMOJI[meta.difficulty] ?? DIFF_EMOJI.Unknown;
  const url = `https://leetcode.com/problems/${s.titleSlug}/`;
  const num = meta.frontend_id ? `#${meta.frontend_id} ` : "";
  await postMessage(env, env.ANNOUNCE_CHANNEL_ID, {
    content: `${emoji} ${mention(m.discord_user_id)} solved **${num}${meta.title}** (${meta.difficulty}) — <${url}>`,
  });
}

async function pollMember(env: Env, m: Member): Promise<number> {
  let announced = 0;
  const recents = await getRecentSolves(m.leetcode_username, 20);
  // Oldest first so announcements land in solve order and last_seen advances safely.
  recents.sort((a, b) => a.timestamp - b.timestamp);

  let maxTs = m.last_seen_ts;
  for (const s of recents) {
    if (s.timestamp <= m.last_seen_ts) continue; // already processed at/least this point
    const meta = await resolveMeta(env, s);
    const weekKey = weekKeyForTs(s.timestamp);
    // Is this the first solve of this problem in this week? If so, it adds to the
    // weekly distinct count and is worth announcing. Check BEFORE inserting.
    const alreadyThisWeek = await memberSolvedSlugInWeek(
      env.DB,
      m.discord_user_id,
      s.titleSlug,
      weekKey
    );
    const isNew = await insertSolveIfNew(env.DB, {
      submissionId: s.id,
      discordUserId: m.discord_user_id,
      titleSlug: s.titleSlug,
      title: meta.title,
      difficulty: meta.difficulty,
      solvedAt: s.timestamp,
      weekKey,
    });
    // Announce only genuinely-new submissions (dedup by submission_id) that also
    // add a new distinct problem to the week — so re-submits never re-announce.
    if (isNew && !alreadyThisWeek) {
      await announce(env, m, s, meta);
      announced++;
    }
    if (s.timestamp > maxTs) maxTs = s.timestamp;
  }
  if (maxTs > m.last_seen_ts) await updateLastSeen(env.DB, m.discord_user_id, maxTs);
  return announced;
}

export interface PollSummary {
  membersChecked: number;
  announced: number;
  errors: string[];
}

export async function runPoll(env: Env): Promise<PollSummary> {
  const members = await listActiveMembers(env.DB);
  const summary: PollSummary = { membersChecked: members.length, announced: 0, errors: [] };
  for (const m of members) {
    try {
      summary.announced += await pollMember(env, m);
    } catch (e) {
      const msg = `poll failed for ${m.leetcode_username}: ${e}`;
      console.log(msg);
      summary.errors.push(msg);
    }
  }
  console.log(
    `[poll] checked=${summary.membersChecked} announced=${summary.announced} errors=${summary.errors.length}`
  );
  return summary;
}
