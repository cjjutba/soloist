import { createElement } from "react";
import { render } from "@react-email/components";
import { sendEmail } from "@/server/email/mailer";
import { ShipPublishedEmail } from "@/emails/ship-published-email";
import { SHIP_STATUS, toShipStatus } from "@/components/ui/ship-status";

/**
 * Send the branded "new update" email to a Client (Story 3.6 fan-out). Renders the React Email
 * template (Tenant logo + accent, status emoji+label) and hands it to the mailer port (dev →
 * Mailpit, prod → Resend). The mailer enforces loud-fail in production so a dropped client ping
 * THROWS — letting the Inngest fan-out RETRY it (NFR-4) instead of swallowing it. The status
 * emoji/label/colors come from the SHIP_STATUS single source of truth.
 */
export async function sendShipPublishedEmail(data: {
  to: string;
  statusTag: string;
  title: string;
  summary: string | null;
  clientDisplayName: string;
  tenantName: string;
  logoUrl: string | null;
  accentHex: string;
  portalUrl: string;
}): Promise<void> {
  const { to, statusTag, title, summary, clientDisplayName, tenantName, logoUrl, accentHex, portalUrl } = data;
  const status = SHIP_STATUS[toShipStatus(statusTag)];

  const html = await render(
    createElement(ShipPublishedEmail, {
      statusEmoji: status.emoji,
      statusLabel: status.label,
      statusBg: status.bg,
      statusFg: status.fg,
      title,
      summary,
      clientDisplayName,
      tenantName,
      logoUrl,
      accentHex,
      portalUrl,
    }),
  );
  const text =
    `${tenantName} shipped an update.\n\n` +
    `${status.emoji} ${status.label}: ${title}\n` +
    (summary ? `${summary}\n` : "") +
    `\nView it in your portal:\n${portalUrl}`;

  await sendEmail({
    to,
    subject: `New update from ${tenantName}: ${title}`,
    html,
    text,
  });
}
