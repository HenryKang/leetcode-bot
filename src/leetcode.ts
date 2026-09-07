// LeetCode GraphQL client — the ONLY surface that touches the unofficial API.
// Everything here fails soft (throws on transport/GraphQL errors; callers catch).

const ENDPOINT = "https://leetcode.com/graphql";
const UA =
  "Mozilla/5.0 (compatible; KIG-LeetCode-Bot/1.0; +https://github.com/HenryKang/kig-leetcode-bot)";

async function gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": UA,
      Referer: "https://leetcode.com",
      Origin: "https://leetcode.com",
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`LeetCode HTTP ${res.status}`);
  const json = (await res.json()) as { data?: T; errors?: unknown };
  if (json.errors) throw new Error(`LeetCode GraphQL error: ${JSON.stringify(json.errors)}`);
  if (!json.data) throw new Error("LeetCode: empty data");
  return json.data;
}

export interface UserStats {
  username: string; // canonical casing from LeetCode
  all: number;
  easy: number;
  medium: number;
  hard: number;
}

/** Cumulative solved counts by difficulty. Returns null if the user does not exist. */
export async function getUserStats(username: string): Promise<UserStats | null> {
  const data = await gql<{
    matchedUser: {
      username: string;
      submitStatsGlobal: { acSubmissionNum: { difficulty: string; count: number }[] };
    } | null;
  }>(
    `query stats($u: String!) {
       matchedUser(username: $u) {
         username
         submitStatsGlobal { acSubmissionNum { difficulty count } }
       }
     }`,
    { u: username }
  );
  const mu = data.matchedUser;
  if (!mu) return null;
  const nums = mu.submitStatsGlobal.acSubmissionNum;
  const get = (d: string) => nums.find((n) => n.difficulty === d)?.count ?? 0;
  return {
    username: mu.username,
    all: get("All"),
    easy: get("Easy"),
    medium: get("Medium"),
    hard: get("Hard"),
  };
}

export interface RecentSolve {
  id: string;
  title: string;
  titleSlug: string;
  timestamp: number; // unix seconds
}

/**
 * Recent accepted submissions, newest first. Empty when the user has hidden their
 * recent submissions (a LeetCode privacy setting) or has none.
 */
export async function getRecentSolves(username: string, limit = 20): Promise<RecentSolve[]> {
  const data = await gql<{
    recentAcSubmissionList: { id: string; title: string; titleSlug: string; timestamp: string }[] | null;
  }>(
    `query recentAc($u: String!, $l: Int!) {
       recentAcSubmissionList(username: $u, limit: $l) {
         id title titleSlug timestamp
       }
     }`,
    { u: username, l: limit }
  );
  return (data.recentAcSubmissionList ?? []).map((s) => ({
    id: s.id,
    title: s.title,
    titleSlug: s.titleSlug,
    timestamp: Number(s.timestamp),
  }));
}

export interface QuestionInfo {
  difficulty: string; // Easy | Medium | Hard
  frontendId: string;
  title: string;
}

/** Look up a problem's difficulty by slug. Returns null if not found. */
export async function getQuestionInfo(titleSlug: string): Promise<QuestionInfo | null> {
  const data = await gql<{
    question: { questionFrontendId: string; title: string; difficulty: string } | null;
  }>(
    `query q($s: String!) {
       question(titleSlug: $s) { questionFrontendId title difficulty }
     }`,
    { s: titleSlug }
  );
  const q = data.question;
  if (!q) return null;
  return { difficulty: q.difficulty, frontendId: q.questionFrontendId, title: q.title };
}
