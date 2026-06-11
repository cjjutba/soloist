import { afterEach, describe, expect, it, vi } from "vitest";

// `email.ts` no longer builds a Resend client — it composes the message and delegates delivery
// to the mailer port. This test verifies the composition + hand-off; the transport matrix
// (resend / smtp / console, dev vs prod, SMTP-down fallback) lives in the mailer's own test.

const sendEmailMock = vi.fn();
vi.mock("@/server/email/mailer", () => ({
  sendEmail: sendEmailMock,
}));

const data = {
  user: { email: "cj@example.com", name: "CJ" },
  url: "https://soloist.app/api/auth/reset-password/tok_123?callbackURL=/reset-password",
  token: "tok_123",
};

afterEach(() => {
  vi.clearAllMocks();
});

describe("sendResetPasswordEmail", () => {
  it("hands the reset link to the mailer with the right recipient, subject, and branded HTML + text", async () => {
    const { sendResetPasswordEmail } = await import("../email");

    await sendResetPasswordEmail(data);

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const payload = sendEmailMock.mock.calls[0][0] as {
      to: string;
      subject: string;
      text: string;
      html: string;
    };
    expect(payload.to).toBe("cj@example.com");
    expect(payload.subject).toMatch(/reset/i);
    // The link must ride in `text` — that's what the dev console fallback surfaces.
    expect(payload.text).toContain(data.url);
    // …and the email now carries a branded HTML body with a real button + the link.
    expect(payload.html).toBeTruthy();
    expect(payload.html).toContain(data.url);
    expect(payload.html).toMatch(/reset password/i);
  });
});
