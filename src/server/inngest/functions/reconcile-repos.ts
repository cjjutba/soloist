import {
  listConnectionsForReconcile,
  markConnectionError,
  markConnectionPulled,
} from "@/server/db/repositories/repo-connections.repository";
import { createCandidate } from "@/server/db/repositories/ship-update.repository";
import { pullRecentActivity } from "@/server/github/app";
import { pulledActivityToEvents } from "@/server/ship-feed/github-pull";
import { heuristicSummarizer } from "@/server/ship-feed/summarization";
import { inngest } from "../client";

/**
 * The reconciliation BACKSTOP (Story 3.3 / NFR-4): poll every connected repo's recent activity and
 * turn it into candidates — deduped against the real-time webhook path by MATCHING source_event_keys
 * (`createCandidate` is idempotent on `(engagement_id, source_event_key)`). A SYSTEM process (no
 * session): each connection row carries its tenant/engagement, so no resolve is needed. Per-repo
 * isolation: one repo's failure marks only that connection `error` and never aborts the rest.
 */
/**
 * Pull ONE connection's recent activity → candidates, and record the outcome on the connection
 * (Story 3.3; extracted in 3.9 so a freelancer-triggered Retry reuses it verbatim). Idempotent
 * (dedup via `source_event_key`) and self-contained: on success `markConnectionPulled` (clears
 * `last_error`, sets `status='connected'`); on ANY failure it CATCHES and `markConnectionError`
 * with a CONTROLLED message (never the raw Octokit error — its request config can carry the
 * installation token), which the repo card surfaces. Never throws → one repo can't abort the loop.
 */
export async function pullAndRecordConnection(conn: {
  id: string;
  tenantId: string;
  engagementId: string;
  ghInstallationId: string;
  repoFullName: string;
}): Promise<{ ok: boolean; candidates: number }> {
  try {
    const activity = await pullRecentActivity(conn.ghInstallationId, conn.repoFullName);
    let candidates = 0;
    for (const event of pulledActivityToEvents(conn.repoFullName, activity)) {
      const summary = heuristicSummarizer.mapEvent(event);
      const created = await createCandidate(
        { tenantId: conn.tenantId, userId: "system", role: "freelancer" },
        {
          engagementId: conn.engagementId,
          statusTag: summary.statusTag,
          title: summary.title,
          summary: summary.summary,
          source: "github",
          sourceEventKey: event.sourceEventKey,
          rawMeta: event.rawMeta,
        },
      );
      if (created) candidates += 1; // null = deduped (already made by the webhook / a prior run)
    }
    await markConnectionPulled(conn.id);
    return { ok: true, candidates };
  } catch (err) {
    const status = (err as { status?: number }).status;
    await markConnectionError(conn.id, typeof status === "number" ? `GitHub returned ${status}` : "Couldn’t reach GitHub");
    return { ok: false, candidates: 0 };
  }
}

export async function reconcileConnectedRepos(): Promise<{
  pulled: number;
  candidates: number;
  errored: number;
}> {
  const connections = await listConnectionsForReconcile();
  let pulled = 0;
  let candidates = 0;
  let errored = 0;

  for (const conn of connections) {
    const res = await pullAndRecordConnection(conn);
    if (res.ok) {
      pulled += 1;
      candidates += res.candidates;
    } else {
      errored += 1;
    }
  }

  return { pulled, candidates, errored };
}

/** Scheduled every ~10 min — the NFR-4 backstop. A cron trigger (no event payload). */
export const reconcileRepos = inngest.createFunction(
  { id: "reconcile-repos", triggers: [{ cron: "*/10 * * * *" }] },
  async () => reconcileConnectedRepos(),
);
