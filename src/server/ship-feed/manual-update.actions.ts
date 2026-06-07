"use server";

import { revalidatePath } from "next/cache";
import { requireFreelancer } from "@/server/auth/session";
import { getEngagement } from "@/server/db/repositories/engagements.repository";
import { createCandidate } from "@/server/db/repositories/ship-update.repository";
import { manualUpdateSchema } from "./curation.schema";

export type ManualUpdateResult = { ok: true } | { ok: false; error: string };

/**
 * Author a manual Ship Update (Story 3.8 — the GitHub-independent fallback). Creates a
 * `source='manual'` candidate that enters the curation queue and flows through the SAME
 * edit/dismiss/publish pipeline (3.5/3.6) — no auto-publish. The `getEngagement` guard is
 * LOAD-BEARING, not just fail-fast: the `ship_update_scope` WITH CHECK only gates `tenant_id`
 * (a freelancer ctx sets no `app.engagement_id`), so RLS would NOT reject a row stamped to the
 * caller's tenant but pointing at a FOREIGN `engagement_id`. The RLS-scoped `getEngagement`
 * (null for a non-caller's engagement) is what prevents that malformed cross-engagement write.
 * Never touches GitHub, so it works when the pipeline can't.
 */
export async function createManualUpdateAction(input: {
  engagementId: string;
  title: string;
  summary?: string | null;
  statusTag: string;
}): Promise<ManualUpdateResult> {
  const ctx = await requireFreelancer();

  const parsed = manualUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  }
  const { engagementId, title, summary, statusTag } = parsed.data;

  try {
    const engagement = await getEngagement(ctx, engagementId);
    if (!engagement) return { ok: false, error: "That engagement no longer exists." };

    await createCandidate(ctx, {
      engagementId,
      statusTag,
      title,
      summary: summary ?? null,
      source: "manual",
    });
    revalidatePath("/app"); // dashboard candidate-count badge
    revalidatePath(`/app/engagements/${engagementId}`); // the curation queue
    return { ok: true };
  } catch (err) {
    console.error("[manual-update] createManualUpdateAction failed:", err instanceof Error ? err.message : String(err));
    return { ok: false, error: "Couldn't save that update. Please try again." };
  }
}
