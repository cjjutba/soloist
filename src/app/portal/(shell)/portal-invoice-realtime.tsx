"use client";

import { useRealtimeRefresh } from "@/components/realtime/realtime-provider";
import { engagementChannel } from "@/lib/realtime-channels";

/**
 * Live invoice sync on the client portal (render-null). The Documents list + the invoice detail are
 * RSC; this re-runs them via `router.refresh()` on the `invoice.updated` signal (published when the
 * freelancer sends an invoice or marks it paid) — so a newly-sent invoice appears, and a status chip
 * flips to Paid, with no reload. No-op when realtime is disabled (the page is still correct on the
 * next navigation). "Signal, not data" — the refreshed RSC refetches through the RLS-scoped reads.
 */
export function PortalInvoiceRealtime({ engagementId }: { engagementId: string }) {
  useRealtimeRefresh(engagementChannel(engagementId), ["invoice.updated"]);
  return null;
}
