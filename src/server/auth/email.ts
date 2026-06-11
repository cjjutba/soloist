import { createElement } from "react";
import { render } from "@react-email/components";
import { sendEmail } from "@/server/email/mailer";
import { ResetPasswordEmail } from "@/emails/reset-password-email";
import { VerifyEmail } from "@/emails/verify-email";

/**
 * Verification-email transport (Story 1.3). Better Auth calls this with the verification `url`.
 * Renders the branded Soloist `VerifyEmail` (a platform email — Soloist Iris, not Tenant-branded)
 * and hands HTML + a plain-text fallback to the mailer port, which routes it (dev → Mailpit, prod →
 * Resend) and enforces the loud-fail policy: in production a missing transport THROWS rather than
 * silently leaking the verification token (an account-takeover credential).
 */
export async function sendVerificationEmail(data: {
  user: { email: string; name?: string };
  url: string;
  token: string;
}): Promise<void> {
  const { user, url } = data;

  const html = await render(createElement(VerifyEmail, { verifyUrl: url, userName: user.name }));

  await sendEmail({
    to: user.email,
    subject: "Verify your email for Soloist",
    html,
    text:
      `Welcome to Soloist${user.name ? `, ${user.name}` : ""}.\n\n` +
      `Confirm your email to activate your workspace:\n\n${url}\n\n` +
      `This link expires in 1 hour. If you didn't create a Soloist account, ignore this email.`,
  });
}

/**
 * Reset-password transport (Story: password reset). Better Auth calls this with the reset `url`.
 * Renders the branded Soloist `ResetPasswordEmail` (button + paste-link fallback) and hands HTML +
 * plain text to the mailer port. A reset link is an account-takeover credential, so a missing
 * transport in production THROWS (the mailer enforces this) rather than dropping the email silently.
 */
export async function sendResetPasswordEmail(data: {
  user: { email: string; name?: string };
  url: string;
  token: string;
}): Promise<void> {
  const { user, url } = data;

  const html = await render(
    createElement(ResetPasswordEmail, { resetUrl: url, userName: user.name }),
  );

  await sendEmail({
    to: user.email,
    subject: "Reset your Soloist password",
    html,
    text:
      `Reset your Soloist password${user.name ? `, ${user.name}` : ""}.\n\n` +
      `Click the link below to choose a new password:\n\n${url}\n\n` +
      `This link expires in 1 hour. If you didn't request a reset, ignore this email — your password stays the same.`,
  });
}
