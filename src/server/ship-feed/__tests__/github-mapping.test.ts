import { describe, expect, it } from "vitest";
import { normalizeGithubEvent } from "../github-event";
import { cleanSubject, heuristicSummarizer } from "../summarization";

const map = (eventType: string, payload: unknown) => {
  const n = normalizeGithubEvent(eventType, payload);
  return n ? { ...n, ...heuristicSummarizer.mapEvent(n) } : null;
};

const repo = { full_name: "cj/soloist" };

describe("normalizeGithubEvent + heuristicSummarizer", () => {
  it("a push → in_progress, head-commit title, count summary", () => {
    const r = map("push", {
      repository: repo,
      ref: "refs/heads/main",
      after: "abc123",
      head_commit: { message: "Add the login form\n\nmore detail" },
      commits: [{}, {}, {}],
    });
    expect(r?.statusTag).toBe("in_progress");
    expect(r?.title).toBe("Add the login form"); // first line, cleaned
    expect(r?.summary).toBe("3 commits"); // no branch (NFR-3)
    expect(r?.summary).not.toContain("main");
    expect(r?.sourceEventKey).toBe("push:cj/soloist:abc123");
    // raw_meta carries the SHA; the title/summary do NOT.
    expect(r?.rawMeta.after).toBe("abc123");
    expect(r?.title).not.toContain("abc123");
  });

  it("a 1-commit push (empty message) → count fallback, no branch", () => {
    const r = map("push", {
      repository: repo,
      ref: "refs/heads/dev",
      after: "x1",
      head_commit: { message: "" },
      commits: [{}],
    });
    expect(r?.title).toBe("1 new commit");
    expect(r?.summary).toBe("1 commit");
    expect(r?.title).not.toContain("dev");
  });

  it("an opened PR → in_progress 'In review: …'", () => {
    const r = map("pull_request", {
      action: "opened",
      repository: repo,
      pull_request: { number: 7, title: "Dark mode", merged: false, head: { ref: "feat/dark", sha: "s" } },
    });
    expect(r?.statusTag).toBe("in_progress");
    expect(r?.title).toBe("In review: Dark mode");
    expect(r?.sourceEventKey).toBe("pr:cj/soloist:7:opened");
  });

  it("a merged PR → shipped 'Shipped: …'", () => {
    const r = map("pull_request", {
      action: "closed",
      repository: repo,
      pull_request: { number: 7, title: "Dark mode", merged: true, head: { ref: "feat/dark", sha: "s" } },
    });
    expect(r?.statusTag).toBe("shipped");
    expect(r?.title).toBe("Shipped: Dark mode");
    expect(r?.sourceEventKey).toBe("pr:cj/soloist:7:merged"); // distinct from the opened key
  });

  it("a published release → shipped", () => {
    const r = map("release", {
      action: "published",
      repository: repo,
      release: { tag_name: "v1.2.0", name: "Winter release" },
    });
    expect(r?.statusTag).toBe("shipped");
    expect(r?.title).toBe("Winter release");
    expect(r?.summary).toBe("Release v1.2.0");
    expect(r?.sourceEventKey).toBe("release:cj/soloist:v1.2.0");
  });

  it("the same logical event yields a STABLE sourceEventKey (idempotency)", () => {
    const e = { repository: repo, ref: "refs/heads/main", after: "deadbeef", head_commit: { message: "x" }, commits: [{}] };
    expect(normalizeGithubEvent("push", e)?.sourceEventKey).toBe(normalizeGithubEvent("push", e)?.sourceEventKey);
  });

  it("ignores non-qualifying events (synchronize, closed-unmerged, tag push, 0 commits, draft release, unknown)", () => {
    expect(map("pull_request", { action: "synchronize", repository: repo, pull_request: { number: 1, title: "x", head: {} } })).toBeNull();
    expect(map("pull_request", { action: "closed", repository: repo, pull_request: { number: 1, title: "x", merged: false, head: {} } })).toBeNull();
    expect(map("push", { repository: repo, ref: "refs/tags/v1", after: "a", commits: [{}] })).toBeNull();
    expect(map("push", { repository: repo, ref: "refs/heads/main", after: "0000000000", commits: [] })).toBeNull();
    expect(map("release", { action: "created", repository: repo, release: { tag_name: "v1" } })).toBeNull();
    expect(map("issues", { repository: repo, action: "opened" })).toBeNull();
    expect(map("push", { ref: "refs/heads/main", after: "a", commits: [{}] })).toBeNull(); // no repo
  });
});

describe("cleanSubject (Story 3.4 — plain-English rendering)", () => {
  it("drops a conventional-commit prefix + scope + breaking `!` + squash PR number, capitalizes", () => {
    expect(cleanSubject("feat(auth): add login (#42)")).toBe("Add login");
    expect(cleanSubject("fix: resolve the crash")).toBe("Resolve the crash");
    expect(cleanSubject("chore!: drop node 18")).toBe("Drop node 18");
    expect(cleanSubject("feat : add billing")).toBe("Add billing"); // tolerate a space before the colon
    expect(cleanSubject("docs: update README\n\nbody")).toBe("Update README"); // first line only
  });

  it("leaves a plain (non-conventional) subject alone — only capitalizes", () => {
    expect(cleanSubject("TODO: wire the webhook")).toBe("TODO: wire the webhook");
    expect(cleanSubject("polish the empty state")).toBe("Polish the empty state");
  });

  it("treats merge-commit boilerplate / empty as noise (null → caller uses a count)", () => {
    expect(cleanSubject("Merge pull request #5 from cj/feat-login")).toBeNull();
    expect(cleanSubject("Merge branch 'main' into dev")).toBeNull();
    expect(cleanSubject("")).toBeNull();
    expect(cleanSubject(null)).toBeNull();
  });
});
