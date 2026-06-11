import Ably from "ably";
import { env } from "@/env";

// Built once from the server-only ROOT key. Null when ABLY_API_KEY is unset — realtime is an
// enhancement over polling, so callers no-op and clients fall back to the poll.
let rest: Ably.Rest | null = null;

/** The server Ably REST client — publishes signal events and mints scoped subscribe tokens.
 * NEVER exposed to the browser (clients authenticate via the /api/realtime/token endpoint). */
export function getAblyRest(): Ably.Rest | null {
  if (!env.ABLY_API_KEY) return null;
  if (!rest) rest = new Ably.Rest(env.ABLY_API_KEY);
  return rest;
}

/** Whether realtime is configured — gates whether the client even opens an Ably connection (so it
 * doesn't retry a token endpoint that 503s). When false, clients run on polling only. */
export function isRealtimeConfigured(): boolean {
  return Boolean(env.ABLY_API_KEY);
}
