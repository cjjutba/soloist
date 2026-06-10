import { env } from "@/env";
import { resolveNotifiableRecipient } from "@/server/db/repositories/client-access.repository";
import { createNotification } from "@/server/db/repositories/notifications.repository";
import { loadInvoiceSentContext } from "@/server/db/repositories/invoices.repository";
import { sendInvoiceSentEmail } from "@/server/doc-engine/invoice-sent-email";
import { inngest, type InvoiceSent } from "../client";

export type InvoiceSentResult =
  | { status: "sent" }
  | { status: "no-recipient" }
  | { status: "muted" }
  | { status: "stale" };

/**
 * The `invoice.sent` fan-out core (Story 5.2), extracted so it's unit-testable outside the Inngest
 * runtime — a near-clone of `handleShipPublished`. Idempotent: the notification insert dedupes
 * (`notifications_invoice_dedup`), so a whole-function retry won't double-notify; the email may
 * resend on retry (a duplicate ping is benign). If the email throws, the function throws → Inngest
 * retries (NFR-4); the send/status write is already durable and is never rolled back.
 */
export async function handleInvoiceSent(data: InvoiceSent): Promise<InvoiceSentResult> {
  // The SAME event-agnostic notify gate as ship-published (Story 4.4): the Engagement's Client AND
  // their mute pref, in one raw system read keyed on the trusted event id. `muted` = the Client
  // opted out → send NOTHING (no in-app row, no email; the 4.2 toast is transitively silent — but
  // the invoice is still visible in the portal Documents). Neither status throws — both are no-ops.
  const resolved = await resolveNotifiableRecipient(data.engagementId);
  if (resolved.status !== "ok") return { status: resolved.status };
  const recipient = resolved.recipient;

  // In-app notification (idempotent via the partial unique on (recipient, invoice)).
  await createNotification(
    { tenantId: data.tenantId, userId: "system", role: "freelancer" },
    {
      engagementId: data.engagementId,
      userId: recipient.userId,
      type: "invoice_sent",
      invoiceId: data.invoiceId,
    },
  );

  // Re-read the email data fresh (never trust event-carried content). Skip the email ONLY if the
  // invoice is gone or never actually left draft (a dismissed/rolled-back race) — the notification
  // already records the moment. A `sent` OR `paid` status both mean it WAS legitimately sent: unlike
  // ship-published (`published` is terminal), the freelancer can mark a Sent invoice Paid before this
  // async fan-out runs, and that must NOT suppress the "new invoice" email.
  const ctx = await loadInvoiceSentContext(data.invoiceId);
  if (!ctx || ctx.status === "draft") return { status: "stale" };

  await sendInvoiceSentEmail({
    to: recipient.email,
    number: ctx.number,
    amountTotal: ctx.amountTotal,
    currency: ctx.currency,
    dueAt: ctx.dueAt,
    clientDisplayName: ctx.clientDisplayName,
    tenantName: ctx.tenantName,
    logoUrl: ctx.logoUrl,
    accentHex: ctx.accentHex ?? "#5b5bd6", // Soloist Iris default when the Tenant set no accent
    invoiceUrl: `${env.BETTER_AUTH_URL.replace(/\/+$/, "")}/portal/documents/${data.invoiceId}`,
  });

  return { status: "sent" };
}

/** The durable, retrying Inngest fan-out (Story 5.2). Idempotency lives in the notification dedup,
 * so a whole-function retry (e.g. an email failure) is safe. */
export const invoiceSent = inngest.createFunction(
  { id: "invoice-sent", triggers: [{ event: "invoice.sent" }] },
  async ({ event }) => handleInvoiceSent(event.data as InvoiceSent),
);
