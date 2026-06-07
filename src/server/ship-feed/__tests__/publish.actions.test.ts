import { beforeEach, describe, expect, it, vi } from "vitest";

const ENG = "11111111-1111-4111-8111-111111111111";
const CAND = "22222222-2222-4222-8222-222222222222";
const CAND2 = "33333333-3333-4333-8333-333333333333";

const m = vi.hoisted(() => ({
  ctx: { tenantId: "t1", userId: "u1", role: "freelancer" as const },
  publishShipUpdate: vi.fn(),
  publishShipUpdates: vi.fn(),
  send: vi.fn(),
  captureException: vi.fn(),
}));

vi.mock("@/server/auth/session", () => ({ requireFreelancer: () => Promise.resolve(m.ctx) }));
vi.mock("@/server/db/repositories/ship-update.repository", () => ({
  publishShipUpdate: m.publishShipUpdate,
  publishShipUpdates: m.publishShipUpdates,
}));
vi.mock("@/server/inngest/client", () => ({ inngest: { send: m.send } }));
vi.mock("@sentry/nextjs", () => ({ captureException: m.captureException }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { bulkPublishCandidatesAction, publishCandidateAction } from "../publish.actions";

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  m.publishShipUpdate.mockResolvedValue({ id: CAND, engagementId: ENG, tenantId: "t1" });
  m.publishShipUpdates.mockResolvedValue([
    { id: CAND, engagementId: ENG, tenantId: "t1" },
    { id: CAND2, engagementId: ENG, tenantId: "t1" },
  ]);
  m.send.mockResolvedValue(undefined);
});

describe("Story 3.6 — publish actions", () => {
  it("publishes (the gate) + emits ship/update.published with the ids", async () => {
    const res = await publishCandidateAction({ id: CAND, engagementId: ENG });
    expect(res).toEqual({ ok: true });
    expect(m.publishShipUpdate).toHaveBeenCalledWith(m.ctx, CAND);
    expect(m.send).toHaveBeenCalledWith({
      name: "ship/update.published",
      data: { shipUpdateId: CAND, engagementId: ENG, tenantId: "t1" },
    });
  });

  it("a null repo result (not a candidate / foreign) → friendly error, NO event emitted", async () => {
    m.publishShipUpdate.mockResolvedValue(null);
    const res = await publishCandidateAction({ id: CAND, engagementId: ENG });
    expect(res).toEqual({ ok: false, error: "That candidate is no longer in your queue." });
    expect(m.send).not.toHaveBeenCalled();
  });

  it("an emit failure STILL returns ok (publish is durable) + reports to Sentry", async () => {
    m.send.mockRejectedValueOnce(new Error("inngest unreachable"));
    const res = await publishCandidateAction({ id: CAND, engagementId: ENG });
    expect(res).toEqual({ ok: true });
    expect(m.captureException).toHaveBeenCalled();
  });

  it("invalid input (non-uuid) → validation error, no publish", async () => {
    const res = await publishCandidateAction({ id: "nope", engagementId: ENG });
    expect(res.ok).toBe(false);
    expect(m.publishShipUpdate).not.toHaveBeenCalled();
  });

  it("bulk publishes + emits one event per row + returns the count", async () => {
    const res = await bulkPublishCandidatesAction({ ids: [CAND, CAND2], engagementId: ENG });
    expect(res).toEqual({ ok: true, count: 2 });
    expect(m.send).toHaveBeenCalledTimes(2);
  });

  it("bulk: an empty selection is rejected by Zod (no publish)", async () => {
    const res = await bulkPublishCandidatesAction({ ids: [], engagementId: ENG });
    expect(res.ok).toBe(false);
    expect(m.publishShipUpdates).not.toHaveBeenCalled();
  });
});
