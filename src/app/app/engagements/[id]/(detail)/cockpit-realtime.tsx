"use client";

import { usePresenceViewers, useRealtimeRefresh } from "@/components/realtime/realtime-provider";
import { engagementChannel } from "@/lib/realtime-channels";

/** Re-runs the engagement-detail server components when the client views something, a new update
 * publishes, an invoice status changes, or a chat message arrives/is read — so "Client viewed X ago",
 * the per-update Seen badges, invoice "Seen", the invoice status chips (sent/paid), and the
 * Messages-tab unread badge all update live without a new API. Render-null. */
export function CockpitRealtime({ engagementId }: { engagementId: string }) {
  useRealtimeRefresh(engagementChannel(engagementId), [
    "seen",
    "ship.published",
    "invoice.sent",
    "invoice.updated",
    "message",
  ]);
  return null;
}

/** A live "● Client viewing now" pill while the client has the portal open (Ably presence). Only
 * the client enters presence today, but we still exclude the freelancer's own id defensively (the
 * token grants presence on the channel), so this can only ever reflect the CLIENT viewing. */
export function ClientViewingDot({
  engagementId,
  selfUserId,
}: {
  engagementId: string;
  selfUserId: string;
}) {
  const viewers = usePresenceViewers(engagementChannel(engagementId)).filter((id) => id !== selfUserId);
  if (viewers.length === 0) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
      <span className="size-1.5 rounded-full bg-emerald-500 motion-safe:animate-pulse" aria-hidden />
      Client viewing now
    </span>
  );
}
