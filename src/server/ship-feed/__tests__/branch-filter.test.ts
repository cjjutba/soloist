import { describe, expect, it } from "vitest";
import { isProductionEvent } from "../branch-filter";
import type { NormalizedGithubEvent } from "../github-event";

const push = (branch: string, defaultBranch: string | null = "main"): NormalizedGithubEvent => ({
  kind: "push",
  repoFullName: "cj/x",
  sourceEventKey: "k",
  branch,
  defaultBranch,
  commitCount: 1,
  headCommitMessage: "x",
  rawMeta: {},
});

const pr = (opts: {
  merged: boolean;
  base: string;
  defaultBranch?: string | null;
}): NormalizedGithubEvent => ({
  kind: "pull_request",
  repoFullName: "cj/x",
  sourceEventKey: "k",
  number: 1,
  title: "t",
  merged: opts.merged,
  branch: "feat/x",
  baseBranch: opts.base,
  // Respect an explicit `null` (a `?? "main"` would mask the no-default-branch case).
  defaultBranch: opts.defaultBranch === undefined ? "main" : opts.defaultBranch,
  rawMeta: {},
});

const release = (defaultBranch: string | null = "main"): NormalizedGithubEvent => ({
  kind: "release",
  repoFullName: "cj/x",
  sourceEventKey: "k",
  tag: "v1",
  name: null,
  defaultBranch,
  rawMeta: {},
});

describe("isProductionEvent — the Shipped-only gate", () => {
  it("push: candidate iff the pushed branch IS the production branch", () => {
    expect(isProductionEvent(push("main"), "main")).toBe(true);
    expect(isProductionEvent(push("feat/login"), "main")).toBe(false);
  });

  it("pull_request: candidate iff MERGED into the production branch", () => {
    expect(isProductionEvent(pr({ merged: true, base: "main" }), "main")).toBe(true);
    expect(isProductionEvent(pr({ merged: true, base: "dev" }), "main")).toBe(false);
    // PR-opened ("in review") is dropped even when its base is production.
    expect(isProductionEvent(pr({ merged: false, base: "main" }), "main")).toBe(false);
  });

  it("release: always a candidate", () => {
    expect(isProductionEvent(release(), "main")).toBe(true);
    expect(isProductionEvent(release(null), null)).toBe(true); // even with no resolvable branch
  });

  it("falls back to the repo's default branch when no production branch is set", () => {
    expect(isProductionEvent(push("main", "main"), null)).toBe(true);
    expect(isProductionEvent(push("feature", "main"), null)).toBe(false);
    expect(isProductionEvent(pr({ merged: true, base: "main", defaultBranch: "main" }), null)).toBe(true);
  });

  it("an explicit production branch overrides the default branch", () => {
    // Track "release/2.0"; default is "main".
    expect(isProductionEvent(push("release/2.0", "main"), "release/2.0")).toBe(true);
    expect(isProductionEvent(push("main", "main"), "release/2.0")).toBe(false);
  });

  it("drops push/PR when neither a production branch nor a default branch is known", () => {
    expect(isProductionEvent(push("main", null), null)).toBe(false);
    expect(isProductionEvent(pr({ merged: true, base: "main", defaultBranch: null }), null)).toBe(false);
  });
});
