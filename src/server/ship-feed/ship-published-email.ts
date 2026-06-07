import { createElement } from "react";
import { render } from "@react-email/components";
import { Resend } from "resend";
import { env } from "@/env";
import { ShipPublishedEmail } from "@/emails/ship-published-email";
import { SHIP_STATUS, toShipStatus } from "@/components/ui/ship-status";

// Built once (the API key is a constant) — mirrors src/server/invitations/email.ts.
const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

/**
 * Send the branded "new update" email to a Client (Story 3.6 fan-out). With a Resend key we send
 * the rendered React Email template (Tenant logo + accent, status emoji+label). Without a key: in
 * dev we log, in PRODUCTION we THROW — a dropped client ping must fail loudly so the Inngest
 * fan-out RETRIES it (NFR-4), not silently swallow it (same policy as auth/invitations email).
 * The status emoji/label/colors come from the SHIP_STATUS single source of truth.
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

  if (!resend) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("RESEND_API_KEY is required to send the ship-published email in production.");
    }
    console.info(`[ship-published] ${status.label} for ${to}: ${title} → ${portalUrl}`);
    return;
  }

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

  await resend.emails.send({
    from: env.EMAIL_FROM,
    to,
    subject: `New update from ${tenantName}: ${title}`,
    html,
    text,
  });
}
