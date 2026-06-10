"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { markInvoicePaidAction, sendInvoiceAction } from "@/server/doc-engine/invoice.actions";

/**
 * The Freelancer status actions on an invoice (Story 5.2): Send a Draft, or Mark a Sent invoice Paid.
 * Status enum is Draft → Sent → Paid ONLY; Paid is manual/out-of-band (there is NO payment
 * processing). Each confirms first (Send notifies + emails the Client; Paid is a record change). RLS
 * + the action's ownership guard scope this to the caller's own invoice. A sibling of the reusable
 * `InvoiceDocument` (the Client view + 5.3's PDF never inherit these controls).
 */
export function InvoiceActions({
  invoiceId,
  engagementId,
  status,
}: {
  invoiceId: string;
  engagementId: string;
  status: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function run(action: Promise<{ ok: true } | { ok: false; error: string }>, success: string) {
    setBusy(true);
    try {
      const res = await action;
      if (res.ok) {
        toast.success(success);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function onSend() {
    if (!window.confirm("Send this invoice? Your client will be notified and can view it in their portal.")) return;
    void run(sendInvoiceAction({ invoiceId, engagementId }), "Invoice sent.");
  }

  function onMarkPaid() {
    if (!window.confirm("Mark this invoice as paid? This only updates the status — there's no payment processing.")) return;
    void run(markInvoicePaidAction({ invoiceId, engagementId }), "Invoice marked paid.");
  }

  if (status === "draft") {
    return (
      <div className="flex flex-wrap items-center justify-end gap-3">
        <p className="text-sm text-muted-foreground">This invoice is a draft — only you can see it.</p>
        <Button onClick={onSend} loading={busy}>
          Send invoice
        </Button>
      </div>
    );
  }
  if (status === "sent") {
    return (
      <div className="flex flex-wrap items-center justify-end gap-3">
        <p className="text-sm text-muted-foreground">Sent — your client can view it in their portal.</p>
        <Button variant="outline" onClick={onMarkPaid} loading={busy}>
          Mark as paid
        </Button>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-end">
      <p className="text-sm text-muted-foreground">Paid — this invoice is settled.</p>
    </div>
  );
}
