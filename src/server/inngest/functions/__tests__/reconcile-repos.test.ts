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

import { reconcileConnectedRepos } from "../reconcile-repos";

type Conn = {
  id: string;
  tenantId: string;
  engagementId: string;
  ghInstallationId: string;
  repoFullName: string;
  lastPullAt: Date | null;
};
const conn = (over: Partial<Conn> = {}): Conn => ({
  id: "c1",
  tenantId: "t1",
  engagementId: "e1",
  ghInstallationId: "555",
  repoFullName: "cj/x",
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
      headCommit: { sha: "abc", message: "Ship it", branch: "main" },
      pulls: [{ number: 7, title: "PR", merged: true, branch: "b", headSha: "s" }],
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
        : Promise.resolve({ headCommit: { sha: "z", message: "m", branch: "main" }, pulls: [], releases: [] }),
    );
    const r = await reconcileConnectedRepos();
    expect(m.markConnectionError).toHaveBeenCalledWith("bad", "GitHub returned 404");
    expect(m.markConnectionPulled).toHaveBeenCalledWith("good");
    expect(r).toEqual({ pulled: 1, candidates: 1, errored: 1 });
  });

  it("a deduped candidate (createCandidate → null) isn't counted but the repo is still marked pulled", async () => {
    m.listConnectionsForReconcile.mockResolvedValue([conn()]);
    m.pullRecentActivity.mockResolvedValue({
      headCommit: { sha: "abc", message: "x", branch: "main" },
      pulls: [],
      releases: [],
    });
    m.createCandidate.mockResolvedValue(null);
    const r = await reconcileConnectedRepos();
    expect(r).toEqual({ pulled: 1, candidates: 0, errored: 0 });
    expect(m.markConnectionPulled).toHaveBeenCalledWith("c1");
  });
});
