import { createElement } from "react";
import { render } from "@react-email/components";
import { Resend } from "resend";
import { env } from "@/env";
import { InviteEmail } from "@/emails/invite-email";

// Built once (the API key is a constant) — not per send. Mirrors src/server/auth/email.ts.
const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

/**
 * Send the branded client-invite email (Story 2.3). With a Resend key we send the rendered
 * React Email template (Tenant logo + accent) from EMAIL_FROM. Without a key: in dev we log
 * the invite URL so the flow works offline; in PRODUCTION we THROW — a dropped invite must
 * fail loudly, not silently swallow an access grant (same policy as auth/email.ts).
 */
export async function sendInviteEmail(data: {
  to: string;
  inviteUrl: string;
  tenantName: string;
  logoUrl: string | null;
  accentHex: string;
}): Promise<void> {
  const { to, inviteUrl, tenantName, logoUrl, accentHex } = data;

  if (!resend) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("RESEND_API_KEY is required to send invite email in production.");
    }
    console.info(`[invite] link for ${to}: ${inviteUrl}`);
    return;
  }

  const html = await render(
    createElement(InviteEmail, { inviteUrl, tenantName, logoUrl, accentHex }),
  );
  const text =
    `${tenantName} invited you to your client portal.\n\n` +
    `Set your password to see live progress:\n\n${inviteUrl}\n\n` +
    `This link expires in 7 days. If you weren't expecting this, ignore this email.`;

  await resend.emails.send({
    from: env.EMAIL_FROM,
    to,
    subject: `${tenantName} invited you to your client portal`,
    html,
    text,
  });
}
