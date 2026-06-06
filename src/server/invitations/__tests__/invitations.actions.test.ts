import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  requireFreelancer: vi.fn(),
  getEngagement: vi.fn(),
  upsertInvitation: vi.fn(),
  getInvitationByEngagement: vi.fn(),
  getTenant: vi.fn(),
  getBranding: vi.fn(),
  sendInviteEmail: vi.fn(),
  env: { BETTER_AUTH_URL: "https://soloist.test" },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/env", () => ({ env: m.env }));
vi.mock("@/server/auth/session", () => ({ requireFreelancer: m.requireFreelancer }));
vi.mock("@/server/db/repositories/engagements.repository", () => ({ getEngagement: m.getEngagement }));
vi.mock("@/server/db/repositories/invitations.repository", () => ({
  upsertInvitation: m.upsertInvitation,
  getInvitationByEngagement: m.getInvitationByEngagement,
}));
vi.mock("@/server/db/repositories/tenants.repository", () => ({ getTenant: m.getTenant }));
vi.mock("@/server/db/repositories/branding.repository", () => ({ getBranding: m.getBranding }));
vi.mock("../email", () => ({ sendInviteEmail: m.sendInviteEmail }));

import { resendInviteAction, sendInviteAction } from "../invitations.actions";

const CTX = { tenantId: "t1", userId: "u1", role: "freelancer" as const };
const ENG = "018f8b3e-1c2a-7e3b-9c4d-5e6f7a8b9c0d"; // valid uuid (the isUuid action guard)

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  m.requireFreelancer.mockResolvedValue(CTX);
  m.getEngagement.mockResolvedValue({ id: ENG, name: "Proj" });
  m.upsertInvitation.mockResolvedValue({ id: "inv1" });
  m.getInvitationByEngagement.mockResolvedValue({ id: "inv1", email: "old@acme.com" });
  m.getTenant.mockResolvedValue({ name: "Studio" });
  m.getBranding.mockResolvedValue({ logoBlobUrl: "https://blob/logo.png", accentHex: "#0F766E" });
  m.sendInviteEmail.mockResolvedValue(undefined);
});

describe("sendInviteAction (AC-1)", () => {
  it("persists the token HASH (not the raw token) and emails a URL containing the raw token", async () => {
    const r = await sendInviteAction(ENG, "Client@Acme.com");
    expect(r).toEqual({ ok: true });

    // email normalized; hash stored, never the raw token.
    const upsertArg = m.upsertInvitation.mock.calls[0][1];
    expect(upsertArg.email).toBe("client@acme.com");
    expect(upsertArg.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(upsertArg.expiresAt).toBeInstanceOf(Date);

    const emailArg = m.sendInviteEmail.mock.calls[0][0];
    expect(emailArg.to).toBe("client@acme.com");
    expect(emailArg.inviteUrl).toMatch(/^https:\/\/soloist\.test\/invite\/.+/);
    // The raw token in the URL must NOT equal the stored hash.
    const rawToken = emailArg.inviteUrl.split("/invite/")[1];
    expect(rawToken).not.toBe(upsertArg.tokenHash);
    expect(emailArg.logoUrl).toBe("https://blob/logo.png");
    expect(emailArg.accentHex).toBe("#0F766E");
  });

  it("rejects an invalid email without writing or sending", async () => {
    const r = await sendInviteAction(ENG, "not-an-email");
    expect(r.ok).toBe(false);
    expect(m.upsertInvitation).not.toHaveBeenCalled();
    expect(m.sendInviteEmail).not.toHaveBeenCalled();
  });

  it("rejects when the engagement isn't the caller's (no send)", async () => {
    m.getEngagement.mockResolvedValue(null);
    const r = await sendInviteAction(ENG, "client@acme.com");
    expect(r.ok).toBe(false);
    expect(m.upsertInvitation).not.toHaveBeenCalled();
    expect(m.sendInviteEmail).not.toHaveBeenCalled();
  });

  it("rejects a non-uuid engagementId without writing or sending", async () => {
    const r = await sendInviteAction("not-a-uuid", "client@acme.com");
    expect(r.ok).toBe(false);
    expect(m.getEngagement).not.toHaveBeenCalled();
    expect(m.sendInviteEmail).not.toHaveBeenCalled();
  });

  it("refuses to re-invite (and silently un-accept) an already-accepted client", async () => {
    m.getInvitationByEngagement.mockResolvedValue({ id: "inv1", email: "client@acme.com", acceptedAt: new Date() });
    const r = await sendInviteAction(ENG, "client@acme.com");
    expect(r.ok).toBe(false);
    expect(m.upsertInvitation).not.toHaveBeenCalled();
    expect(m.sendInviteEmail).not.toHaveBeenCalled();
  });

  it("falls back to the default accent when branding has none", async () => {
    m.getBranding.mockResolvedValue({ logoBlobUrl: null, accentHex: null });
    await sendInviteAction(ENG, "client@acme.com");
    expect(m.sendInviteEmail.mock.calls[0][0].accentHex).toBe("#5B5BD6");
    expect(m.sendInviteEmail.mock.calls[0][0].logoUrl).toBeNull();
  });

  it("returns a neutral error (no throw) if sending fails", async () => {
    m.sendInviteEmail.mockRejectedValue(new Error("resend down"));
    const r = await sendInviteAction(ENG, "client@acme.com");
    expect(r).toMatchObject({ ok: false });
  });
});

describe("resendInviteAction (AC-2)", () => {
  it("regenerates and re-sends to the stored email", async () => {
    const r = await resendInviteAction(ENG);
    expect(r).toEqual({ ok: true });
    expect(m.sendInviteEmail.mock.calls[0][0].to).toBe("old@acme.com");
    // A fresh token hash is generated for the resend.
    expect(m.upsertInvitation.mock.calls[0][1].tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("reports when there's no invite to resend", async () => {
    m.getInvitationByEngagement.mockResolvedValue(null);
    const r = await resendInviteAction(ENG);
    expect(r.ok).toBe(false);
    expect(m.sendInviteEmail).not.toHaveBeenCalled();
  });
});
