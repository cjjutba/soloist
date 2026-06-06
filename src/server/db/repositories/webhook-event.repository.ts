import { eq, sql } from "drizzle-orm";
import { db } from "../index";
import { webhookEvents } from "../schema";

/**
 * The GitHub webhook idempotency LEDGER (Story 3.1). Raw `db` (NOT `withTenant`) by design:
 * the webhook handler runs PRE-TENANT (it dedupes before any Tenant context exists), and the
 * `webhook_events` table carries no RLS (system ledger, no Tenant data — see schema). The
 * connection role writes it directly.
 */

/** Record a delivery; returns `true` if newly recorded, `false` if it's a duplicate
 * (`gh_delivery_id` already seen → the handler skips re-enqueue). */
export async function recordDelivery(input: {
  ghDeliveryId: string;
  eventType: string;
}): Promise<boolean> {
  const rows = await db
    .insert(webhookEvents)
    .values({ ghDeliveryId: input.ghDeliveryId, eventType: input.eventType })
    .onConflictDoNothing({ target: webhookEvents.ghDeliveryId })
    .returning({ id: webhookEvents.id });
  return rows.length > 0;
}

/** Roll back a recorded delivery — the compensating action when the enqueue fails AFTER the
 * ledger row was written, so GitHub's redelivery (same `gh_delivery_id`) re-enqueues instead
 * of being dropped as a "duplicate". */
export async function deleteDelivery(ghDeliveryId: string): Promise<void> {
  await db.delete(webhookEvents).where(eq(webhookEvents.ghDeliveryId, ghDeliveryId));
}

/** Stamp a delivery as processed (after the Inngest run handled it). */
export async function markProcessed(ghDeliveryId: string): Promise<void> {
  await db
    .update(webhookEvents)
    .set({ processedAt: sql`now()` })
    .where(eq(webhookEvents.ghDeliveryId, ghDeliveryId));
}
