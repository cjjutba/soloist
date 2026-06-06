import { findSpikeTargetEngagement } from "@/server/db/repositories/engagements.repository";

/**
 * Resolve which Engagement a repo's events feed (Story 3.1). **SPIKE:** ignores the repo and
 * returns the single active Engagement — proving the pipeline before the connect UI exists.
 * **Story 3.2 reimplements this as a `repo_connections` lookup keyed on `repoFullName`**
 * (a repo can feed exactly one Engagement; multiple repos can feed one Engagement).
 */
export async function resolveEngagementForRepo(
  _repoFullName: string,
): Promise<{ tenantId: string; engagementId: string } | null> {
  return findSpikeTargetEngagement();
}
