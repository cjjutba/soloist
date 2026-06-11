import { findEngagementForRepo } from "@/server/db/repositories/repo-connections.repository";

/**
 * Resolve which Engagement a repo's events feed (Story 3.2). Looks up the ACTIVE
 * `repo_connections` row keyed on `repoFullName` (a repo feeds exactly one Engagement; many
 * repos can feed one Engagement). Returns null for an unconnected/disconnected repo → the
 * GitHub pipeline no-ops (no candidate). **Replaces the Story 3.1 single-active-Engagement
 * spike shortcut** (`findSpikeTargetEngagement`), which also retires the "every push to any
 * repo creates a candidate" side effect that the all-repos install caused.
 */
export async function resolveEngagementForRepo(
  repoFullName: string,
): Promise<{ tenantId: string; engagementId: string; productionBranch: string | null } | null> {
  return findEngagementForRepo(repoFullName);
}
