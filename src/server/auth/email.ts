import { Resend } from "resend";
import { env } from "@/env";

// Built once (the API key is a constant) — not per send.
const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

/**
 * Verification-email transport (Story 1.3). Better Auth calls this with the
 * verification `url`. With a Resend key we send from EMAIL_FROM (defaults to
 * onboarding@resend.dev — sends without domain verification; Epic 4.3 brands it).
 * Without a key: in dev we log the link so the flow works offline; in PRODUCTION we
 * throw, so a missing key fails loudly instead of silently leaking verification
 * tokens (an account-takeover credential) into the logs.
 */
export async function sendVerificationEmail(data: {
  user: { email: string; name?: string };
  url: string;
  token: string;
}): Promise<void> {
  const { user, url } = data;

  if (!resend) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "RESEND_API_KEY is required to send verification email in production.",
      );
    }
    console.info(`[auth] verification link for ${user.email}: ${url}`);
    return;
  }

  await resend.emails.send({
    from: env.EMAIL_FROM,
    to: user.email,
    subject: "Verify your email for Soloist",
    text:
      `Welcome to Soloist${user.name ? `, ${user.name}` : ""}.\n\n` +
      `Confirm your email to activate your workspace:\n\n${url}\n\n` +
      `This link expires in 1 hour. If you didn't create a Soloist account, ignore this email.`,
  });
}

/**
 * Reset-password transport (Story: password reset). Better Auth calls this with the reset
 * `url`. Same guard as the verification email: with a Resend key we send; without one we log
 * the link in dev so the flow works offline, and in PRODUCTION we THROW — a reset link is an
 * account-takeover credential, so a missing key must fail loudly rather than silently drop
 * the email (or leak the link into the logs).
 */
export async function sendResetPasswordEmail(data: {
  user: { email: string; name?: string };
  url: string;
  token: string;
}): Promise<void> {
  const { user, url } = data;

  if (!resend) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "RESEND_API_KEY is required to send password-reset email in production.",
      );
    }
    console.info(`[auth] password-reset link for ${user.email}: ${url}`);
    return;
  }

  await resend.emails.send({
    from: env.EMAIL_FROM,
    to: user.email,
    subject: "Reset your Soloist password",
    text:
      `Reset your Soloist password${user.name ? `, ${user.name}` : ""}.\n\n` +
      `Click the link below to choose a new password:\n\n${url}\n\n` +
      `This link expires in 1 hour. If you didn't request a reset, ignore this email — your password stays the same.`,
  });
}
