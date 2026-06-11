"use server";

import { requireClient } from "@/server/auth/session";
import {
  markInvoiceViewed,
} from "@/server/db/repositories/invoices.repository";
import { markLastSeen } from "@/server/db/repositories/client-access.repository";
import { publishToEngagement } from "@/server/realtime/publish";
import { isUuid } from "@/lib/uuid";

/**
 * "Seen by client" stamps (presence slice). Both are `requireClient` + RLS-scoped — a Client can
 * only ever stamp their OWN engagement's records — and best-effort publish a no-payload `seen`
 * signal so the freelancer's open cockpit refreshes live. The client throttles how often it calls
 * `markSeenAction` (on view/focus, not every poll).
 */
export async function markSeenAction(): Promise<void> {
  const ctx = await requireClient();
  await markLastSeen(ctx);
  await publishToEngagement(ctx.engagementId, "seen");
}

export async function markInvoiceSeenAction(invoiceId: string): Promise<void> {
  if (!isUuid(invoiceId)) return;
  const ctx = await requireClient();
  // First-view only (the repo's IS NULL guard) → publish the signal once, when it actually changed.
  const stamped = await markInvoiceViewed(ctx, invoiceId);
  if (stamped) await publishToEngagement(stamped.engagementId, "seen");
}
