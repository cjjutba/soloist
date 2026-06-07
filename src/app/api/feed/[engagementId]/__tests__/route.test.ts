import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  getAppSession: vi.fn(),
  listPublishedUpdates: vi.fn(),
}));
vi.mock("@/server/auth/session", () => ({ getAppSession: m.getAppSession }));
vi.mock("@/server/db/repositories/ship-update.repository", () => ({
  listPublishedUpdates: m.listPublishedUpdates,
}));

import { GET } from "../route";

const ENG = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const clientSession = {
  userId: "u1",
  name: "Client",
  email: "c@example.com",
  emailVerified: true,
  role: "client",
  tenantId: "t1",
  engagementId: ENG,
};

const call = (engagementId: string) =>
  GET(new Request(`http://localhost/api/feed/${engagementId}`), {
    params: Promise.resolve({ engagementId }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  m.getAppSession.mockResolvedValue(clientSession);
  m.listPublishedUpdates.mockResolvedValue([
    { id: "s1", statusTag: "shipped", title: "Shipped auth", summary: null, publishedAt: new Date("2026-06-07T00:00:00Z") },
  ]);
});

describe("Story 3.7 — GET /api/feed/[engagementId] (authz-scoped)", () => {
  it("a Client polling their OWN engagement → 200; the Date publishedAt serializes to an ISO string", async () => {
    const res = await call(ENG);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { updates: { publishedAt: string }[] };
    expect(json.updates).toHaveLength(1);
    expect(json.updates[0].publishedAt).toBe("2026-06-07T00:00:00.000Z"); // the FeedUpdate wire contract
    expect(m.listPublishedUpdates).toHaveBeenCalledWith(
      { tenantId: "t1", userId: "u1", role: "client", engagementId: ENG },
      ENG,
    );
  });

  it("an authenticated client with NO engagementId (un-onboarded / no ClientAccess) → 403, no read", async () => {
    m.getAppSession.mockResolvedValue({ ...clientSession, engagementId: undefined });
    expect((await call(ENG)).status).toBe(403);
    expect(m.listPublishedUpdates).not.toHaveBeenCalled();
  });

  it("no session → 401, no read", async () => {
    m.getAppSession.mockResolvedValue(null);
    expect((await call(ENG)).status).toBe(401);
    expect(m.listPublishedUpdates).not.toHaveBeenCalled();
  });

  it("a freelancer (not a client) → 403, no read", async () => {
    m.getAppSession.mockResolvedValue({ ...clientSession, role: "freelancer", engagementId: undefined });
    expect((await call(ENG)).status).toBe(403);
    expect(m.listPublishedUpdates).not.toHaveBeenCalled();
  });

  it("a Client polling ANOTHER engagement (URL tamper) → 403, no read", async () => {
    const res = await call(OTHER); // session.engagementId is ENG; the path param is OTHER
    expect(res.status).toBe(403);
    expect(m.listPublishedUpdates).not.toHaveBeenCalled();
  });
});
