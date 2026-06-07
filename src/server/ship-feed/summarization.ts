import type { NormalizedGithubEvent } from "./github-event";

/** A founder-readable candidate, ready to store as a `ship_updates` row. */
export type CandidateSummary = {
  statusTag: "shipped" | "in_progress" | "next";
  title: string;
  summary: string | null;
};

/**
 * The summarization seam (Story 3.1, FR-11). v1 is a pure HEURISTIC/template — clean
 * commit/PR/release titles, never raw dev artifacts. The LLM summarizer is a fast-follow
 * behind THIS SAME interface (swap the implementation, not the callers).
 */
export interface SummarizationProvider {
  mapEvent(event: NormalizedGithubEvent): CandidateSummary;
}

// Known Conventional-Commit types only — so a plain `TODO:`/`Note:`/`WARNING:` subject is left
// alone rather than mangled.
const CONVENTIONAL_TYPE =
  /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert|wip)(\([^)]*\))?!?\s*:\s*/i;

/**
 * Turn a raw commit/PR/release subject into founder-readable plain English (Story 3.4, FR-11):
 * first line only; drop a Conventional-Commit type prefix; drop a squash PR-number suffix
 * `(#123)`; treat merge-commit boilerplate as noise (→ null, the caller falls back to a count);
 * capitalize. NEVER returns a SHA or branch (those stay in `raw_meta`).
 */
export function cleanSubject(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = raw.split("\n")[0].trim();
  if (!s) return null;
  if (/^merge\s+(pull request|branch|remote-tracking)/i.test(s)) return null; // merge boilerplate
  s = s.replace(CONVENTIONAL_TYPE, ""); // feat(scope)!: …  →  …
  s = s.replace(/\s*\(#\d+\)\s*$/, "").trim(); // squash PR-number suffix
  if (!s) return null;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** status_tag per FR-10: a merged PR or a published release → Shipped; an open PR or a push
 * → In Progress. (Manual/planned → Next, used by the manual path later.) Titles/summaries are
 * plain-English (cleanSubject) and never carry a SHA or branch name (NFR-3). */
export const heuristicSummarizer: SummarizationProvider = {
  mapEvent(event) {
    switch (event.kind) {
      case "push": {
        const n = event.commitCount;
        return {
          statusTag: "in_progress",
          // Prefer a cleaned head-commit subject (the human change description); else a count.
          title: cleanSubject(event.headCommitMessage) ?? `${n} new ${n === 1 ? "commit" : "commits"}`,
          summary: `${n} ${n === 1 ? "commit" : "commits"}`, // no branch — NFR-3
        };
      }
      case "pull_request": {
        const subject = cleanSubject(event.title) ?? event.title;
        return event.merged
          ? { statusTag: "shipped", title: `Shipped: ${subject}`, summary: null }
          : { statusTag: "in_progress", title: `In review: ${subject}`, summary: null };
      }
      case "release":
        return {
          statusTag: "shipped",
          title: cleanSubject(event.name) ?? `Released ${event.tag}`,
          summary: `Release ${event.tag}`,
        };
      default: {
        // Exhaustiveness guard — adding a NormalizedGithubEvent kind must add a case here, or
        // this fails to compile (rather than silently returning undefined at runtime).
        const _exhaustive: never = event;
        throw new Error(`Unhandled event kind: ${JSON.stringify(_exhaustive)}`);
      }
    }
  },
};
