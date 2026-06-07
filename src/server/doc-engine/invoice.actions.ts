"use server";

import { revalidatePath } from "next/cache";
import { requireFreelancer } from "@/server/auth/session";
import { getEngagement } from "@/server/db/repositories/engagements.repository";
import { createInvoice } from "@/server/db/repositories/invoices.repository";
import { createInvoiceSchema } from "./invoice.schema";

export type CreateInvoiceResult = { ok: true; id: string } | { ok: false; error: string };

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
