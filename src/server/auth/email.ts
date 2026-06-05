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
