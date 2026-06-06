import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  findInvitationByTokenHash: vi.fn(),
  acceptInvitationTx: vi.fn(),
  userExistsByEmail: vi.fn(),
  deleteUserById: vi.fn(),
  createUser: vi.fn(),
  createAccount: vi.fn(),
  hash: vi.fn(),
  signInEmail: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/server/db/repositories/invitations.repository", () => ({
  findInvitationByTokenHash: m.findInvitationByTokenHash,
  // The real predicate's logic (it's pure + covered by the repository test); inlined here so
  // the orchestration test exercises the same validity gate.
  isInvitationAcceptable: (inv: { acceptedAt: Date | null; expiresAt: Date } | null) =>
    !!inv && !inv.acceptedAt && inv.expiresAt.getTime() > Date.now(),
}));
vi.mock("@/server/db/repositories/client-access.repository", () => ({
  acceptInvitationTx: m.acceptInvitationTx,
}));
vi.mock("../users", () => ({
  userExistsByEmail: m.userExistsByEmail,
  deleteUserById: m.deleteUserById,
}));
vi.mock("../index", () => ({
  auth: {
    $context: Promise.resolve({
      password: { hash: m.hash },
      internalAdapter: { createUser: m.createUser, createAccount: m.createAccount },
    }),
    api: { signInEmail: m.signInEmail },
  },
}));

import { acceptInvite } from "../accept-invite";

const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
const validInv = {
  id: "inv1",
  tenantId: "t1",
  engagementId: "e1",
  email: "client@acme.com",
  expiresAt: future,
  acceptedAt: null,
  createdAt: new Date("2026-06-01T00:00:00Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  m.findInvitationByTokenHash.mockResolvedValue(validInv);
  m.userExistsByEmail.mockResolvedValue(false);
  m.hash.mockResolvedValue("hashed-pw");
  m.createUser.mockResolvedValue({ id: "new-user" });
  m.createAccount.mockResolvedValue({});
  m.acceptInvitationTx.mockResolvedValue({ id: "ca1" });
  m.signInEmail.mockResolvedValue({});
});

describe("acceptInvite (Story 2.4)", () => {
  it("creates a VERIFIED client user + credential, grants access, signs in", async () => {
    const r = await acceptInvite({ token: "raw-token", password: "supersecret" });
    expect(r).toEqual({ ok: true });

    expect(m.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: "client@acme.com", emailVerified: true }),
    );
    expect(m.createAccount).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "new-user", providerId: "credential", password: "hashed-pw" }),
    );
    // Access tx scoped by the invitation-derived tenant/engagement.
    expect(m.acceptInvitationTx).toHaveBeenCalledWith(
      { tenantId: "t1", engagementId: "e1", userId: "new-user", role: "client" },
      expect.objectContaining({ engagementId: "e1", userId: "new-user" }),
    );
    expect(m.signInEmail).toHaveBeenCalled();
  });

  it("rejects an EXPIRED token as 'invalid' (no user created)", async () => {
    m.findInvitationByTokenHash.mockResolvedValue({ ...validInv, expiresAt: new Date(Date.now() - 1000) });
    const r = await acceptInvite({ token: "x", password: "supersecret" });
    expect(r).toEqual({ ok: false, reason: "invalid" });
    expect(m.createUser).not.toHaveBeenCalled();
  });

  it("rejects an ALREADY-ACCEPTED token as 'invalid'", async () => {
    m.findInvitationByTokenHash.mockResolvedValue({ ...validInv, acceptedAt: new Date() });
    const r = await acceptInvite({ token: "x", password: "supersecret" });
    expect(r).toEqual({ ok: false, reason: "invalid" });
    expect(m.createUser).not.toHaveBeenCalled();
  });

  it("rejects an UNKNOWN token as 'invalid' (same neutral reason — no disclosure)", async () => {
    m.findInvitationByTokenHash.mockResolvedValue(null);
    const r = await acceptInvite({ token: "x", password: "supersecret" });
    expect(r).toEqual({ ok: false, reason: "invalid" });
    expect(m.createUser).not.toHaveBeenCalled();
  });

  it("rejects an existing email as 'email-taken' (no user created)", async () => {
    m.userExistsByEmail.mockResolvedValue(true);
    const r = await acceptInvite({ token: "x", password: "supersecret" });
    expect(r).toEqual({ ok: false, reason: "email-taken" });
    expect(m.createUser).not.toHaveBeenCalled();
  });

  it("deletes the orphan user if the access tx fails (so a retry isn't blocked)", async () => {
    m.acceptInvitationTx.mockRejectedValue(new Error("tx down"));
    const r = await acceptInvite({ token: "x", password: "supersecret" });
    expect(r).toEqual({ ok: false, reason: "error" });
    expect(m.deleteUserById).toHaveBeenCalledWith("new-user");
    expect(m.signInEmail).not.toHaveBeenCalled();
  });

  it("deletes the orphan user if createAccount fails AFTER createUser (retry not blocked)", async () => {
    m.createAccount.mockRejectedValue(new Error("account insert down"));
    const r = await acceptInvite({ token: "x", password: "supersecret" });
    expect(r).toEqual({ ok: false, reason: "error" });
    expect(m.deleteUserById).toHaveBeenCalledWith("new-user");
    expect(m.acceptInvitationTx).not.toHaveBeenCalled();
  });
});
