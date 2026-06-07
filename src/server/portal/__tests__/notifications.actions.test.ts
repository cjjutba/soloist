import { beforeEach, describe, expect, it, vi } from "vitest";

const N1 = "11111111-1111-4111-8111-111111111111";
const N2 = "22222222-2222-4222-8222-222222222222";

const m = vi.hoisted(() => ({
  ctx: { tenantId: "t1", userId: "client-1", role: "client" as const, engagementId: "e1" },
  markNotificationsRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
}));

vi.mock("@/server/auth/session", () => ({ requireClient: () => Promise.resolve(m.ctx) }));
vi.mock("@/server/db/repositories/notifications.repository", () => ({
  markNotificationsRead: m.markNotificationsRead,
  markAllNotificationsRead: m.markAllNotificationsRead,
}));

import { markAllNotificationsReadAction, markNotificationsReadAction } from "../notifications.actions";

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  m.markNotificationsRead.mockResolvedValue({ count: 2 });
  m.markAllNotificationsRead.mockResolvedValue({ count: 3 });
});

describe("Story 4.1 — notification mark-read actions", () => {
  it("markRead: passes the ids to the repo + returns ok", async () => {
    const res = await markNotificationsReadAction([N1, N2]);
    expect(res).toEqual({ ok: true });
    expect(m.markNotificationsRead).toHaveBeenCalledWith(m.ctx, [N1, N2]);
  });

  it("markRead: non-uuid ids are rejected before any repo call", async () => {
    const res = await markNotificationsReadAction(["nope"]);
    expect(res).toEqual({ ok: false });
    expect(m.markNotificationsRead).not.toHaveBeenCalled();
  });

  it("markRead: a repo throw → {ok:false}", async () => {
    m.markNotificationsRead.mockRejectedValue(new Error("db down"));
    expect(await markNotificationsReadAction([N1])).toEqual({ ok: false });
  });

  it("markRead: an oversized id array (>200) is rejected by Zod, no repo call", async () => {
    const tooMany = Array.from({ length: 201 }, () => N1);
    expect(await markNotificationsReadAction(tooMany)).toEqual({ ok: false });
    expect(m.markNotificationsRead).not.toHaveBeenCalled();
  });

  it("markAll: a repo throw → {ok:false}", async () => {
    m.markAllNotificationsRead.mockRejectedValue(new Error("db down"));
    expect(await markAllNotificationsReadAction()).toEqual({ ok: false });
  });

  it("markAll: calls markAllNotificationsRead + returns ok", async () => {
    const res = await markAllNotificationsReadAction();
    expect(res).toEqual({ ok: true });
    expect(m.markAllNotificationsRead).toHaveBeenCalledWith(m.ctx);
  });
});
