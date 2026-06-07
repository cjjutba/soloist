import { beforeEach, describe, expect, it, vi } from "vitest";

const ENG = "11111111-1111-4111-8111-111111111111";
const CAND = "22222222-2222-4222-8222-222222222222";
const CAND2 = "33333333-3333-4333-8333-333333333333";

const m = vi.hoisted(() => ({
  ctx: { tenantId: "t1", userId: "u1", role: "freelancer" as const },
  updateCandidate: vi.fn(),
  dismissCandidate: vi.fn(),
  dismissCandidates: vi.fn(),
}));

vi.mock("@/server/auth/session", () => ({ requireFreelancer: () => Promise.resolve(m.ctx) }));
vi.mock("@/server/db/repositories/ship-update.repository", () => ({
  updateCandidate: m.updateCandidate,
  dismissCandidate: m.dismissCandidate,
  dismissCandidates: m.dismissCandidates,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  bulkDismissCandidatesAction,
  dismissCandidateAction,
  editCandidateAction,
} from "../curation.actions";

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  m.updateCandidate.mockResolvedValue({ id: CAND });
  m.dismissCandidate.mockResolvedValue({ id: CAND, state: "dismissed" });
  m.dismissCandidates.mockResolvedValue({ count: 2 });
});

describe("Story 3.5 — curation actions", () => {
  it("edit: passes the parsed patch (title/summary/statusTag) to the repository", async () => {
    const res = await editCandidateAction({
      id: CAND,
      engagementId: ENG,
      title: "Clean title",
      summary: "Plain detail",
      statusTag: "shipped",
    });
    expect(res).toEqual({ ok: true });
    expect(m.updateCandidate).toHaveBeenCalledWith(m.ctx, CAND, {
      title: "Clean title",
      summary: "Plain detail",
      statusTag: "shipped",
    });
  });

  it("edit: a pure status re-tag is allowed (only statusTag present)", async () => {
    const res = await editCandidateAction({ id: CAND, engagementId: ENG, statusTag: "next" });
    expect(res).toEqual({ ok: true });
    expect(m.updateCandidate).toHaveBeenCalledWith(m.ctx, CAND, {
      title: undefined,
      summary: undefined,
      statusTag: "next",
    });
  });

  it("edit: an unknown statusTag is rejected by Zod before any repo call", async () => {
    const res = await editCandidateAction({ id: CAND, engagementId: ENG, statusTag: "bogus" });
    expect(res.ok).toBe(false);
    expect(m.updateCandidate).not.toHaveBeenCalled();
  });

  it("edit: an empty patch (no fields) is rejected", async () => {
    const res = await editCandidateAction({ id: CAND, engagementId: ENG });
    expect(res.ok).toBe(false);
    expect(m.updateCandidate).not.toHaveBeenCalled();
  });

  it("edit: a null repo result (gone/foreign/published) → friendly error", async () => {
    m.updateCandidate.mockResolvedValue(null);
    const res = await editCandidateAction({ id: CAND, engagementId: ENG, title: "x" });
    expect(res).toEqual({ ok: false, error: "That candidate is no longer in your queue." });
  });

  it("dismiss: happy path returns ok and calls the repo with the id", async () => {
    const res = await dismissCandidateAction({ id: CAND, engagementId: ENG });
    expect(res).toEqual({ ok: true });
    expect(m.dismissCandidate).toHaveBeenCalledWith(m.ctx, CAND);
  });

  it("dismiss: a null repo result → friendly error", async () => {
    m.dismissCandidate.mockResolvedValue(null);
    const res = await dismissCandidateAction({ id: CAND, engagementId: ENG });
    expect(res).toEqual({ ok: false, error: "That candidate is no longer in your queue." });
  });

  it("dismiss: non-uuid id → validation error, no repo call", async () => {
    const res = await dismissCandidateAction({ id: "nope", engagementId: ENG });
    expect(res.ok).toBe(false);
    expect(m.dismissCandidate).not.toHaveBeenCalled();
  });

  it("bulk-dismiss: returns the count moved", async () => {
    const res = await bulkDismissCandidatesAction({ ids: [CAND, CAND2], engagementId: ENG });
    expect(res).toEqual({ ok: true, count: 2 });
    expect(m.dismissCandidates).toHaveBeenCalledWith(m.ctx, [CAND, CAND2]);
  });

  it("bulk-dismiss: an empty selection is rejected by Zod", async () => {
    const res = await bulkDismissCandidatesAction({ ids: [], engagementId: ENG });
    expect(res.ok).toBe(false);
    expect(m.dismissCandidates).not.toHaveBeenCalled();
  });
});
