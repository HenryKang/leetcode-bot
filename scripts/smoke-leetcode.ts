// Quick sanity check of the LeetCode client against the real API.
// Usage: npm run leetcode:smoke -- [username]
import { getRecentSolves, getUserStats, getQuestionInfo } from "../src/leetcode.js";

async function main() {
  const user = process.argv[2] ?? "lee215";
  console.log(`\n== getUserStats(${user}) ==`);
  const stats = await getUserStats(user);
  console.log(stats);

  console.log(`\n== getRecentSolves(${user}, 3) ==`);
  const recents = await getRecentSolves(user, 3);
  console.log(recents);

  console.log(`\n== getQuestionInfo("two-sum") ==`);
  console.log(await getQuestionInfo("two-sum"));

  if (!stats) {
    console.error("\nFAIL: user stats were null");
    process.exit(1);
  }
  console.log("\nOK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
