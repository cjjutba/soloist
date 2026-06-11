import type { NormalizedGithubEvent } from "./github-event";

/**
 * The "Shipped-only" production-branch gate (the one piece of branching logic, shared by BOTH
 * ingestion paths — the real-time webhook and the reconcile cron — so they stay in lockstep).
 *
 * An event becomes a candidate ONLY if it represents work reaching the repo's PRODUCTION branch:
 *   - release          → always (a published release is inherently a production signal)
 *   - push             → the pushed branch IS the production branch
 *   - pull_request     → it is MERGED and its BASE (the branch it merged into) is production
 *
 * Everything else is dropped: pushes to feature/worktree branches, and PR-opened ("in review")
 * events — which is what was flooding the curation queue.
 *
 * The production branch is resolved as `productionBranch ?? event.defaultBranch` (the connection's
 * explicit choice, else the repo's GitHub default). If neither is known, push/PR are dropped
 * (we can't confirm production) while releases still pass.
 */
export function isProductionEvent(
  event: NormalizedGithubEvent,
  productionBranch: string | null,
): boolean {
  if (event.kind === "release") return true;

  const resolved = productionBranch ?? event.defaultBranch;
  if (!resolved) return false;

  if (event.kind === "push") return event.branch === resolved;
  // pull_request: only a merge INTO production counts (PR-opened is dropped).
  return event.merged && event.baseBranch === resolved;
}
