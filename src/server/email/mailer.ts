import { Resend } from "resend";
import nodemailer, { type Transporter } from "nodemailer";
import { env } from "@/env";

/**
 * The single email transport port. Every sender (auth, invitations, invoice-sent,
 * ship-published) composes its own subject/html/text and calls `sendEmail` — they no
 * longer know or care HOW mail leaves. This module owns that decision.
 *
 * Transport is resolved per call (precedence):
 *   1. explicit `EMAIL_TRANSPORT`              → forced
 *   2. `SMTP_HOST` present                      → "smtp"  (dev → Mailpit; `npm run mail`)
 *   3. `RESEND_API_KEY` present                 → "resend" (prod — unchanged HTTP SDK path)
 *   4. otherwise                                → "console"
 *
 * Loud-fail is preserved: in PRODUCTION, the "console" transport (nothing configured) THROWS,
 * and an SMTP failure RE-THROWS — a reset/invite/invoice ping is never silently dropped. In
 * dev nothing throws for transport reasons: SMTP failures (Mailpit/Docker down) and the
 * console transport both log the message (the link lives in `text`) so the flow keeps working.
 */

export interface SendEmailInput {
  to: string;
  subject: string;
  /** Always provided by every sender; the link lives here for the dev console fallback. */
  text: string;
  /** Optional — auth emails are text-only; branded emails (invite/invoice/ship) add HTML. */
  html?: string;
  /** Defaults to `env.EMAIL_FROM`. */
  from?: string;
}

type Transport = "resend" | "smtp" | "console";

function resolveTransport(): Transport {
  if (env.EMAIL_TRANSPORT) return env.EMAIL_TRANSPORT;
  if (env.SMTP_HOST) return "smtp";
  if (env.RESEND_API_KEY) return "resend";
  return "console";
}

// Lazy singletons — built on first use (reads env at call time, so tests can swap env +
// resetModules), reused across sends.
let resendClient: Resend | null = null;
function getResend(): Resend {
  if (!resendClient) {
    if (!env.RESEND_API_KEY) {
      // resolveTransport only returns "resend" when the key exists; guard anyway for an
      // explicit EMAIL_TRANSPORT=resend with no key (misconfiguration → fail loud).
      throw new Error("RESEND_API_KEY is required for the resend email transport.");
    }
    resendClient = new Resend(env.RESEND_API_KEY);
  }
  return resendClient;
}

let smtpTransporter: Transporter | null = null;
function getSmtp(): Transporter {
  if (!smtpTransporter) {
    smtpTransporter = nodemailer.createTransport({
      host: env.SMTP_HOST, // undefined → nodemailer defaults to localhost (Mailpit)
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      // Require BOTH halves — a user without a pass would make nodemailer attempt AUTH with
      // an undefined password (a confusing failure) instead of connecting anonymously, which
      // is what Mailpit wants by default.
      auth:
        env.SMTP_USER && env.SMTP_PASS
          ? { user: env.SMTP_USER, pass: env.SMTP_PASS }
          : undefined,
    });
  }
  return smtpTransporter;
}

function logToConsole(from: string, input: SendEmailInput, err?: unknown): void {
  const reason = err
    ? ` (smtp send failed: ${err instanceof Error ? err.message : String(err)})`
    : "";
  console.info(
    `[email] console transport${reason} — not delivered.\n` +
      `  from: ${from}\n  to: ${input.to}\n  subject: ${input.subject}\n  ${input.text}`,
  );
}

export async function sendEmail(input: SendEmailInput): Promise<void> {
  const from = input.from ?? env.EMAIL_FROM;
  const transport = resolveTransport();

  if (transport === "resend") {
    // Build the payload conditionally so we never pass `html: undefined` into Resend's
    // content union (matches the two shapes the senders already used: text-only / html+text).
    const base = { from, to: input.to, subject: input.subject, text: input.text };
    await getResend().emails.send(input.html ? { ...base, html: input.html } : base);
    return;
  }

  if (transport === "smtp") {
    try {
      await getSmtp().sendMail({
        from,
        to: input.to,
        subject: input.subject,
        text: input.text,
        html: input.html,
      });
      return;
    } catch (err) {
      // DEV RESILIENCE: Mailpit/Docker down → log + carry on. Prod SMTP must fail loud.
      if (process.env.NODE_ENV === "production") throw err;
      logToConsole(from, input, err);
      return;
    }
  }

  // transport === "console" — nothing configured.
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      `No email transport configured (set RESEND_API_KEY or SMTP_HOST) — refusing to ` +
        `silently drop mail in production. subject="${input.subject}" to=${input.to}`,
    );
  }
  logToConsole(from, input);
}
