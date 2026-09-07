// Discord REST helpers (bot token) + interaction-response builders.

import type { Env } from "./types.js";

const API = "https://discord.com/api/v10";

// Interaction response types
export const InteractionResponseType = {
  PONG: 1,
  CHANNEL_MESSAGE_WITH_SOURCE: 4,
  DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE: 5,
} as const;

// Interaction request types
export const InteractionType = {
  PING: 1,
  APPLICATION_COMMAND: 2,
} as const;

export const EPHEMERAL = 64; // message flag

/** Render a user id as a mention. */
export function mention(discordUserId: string): string {
  return `<@${discordUserId}>`;
}

/** An immediate ephemeral text reply (only the invoker sees it). */
export function ephemeralReply(content: string) {
  return {
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { content, flags: EPHEMERAL },
  };
}

/** An immediate public reply. `pings` controls whether mentions notify. */
export function publicReply(content: string, embeds?: unknown[], pings = false) {
  return {
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content,
      embeds,
      allowed_mentions: pings ? undefined : { parse: [] as string[] },
    },
  };
}

/** ACK now, follow up later (for commands that must call LeetCode). */
export function deferEphemeral() {
  return {
    type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
    data: { flags: EPHEMERAL },
  };
}

/** Edit the original (deferred) interaction response. */
export async function editOriginalResponse(
  env: Env,
  interactionToken: string,
  content: string
): Promise<void> {
  const url = `${API}/webhooks/${env.DISCORD_APPLICATION_ID}/${interactionToken}/messages/@original`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
  });
  if (!res.ok) {
    console.log(`editOriginalResponse failed: ${res.status} ${await res.text()}`);
  }
}

/**
 * Send a private DM to a user. Opens (or reuses) the bot↔user DM channel, then
 * posts. Returns false if the user disallows DMs from server members (or any error).
 */
export async function sendDM(env: Env, userId: string, content: string): Promise<boolean> {
  const chRes = await fetch(`${API}/users/@me/channels`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` },
    body: JSON.stringify({ recipient_id: userId }),
  });
  if (!chRes.ok) {
    console.log(`open DM failed for ${userId}: ${chRes.status} ${await chRes.text()}`);
    return false;
  }
  const ch = (await chRes.json()) as { id: string };
  const msgRes = await fetch(`${API}/channels/${ch.id}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` },
    body: JSON.stringify({ content }),
  });
  if (!msgRes.ok) {
    console.log(`DM send failed for ${userId}: ${msgRes.status} ${await msgRes.text()}`);
    return false;
  }
  return true;
}

/** Post a message to a channel via the bot token. `pings` controls notifications. */
export async function postMessage(
  env: Env,
  channelId: string,
  payload: { content?: string; embeds?: unknown[] },
  pings = false
): Promise<void> {
  const res = await fetch(`${API}/channels/${channelId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
    },
    body: JSON.stringify({
      ...payload,
      allowed_mentions: pings ? { parse: ["users"] } : { parse: [] },
    }),
  });
  if (!res.ok) {
    console.log(`postMessage(${channelId}) failed: ${res.status} ${await res.text()}`);
  }
}
