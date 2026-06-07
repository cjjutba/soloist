import { and, desc, eq, inArray, sql } from "drizzle-orm";
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

/** The curation queue (Story 3.5): the Engagement's candidates awaiting curation, newest
 * first. RLS scopes to the Tenant; the explicit `engagement_id` filter narrows the view to
 * this Engagement (a freelancer ctx has no `app.engagement_id`, so the policy alone wouldn't). */
export async function listCandidates(ctx: TenantContext, engagementId: string) {
  return withTenant(ctx, (tx) =>
    tx
      .select()
      .from(shipUpdates)
      .where(and(eq(shipUpdates.engagementId, engagementId), eq(shipUpdates.state, "candidate")))
      .orderBy(desc(shipUpdates.createdAt)),
  );
}

/** Curate a candidate (Story 3.5): patch the founder-readable title/summary and/or re-tag its
 * status. **Allow-listed** — only those three columns are settable (never spread caller input,
 * mirroring `updateEngagement`), so `tenant_id`/`state`/`id` can't be moved through this path.
 * Always stamps `edited_at` (the Story 3.4 kill-signal: any curation edit means the heuristic
 * output wasn't publish-ready). Guarded to `state='candidate'` → can't edit a published/dismissed
 * row, and returns null for a foreign/non-candidate id (RLS + the guard). */
export async function updateCandidate(
  ctx: TenantContext,
  id: string,
  data: { title?: string; summary?: string | null; statusTag?: string },
) {
  const { title, summary, statusTag } = data;
  return withTenant(ctx, async (tx) => {
    const [row] = await tx
      .update(shipUpdates)
      .set({
        ...(title !== undefined ? { title } : {}),
        ...(summary !== undefined ? { summary } : {}),
        ...(statusTag !== undefined ? { statusTag } : {}),
        editedAt: sql`now()`,
      })
      .where(and(eq(shipUpdates.id, id), eq(shipUpdates.state, "candidate")))
      .returning();
    return row ?? null;
  });
}

/** Dismiss a candidate (Story 3.5) → `state='dismissed'`: it leaves the queue and never reaches
 * the Client, but is kept for history. Guarded to `state='candidate'` so it's idempotent (a
 * replay returns null) and can never un-publish a published row. */
export async function dismissCandidate(ctx: TenantContext, id: string) {
  return withTenant(ctx, async (tx) => {
    const [row] = await tx
      .update(shipUpdates)
      .set({ state: "dismissed" })
      .where(and(eq(shipUpdates.id, id), eq(shipUpdates.state, "candidate")))
      .returning();
    return row ?? null;
  });
}

/** Bulk-dismiss (Story 3.5, the `lg+` bulk-select). Same `state='candidate'` guard → only
 * candidates flip; already-dismissed/foreign ids are silently skipped. Returns the count moved. */
export async function dismissCandidates(
  ctx: TenantContext,
  ids: string[],
): Promise<{ count: number }> {
  if (ids.length === 0) return { count: 0 };
  return withTenant(ctx, async (tx) => {
    const rows = await tx
      .update(shipUpdates)
      .set({ state: "dismissed" })
      .where(and(inArray(shipUpdates.id, ids), eq(shipUpdates.state, "candidate")))
      .returning({ id: shipUpdates.id });
    return { count: rows.length };
  });
}

/** The dashboard's "needs attention" counts (Story 3.5 makes Story 2.2's badge real): the number
 * of `state='candidate'` rows per Engagement (dismissed/published excluded). One grouped, RLS-
 * scoped query → a `Map<engagementId, count>` the dashboard merges onto its rows. */
export async function countCandidatesByEngagement(
  ctx: TenantContext,
): Promise<Map<string, number>> {
  const rows = await withTenant(ctx, (tx) =>
    tx
      .select({
        engagementId: shipUpdates.engagementId,
        count: sql<number>`count(*)::int`,
      })
      .from(shipUpdates)
      .where(eq(shipUpdates.state, "candidate"))
      .groupBy(shipUpdates.engagementId),
  );
  return new Map(rows.map((r) => [r.engagementId, r.count]));
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
