import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { computeAmountTotal } from "@/server/doc-engine/money";
import type { InvoiceLineItem } from "@/server/doc-engine/invoice.schema";
import { db } from "../index";
import { withTenant, type TenantContext } from "../context";
import { branding, engagements, invoices, tenants } from "../schema";

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

/** The list projection shared by the Freelancer + Client invoice lists (omits line_items/tenant_id). */
const invoiceListColumns = {
  id: invoices.id,
  number: invoices.number,
  status: invoices.status,
  amountTotal: invoices.amountTotal,
  currency: invoices.currency,
  issuedAt: invoices.issuedAt,
  dueAt: invoices.dueAt,
} as const;

/** The Engagement's invoices, newest (highest number) first — RLS-scoped + engagement-filtered.
 * The Freelancer (Cockpit) list: ALL statuses (a draft is theirs to see). */
export async function listInvoices(ctx: TenantContext, engagementId: string) {
  return withTenant(ctx, (tx) =>
    tx
      .select(invoiceListColumns)
      .from(invoices)
      .where(eq(invoices.engagementId, engagementId))
      .orderBy(desc(invoices.number)),
  );
}

/** The Client (portal) invoice list (Story 5.2) — **sent/paid ONLY**, newest-first. A Draft is
 * Freelancer-only until sent, so the status gate is the privacy boundary HERE (not just the UI),
 * like ship_updates' published-only Client read. RLS already scopes the engagement. */
export async function listClientInvoices(ctx: TenantContext, engagementId: string) {
  return withTenant(ctx, (tx) =>
    tx
      .select(invoiceListColumns)
      .from(invoices)
      .where(and(eq(invoices.engagementId, engagementId), inArray(invoices.status, ["sent", "paid"])))
      .orderBy(desc(invoices.number)),
  );
}

/** A single invoice (full row) — RLS-scoped; null if not the caller's. The Freelancer view read. */
export async function getInvoice(ctx: TenantContext, id: string) {
  return withTenant(ctx, async (tx) => {
    const [row] = await tx.select().from(invoices).where(eq(invoices.id, id)).limit(1);
    return row ?? null;
  });
}

/** A single invoice for the Client portal view (Story 5.2) — full row, but **null for a Draft**
 * (never leaks to the Client) or not the caller's. RLS-scoped; the `status <> 'draft'` gate is the
 * draft exclusion (defense-in-depth even if the page forgets to guard). */
export async function getClientInvoice(ctx: TenantContext, id: string) {
  return withTenant(ctx, async (tx) => {
    const [row] = await tx
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, id), ne(invoices.status, "draft")))
      .limit(1);
    return row ?? null;
  });
}

/**
 * Transition a Draft → Sent (Story 5.2), atomically + RLS-scoped. The `status='draft'` guard in the
 * WHERE is the concurrency boundary: only a real draft→sent transition returns a row, so the action
 * fires EXACTLY ONE `invoice.sent` even under a double-send/concurrent race (no read-then-write gap).
 * Returns null if already sent/paid or not the caller's — the action then emits nothing.
 */
export async function markInvoiceSent(ctx: TenantContext, id: string) {
  return withTenant(ctx, async (tx) => {
    const [row] = await tx
      .update(invoices)
      .set({ status: "sent" })
      .where(and(eq(invoices.id, id), eq(invoices.status, "draft")))
      .returning();
    return row ?? null;
  });
}

/**
 * Transition a Sent → Paid (Story 5.2) — the manual, out-of-band status flip. The `status='sent'`
 * guard means a Draft can NEVER skip straight to Paid (Draft→Sent→Paid only) and a re-mark is a
 * no-op. RLS-scoped; null if not sent/not the caller's. No event/email (Paid is private bookkeeping).
 */
export async function markInvoicePaid(ctx: TenantContext, id: string) {
  return withTenant(ctx, async (tx) => {
    const [row] = await tx
      .update(invoices)
      .set({ status: "paid" })
      .where(and(eq(invoices.id, id), eq(invoices.status, "sent")))
      .returning();
    return row ?? null;
  });
}

/**
 * Persist the generated PDF's Blob URL (Story 5.3) — RLS-scoped, defense-in-depth atop the policy.
 * The lazy generate-once-and-cache: the first download renders + stores the PDF, this records the
 * blob url so later downloads reuse it (`getDownloadUrl`) instead of re-rendering. A client ctx may
 * write its OWN engagement's invoice (a cache field, not business data); a freelancer ctx is
 * tenant-scoped — `invoice_scope` confines both.
 */
export async function setInvoicePdfUrl(ctx: TenantContext, id: string, url: string): Promise<void> {
  await withTenant(ctx, async (tx) => {
    await tx.update(invoices).set({ pdfBlobUrl: url }).where(eq(invoices.id, id));
  });
}

/**
 * Everything the `invoice.sent` email needs, in one raw (system) read — the Inngest fan-out has no
 * session (mirror `loadShipPublishedContext`). Keyed on the TRUSTED event's `invoiceId`, never
 * request input. Returns null if the invoice is gone; `logoUrl`/`accentHex` are null when the Tenant
 * set no branding (the email falls back to the tenant name / default accent).
 */
export async function loadInvoiceSentContext(invoiceId: string) {
  const [row] = await db
    .select({
      number: invoices.number,
      amountTotal: invoices.amountTotal,
      currency: invoices.currency,
      status: invoices.status,
      dueAt: invoices.dueAt,
      engagementId: invoices.engagementId,
      tenantId: invoices.tenantId,
      clientDisplayName: engagements.clientDisplayName,
      tenantName: tenants.name,
      logoUrl: branding.logoBlobUrl,
      accentHex: branding.accentHex,
    })
    .from(invoices)
    .innerJoin(engagements, eq(engagements.id, invoices.engagementId))
    .innerJoin(tenants, eq(tenants.id, invoices.tenantId))
    .leftJoin(branding, eq(branding.tenantId, invoices.tenantId))
    .where(eq(invoices.id, invoiceId))
    .limit(1);
  return row ?? null;
}
