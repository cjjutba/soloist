import { createElement } from "react";
import { render } from "@react-email/components";
import { sendEmail } from "@/server/email/mailer";
import { InviteEmail } from "@/emails/invite-email";

/**
 * Send the branded client-invite email (Story 2.3). Renders the React Email template (Tenant
 * logo + accent) and hands it to the mailer port for delivery (dev → Mailpit, prod → Resend).
 * The mailer enforces loud-fail in production — a dropped invite (an access grant) THROWS
 * rather than silently vanishing.
 */
export async function sendInviteEmail(data: {
  to: string;
  inviteUrl: string;
  tenantName: string;
  logoUrl: string | null;
  accentHex: string;
}): Promise<void> {
  const { to, inviteUrl, tenantName, logoUrl, accentHex } = data;

  const html = await render(
    createElement(InviteEmail, { inviteUrl, tenantName, logoUrl, accentHex }),
  );
  const text =
    `${tenantName} invited you to your client portal.\n\n` +
    `Set your password to see live progress:\n\n${inviteUrl}\n\n` +
    `This link expires in 7 days. If you weren't expecting this, ignore this email.`;

  await sendEmail({
    to,
    subject: `${tenantName} invited you to your client portal`,
    html,
    text,
  });
}
