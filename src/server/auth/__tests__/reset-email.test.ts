import { afterEach, describe, expect, it, vi } from "vitest";

// `email.ts` builds the Resend client at module load from `env.RESEND_API_KEY`, so each
// scenario mutates the mocked env, `vi.resetModules()`, then re-imports to re-run that
// load-time branch (mirrors the vi.hoisted + vi.mock style used by the other auth tests).

const sendMock = vi.fn();

// `new Resend(key)` is constructed at module load, so the mock must be newable (a class),
// not an arrow fn. Its `emails.send` is the shared spy we assert against.
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));

const envState: { RESEND_API_KEY?: string; EMAIL_FROM: string } = {
  RESEND_API_KEY: "re_test_key",
  EMAIL_FROM: "noreply@soloist.test",
};
vi.mock("@/env", () => ({ env: envState }));

const data = {
  user: { email: "cj@example.com", name: "CJ" },
  url: "https://soloist.app/api/auth/reset-password/tok_123?callbackURL=/reset-password",
  token: "tok_123",
};

async function loadEmailModule() {
  vi.resetModules();
  return import("../email");
}

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  // Reset the mutated mock env so a key set by one test never leaks into the next.
  envState.RESEND_API_KEY = "re_test_key";
});

describe("sendResetPasswordEmail", () => {
  it("sends the reset link via Resend when a key is configured", async () => {
    envState.RESEND_API_KEY = "re_test_key";
    const { sendResetPasswordEmail } = await loadEmailModule();

    await sendResetPasswordEmail(data);

    expect(sendMock).toHaveBeenCalledTimes(1);
    const payload = sendMock.mock.calls[0][0] as {
      from: string;
      to: string;
      subject: string;
      text: string;
    };
    expect(payload.to).toBe("cj@example.com");
    expect(payload.from).toBe("noreply@soloist.test");
    expect(payload.subject).toMatch(/reset/i);
    expect(payload.text).toContain(data.url);
  });

  it("throws in production when RESEND_API_KEY is missing — a reset link is never silently dropped", async () => {
    envState.RESEND_API_KEY = undefined;
    vi.stubEnv("NODE_ENV", "production");
    const { sendResetPasswordEmail } = await loadEmailModule();

    await expect(sendResetPasswordEmail(data)).rejects.toThrow(/RESEND_API_KEY/);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("logs the link (no throw, no send) in dev when RESEND_API_KEY is missing", async () => {
    envState.RESEND_API_KEY = undefined;
    vi.stubEnv("NODE_ENV", "development");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const { sendResetPasswordEmail } = await loadEmailModule();

    await expect(sendResetPasswordEmail(data)).resolves.toBeUndefined();

    expect(sendMock).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith(expect.stringContaining(data.url));
    info.mockRestore();
  });
});
