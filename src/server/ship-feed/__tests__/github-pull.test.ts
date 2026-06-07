import { describe, expect, it } from "vitest";
import type { PulledActivity } from "@/server/github/app";
import { normalizeGithubEvent } from "../github-event";
import { pulledActivityToEvents } from "../github-pull";

const repo = "cj/soloist";

describe("Story 3.3 — pulledActivityToEvents", () => {
  it("produces source_event_keys IDENTICAL to the webhook normalizer (the dedup depends on it)", () => {
    const pulled: PulledActivity = {
      headCommit: { sha: "abc123", message: "Add the login form\n\nbody", branch: "main" },
      pulls: [
        { number: 7, title: "Dark mode", merged: true, branch: "feat/dark", headSha: "s1" },
        { number: 9, title: "WIP", merged: false, branch: "feat/wip", headSha: "s2" },
      ],
      releases: [{ tag: "v1.2.0", name: "Winter" }],
    };
    const cronKeys = pulledActivityToEvents(repo, pulled)
      .map((e) => e.sourceEventKey)
      .sort();

    // The SAME logical events delivered as webhooks must yield the same keys.
    const webhookKeys = [
      normalizeGithubEvent("push", {
        repository: { full_name: repo },
        ref: "refs/heads/main",
        after: "abc123",
        head_commit: { message: "x" },
        commits: [{}],
      })!.sourceEventKey,
      normalizeGithubEvent("pull_request", {
        action: "closed",
        repository: { full_name: repo },
        pull_request: { number: 7, title: "Dark mode", merged: true, head: { ref: "feat/dark", sha: "s1" } },
      })!.sourceEventKey,
      normalizeGithubEvent("pull_request", {
        action: "opened",
        repository: { full_name: repo },
        pull_request: { number: 9, title: "WIP", merged: false, head: { ref: "feat/wip", sha: "s2" } },
      })!.sourceEventKey,
      normalizeGithubEvent("release", {
        action: "published",
        repository: { full_name: repo },
        release: { tag_name: "v1.2.0", name: "Winter" },
      })!.sourceEventKey,
    ].sort();

    expect(cronKeys).toEqual(webhookKeys);
  });

  it("keeps SHAs/branches in raw_meta, off the founder-facing fields", () => {
    const [push] = pulledActivityToEvents(repo, {
      headCommit: { sha: "deadbeef", message: "Fix the thing", branch: "main" },
      pulls: [],
      releases: [],
    });
    expect(push.kind).toBe("push");
    expect((push.rawMeta as { after: string }).after).toBe("deadbeef");
    if (push.kind === "push") expect(push.headCommitMessage).toBe("Fix the thing");
  });

  it("emits nothing for an empty pull", () => {
    expect(pulledActivityToEvents(repo, { pulls: [], releases: [] })).toEqual([]);
  });
});
