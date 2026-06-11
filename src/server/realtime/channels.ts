import { engagementChannel, userChannel } from "@/lib/realtime-channels";

/**
 * The wire-access capability map — the channel-level analog of RLS.
 *
 * A token grants `subscribe`/`presence` ONLY on the channels the session owns. Clients are
 * SUBSCRIBE-only (publishing is server-only with the secret key). This map IS the security
 * boundary — it must never include a channel the principal doesn't own.
 */

export type RealtimePrincipal = {
  userId: string;
  /** Client: their one engagement. Freelancer: all their owned engagements. */
  engagementIds: string[];
};

/**
 * Build the Ably capability map for a session — least-privilege: `subscribe` on the principal's own
 * user channel (the notification bell), and `subscribe` + `presence` on each engagement channel they
 * own (presence powers the "client is viewing now" + "seen" slice — the client enters, the freelancer
 * reads). No `publish` is ever granted — the server publishes signals with the root key.
 */
export function buildCapability(principal: RealtimePrincipal): Record<string, string[]> {
  const cap: Record<string, string[]> = {
    [userChannel(principal.userId)]: ["subscribe"],
  };
  for (const id of principal.engagementIds) {
    cap[engagementChannel(id)] = ["subscribe", "presence"];
  }
  return cap;
}
