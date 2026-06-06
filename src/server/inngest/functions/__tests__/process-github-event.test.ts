import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  createCandidate: vi.fn(),
  markProcessed: vi.fn(),
  resolveEngagementForRepo: vi.fn(),
  removeInstallation: vi.fn(),
  disconnectByInstallation: vi.fn(),
}));

vi.mock("@/server/db/repositories/ship-update.repository", () => ({ createCandidate: m.createCandidate }));
vi.mock("@/server/db/repositories/webhook-event.repository", () => ({ markProcessed: m.markProcessed }));
vi.mock("@/server/db/repositories/github-installations.repository", () => ({
  removeInstallation: m.removeInstallation,
  disconnectByInstallation: m.disconnectByInstallation,
}));
vi.mock("@/server/ship-feed/resolve-engagement", () => ({ resolveEngagementForRepo: m.resolveEngagementForRepo }));
// The Inngest client is imported for the createFunction wrapper — give it a no-op shape.
vi.mock("../../client", () => ({ inngest: { createFunction: () => ({}) } }));

import { handleGithubEvent } from "../process-github-event";

const repo = { full_name: "cj/soloist" };
const mergedPr = {
  ghDeliveryId: "d1",
  eventType: "pull_request",
  payload: {
    action: "closed",
    repository: repo,
    pull_request: { number: 9, title: "Auth", merged: true, head: { ref: "feat/auth", sha: "deadbeef" } },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  m.markProcessed.mockResolvedValue(undefined);
  m.createCandidate.mockResolvedValue({ id: "su1" });
  m.resolveEngagementForRepo.mockResolvedValue({ tenantId: "t1", engagementId: "e1" });
  m.removeInstallation.mockResolvedValue(1);
  m.disconnectByInstallation.mockResolvedValue(0);
});

describe("handleGithubEvent (Story 3.1)", () => {
  it("a qualifying event + an engagement → creates a candidate with the mapped fields", async () => {
    const r = await handleGithubEvent(mergedPr);
    expect(r).toEqual({ status: "candidate", candidateId: "su1" });

    expect(m.createCandidate).toHaveBeenCalledWith(
      { tenantId: "t1", userId: "system", role: "freelancer" },
      expect.objectContaining({
        engagementId: "e1",
        statusTag: "shipped",
        title: "Shipped: Auth",
        source: "github",
        sourceEventKey: "pr:cj/soloist:9:merged",
      }),
    );
    // raw_meta carries the SHA; the title doesn't.
    expect(m.createCandidate.mock.calls[0][1].rawMeta).toMatchObject({ headSha: "deadbeef" });
    expect(m.createCandidate.mock.calls[0][1].title).not.toContain("deadbeef");
    expect(m.markProcessed).toHaveBeenCalledWith("d1");
  });

  it("a non-qualifying event → no candidate, still marks processed", async () => {
    const r = await handleGithubEvent({ ghDeliveryId: "d2", eventType: "issues", payload: { repository: repo, action: "opened" } });
    expect(r).toEqual({ status: "skipped", reason: "non-qualifying" });
    expect(m.createCandidate).not.toHaveBeenCalled();
    expect(m.markProcessed).toHaveBeenCalledWith("d2");
  });

  it("no resolvable engagement → no candidate (skipped)", async () => {
    m.resolveEngagementForRepo.mockResolvedValue(null);
    const r = await handleGithubEvent(mergedPr);
    expect(r).toEqual({ status: "skipped", reason: "no-engagement" });
    expect(m.createCandidate).not.toHaveBeenCalled();
  });

  it("a duplicate (createCandidate returns null) → candidateId null, no throw", async () => {
    m.createCandidate.mockResolvedValue(null);
    const r = await handleGithubEvent(mergedPr);
    expect(r).toEqual({ status: "candidate", candidateId: null });
  });

  it("an installation.deleted (uninstall) → removes the binding + disconnects its repos (3.2.1)", async () => {
    const r = await handleGithubEvent({
      ghDeliveryId: "d9",
      eventType: "installation",
      payload: { action: "deleted", installation: { id: 555 } },
    });
    expect(r).toEqual({ status: "uninstalled", installationId: "555" });
    expect(m.removeInstallation).toHaveBeenCalledWith("555");
    expect(m.disconnectByInstallation).toHaveBeenCalledWith("555");
    expect(m.createCandidate).not.toHaveBeenCalled();
    expect(m.markProcessed).toHaveBeenCalledWith("d9");
  });

  it("a non-deleted installation event → no cleanup, non-qualifying", async () => {
    const r = await handleGithubEvent({
      ghDeliveryId: "d10",
      eventType: "installation",
      payload: { action: "created", installation: { id: 555 } },
    });
    expect(r).toEqual({ status: "skipped", reason: "non-qualifying" });
    expect(m.removeInstallation).not.toHaveBeenCalled();
  });
});
