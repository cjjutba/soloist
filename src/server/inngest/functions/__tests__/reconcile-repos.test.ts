import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  listConnectionsForReconcile: vi.fn(),
  markConnectionPulled: vi.fn(),
  markConnectionError: vi.fn(),
  createCandidate: vi.fn(),
  pullRecentActivity: vi.fn(),
}));

vi.mock("@/server/db/repositories/repo-connections.repository", () => ({
  listConnectionsForReconcile: m.listConnectionsForReconcile,
  markConnectionPulled: m.markConnectionPulled,
  markConnectionError: m.markConnectionError,
}));
vi.mock("@/server/db/repositories/ship-update.repository", () => ({ createCandidate: m.createCandidate }));
vi.mock("@/server/github/app", () => ({ pullRecentActivity: m.pullRecentActivity }));
vi.mock("../../client", () => ({ inngest: { createFunction: () => ({}) } }));

import { pullAndRecordConnection, reconcileConnectedRepos } from "../reconcile-repos";

type Conn = {
  id: string;
  tenantId: string;
  engagementId: string;
  ghInstallationId: string;
  repoFullName: string;
  productionBranch: string | null;
  lastPullAt: Date | null;
};
const conn = (over: Partial<Conn> = {}): Conn => ({
  id: "c1",
  tenantId: "t1",
  engagementId: "e1",
  ghInstallationId: "555",
  repoFullName: "cj/x",
  productionBranch: null,
  lastPullAt: null,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  m.markConnectionPulled.mockResolvedValue(undefined);
  m.markConnectionError.mockResolvedValue(undefined);
  m.createCandidate.mockResolvedValue({ id: "su1" });
});

describe("Story 3.3 — reconcileConnectedRepos", () => {
  it("pulls a connection, creates a scoped candidate per event, marks pulled", async () => {
    m.listConnectionsForReconcile.mockResolvedValue([conn()]);
    m.pullRecentActivity.mockResolvedValue({
      defaultBranch: "main",
      headCommit: { sha: "abc", message: "Ship it", branch: "main" },
      pulls: [{ number: 7, title: "PR", merged: true, branch: "b", base: "main", headSha: "s" }],
      releases: [],
    });
    const r = await reconcileConnectedRepos();
    expect(r).toEqual({ pulled: 1, candidates: 2, errored: 0 });
    expect(m.markConnectionPulled).toHaveBeenCalledWith("c1");
    // scoped to the connection's tenant/engagement, with the webhook-matching key
    expect(m.createCandidate).toHaveBeenCalledWith(
      { tenantId: "t1", userId: "system", role: "freelancer" },
      expect.objectContaining({ engagementId: "e1", source: "github", sourceEventKey: "push:cj/x:abc" }),
    );
  });

  it("per-repo isolation: a failing repo is marked error; the others still process", async () => {
    m.listConnectionsForReconcile.mockResolvedValue([
      conn({ id: "bad", repoFullName: "cj/bad" }),
      conn({ id: "good", repoFullName: "cj/good" }),
    ]);
    m.pullRecentActivity.mockImplementation((_inst: string, repo: string) =>
      repo === "cj/bad"
        ? Promise.reject(Object.assign(new Error("Not Found"), { status: 404 }))
        : Promise.resolve({ defaultBranch: "main", headCommit: { sha: "z", message: "m", branch: "main" }, pulls: [], releases: [] }),
    );
    const r = await reconcileConnectedRepos();
    expect(m.markConnectionError).toHaveBeenCalledWith("bad", "GitHub returned 404");
    expect(m.markConnectionPulled).toHaveBeenCalledWith("good");
    expect(r).toEqual({ pulled: 1, candidates: 1, errored: 1 });
  });

  it("a deduped candidate (createCandidate → null) isn't counted but the repo is still marked pulled", async () => {
    m.listConnectionsForReconcile.mockResolvedValue([conn()]);
    m.pullRecentActivity.mockResolvedValue({
      defaultBranch: "main",
      headCommit: { sha: "abc", message: "x", branch: "main" },
      pulls: [],
      releases: [],
    });
    m.createCandidate.mockResolvedValue(null);
    const r = await reconcileConnectedRepos();
    expect(r).toEqual({ pulled: 1, candidates: 0, errored: 0 });
    expect(m.markConnectionPulled).toHaveBeenCalledWith("c1");
  });

  it("the production-branch filter drops a PR merged into a non-production branch (parity with the webhook)", async () => {
    m.listConnectionsForReconcile.mockResolvedValue([conn({ productionBranch: "main" })]);
    m.pullRecentActivity.mockResolvedValue({
      defaultBranch: "main",
      pulls: [
        { number: 1, title: "into dev", merged: true, branch: "f1", base: "dev", headSha: "s1" }, // dropped
        { number: 2, title: "into main", merged: true, branch: "f2", base: "main", headSha: "s2" }, // kept
      ],
      releases: [],
    });
    const r = await reconcileConnectedRepos();
    expect(r).toEqual({ pulled: 1, candidates: 1, errored: 0 });
    // Only the merge INTO the production branch became a candidate.
    expect(m.createCandidate).toHaveBeenCalledTimes(1);
    expect(m.createCandidate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ sourceEventKey: "pr:cj/x:2:merged" }),
    );
  });
});

describe("Story 3.9 — pullAndRecordConnection (extracted; reused by the Retry)", () => {
  it("success → candidate created + markConnectionPulled + {ok:true}", async () => {
    m.pullRecentActivity.mockResolvedValue({
      defaultBranch: "main",
      headCommit: { sha: "abc", message: "Ship it", branch: "main" },
      pulls: [],
      releases: [],
    });
    const res = await pullAndRecordConnection(conn());
    expect(res).toEqual({ ok: true, candidates: 1 });
    expect(m.markConnectionPulled).toHaveBeenCalledWith("c1");
    expect(m.markConnectionError).not.toHaveBeenCalled();
  });

  it("an HTTP failure → markConnectionError with the controlled status message + {ok:false}", async () => {
    m.pullRecentActivity.mockRejectedValue(Object.assign(new Error("Not Found"), { status: 404 }));
    const res = await pullAndRecordConnection(conn());
    expect(res).toEqual({ ok: false, candidates: 0 });
    expect(m.markConnectionError).toHaveBeenCalledWith("c1", "GitHub returned 404");
    expect(m.markConnectionPulled).not.toHaveBeenCalled();
  });

  it("a non-HTTP throw → the generic 'Couldn’t reach GitHub' message (never the raw error)", async () => {
    m.pullRecentActivity.mockRejectedValue(new Error("ECONNRESET socket hang up"));
    const res = await pullAndRecordConnection(conn());
    expect(res.ok).toBe(false);
    expect(m.markConnectionError).toHaveBeenCalledWith("c1", "Couldn’t reach GitHub");
  });
});
