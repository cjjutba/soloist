import { createElement } from "react";
import { render } from "@react-email/components";
import { sendEmail } from "@/server/email/mailer";
import { InvoiceSentEmail } from "@/emails/invoice-sent-email";
import { formatMoney } from "@/server/doc-engine/money";

/**
 * Send the branded "new invoice" email to a Client (Story 5.2 fan-out). Renders the React Email
 * template (Tenant logo + accent, the invoice number + total) and hands it to the mailer port
 * (dev → Mailpit, prod → Resend). The mailer enforces loud-fail in production so a dropped
 * client ping THROWS — letting the Inngest fan-out RETRY it (NFR-4) instead of swallowing it.
 * The amount is formatted via the shared `formatMoney` (integer minor units → localized string).
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

  await sendEmail({
    to,
    subject: `New invoice from ${tenantName}: #${number}`,
    html,
    text,
  });
}
