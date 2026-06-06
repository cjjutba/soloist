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

/** status_tag per FR-10: a merged PR or a published release → Shipped; an open PR or a push
 * → In Progress. (Manual/planned → Next, used by the manual path later.) */
export const heuristicSummarizer: SummarizationProvider = {
  mapEvent(event) {
    switch (event.kind) {
      case "push": {
        const n = event.commitCount;
        return {
          statusTag: "in_progress",
          // Prefer the head commit's first line (the human change description); else a count.
          title: event.headCommitMessage || `${n} ${n === 1 ? "update" : "updates"} to ${event.branch}`,
          summary: `${n} ${n === 1 ? "commit" : "commits"} on ${event.branch}`,
        };
      }
      case "pull_request":
        return event.merged
          ? { statusTag: "shipped", title: `Shipped: ${event.title}`, summary: null }
          : { statusTag: "in_progress", title: `In review: ${event.title}`, summary: null };
      case "release":
        return {
          statusTag: "shipped",
          title: event.name || `Released ${event.tag}`,
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
