// Discord request signature verification (ed25519, via Web Crypto).
import { verifyKey } from "discord-interactions";

/**
 * Verify an incoming interaction request. Discord signs every request with the
 * app's ed25519 key; reject anything that doesn't match.
 */
export async function isValidRequest(
  rawBody: string,
  signature: string | null,
  timestamp: string | null,
  publicKey: string
): Promise<boolean> {
  if (!signature || !timestamp) return false;
  try {
    return await verifyKey(rawBody, signature, timestamp, publicKey);
  } catch {
    return false;
  }
}
