import { afterEach, describe, expect, it, vi } from "vitest";

// The mailer builds its Resend client + nodemailer transporter lazily and reads env at call
// time, so each scenario mutates the mocked env, `vi.resetModules()`, then re-imports the
// mailer to get fresh module-level singletons (mirrors the auth email-test pattern).

const resendSendMock = vi.fn();
vi.mock("resend", () => ({
  // `new Resend(key)` is constructed lazily, so the mock must be newable (a class).
  Resend: class {
    emails = { send: resendSendMock };
  },
}));

const sendMailMock = vi.fn();
const createTransportMock = vi.fn(() => ({ sendMail: sendMailMock }));
vi.mock("nodemailer", () => ({
  default: { createTransport: createTransportMock },
  createTransport: createTransportMock,
}));

type EnvState = {
  EMAIL_FROM: string;
  EMAIL_TRANSPORT?: "resend" | "smtp" | "console";
  RESEND_API_KEY?: string;
  SMTP_HOST?: string;
  SMTP_PORT: number;
  SMTP_SECURE: boolean;
  SMTP_USER?: string;
  SMTP_PASS?: string;
};
const envState: EnvState = {
  EMAIL_FROM: "noreply@soloist.test",
  SMTP_PORT: 1027,
  SMTP_SECURE: false,
};
vi.mock("@/env", () => ({ env: envState }));

const input = {
  to: "client@example.com",
  subject: "Reset your Soloist password",
  text: "Click: https://soloist.app/reset/tok_123",
  html: "<p>Click</p>",
};

function resetEnv() {
  envState.EMAIL_FROM = "noreply@soloist.test";
  envState.EMAIL_TRANSPORT = undefined;
  envState.RESEND_API_KEY = undefined;
  envState.SMTP_HOST = undefined;
  envState.SMTP_PORT = 1027;
  envState.SMTP_SECURE = false;
  envState.SMTP_USER = undefined;
  envState.SMTP_PASS = undefined;
}

async function loadMailer() {
  vi.resetModules();
  return import("../mailer");
}

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  resetEnv();
});

describe("sendEmail — transport selection", () => {
  it("sends via Resend when RESEND_API_KEY is set and no SMTP host", async () => {
    envState.RESEND_API_KEY = "re_test";
    const { sendEmail } = await loadMailer();

    await sendEmail(input);

    expect(resendSendMock).toHaveBeenCalledTimes(1);
    expect(resendSendMock.mock.calls[0][0]).toMatchObject({
      from: "noreply@soloist.test",
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it("omits html from the Resend payload for text-only emails", async () => {
    envState.RESEND_API_KEY = "re_test";
    const { sendEmail } = await loadMailer();

    await sendEmail({ to: input.to, subject: input.subject, text: input.text });

    const payload = resendSendMock.mock.calls[0][0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty("html");
    expect(payload.text).toBe(input.text);
  });

  it("sends via SMTP (nodemailer) when SMTP_HOST is set", async () => {
    envState.SMTP_HOST = "localhost";
    const { sendEmail } = await loadMailer();

    await sendEmail(input);

    expect(sendMailMock).toHaveBeenCalledTimes(1);
    expect(sendMailMock.mock.calls[0][0]).toMatchObject({
      from: "noreply@soloist.test",
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
    expect(resendSendMock).not.toHaveBeenCalled();
  });

  it("configures the SMTP transporter from env (host/port/secure) with no auth by default", async () => {
    envState.SMTP_HOST = "mailpit";
    envState.SMTP_PORT = 2525;
    envState.SMTP_SECURE = true;
    const { sendEmail } = await loadMailer();

    await sendEmail(input);

    expect(createTransportMock).toHaveBeenCalledWith(
      expect.objectContaining({ host: "mailpit", port: 2525, secure: true, auth: undefined }),
    );
  });

  it("sets SMTP auth only when BOTH user and pass are present", async () => {
    envState.SMTP_HOST = "smtp.relay.test";
    envState.SMTP_USER = "postmaster";
    envState.SMTP_PASS = "secret";
    const { sendEmail } = await loadMailer();

    await sendEmail(input);

    expect(createTransportMock).toHaveBeenCalledWith(
      expect.objectContaining({ auth: { user: "postmaster", pass: "secret" } }),
    );
  });

  it("omits SMTP auth when a user is set but the pass is missing (no AUTH with undefined pass)", async () => {
    envState.SMTP_HOST = "smtp.relay.test";
    envState.SMTP_USER = "postmaster";
    envState.SMTP_PASS = undefined;
    const { sendEmail } = await loadMailer();

    await sendEmail(input);

    expect(createTransportMock).toHaveBeenCalledWith(
      expect.objectContaining({ auth: undefined }),
    );
  });

  it("honors an explicit EMAIL_TRANSPORT over inference", async () => {
    envState.EMAIL_TRANSPORT = "resend";
    envState.RESEND_API_KEY = "re_test";
    envState.SMTP_HOST = "localhost"; // would otherwise infer smtp
    const { sendEmail } = await loadMailer();

    await sendEmail(input);

    expect(resendSendMock).toHaveBeenCalledTimes(1);
    expect(sendMailMock).not.toHaveBeenCalled();
  });
});

describe("sendEmail — failure & fallback semantics", () => {
  it("falls back to console (no throw) when SMTP send fails in dev", async () => {
    envState.SMTP_HOST = "localhost";
    vi.stubEnv("NODE_ENV", "development");
    sendMailMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const { sendEmail } = await loadMailer();

    await expect(sendEmail(input)).resolves.toBeUndefined();

    // The link (in `text`) is surfaced so the dev flow keeps working with Mailpit down.
    expect(info).toHaveBeenCalledWith(expect.stringContaining(input.text));
    info.mockRestore();
  });

  it("re-throws when SMTP send fails in production", async () => {
    envState.SMTP_HOST = "localhost";
    vi.stubEnv("NODE_ENV", "production");
    sendMailMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const { sendEmail } = await loadMailer();

    await expect(sendEmail(input)).rejects.toThrow(/ECONNREFUSED/);
  });

  it("logs to console (no send) when nothing is configured in dev", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const { sendEmail } = await loadMailer();

    await expect(sendEmail(input)).resolves.toBeUndefined();

    expect(info).toHaveBeenCalledWith(expect.stringContaining(input.text));
    expect(resendSendMock).not.toHaveBeenCalled();
    expect(sendMailMock).not.toHaveBeenCalled();
    info.mockRestore();
  });

  it("throws in production when no transport is configured — mail is never silently dropped", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { sendEmail } = await loadMailer();

    await expect(sendEmail(input)).rejects.toThrow(/No email transport configured/);
    expect(resendSendMock).not.toHaveBeenCalled();
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it("throws even in dev when EMAIL_TRANSPORT=resend is forced without a key (fail loud on misconfig)", async () => {
    envState.EMAIL_TRANSPORT = "resend";
    envState.RESEND_API_KEY = undefined;
    vi.stubEnv("NODE_ENV", "development");
    const { sendEmail } = await loadMailer();

    await expect(sendEmail(input)).rejects.toThrow(/RESEND_API_KEY/);
    expect(resendSendMock).not.toHaveBeenCalled();
  });
});
