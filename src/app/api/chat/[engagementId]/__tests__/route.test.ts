import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  getAppSession: vi.fn(),
  getEngagement: vi.fn(),
  loadClientChatPayload: vi.fn(),
  loadFreelancerChatPayload: vi.fn(),
}));
vi.mock("@/server/auth/session", () => ({ getAppSession: m.getAppSession }));
vi.mock("@/server/db/repositories/engagements.repository", () => ({ getEngagement: m.getEngagement }));
vi.mock("@/server/chat/chat.read", () => ({
  loadClientChatPayload: m.loadClientChatPayload,
  loadFreelancerChatPayload: m.loadFreelancerChatPayload,
}));

import { GET } from "../route";

const ENG = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const clientSession = { userId: "cu", role: "client", tenantId: "t1", engagementId: ENG, emailVerified: true };
const freelancerSession = { userId: "fu", role: "freelancer", tenantId: "t1", emailVerified: true };

const call = (engagementId: string) =>
  GET(new Request("http://localhost/api/chat/x"), { params: Promise.resolve({ engagementId }) });

beforeEach(() => {
  vi.clearAllMocks();
  m.getAppSession.mockResolvedValue(clientSession);
  m.getEngagement.mockResolvedValue({ id: ENG });
  m.loadClientChatPayload.mockResolvedValue({ messages: [], unreadCount: 0, otherLastReadAt: null });
  m.loadFreelancerChatPayload.mockResolvedValue({ messages: [], unreadCount: 0, otherLastReadAt: null });
});

describe("GET /api/chat/[engagementId]", () => {
  it("no session → 401", async () => {
    m.getAppSession.mockResolvedValue(null);
    expect((await call(ENG)).status).toBe(401);
  });

  it("an unprovisioned session (role null) → 403", async () => {
    m.getAppSession.mockResolvedValue({ ...clientSession, role: null, tenantId: null });
    expect((await call(ENG)).status).toBe(403);
  });

  it("a client polling ANOTHER engagement → 403, no load", async () => {
    expect((await call(OTHER)).status).toBe(403);
    expect(m.loadClientChatPayload).not.toHaveBeenCalled();
  });

  it("a client polling THEIR engagement → 200 via the client loader", async () => {
    const res = await call(ENG);
    expect(res.status).toBe(200);
    expect(m.loadClientChatPayload).toHaveBeenCalledWith(
      { tenantId: "t1", userId: "cu", role: "client", engagementId: ENG },
      ENG,
    );
  });

  it("a freelancer with a malformed engagement id → 404 (before the cast)", async () => {
    m.getAppSession.mockResolvedValue(freelancerSession);
    expect((await call("not-a-uuid")).status).toBe(404);
    expect(m.getEngagement).not.toHaveBeenCalled();
  });

  it("a freelancer on a foreign engagement (getEngagement → null) → 403, no load", async () => {
    m.getAppSession.mockResolvedValue(freelancerSession);
    m.getEngagement.mockResolvedValue(null);
    expect((await call(ENG)).status).toBe(403);
    expect(m.loadFreelancerChatPayload).not.toHaveBeenCalled();
  });

  it("a freelancer on their own engagement → 200 via the freelancer loader", async () => {
    m.getAppSession.mockResolvedValue(freelancerSession);
    const res = await call(ENG);
    expect(res.status).toBe(200);
    expect(m.loadFreelancerChatPayload).toHaveBeenCalledWith(
      { tenantId: "t1", userId: "fu", role: "freelancer" },
      ENG,
    );
  });
});
