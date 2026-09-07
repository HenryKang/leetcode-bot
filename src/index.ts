// Worker entry: Discord interactions (fetch) + cron jobs (scheduled).

import { handleInteraction } from "./interactions.js";
import { isValidRequest } from "./verify.js";
import { runPoll } from "./poll.js";
import { runReminders } from "./reminders.js";
import { runWeeklySummary } from "./summary.js";
import { WEEKLY_CRON, type Env } from "./types.js";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Authenticated manual triggers — run the same jobs the cron would, on demand.
    // Driven by GitHub Actions (Cloudflare cron doesn't fire on this account).
    if (url.pathname.startsWith("/admin/")) {
      if (url.searchParams.get("key") !== env.ADMIN_KEY) {
        return new Response("unauthorized", { status: 401 });
      }
      if (url.pathname === "/admin/summary") {
        const week = url.searchParams.get("week") ?? undefined;
        await runWeeklySummary(env, week);
        return Response.json({ ok: true, ran: "summary", week: week ?? "(ended week)" });
      }
      if (url.pathname === "/admin/remind") {
        const only = url.searchParams.get("user") ?? undefined; // optional: DM just one member (testing)
        const r = await runReminders(env, only);
        return Response.json({ ok: true, ran: "remind", ...r });
      }
      if (url.pathname === "/admin/poll") {
        const summary = await runPoll(env);
        return Response.json({ ok: true, ran: "poll", ...summary });
      }
      return new Response("unknown admin action", { status: 404 });
    }

    if (request.method === "GET") {
      return new Response("KIG LeetCode bot is running.", { status: 200 });
    }
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const signature = request.headers.get("x-signature-ed25519");
    const timestamp = request.headers.get("x-signature-timestamp");
    const rawBody = await request.text();

    const valid = await isValidRequest(rawBody, signature, timestamp, env.DISCORD_PUBLIC_KEY);
    if (!valid) {
      return new Response("Bad request signature", { status: 401 });
    }

    const interaction = JSON.parse(rawBody);
    const response = await handleInteraction(interaction, env, ctx);
    return new Response(JSON.stringify(response), {
      headers: { "Content-Type": "application/json" },
    });
  },

  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    if (event.cron === WEEKLY_CRON) {
      ctx.waitUntil(runWeeklySummary(env));
    } else {
      ctx.waitUntil(runPoll(env));
    }
  },
};
