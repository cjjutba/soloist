import { beforeEach, describe, expect, it, vi } from "vitest";

const ENG = "11111111-1111-4111-8111-111111111111";

const m = vi.hoisted(() => ({
  ctx: { tenantId: "t1", userId: "u1", role: "freelancer" as const },
  getEngagement: vi.fn(),
  createCandidate: vi.fn(),
}));

vi.mock("@/server/auth/session", () => ({ requireFreelancer: () => Promise.resolve(m.ctx) }));
vi.mock("@/server/db/repositories/engagements.repository", () => ({ getEngagement: m.getEngagement }));
vi.mock("@/server/db/repositories/ship-update.repository", () => ({ createCandidate: m.createCandidate }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createManualUpdateAction } from "../manual-update.actions";

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  m.getEngagement.mockResolvedValue({ id: ENG });
  m.createCandidate.mockResolvedValue({ id: "su1" });
});

describe("Story 3.8 — manual ship update action", () => {
  it("creates a source='manual' candidate with the parsed fields", async () => {
    const res = await createManualUpdateAction({
      engagementId: ENG,
      title: "  Shipped the billing page  ",
      summary: "  Clients can pay now.  ",
      statusTag: "shipped",
    });
    expect(res).toEqual({ ok: true });
    expect(m.createCandidate).toHaveBeenCalledWith(m.ctx, {
      engagementId: ENG,
      statusTag: "shipped",
      title: "Shipped the billing page", // trimmed
      summary: "Clients can pay now.",
      source: "manual",
    });
  });

  it("an empty/whitespace title is rejected by Zod before any work", async () => {
    const res = await createManualUpdateAction({ engagementId: ENG, title: "   ", statusTag: "next" });
    expect(res.ok).toBe(false);
    expect(m.getEngagement).not.toHaveBeenCalled();
    expect(m.createCandidate).not.toHaveBeenCalled();
  });

  it("an unknown statusTag is rejected by Zod", async () => {
    const res = await createManualUpdateAction({ engagementId: ENG, title: "x", statusTag: "bogus" });
    expect(res.ok).toBe(false);
    expect(m.createCandidate).not.toHaveBeenCalled();
  });

  it("a non-uuid engagement is rejected by Zod", async () => {
    const res = await createManualUpdateAction({ engagementId: "nope", title: "x", statusTag: "next" });
    expect(res.ok).toBe(false);
    expect(m.getEngagement).not.toHaveBeenCalled();
  });

  it("a foreign/gone engagement (null getEngagement) → friendly error, no create", async () => {
    m.getEngagement.mockResolvedValue(null);
    const res = await createManualUpdateAction({ engagementId: ENG, title: "x", statusTag: "next" });
    expect(res).toEqual({ ok: false, error: "That engagement no longer exists." });
    expect(m.createCandidate).not.toHaveBeenCalled();
  });

  it("a null summary is allowed (optional)", async () => {
    const res = await createManualUpdateAction({ engagementId: ENG, title: "Quick note", summary: null, statusTag: "in_progress" });
    expect(res).toEqual({ ok: true });
    expect(m.createCandidate).toHaveBeenCalledWith(
      m.ctx,
      expect.objectContaining({ summary: null, source: "manual" }),
    );
  });
});
