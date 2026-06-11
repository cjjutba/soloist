"use client";

import { useEffect } from "react";
import { markInvoiceSeenAction } from "@/server/portal/seen.actions";

/** Render-null: stamps `client_viewed_at` (first view) when the client opens this invoice, so the
 * freelancer's cockpit shows "✓ Seen". Idempotent server-side (first-view guard). */
export function MarkInvoiceSeen({ invoiceId }: { invoiceId: string }) {
  useEffect(() => {
    void markInvoiceSeenAction(invoiceId);
  }, [invoiceId]);
  return null;
}
