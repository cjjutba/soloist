import { and, desc, eq, gte, sql } from "drizzle-orm";
import { withTenant, type TenantContext } from "../context";
import { engagements, invoices, shipUpdates } from "../schema";

/** Sum invoice amounts (integer minor units) grouped by currency, for one status, optionally
 * floored at `since` (by issue date). RLS scopes to the caller's tenant. */
async function invoiceTotalsByCurrency(ctx: TenantContext, status: "paid" | "sent", since?: Date) {
  return withTenant(ctx, (tx) =>
    tx
      .select({
        currency: invoices.currency,
        minor: sql<number>`coalesce(sum(${invoices.amountTotal}), 0)::int`,
      })
      .from(invoices)
      .where(
        since ? and(eq(invoices.status, status), gte(invoices.issuedAt, since)) : eq(invoices.status, status),
      )
      .groupBy(invoices.currency),
  );
}

/** Paid-this-month (by ISSUE date — there is no paid-at timestamp) + outstanding (sent, unpaid),
 * each grouped by currency. `monthStart` is passed in for deterministic, testable behavior. */
export async function invoiceMoneyStats(ctx: TenantContext, monthStart: Date) {
  const [paidThisMonth, outstanding] = await Promise.all([
    invoiceTotalsByCurrency(ctx, "paid", monthStart),
    invoiceTotalsByCurrency(ctx, "sent"),
  ]);
  return { paidThisMonth, outstanding };
}

/** Sent-but-unpaid invoices across the tenant's engagements, newest issue first (the Overview's
 * "Outstanding invoices" panel). Each row carries its own currency — never summed across currencies. */
export async function listOutstandingInvoices(ctx: TenantContext, limit = 5) {
  return withTenant(ctx, (tx) =>
    tx
      .select({
        id: invoices.id,
        number: invoices.number,
        amountTotal: invoices.amountTotal,
        currency: invoices.currency,
        issuedAt: invoices.issuedAt,
        dueAt: invoices.dueAt,
        engagementId: invoices.engagementId,
        engagementName: engagements.name,
        clientDisplayName: engagements.clientDisplayName,
      })
      .from(invoices)
      .innerJoin(engagements, eq(engagements.id, invoices.engagementId))
      .where(eq(invoices.status, "sent"))
      .orderBy(desc(invoices.issuedAt))
      .limit(limit),
  );
}

/** Recently PUBLISHED ship updates across the tenant's engagements — client projection only
 * (never raw_meta). Newest first. Powers the "Recent updates sent" panel. */
export async function listRecentPublishedUpdates(ctx: TenantContext, limit = 6) {
  return withTenant(ctx, (tx) =>
    tx
      .select({
        id: shipUpdates.id,
        title: shipUpdates.title,
        statusTag: shipUpdates.statusTag,
        publishedAt: shipUpdates.publishedAt,
        engagementId: shipUpdates.engagementId,
        engagementName: engagements.name,
      })
      .from(shipUpdates)
      .innerJoin(engagements, eq(engagements.id, shipUpdates.engagementId))
      .where(eq(shipUpdates.state, "published"))
      .orderBy(desc(shipUpdates.publishedAt))
      .limit(limit),
  );
}

/** Published-at timestamps within the window (>= `since`) for the momentum-chart bucketing.
 * Returns non-null Dates only. */
export async function publishedUpdateDates(ctx: TenantContext, since: Date): Promise<Date[]> {
  const rows = await withTenant(ctx, (tx) =>
    tx
      .select({ publishedAt: shipUpdates.publishedAt })
      .from(shipUpdates)
      .where(and(eq(shipUpdates.state, "published"), gte(shipUpdates.publishedAt, since))),
  );
  return rows.map((r) => r.publishedAt).filter((d): d is Date => d != null);
}
