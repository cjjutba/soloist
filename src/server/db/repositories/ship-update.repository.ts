import { and, eq } from "drizzle-orm";
import { withTenant, type TenantContext } from "../context";
import { shipUpdates } from "../schema";

/** Create a CANDIDATE ShipUpdate (Story 3.1) — freelancer-only until an explicit publish
 * (Story 3.6). Idempotent: `onConflictDoNothing` on the `(engagement_id, source_event_key)`
 * unique, so a duplicate webhook delivery / an Inngest retry returns null (no second row).
 * `tenant_id` is always stamped from `ctx` (the system-derived scope), never input. */
export async function createCandidate(
  ctx: TenantContext,
  input: {
    engagementId: string;
    statusTag: string;
    title: string;
    summary?: string | null;
    source: string;
    sourceEventKey?: string | null;
    rawMeta?: unknown;
  },
) {
  return withTenant(ctx, async (tx) => {
    const [row] = await tx
      .insert(shipUpdates)
      .values({
        tenantId: ctx.tenantId,
        engagementId: input.engagementId,
        statusTag: input.statusTag,
        title: input.title,
        summary: input.summary ?? null,
        state: "candidate",
        source: input.source,
        sourceEventKey: input.sourceEventKey ?? null,
        rawMeta: input.rawMeta ?? null,
      })
      .onConflictDoNothing({ target: [shipUpdates.engagementId, shipUpdates.sourceEventKey] })
      .returning();
    return row ?? null; // null = duplicate (the candidate was already created)
  });
}

/** Kill-signal (Story 3.4 / AR-13): of the Tenant's PUBLISHED ship updates, what fraction were
 * EDITED before publish (`edited_at` set, stamped by the Story 3.5 curation edit)? A proxy for
 * heuristic rendering quality — a high edit rate means the auto-rendering needs work (or an LLM
 * summarizer behind the same `SummarizationProvider` seam). RLS-scoped. */
export async function renderingQualityStat(
  ctx: TenantContext,
): Promise<{ published: number; edited: number; editedRate: number }> {
  const rows = await withTenant(ctx, (tx) =>
    tx
      .select({ editedAt: shipUpdates.editedAt })
      .from(shipUpdates)
      .where(eq(shipUpdates.state, "published")),
  );
  const published = rows.length;
  const edited = rows.filter((r) => r.editedAt != null).length;
  return { published, edited, editedRate: published === 0 ? 0 : edited / published };
}

/** Read a candidate by its idempotency key (RLS-scoped → null if not the caller's). */
export async function findCandidateBySourceEventKey(
  ctx: TenantContext,
  engagementId: string,
  sourceEventKey: string,
) {
  return withTenant(ctx, async (tx) => {
    const [row] = await tx
      .select()
      .from(shipUpdates)
      .where(
        and(eq(shipUpdates.engagementId, engagementId), eq(shipUpdates.sourceEventKey, sourceEventKey)),
      )
      .limit(1);
    return row ?? null;
  });
}
