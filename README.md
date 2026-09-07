# KIG LeetCode Accountability Bot

A Discord bot that keeps KIG members accountable for weekly LeetCode practice. It
announces solves in real-ish time, posts a weekly leaderboard against each member's
personal goal, and lets members self-serve link their account and check stats.

- **Announces** in the `#leetcode` channel whenever a linked member solves a problem
  (within one poll interval, ~15 min).
- **Weekly recap**: Monday morning leaderboard of distinct problems solved vs. each
  member's goal (✅/❌).
- **Self-serve commands**: `/link`, `/setgoal`, `/stats`, `/committed`, `/leaderboard`, `/unlink`.
- **Tracks from link time only** — pre-existing solve history is never counted.
- **$0 to run**: Cloudflare Workers + D1 + Cron Triggers, all on free tiers.

## How it works

LeetCode has no official API or push, so the bot polls the public GraphQL endpoint
on a schedule. All of that lives in `src/leetcode.ts` (the only unofficial-API surface).

```
Discord ──slash command──▶ Worker.fetch  (ed25519-verified) ──▶ D1
Cron every 15m ──▶ Worker.scheduled ──▶ poll.ts   ──▶ LeetCode + announce + D1
Cron Mon 13:00 UTC ──▶ Worker.scheduled ──▶ summary.ts ──▶ weekly leaderboard
```

**Weekly metric:** distinct problems (`titleSlug`) accepted within the week. Dedup is
per-week and resets weekly — re-solving the same problem twice in one week counts once,
but a problem solved in different weeks counts in each.

### Hard requirement for members
Each member must keep **recent submissions public** on LeetCode
(Settings → Privacy). If hidden, their solves can't be announced or counted. `/link`
warns you if it detects this.

## One-time setup

### 1. Discord application
1. https://discord.com/developers/applications → **New Application**.
2. Copy the **Application ID** and **Public Key** (General Information).
3. **Bot** tab → copy the **Token** (Reset Token if needed).
4. **OAuth2 → URL Generator**: scopes `bot` + `applications.commands`; bot permission
   **Send Messages** + **Embed Links**. Open the generated URL and invite the bot to KIG.
5. Get the **Guild ID** (KIG server) and the **channel ID** of `#leetcode`
   (enable Developer Mode in Discord → right-click → Copy ID).

### 2. Project + Cloudflare
```bash
npm install
npx wrangler login

# Create the D1 database, then paste the printed database_id into wrangler.toml
npx wrangler d1 create kig_leetcode

# Apply the schema (remote and, if you want local dev, local)
npm run db:init
npm run db:init:local
```
Edit `wrangler.toml`: set `database_id`, `GUILD_ID`, `ANNOUNCE_CHANNEL_ID`,
`SUMMARY_CHANNEL_ID`.

### 3. Secrets
```bash
npx wrangler secret put DISCORD_PUBLIC_KEY
npx wrangler secret put DISCORD_BOT_TOKEN
npx wrangler secret put DISCORD_APPLICATION_ID
```
For local dev and the register script, copy `.dev.vars.example` → `.dev.vars` and fill it in.

### 4. Deploy + wire up interactions
```bash
npm run deploy
```
Copy the deployed Worker URL and paste it into the Discord app under
**General Information → Interactions Endpoint URL**, then Save. Discord sends a PING;
the bot answers PONG, and the save succeeds.

### 5. Register slash commands
```bash
npm run register
```
Guild commands appear in KIG instantly.

## Member instructions (share these)
1. Make recent submissions public: LeetCode → Settings → Privacy.
2. In `#leetcode`, run `/link username:<your-leetcode-username>`.
3. Set a goal: `/setgoal count:7`.
4. Solve problems — the bot announces them and tracks your week.
5. Check standings anytime with `/leaderboard`, or your totals with `/stats`.

## Commands
| Command | What it does |
|---|---|
| `/link username:<name>` | Link your account; tracking starts now |
| `/unlink` | Stop tracking |
| `/setgoal count:<n>` | Set your weekly target |
| `/stats [member]` | Totals since linking + this-week progress |
| `/committed` | Everyone tracked + their totals |
| `/leaderboard` | This week's standings |

## Local development
```bash
npm run typecheck          # tsc --noEmit
npm run leetcode:smoke     # hit the real LeetCode API to sanity-check the client
npm run dev                # wrangler dev (interactions + --test-scheduled)
```
Trigger the cron handlers locally with wrangler's scheduled test endpoint, e.g.
`curl "http://localhost:8787/__scheduled?cron=*/15+*+*+*+*"` (poll) or
`curl "http://localhost:8787/__scheduled?cron=0+13+*+*+1"` (weekly).

## Scheduling notes
Crons run in UTC (`wrangler.toml`). Poll = every 15 min. Weekly recap =
`0 13 * * 1` (Mon 13:00 UTC ≈ 8–9am ET Monday), summarizing the week that just ended.
Week boundaries are ISO weeks computed in America/New_York (`src/week.ts`).

## Deferred (Phase 2): Duolingo-style streaks
Daily/weekly streaks, milestone shout-outs, and `/streak`. The schema already keeps
per-solve timestamps and a `weekly_summary` history to build on.

## Caveats
- Unofficial LeetCode API — could change and need a fix in `src/leetcode.ts`.
- Announcements are near-real-time (one poll interval), not instant.
- If a member solves >20 problems between polls, the feed window could miss the oldest;
  rare per person at a 15-min cadence.
