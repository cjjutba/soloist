"use server";

import { revalidatePath } from "next/cache";
import * as Sentry from "@sentry/nextjs";
import { requireFreelancer } from "@/server/auth/session";
import { getEngagement } from "@/server/db/repositories/engagements.repository";
import {
  createInvoice,
  getInvoice,
  markInvoicePaid,
  markInvoiceSent,
} from "@/server/db/repositories/invoices.repository";
import { inngest } from "@/server/inngest/client";
import { publishToEngagement } from "@/server/realtime/publish";
import { createInvoiceSchema, invoiceActionSchema } from "./invoice.schema";

export type CreateInvoiceResult = { ok: true; id: string } | { ok: false; error: string };
export type InvoiceStatusResult = { ok: true } | { ok: false; error: string };

/**
 * Create a Draft Invoice (Story 5.1). The `getEngagement` guard is LOAD-BEARING, not just
 * fail-fast: `invoice_scope`'s WITH CHECK only gates `tenant_id` for a freelancer ctx (no
 * `app.engagement_id` GUC), so RLS would NOT reject an invoice stamped to the caller's tenant but
 * pointing at a FOREIGN `engagement_id`. The RLS-scoped `getEngagement` (null for a non-caller's
 * engagement) is what prevents that cross-engagement write. The total is recomputed server-side.
 */
export async function createInvoiceAction(input: unknown): Promise<CreateInvoiceResult> {
  const ctx = await requireFreelancer();

  const parsed = createInvoiceSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  }
  const { engagementId, lineItems, currency, issuedAt, dueAt, notes } = parsed.data;

  try {
    const engagement = await getEngagement(ctx, engagementId);
    if (!engagement) return { ok: false, error: "That engagement no longer exists." };

    const invoice = await createInvoice(ctx, {
      engagementId,
      lineItems,
      currency,
      issuedAt,
      dueAt: dueAt ?? null,
      notes: notes ?? null,
    });
    revalidatePath(`/app/engagements/${engagementId}/documents`);
    return { ok: true, id: invoice.id };
  } catch (err) {
    console.error("[doc-engine] createInvoiceAction failed:", err instanceof Error ? err.message : String(err));
    return { ok: false, error: "Couldn't create that invoice. Please try again." };
  }
}

function revalidateInvoice(engagementId: string, invoiceId: string): void {
  revalidatePath(`/app/engagements/${engagementId}/documents`); // the list (status chip)
  revalidatePath(`/app/engagements/${engagementId}/documents/${invoiceId}`); // this document view
}

/**
 * Best-effort realtime nudge on a status transition (live invoice sync) — so BOTH parties' open
 * invoice views refetch instantly: the client portal Documents list + detail (RSC, refreshed by
 * PortalInvoiceRealtime) and the freelancer's other tabs/devices (refreshed by CockpitRealtime).
 * "Signal, not data" — no payload. `publishToEngagement` is bounded + never throws, and the status
 * write is already the durable truth, so this never affects the action's result.
 */
async function signalInvoiceUpdated(engagementId: string): Promise<void> {
  await publishToEngagement(engagementId, "invoice.updated");
}

/**
 * Emit `invoice.sent` (the notify + branded-email fan-out, Story 5.2). BEST-EFFORT — the status
 * write has already committed (Sent is the durable truth), so an enqueue failure is logged + reported
 * but NOT rolled back: the Client still sees the invoice in the portal; only the ping is missed.
 * Mirrors `emitPublished` (the OPPOSITE of the webhook's record-before-enqueue compensation).
 */
async function emitInvoiceSent(row: { id: string; engagementId: string; tenantId: string }): Promise<void> {
  try {
    await inngest.send({
      name: "invoice.sent",
      data: { invoiceId: row.id, engagementId: row.engagementId, tenantId: row.tenantId },
    });
  } catch (err) {
    console.error("[doc-engine] invoice.sent enqueue failed:", err instanceof Error ? err.message : String(err));
    Sentry.captureException(err);
  }
}

/**
 * Send a Draft Invoice (Story 5.2). The `getInvoice` ownership + `engagementId` cross-check is
 * LOAD-BEARING (the 5.1/3.8 lesson): `invoice_scope`'s WITH CHECK only gates `tenant_id` for a
 * freelancer ctx, so an id-only write could touch another engagement, and a tampered `engagementId`
 * must not mis-target. `markInvoiceSent` is a guarded UPDATE (`status='draft'`) — the atomic
 * concurrency boundary, so EXACTLY ONE `invoice.sent` fires even under a double-send. Status enum is
 * Draft → Sent → Paid only; there is no payment processing anywhere.
 */
export async function sendInvoiceAction(input: unknown): Promise<InvoiceStatusResult> {
  const ctx = await requireFreelancer();

  const parsed = invoiceActionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Couldn't send that invoice." };
  }
  const { invoiceId, engagementId } = parsed.data;

  try {
    const invoice = await getInvoice(ctx, invoiceId);
    if (!invoice || invoice.engagementId !== engagementId) {
      return { ok: false, error: "That invoice no longer exists." };
    }
    if (invoice.status !== "draft") {
      return { ok: false, error: "That invoice has already been sent." };
    }

    const sent = await markInvoiceSent(ctx, invoiceId);
    if (!sent) return { ok: false, error: "That invoice has already been sent." }; // lost the race → no emit

    await emitInvoiceSent(sent);
    revalidateInvoice(engagementId, invoiceId);
    await signalInvoiceUpdated(engagementId);
    return { ok: true };
  } catch (err) {
    console.error("[doc-engine] sendInvoiceAction failed:", err instanceof Error ? err.message : String(err));
    return { ok: false, error: "Couldn't send that invoice. Please try again." };
  }
}

/**
 * Mark a Sent Invoice Paid (Story 5.2) — the manual, out-of-band status flip. `markInvoicePaid` is
 * guarded (`status='sent'`) so a Draft can NEVER skip to Paid (Draft → Sent → Paid only). NO Inngest
 * event, NO email/notification (Paid is the Freelancer's private bookkeeping) — but it DOES publish a
 * best-effort `invoice.updated` realtime nudge so the client's already-visible status chip flips to
 * Paid live (live invoice sync). Same ownership guard as send.
 */
export async function markInvoicePaidAction(input: unknown): Promise<InvoiceStatusResult> {
  const ctx = await requireFreelancer();

  const parsed = invoiceActionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Couldn't update that invoice." };
  }
  const { invoiceId, engagementId } = parsed.data;

  try {
    const invoice = await getInvoice(ctx, invoiceId);
    if (!invoice || invoice.engagementId !== engagementId) {
      return { ok: false, error: "That invoice no longer exists." };
    }
    if (invoice.status !== "sent") {
      return { ok: false, error: "Only a sent invoice can be marked paid." };
    }

    const paid = await markInvoicePaid(ctx, invoiceId);
    if (!paid) return { ok: false, error: "Only a sent invoice can be marked paid." };

    revalidateInvoice(engagementId, invoiceId);
    await signalInvoiceUpdated(engagementId);
    return { ok: true };
  } catch (err) {
    console.error("[doc-engine] markInvoicePaidAction failed:", err instanceof Error ? err.message : String(err));
    return { ok: false, error: "Couldn't update that invoice. Please try again." };
  }
}
