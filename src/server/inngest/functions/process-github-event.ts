import {
  disconnectByInstallation,
  removeInstallation,
} from "@/server/db/repositories/github-installations.repository";
import { createCandidate } from "@/server/db/repositories/ship-update.repository";
import { markProcessed } from "@/server/db/repositories/webhook-event.repository";
import { normalizeGithubEvent, parseInstallationDeleted } from "@/server/ship-feed/github-event";
import { resolveEngagementForRepo } from "@/server/ship-feed/resolve-engagement";
import { heuristicSummarizer } from "@/server/ship-feed/summarization";
import { inngest, type GithubEventReceived } from "../client";

export type HandleResult =
  | { status: "candidate"; candidateId: string | null }
  | { status: "skipped"; reason: "non-qualifying" | "no-engagement" }
  | { status: "uninstalled"; installationId: string };

/**
 * The core of the GitHub → candidate pipeline (Story 3.1), extracted so it's unit-testable
 * outside the Inngest runtime. Idempotent end-to-end: a non-qualifying event no-ops; a
 * duplicate `source_event_key` yields `candidateId: null` (the dedupe). Always stamps the
 * delivery processed.
 */
export async function handleGithubEvent(data: GithubEventReceived): Promise<HandleResult> {
  // Uninstall cleanup (Story 3.2.1): drop the Tenant binding + disconnect that installation's repos.
  const uninstalled = parseInstallationDeleted(data.eventType, data.payload);
  if (uninstalled) {
    // Disconnect FIRST (stops the resolve routing) then remove the binding, so a mid-failure
    // retry never leaves repos still routing for a removed installation.
    await disconnectByInstallation(uninstalled);
    await removeInstallation(uninstalled);
    await markProcessed(data.ghDeliveryId);
    return { status: "uninstalled", installationId: uninstalled };
  }

  const normalized = normalizeGithubEvent(data.eventType, data.payload);
  if (!normalized) {
    await markProcessed(data.ghDeliveryId);
    return { status: "skipped", reason: "non-qualifying" };
  }

  // SPIKE: the single active Engagement. Story 3.2 → repo_connections lookup by repoFullName.
  const target = await resolveEngagementForRepo(normalized.repoFullName);
  if (!target) {
    await markProcessed(data.ghDeliveryId);
    return { status: "skipped", reason: "no-engagement" };
  }

  const summary = heuristicSummarizer.mapEvent(normalized);
  // System-derived scope (no session): a tenant-scoped ctx satisfies the ship_update WITH CHECK.
  const created = await createCandidate(
    { tenantId: target.tenantId, userId: "system", role: "freelancer" },
    {
      engagementId: target.engagementId,
      statusTag: summary.statusTag,
      title: summary.title,
      summary: summary.summary,
      source: "github",
      sourceEventKey: normalized.sourceEventKey,
      rawMeta: normalized.rawMeta,
    },
  );
  await markProcessed(data.ghDeliveryId);
  return { status: "candidate", candidateId: created?.id ?? null };
}

/** The durable, retrying Inngest function. Idempotency lives in the dedupe keys
 * (`webhook_events.gh_delivery_id` + `ship_updates(engagement_id, source_event_key)`), so a
 * whole-function retry is safe. */
export const processGithubEvent = inngest.createFunction(
  { id: "process-github-event", triggers: [{ event: "github/event.received" }] },
  async ({ event }) => handleGithubEvent(event.data as GithubEventReceived),
);
