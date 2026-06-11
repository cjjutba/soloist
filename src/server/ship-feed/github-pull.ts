import type { PulledActivity } from "@/server/github/app";
import type { NormalizedGithubEvent } from "./github-event";

/**
 * Map a reconciliation pull (Story 3.3) into the SAME `NormalizedGithubEvent` shapes — and,
 * crucially, the SAME `sourceEventKey`s — that `normalizeGithubEvent` produces for the equivalent
 * webhook. That key match is what makes the cron's candidates dedupe against the real-time path
 * (`createCandidate` is idempotent on `(engagement_id, source_event_key)`), so a webhook + a cron
 * pull of the same event converge to exactly one candidate (NFR-4).
 */
export function pulledActivityToEvents(
  repoFullName: string,
  pulled: PulledActivity,
): NormalizedGithubEvent[] {
  const events: NormalizedGithubEvent[] = [];

  // Push: keyed by the head SHA — identical to the webhook's `push:{repo}:{after}`.
  if (pulled.headCommit) {
    const { sha, message, branch } = pulled.headCommit;
    events.push({
      kind: "push",
      repoFullName,
      sourceEventKey: `push:${repoFullName}:${sha}`,
      branch,
      defaultBranch: pulled.defaultBranch,
      commitCount: 1,
      headCommitMessage: message ? message.split("\n")[0].trim() : null,
      rawMeta: { after: sha, ref: `refs/heads/${branch}`, commitCount: 1 },
    });
  }

  // PRs: `pr:{repo}:{number}:{opened|merged}` — identical to the webhook.
  for (const pr of pulled.pulls) {
    const phase = pr.merged ? "merged" : "opened";
    events.push({
      kind: "pull_request",
      repoFullName,
      sourceEventKey: `pr:${repoFullName}:${pr.number}:${phase}`,
      number: pr.number,
      title: pr.title,
      merged: pr.merged,
      branch: pr.branch,
      baseBranch: pr.base,
      defaultBranch: pulled.defaultBranch,
      rawMeta: { number: pr.number, branch: pr.branch, baseBranch: pr.base, headSha: pr.headSha },
    });
  }

  // Releases: `release:{repo}:{tag}` — identical to the webhook.
  for (const rel of pulled.releases) {
    events.push({
      kind: "release",
      repoFullName,
      sourceEventKey: `release:${repoFullName}:${rel.tag}`,
      tag: rel.tag,
      name: rel.name,
      defaultBranch: pulled.defaultBranch,
      rawMeta: { tag: rel.tag },
    });
  }

  return events;
}
