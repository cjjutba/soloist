import { beforeEach, describe, expect, it, vi } from "vitest";

const ENG = "11111111-1111-4111-8111-111111111111";
const CONN = "22222222-2222-4222-8222-222222222222";

const m = vi.hoisted(() => ({
  ctx: { tenantId: "t1", userId: "u1", role: "freelancer" as const },
  getEngagement: vi.fn(),
  connectRepo: vi.fn(),
  disconnectRepo: vi.fn(),
  getConnection: vi.fn(),
  setProductionBranch: vi.fn(),
  listInstallationIds: vi.fn(),
  listReposForInstallations: vi.fn(),
  listBranches: vi.fn(),
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
  setProductionBranch: m.setProductionBranch,
}));
vi.mock("@/server/github/app", () => ({
  listReposForInstallations: m.listReposForInstallations,
  listBranches: m.listBranches,
}));
vi.mock("@/server/inngest/functions/reconcile-repos", () => ({
  pullAndRecordConnection: m.pullAndRecordConnection,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  connectRepoAction,
  disconnectRepoAction,
  listRepoBranchesAction,
  retryConnectionAction,
  setProductionBranchAction,
} from "../repo-connections.actions";

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
    productionBranch: "main",
    status: "error",
  });
  m.setProductionBranch.mockResolvedValue({ id: CONN, engagementId: ENG, productionBranch: "main" });
  m.listBranches.mockResolvedValue({ branches: ["main", "dev"], defaultBranch: "main" });
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
      productionBranch: null,
    });
  });

  it("connect with a chosen production branch passes it through", async () => {
    const res = await connectRepoAction({ engagementId: ENG, repoFullName: "cjjutba/soloist", productionBranch: "release" });
    expect(res).toEqual({ ok: true });
    expect(m.connectRepo).toHaveBeenCalledWith(
      m.ctx,
      expect.objectContaining({ productionBranch: "release" }),
    );
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
      productionBranch: "main",
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

describe("production branch — listRepoBranchesAction", () => {
  it("returns the repo's branches (scoped to the caller's installation)", async () => {
    const res = await listRepoBranchesAction({ engagementId: ENG, repoFullName: "cjjutba/soloist" });
    expect(res).toEqual({ ok: true, branches: ["main", "dev"], defaultBranch: "main" });
    expect(m.listBranches).toHaveBeenCalledWith("555", "cjjutba/soloist");
  });

  it("a repo not available to the caller's installation → error, no branch fetch", async () => {
    m.listReposForInstallations.mockResolvedValue([REPO]);
    const res = await listRepoBranchesAction({ engagementId: ENG, repoFullName: "someone/else" });
    expect(res.ok).toBe(false);
    expect(m.listBranches).not.toHaveBeenCalled();
  });
});

describe("production branch — setProductionBranchAction", () => {
  it("retargets the caller's connection and returns ok", async () => {
    const res = await setProductionBranchAction({ engagementId: ENG, connectionId: CONN, productionBranch: "main" });
    expect(res).toEqual({ ok: true });
    expect(m.setProductionBranch).toHaveBeenCalledWith(m.ctx, CONN, "main");
  });

  it("a foreign/gone connection (RLS → null) → error", async () => {
    m.setProductionBranch.mockResolvedValue(null);
    const res = await setProductionBranchAction({ engagementId: ENG, connectionId: CONN, productionBranch: "main" });
    expect(res).toEqual({ ok: false, error: "That connection no longer exists." });
  });

  it("an empty branch → validation error, no write", async () => {
    const res = await setProductionBranchAction({ engagementId: ENG, connectionId: CONN, productionBranch: "  " });
    expect(res.ok).toBe(false);
    expect(m.setProductionBranch).not.toHaveBeenCalled();
  });
});
