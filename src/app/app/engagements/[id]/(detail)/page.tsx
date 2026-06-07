import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { isUuid } from "@/lib/uuid";
import { requireFreelancer } from "@/server/auth/session";
import { listCandidates } from "@/server/db/repositories/ship-update.repository";
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

  return (
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
  );
}
