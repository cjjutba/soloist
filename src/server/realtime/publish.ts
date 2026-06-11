import { engagementChannel, userChannel } from "@/lib/realtime-channels";
import { getAblyRest } from "./ably";

const PUBLISH_TIMEOUT_MS = 3000;

/**
 * Publish a SIGNAL event (no payload — just "something changed, refetch") to a channel.
 *
 * Realtime is a nudge layered over the RLS-protected APIs: the client receives the signal and
 * refetches the real data through its authed endpoint. So this is **best-effort and bounded** — a
 * publish failure (or a hanging Ably) must NEVER break or stall the calling action; the fallback
 * poll still delivers the update. No-op when Ably is unconfigured.
 */
async function publish(channelName: string, event: string): Promise<void> {
  const rest = getAblyRest();
  if (!rest) return;
  const p = rest.channels.get(channelName).publish(event, {});
  p.catch(() => {}); // swallow a late settle after a timeout → never an unhandled rejection
  try {
    await Promise.race([
      p,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("ably publish timeout")), PUBLISH_TIMEOUT_MS),
      ),
    ]);
  } catch (err) {
    console.error("[realtime] publish failed:", err instanceof Error ? err.message : String(err));
  }
}

export function publishToEngagement(engagementId: string, event: string): Promise<void> {
  return publish(engagementChannel(engagementId), event);
}

export function publishToUser(userId: string, event: string): Promise<void> {
  return publish(userChannel(userId), event);
}
