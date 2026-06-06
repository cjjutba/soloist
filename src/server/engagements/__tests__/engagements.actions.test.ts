import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  requireFreelancer: vi.fn(),
  createEngagement: vi.fn(),
  updateEngagement: vi.fn(),
  archiveEngagement: vi.fn(),
  getEngagement: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/auth/session", () => ({ requireFreelancer: m.requireFreelancer }));
vi.mock("@/server/db/repositories/engagements.repository", () => ({
  createEngagement: m.createEngagement,
  updateEngagement: m.updateEngagement,
  archiveEngagement: m.archiveEngagement,
  getEngagement: m.getEngagement,
}));

import {
  archiveEngagementAction,
  createEngagementAction,
  updateEngagementAction,
} from "../engagements.actions";

const CTX = { tenantId: "t1", userId: "u1", role: "freelancer" as const };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  m.requireFreelancer.mockResolvedValue(CTX);
  m.createEngagement.mockResolvedValue({ id: "e1" });
  m.updateEngagement.mockResolvedValue({ id: "e1" });
  m.archiveEngagement.mockResolvedValue({ id: "e1", status: "archived" });
});

describe("createEngagementAction (AC-1)", () => {
  it("validates, creates through the choke point, and returns the new id", async () => {
    const r = await createEngagementAction({ name: "Website", clientDisplayName: "Acme" });
    expect(r).toEqual({ ok: true, id: "e1" });
    expect(m.createEngagement).toHaveBeenCalledWith(CTX, {
      name: "Website",
      clientDisplayName: "Acme",
      scope: null,
    });
  });

  it("trims whitespace and maps an empty scope to null", async () => {
    await createEngagementAction({ name: "  Website  ", clientDisplayName: "Acme", scope: "   " });
    expect(m.createEngagement).toHaveBeenCalledWith(CTX, {
      name: "Website",
      clientDisplayName: "Acme",
      scope: null,
    });
  });

  it("rejects a blank name without touching the repository", async () => {
    const r = await createEngagementAction({ name: "   ", clientDisplayName: "Acme" });
    expect(r.ok).toBe(false);
    expect(m.createEngagement).not.toHaveBeenCalled();
  });

  it("rejects a blank client name without touching the repository", async () => {
    const r = await createEngagementAction({ name: "Website", clientDisplayName: "" });
    expect(r.ok).toBe(false);
    expect(m.createEngagement).not.toHaveBeenCalled();
  });

  it("returns a neutral error (no throw) if the repository fails", async () => {
    m.createEngagement.mockRejectedValue(new Error("db down"));
    const r = await createEngagementAction({ name: "Website", clientDisplayName: "Acme" });
    expect(r).toMatchObject({ ok: false });
  });
});

describe("updateEngagementAction (AC-2/AC-3)", () => {
  it("validates and applies a partial patch, leaving scope untouched when omitted", async () => {
    const r = await updateEngagementAction("e1", { name: "Renamed", status: "paused" });
    expect(r).toEqual({ ok: true });
    // scope omitted from input → omitted from the patch → Drizzle leaves the column alone.
    const [, , patch] = m.updateEngagement.mock.calls[0];
    expect(patch).toEqual({ name: "Renamed", status: "paused" });
    expect("scope" in patch).toBe(false);
  });

  it("clears scope when an explicit empty string is sent", async () => {
    await updateEngagementAction("e1", { scope: "  " });
    expect(m.updateEngagement).toHaveBeenCalledWith(CTX, "e1", expect.objectContaining({ scope: null }));
  });

  it("rejects an invalid status without touching the repository", async () => {
    const r = await updateEngagementAction("e1", { status: "deleted" });
    expect(r.ok).toBe(false);
    expect(m.updateEngagement).not.toHaveBeenCalled();
  });

  it("reports not-found when the row is missing or not the caller's", async () => {
    m.updateEngagement.mockResolvedValue(null);
    const r = await updateEngagementAction("nope", { name: "X" });
    expect(r).toMatchObject({ ok: false });
  });
});

describe("archiveEngagementAction (AC-3)", () => {
  it("soft-archives and reports success", async () => {
    const r = await archiveEngagementAction("e1");
    expect(r).toEqual({ ok: true });
    expect(m.archiveEngagement).toHaveBeenCalledWith(CTX, "e1");
  });

  it("reports not-found when the row is missing", async () => {
    m.archiveEngagement.mockResolvedValue(null);
    const r = await archiveEngagementAction("nope");
    expect(r).toMatchObject({ ok: false });
  });
});
