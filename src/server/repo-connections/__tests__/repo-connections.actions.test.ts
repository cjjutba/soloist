import { beforeEach, describe, expect, it, vi } from "vitest";

const ENG = "11111111-1111-4111-8111-111111111111";
const CONN = "22222222-2222-4222-8222-222222222222";

const m = vi.hoisted(() => ({
  ctx: { tenantId: "t1", userId: "u1", role: "freelancer" as const },
  getEngagement: vi.fn(),
  connectRepo: vi.fn(),
  disconnectRepo: vi.fn(),
  listConnectableRepos: vi.fn(),
}));

vi.mock("@/server/auth/session", () => ({ requireFreelancer: () => Promise.resolve(m.ctx) }));
vi.mock("@/server/db/repositories/engagements.repository", () => ({ getEngagement: m.getEngagement }));
vi.mock("@/server/db/repositories/repo-connections.repository", () => ({
  connectRepo: m.connectRepo,
  disconnectRepo: m.disconnectRepo,
}));
vi.mock("@/server/github/app", () => ({ listConnectableRepos: m.listConnectableRepos }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { connectRepoAction, disconnectRepoAction } from "../repo-connections.actions";

const REPO = { installationId: "555", repoId: "100", fullName: "cjjutba/soloist", private: false };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  m.getEngagement.mockResolvedValue({ id: ENG });
  m.listConnectableRepos.mockResolvedValue([REPO]);
  m.connectRepo.mockResolvedValue({ id: CONN });
  m.disconnectRepo.mockResolvedValue({ id: CONN, status: "disconnected" });
});

describe("Story 3.2 — connect/disconnect actions", () => {
  it("connect resolves the gh ids from the installation and inserts the connection", async () => {
    const res = await connectRepoAction({ engagementId: ENG, repoFullName: "cjjutba/soloist" });
    expect(res).toEqual({ ok: true });
    expect(m.connectRepo).toHaveBeenCalledWith(m.ctx, {
      engagementId: ENG,
      ghInstallationId: "555",
      ghRepoId: "100",
      repoFullName: "cjjutba/soloist",
    });
  });

  it("a repo not available to the App → error, no insert", async () => {
    m.listConnectableRepos.mockResolvedValue([REPO]);
    const res = await connectRepoAction({ engagementId: ENG, repoFullName: "someone/else" });
    expect(res.ok).toBe(false);
    expect(m.connectRepo).not.toHaveBeenCalled();
  });

  it("a 23505 (already actively connected) maps to a friendly error", async () => {
    m.connectRepo.mockRejectedValueOnce({ code: "23505" });
    const res = await connectRepoAction({ engagementId: ENG, repoFullName: "cjjutba/soloist" });
    expect(res).toEqual({ ok: false, error: "That repo is already connected to an engagement." });
  });

  it("a missing engagement → error, no GitHub call", async () => {
    m.getEngagement.mockResolvedValue(null);
    const res = await connectRepoAction({ engagementId: ENG, repoFullName: "cjjutba/soloist" });
    expect(res.ok).toBe(false);
    expect(m.listConnectableRepos).not.toHaveBeenCalled();
  });

  it("invalid input (non-uuid engagement) → validation error, no work", async () => {
    const res = await connectRepoAction({ engagementId: "not-a-uuid", repoFullName: "cjjutba/soloist" });
    expect(res.ok).toBe(false);
    expect(m.getEngagement).not.toHaveBeenCalled();
  });

  it("disconnect flips the connection and returns ok", async () => {
    const res = await disconnectRepoAction({ engagementId: ENG, connectionId: CONN });
    expect(res).toEqual({ ok: true });
    expect(m.disconnectRepo).toHaveBeenCalledWith(m.ctx, CONN);
  });

  it("disconnect of a gone connection → error", async () => {
    m.disconnectRepo.mockResolvedValue(null);
    const res = await disconnectRepoAction({ engagementId: ENG, connectionId: CONN });
    expect(res).toEqual({ ok: false, error: "That connection no longer exists." });
  });
});
