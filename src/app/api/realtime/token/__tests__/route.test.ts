import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  getAppSession: vi.fn(),
  listEngagementIds: vi.fn(),
  getAblyRest: vi.fn(),
  createTokenRequest: vi.fn(),
}));
vi.mock("@/server/auth/session", () => ({ getAppSession: m.getAppSession }));
vi.mock("@/server/db/repositories/engagements.repository", () => ({
  listEngagementIds: m.listEngagementIds,
}));
vi.mock("@/server/realtime/ably", () => ({ getAblyRest: m.getAblyRest }));

import { POST } from "../route";

const ENG = "11111111-1111-4111-8111-111111111111";
const clientSession = {
  userId: "u1",
  role: "client",
  tenantId: "t1",
  engagementId: ENG,
  emailVerified: true,
  name: "C",
  email: "c@example.com",
};
const freelancerSession = {
  userId: "f1",
  role: "freelancer",
  tenantId: "t1",
  emailVerified: true,
  name: "F",
  email: "f@example.com",
};

beforeEach(() => {
  vi.clearAllMocks();
  m.createTokenRequest.mockResolvedValue({ keyName: "m_8hLA.xx", mac: "x", nonce: "n", timestamp: 1 });
  m.getAblyRest.mockReturnValue({ auth: { createTokenRequest: m.createTokenRequest } });
  m.getAppSession.mockResolvedValue(clientSession);
  m.listEngagementIds.mockResolvedValue([ENG]);
});

describe("POST /api/realtime/token", () => {
  it("no session → 401, no token minted", async () => {
    m.getAppSession.mockResolvedValue(null);
    expect((await POST()).status).toBe(401);
    expect(m.createTokenRequest).not.toHaveBeenCalled();
  });

  it("an unprovisioned session (role null) → 401", async () => {
    m.getAppSession.mockResolvedValue({ ...clientSession, role: null, tenantId: null });
    expect((await POST()).status).toBe(401);
  });

  it("an unverified session → 401, no token minted", async () => {
    m.getAppSession.mockResolvedValue({ ...clientSession, emailVerified: false });
    expect((await POST()).status).toBe(401);
    expect(m.createTokenRequest).not.toHaveBeenCalled();
  });

  it("realtime unconfigured → 503", async () => {
    m.getAblyRest.mockReturnValue(null);
    expect((await POST()).status).toBe(503);
    expect(m.createTokenRequest).not.toHaveBeenCalled();
  });

  it("a client → token scoped to THEIR engagement + user channel, clientId = userId (no engagement query)", async () => {
    const res = await POST();
    expect(res.status).toBe(200);
    expect(m.listEngagementIds).not.toHaveBeenCalled(); // client uses session.engagementId
    const arg = m.createTokenRequest.mock.calls[0][0] as { clientId: string; capability: string };
    expect(arg.clientId).toBe("u1");
    expect(JSON.parse(arg.capability)).toEqual({
      "user:u1": ["subscribe"],
      [`engagement:${ENG}`]: ["subscribe"],
    });
  });

  it("a freelancer → token scoped to THEIR engagements (RLS-scoped query) + user channel", async () => {
    m.getAppSession.mockResolvedValue(freelancerSession);
    await POST();
    expect(m.listEngagementIds).toHaveBeenCalledWith({ tenantId: "t1", userId: "f1", role: "freelancer" });
    expect(JSON.parse(m.createTokenRequest.mock.calls[0][0].capability)).toEqual({
      "user:f1": ["subscribe"],
      [`engagement:${ENG}`]: ["subscribe"],
    });
  });
});
