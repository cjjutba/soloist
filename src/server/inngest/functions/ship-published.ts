import { env } from "@/env";
import { resolveNotifiableRecipient } from "@/server/db/repositories/client-access.repository";
import {
  createNotification,
  loadShipPublishedContext,
} from "@/server/db/repositories/notifications.repository";
import { publishToEngagement, publishToUser } from "@/server/realtime/publish";
import { sendShipPublishedEmail } from "@/server/ship-feed/ship-published-email";
import { inngest, type ShipPublished } from "../client";

export type ShipPublishedResult =
  | { status: "sent" }
  | { status: "notified-no-email" }
  | { status: "no-recipient" }
  | { status: "muted" }
  | { status: "stale" };

/**
 * The `ship/update.published` fan-out core (Story 3.6), extracted so it's unit-testable outside
 * the Inngest runtime. Idempotent: the notification insert dedupes (`notifications_ship_dedup`),
 * so a whole-function retry won't double-notify; the email may resend on retry (a duplicate ping
 * is benign). If the email throws, the function throws → Inngest retries (NFR-4) — publish itself
 * is already durable and is never rolled back.
 */
export async function handleShipPublished(data: ShipPublished): Promise<ShipPublishedResult> {
  // Realtime feed signal (best-effort): a published update is visible in the Client's feed
  // regardless of their notification mute / whether they've joined yet, so nudge the engagement
  // channel to refetch FIRST — before the notify gate that can early-return on muted/no-recipient.
  await publishToEngagement(data.engagementId, "ship.published");

  // The event-agnostic notify gate (Story 4.4): the Engagement's Client AND their mute pref, in one
  // raw system read keyed on the trusted event id. `no-recipient` = none accepted yet (the feed
  // still shows it once they join); `muted` = the Client opted out → send NOTHING (no in-app row,
  // no email; the 4.2 toast is transitively silent). Neither throws — both are terminal no-ops.
  const resolved = await resolveNotifiableRecipient(data.engagementId);
  if (resolved.status !== "ok") return { status: resolved.status };
  const recipient = resolved.recipient;

  // In-app notification (idempotent via the partial unique).
  await createNotification(
    { tenantId: data.tenantId, userId: "system", role: "freelancer" },
    {
      engagementId: data.engagementId,
      userId: recipient.userId,
      type: "ship_published",
      shipUpdateId: data.shipUpdateId,
    },
  );

  // Realtime notification signal (best-effort): the bell got a new row → nudge the recipient's
  // user channel so it refetches instantly instead of waiting for the fallback poll.
  await publishToUser(recipient.userId, "notification");

  // Re-read the email data (fresh; never trust event-carried content). A dismissed/edited race
  // that left it non-published → skip the email (the notification already records the moment).
  const ctx = await loadShipPublishedContext(data.shipUpdateId);
  if (!ctx || ctx.state !== "published") return { status: "stale" };

  await sendShipPublishedEmail({
    to: recipient.email,
    statusTag: ctx.statusTag,
    title: ctx.title,
    summary: ctx.summary,
    clientDisplayName: ctx.clientDisplayName,
    tenantName: ctx.tenantName,
    logoUrl: ctx.logoUrl,
    accentHex: ctx.accentHex ?? "#5b5bd6", // Soloist Iris default when the Tenant set no accent
    portalUrl: `${env.BETTER_AUTH_URL.replace(/\/+$/, "")}/portal`, // strip a trailing slash → no //portal
  });

  return { status: "sent" };
}

/** The durable, retrying Inngest fan-out (Story 3.6). Idempotency lives in the notification
 * dedup, so a whole-function retry (e.g. an email failure) is safe. */
export const shipPublished = inngest.createFunction(
  { id: "ship-published", triggers: [{ event: "ship/update.published" }] },
  async ({ event }) => handleShipPublished(event.data as ShipPublished),
);
