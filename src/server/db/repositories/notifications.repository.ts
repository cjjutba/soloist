import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../index";
import { withTenant, type TenantContext } from "../context";
import { branding, engagements, invoices, notifications, shipUpdates, tenants } from "../schema";

/** Create an in-app notification (Story 3.6 ship fan-out / Story 5.2 invoice fan-out). `tenant_id`
 * is stamped from ctx (the system/tenant scope), never input. **Idempotent** via the source-keyed
 * partial uniques → a fan-out retry for the same (recipient, ship_update) OR (recipient, invoice)
 * returns null (no second row). */
export async function createNotification(
  ctx: TenantContext,
  input: {
    engagementId: string;
    userId: string;
    type: string;
    shipUpdateId?: string | null;
    invoiceId?: string | null;
  },
) {
  return withTenant(ctx, async (tx) => {
    const [row] = await tx
      .insert(notifications)
      .values({
        tenantId: ctx.tenantId,
        engagementId: input.engagementId,
        userId: input.userId,
        type: input.type,
        shipUpdateId: input.shipUpdateId ?? null,
        invoiceId: input.invoiceId ?? null,
      })
      // Bare (no target): the only uniques are the two DISJOINT dedup partials (`…_ship_dedup`,
      // `…_invoice_dedup`) — a row carries at most one source id, so a conflict can only ever be the
      // intended (recipient, ship_update) or (recipient, invoice) dedup. If a NON-dedup unique is
      // ever added, pin an explicit target here so an unrelated conflict can't silently drop a row.
      .onConflictDoNothing()
      .returning();
    return row ?? null; // null = already notified (dedup)
  });
}

/** The Client's notification center (Story 4.1): the caller's OWN notifications newest-first, with
 * the linked ship_update's title/status. **`user_id = ctx.userId`** is the load-bearing recipient
 * scope — the `notification_scope` RLS confines reads to the Tenant+Engagement, but a notification
 * carries a recipient, so a Client must see only their own (not a future Freelancer row on the same
 * engagement). LEFT JOIN ship_updates (title/status null for non-ship types) + LEFT JOIN invoices
 * (number null for non-invoice types) — the center derives each row's href/label from the type. */
export async function listNotifications(ctx: TenantContext) {
  return withTenant(ctx, (tx) =>
    tx
      .select({
        id: notifications.id,
        type: notifications.type,
        readAt: notifications.readAt,
        createdAt: notifications.createdAt,
        shipUpdateId: notifications.shipUpdateId,
        title: shipUpdates.title,
        statusTag: shipUpdates.statusTag,
        invoiceId: notifications.invoiceId,
        invoiceNumber: invoices.number,
      })
      .from(notifications)
      .leftJoin(shipUpdates, eq(shipUpdates.id, notifications.shipUpdateId))
      .leftJoin(invoices, eq(invoices.id, notifications.invoiceId))
      .where(eq(notifications.userId, ctx.userId))
      .orderBy(desc(notifications.createdAt)),
  );
}

/** Mark specific notifications read (Story 4.1). Guarded `user_id = ctx.userId AND read_at IS NULL`
 * → only the caller's own, idempotent (a replay/already-read is a no-op). Returns the count moved. */
export async function markNotificationsRead(
  ctx: TenantContext,
  ids: string[],
): Promise<{ count: number }> {
  if (ids.length === 0) return { count: 0 };
  return withTenant(ctx, async (tx) => {
    const rows = await tx
      .update(notifications)
      .set({ readAt: sql`now()` })
      .where(
        and(
          inArray(notifications.id, ids),
          eq(notifications.userId, ctx.userId),
          isNull(notifications.readAt),
        ),
      )
      .returning({ id: notifications.id });
    return { count: rows.length };
  });
}

/** Mark ALL the caller's unread notifications read (Story 4.1, "Mark all as read"). */
export async function markAllNotificationsRead(ctx: TenantContext): Promise<{ count: number }> {
  return withTenant(ctx, async (tx) => {
    const rows = await tx
      .update(notifications)
      .set({ readAt: sql`now()` })
      .where(and(eq(notifications.userId, ctx.userId), isNull(notifications.readAt)))
      .returning({ id: notifications.id });
    return { count: rows.length };
  });
}

/** Everything the `ship/update.published` email needs, in one raw (system) read — the Inngest
 * fan-out has no session, like `findClientAccessByUserId`. Keyed on the trusted event's
 * `shipUpdateId`, never request input. Returns null if the update is gone. `logoUrl`/`accentHex`
 * are null when the Tenant hasn't set branding (the email falls back to the tenant name / default). */
export async function loadShipPublishedContext(shipUpdateId: string) {
  const [row] = await db
    .select({
      statusTag: shipUpdates.statusTag,
      title: shipUpdates.title,
      summary: shipUpdates.summary,
      state: shipUpdates.state,
      engagementId: shipUpdates.engagementId,
      tenantId: shipUpdates.tenantId,
      clientDisplayName: engagements.clientDisplayName,
      tenantName: tenants.name,
      logoUrl: branding.logoBlobUrl,
      accentHex: branding.accentHex,
    })
    .from(shipUpdates)
    .innerJoin(engagements, eq(engagements.id, shipUpdates.engagementId))
    .innerJoin(tenants, eq(tenants.id, shipUpdates.tenantId))
    .leftJoin(branding, eq(branding.tenantId, shipUpdates.tenantId))
    .where(eq(shipUpdates.id, shipUpdateId))
    .limit(1);
  return row ?? null;
}
