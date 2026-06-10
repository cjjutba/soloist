import { createElement } from "react";
import { render } from "@react-email/components";
import { Resend } from "resend";
import { env } from "@/env";
import { InvoiceSentEmail } from "@/emails/invoice-sent-email";
import { formatMoney } from "@/server/doc-engine/money";

// Built once (the API key is a constant) — mirrors src/server/ship-feed/ship-published-email.ts.
const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

/**
 * Send the branded "new invoice" email to a Client (Story 5.2 fan-out). With a Resend key we send the
 * rendered React Email template (Tenant logo + accent, the invoice number + total). Without a key: in
 * dev we log, in PRODUCTION we THROW — a dropped client ping must fail loudly so the Inngest fan-out
 * RETRIES it (NFR-4), not silently swallow it (same policy as the ship-published / invitations email).
 * The amount is formatted via the shared `formatMoney` (integer minor units → localized string) —
 * never a hand-rolled `Intl.NumberFormat`.
 */
export async function sendInvoiceSentEmail(data: {
  to: string;
  number: number;
  amountTotal: number; // integer minor units
  currency: string;
  dueAt: Date | null;
  clientDisplayName: string;
  tenantName: string;
  logoUrl: string | null;
  accentHex: string;
  invoiceUrl: string;
}): Promise<void> {
  const { to, number, amountTotal, currency, dueAt, clientDisplayName, tenantName, logoUrl, accentHex, invoiceUrl } = data;
  const amount = formatMoney(amountTotal, currency);
  const dueLabel = dueAt ? new Date(dueAt).toISOString().slice(0, 10) : null; // YYYY-MM-DD, locale-agnostic

  if (!resend) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("RESEND_API_KEY is required to send the invoice-sent email in production.");
    }
    console.info(`[invoice-sent] #${number} (${amount}) for ${to} → ${invoiceUrl}`);
    return;
  }

  const html = await render(
    createElement(InvoiceSentEmail, {
      number,
      amount,
      dueLabel,
      clientDisplayName,
      tenantName,
      logoUrl,
      accentHex,
      invoiceUrl,
    }),
  );
  const text =
    `${tenantName} sent you an invoice.\n\n` +
    `Invoice #${number}: ${amount}\n` +
    (dueLabel ? `Due ${dueLabel}\n` : "") +
    `\nView it in your portal:\n${invoiceUrl}`;

  await resend.emails.send({
    from: env.EMAIL_FROM,
    to,
    subject: `New invoice from ${tenantName}: #${number}`,
    html,
    text,
  });
}
