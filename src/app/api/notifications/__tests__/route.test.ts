import { beforeEach, describe, expect, it, vi } from "vitest";

const ENG = "11111111-1111-4111-8111-111111111111";

const m = vi.hoisted(() => ({
  getAppSession: vi.fn(),
  listNotifications: vi.fn(),
}));
vi.mock("@/server/auth/session", () => ({ getAppSession: m.getAppSession }));
vi.mock("@/server/db/repositories/notifications.repository", () => ({
  listNotifications: m.listNotifications,
}));

import { GET } from "../route";

const clientSession = {
  userId: "u1",
  name: "Client",
  email: "c@example.com",
  emailVerified: true,
  role: "client",
  tenantId: "t1",
  engagementId: ENG,
};

beforeEach(() => {
  vi.clearAllMocks();
  m.getAppSession.mockResolvedValue(clientSession);
  m.listNotifications.mockResolvedValue([
    { id: "n1", type: "ship_published", readAt: null, createdAt: new Date("2026-02-02T00:00:00Z"), shipUpdateId: "s1", title: "Shipped", statusTag: "shipped" },
  ]);
});

describe("Story 4.1 — GET /api/notifications (authz-scoped, session-keyed)", () => {
  it("a Client → 200 with their notifications; dates serialize to ISO strings", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const json = (await res.json()) as { notifications: { createdAt: string; readAt: string | null }[] };
    expect(json.notifications).toHaveLength(1);
    expect(json.notifications[0].createdAt).toBe("2026-02-02T00:00:00.000Z");
    expect(json.notifications[0].readAt).toBeNull();
    expect(res.headers.get("Cache-Control")).toBe("private, no-store"); // per-session, never proxy/bf-cached
    expect(m.listNotifications).toHaveBeenCalledWith({ tenantId: "t1", userId: "u1", role: "client", engagementId: ENG });
  });

  it("no session → 401, no read", async () => {
    m.getAppSession.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    expect(m.listNotifications).not.toHaveBeenCalled();
  });

  it("a freelancer / a client with no engagement → 403, no read", async () => {
    m.getAppSession.mockResolvedValue({ ...clientSession, role: "freelancer", engagementId: undefined });
    expect((await GET()).status).toBe(403);
    expect(m.listNotifications).not.toHaveBeenCalled();
  });
});
