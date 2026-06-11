import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { formatRelativeTime } from "@/lib/relative-time";
import { isUuid } from "@/lib/uuid";
import { requireFreelancer } from "@/server/auth/session";
import { getEngagementLastSeen } from "@/server/db/repositories/client-access.repository";
import { listCandidates, listPublishedUpdates } from "@/server/db/repositories/ship-update.repository";
import { CurationQueue, type CandidateView } from "./curation-queue";
import { ManualUpdate } from "./manual-update";

// Ship Feed = the curation queue (Story 3.5), the default tab. The shell layout already guarded
// the engagement; this re-guards + reads the candidates (matching repos/page.tsx). Story 3.8 adds
// the manual-update fallback ABOVE the queue — always available (even empty / no repo / GitHub down).
export default async function ShipFeedTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const ctx = await requireFreelancer();

  // Project to the Client-safe view — title/summary/status/timestamps only, never raw_meta.
  const candidates: CandidateView[] = (await listCandidates(ctx, id)).map((r) => ({
    id: r.id,
    title: r.title,
    summary: r.summary,
    statusTag: r.statusTag,
    createdAt: r.createdAt,
  }));

  // "Seen by client": the published updates the Client sees + whether they've viewed since (an
  // update published at/before `last_seen_at` has been seen). Re-read live via CockpitRealtime.
  const published = await listPublishedUpdates(ctx, id);
  const lastSeen = await getEngagementLastSeen(ctx, id);
  const isSeen = (publishedAt: Date | null) =>
    publishedAt != null && lastSeen != null && publishedAt <= lastSeen;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <ManualUpdate engagementId={id} />
        {candidates.length === 0 ? (
          <Card className="flex flex-col items-center gap-2 p-12 text-center">
            <p className="font-medium">All caught up.</p>
            <p className="max-w-md text-sm text-muted-foreground">
              New activity from GitHub will appear here — or write one by hand above.
            </p>
          </Card>
        ) : (
          <CurationQueue engagementId={id} candidates={candidates} />
        )}
      </div>

      {published.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">Published — what your client sees</h2>
          {published.map((u) => (
            <Card key={u.id} className="flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{u.title}</p>
                <p className="text-xs text-muted-foreground">
                  {u.publishedAt ? `Published ${formatRelativeTime(u.publishedAt)}` : "Published"}
                </p>
              </div>
              {isSeen(u.publishedAt) ? (
                <span className="shrink-0 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  ✓ Seen
                </span>
              ) : (
                <span className="shrink-0 text-xs text-muted-foreground">Sent</span>
              )}
            </Card>
          ))}
        </section>
      ) : null}
    </div>
  );
}
