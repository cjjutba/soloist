import { beforeEach, describe, expect, it, vi } from "vitest";

const ENG = "11111111-1111-4111-8111-111111111111";
const CONN = "22222222-2222-4222-8222-222222222222";

const m = vi.hoisted(() => ({
  ctx: { tenantId: "t1", userId: "u1", role: "freelancer" as const },
  getEngagement: vi.fn(),
  connectRepo: vi.fn(),
  disconnectRepo: vi.fn(),
  getConnection: vi.fn(),
  listInstallationIds: vi.fn(),
  listReposForInstallations: vi.fn(),
  pullAndRecordConnection: vi.fn(),
}));

vi.mock("@/server/auth/session", () => ({ requireFreelancer: () => Promise.resolve(m.ctx) }));
vi.mock("@/server/db/repositories/engagements.repository", () => ({ getEngagement: m.getEngagement }));
vi.mock("@/server/db/repositories/github-installations.repository", () => ({
  listInstallationIds: m.listInstallationIds,
}));
vi.mock("@/server/db/repositories/repo-connections.repository", () => ({
  connectRepo: m.connectRepo,
  disconnectRepo: m.disconnectRepo,
  getConnection: m.getConnection,
}));
vi.mock("@/server/github/app", () => ({ listReposForInstallations: m.listReposForInstallations }));
vi.mock("@/server/inngest/functions/reconcile-repos", () => ({
  pullAndRecordConnection: m.pullAndRecordConnection,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { connectRepoAction, disconnectRepoAction, retryConnectionAction } from "../repo-connections.actions";

const REPO = { installationId: "555", repoId: "100", fullName: "cjjutba/soloist", private: false };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  m.getEngagement.mockResolvedValue({ id: ENG });
  m.listInstallationIds.mockResolvedValue(["555"]);
  m.listReposForInstallations.mockResolvedValue([REPO]);
  m.connectRepo.mockResolvedValue({ id: CONN });
  m.disconnectRepo.mockResolvedValue({ id: CONN, status: "disconnected" });
  m.getConnection.mockResolvedValue({
    id: CONN,
    tenantId: "t1",
    engagementId: ENG,
    ghInstallationId: "555",
    repoFullName: "cjjutba/soloist",
    status: "error",
  });
  m.pullAndRecordConnection.mockResolvedValue({ ok: true, candidates: 1 });
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
    m.listReposForInstallations.mockResolvedValue([REPO]);
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
    expect(m.listReposForInstallations).not.toHaveBeenCalled();
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

describe("Story 3.9 — retryConnectionAction", () => {
  it("re-runs the pull for the caller's connection; success → ok", async () => {
    const res = await retryConnectionAction({ engagementId: ENG, connectionId: CONN });
    expect(res).toEqual({ ok: true });
    expect(m.pullAndRecordConnection).toHaveBeenCalledWith({
      id: CONN,
      tenantId: "t1",
      engagementId: ENG,
      ghInstallationId: "555",
      repoFullName: "cjjutba/soloist",
    });
  });

  it("a continued failure → a friendly keep-retrying message (still not blocking anything)", async () => {
    m.pullAndRecordConnection.mockResolvedValue({ ok: false, candidates: 0 });
    const res = await retryConnectionAction({ engagementId: ENG, connectionId: CONN });
    expect(res).toEqual({ ok: false, error: "Still couldn't reach GitHub — auto-updates will keep retrying." });
  });

  it("a foreign/gone connection (null) → error, no pull", async () => {
    m.getConnection.mockResolvedValue(null);
    const res = await retryConnectionAction({ engagementId: ENG, connectionId: CONN });
    expect(res).toEqual({ ok: false, error: "That connection is gone." });
    expect(m.pullAndRecordConnection).not.toHaveBeenCalled();
  });

  it("a disconnected connection → error, no pull", async () => {
    m.getConnection.mockResolvedValue({ id: CONN, status: "disconnected" });
    const res = await retryConnectionAction({ engagementId: ENG, connectionId: CONN });
    expect(res.ok).toBe(false);
    expect(m.pullAndRecordConnection).not.toHaveBeenCalled();
  });

  it("non-uuid input → validation error, no work", async () => {
    const res = await retryConnectionAction({ engagementId: "nope", connectionId: CONN });
    expect(res.ok).toBe(false);
    expect(m.getConnection).not.toHaveBeenCalled();
  });
});
