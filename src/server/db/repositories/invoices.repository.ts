import { and, desc, eq, sql } from "drizzle-orm";
import { computeAmountTotal } from "@/server/doc-engine/money";
import type { InvoiceLineItem } from "@/server/doc-engine/invoice.schema";
import { withTenant, type TenantContext } from "../context";
import { invoices, tenants } from "../schema";

export type { Invoice } from "../schema"; // re-exported so UI can type a full invoice row without importing the schema

export type CreateInvoiceInput = {
  engagementId: string;
  lineItems: InvoiceLineItem[];
  currency: string;
  issuedAt?: Date;
  dueAt?: Date | null;
  notes?: string | null;
};

/**
 * Create a Draft Invoice (Story 5.1), RLS-scoped. In ONE tx: (a) atomically bump the per-Tenant
 * counter (`UPDATE tenants … +1 RETURNING` — the row lock serializes concurrent creates → unique
 * numbers; rolls back with the tx if the insert fails), (b) recompute `amount_total` server-side
 * (NEVER trust a client total), (c) insert as `draft` with `number` = the new seq. `tenant_id` is
 * stamped from ctx, never input. The engagement-ownership guard lives in the ACTION (the freelancer
 * ctx sets no engagement GUC, so `invoice_scope` WITH CHECK only gates tenant_id — see 5.1 Dev Notes).
 */
export async function createInvoice(ctx: TenantContext, input: CreateInvoiceInput) {
  const amountTotal = computeAmountTotal(input.lineItems);
  return withTenant(ctx, async (tx) => {
    const [counter] = await tx
      .update(tenants)
      .set({ invoiceSeq: sql`${tenants.invoiceSeq} + 1` })
      .where(eq(tenants.id, ctx.tenantId))
      .returning({ seq: tenants.invoiceSeq });
    const [row] = await tx
      .insert(invoices)
      .values({
        tenantId: ctx.tenantId,
        engagementId: input.engagementId,
        number: counter.seq,
        status: "draft",
        lineItems: input.lineItems,
        amountTotal,
        currency: input.currency,
        ...(input.issuedAt ? { issuedAt: input.issuedAt } : {}),
        dueAt: input.dueAt ?? null,
        notes: input.notes ?? null,
      })
      .returning();
    return row;
  });
}

/** The Engagement's invoices, newest (highest number) first — RLS-scoped + engagement-filtered. */
export async function listInvoices(ctx: TenantContext, engagementId: string) {
  return withTenant(ctx, (tx) =>
    tx
      .select({
        id: invoices.id,
        number: invoices.number,
        status: invoices.status,
        amountTotal: invoices.amountTotal,
        currency: invoices.currency,
        issuedAt: invoices.issuedAt,
        dueAt: invoices.dueAt,
      })
      .from(invoices)
      .where(and(eq(invoices.engagementId, engagementId)))
      .orderBy(desc(invoices.number)),
  );
}

/** A single invoice (full row) — RLS-scoped; null if not the caller's. */
export async function getInvoice(ctx: TenantContext, id: string) {
  return withTenant(ctx, async (tx) => {
    const [row] = await tx.select().from(invoices).where(eq(invoices.id, id)).limit(1);
    return row ?? null;
  });
}
