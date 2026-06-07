"use server";

import { revalidatePath } from "next/cache";
import { requireFreelancer } from "@/server/auth/session";
import {
  dismissCandidate,
  dismissCandidates,
  updateCandidate,
} from "@/server/db/repositories/ship-update.repository";
import { bulkDismissSchema, dismissCandidateSchema, editCandidateSchema } from "./curation.schema";

export type CurationResult = { ok: true } | { ok: false; error: string };
export type BulkDismissResult = { ok: true; count: number } | { ok: false; error: string };

/** A null repository result = the id isn't a `candidate` in the caller's tenant (foreign,
 * already dismissed, or already published) — RLS + the `state='candidate'` guard. */
const GONE = "That candidate is no longer in your queue.";

/** Curation touches two surfaces: the dashboard candidate-count badge (`/app`) and the
 * Engagement's queue. Revalidate both so a dismiss doesn't leave a stale badge. */
function revalidateCuration(engagementId: string): void {
  revalidatePath("/app");
  revalidatePath(`/app/engagements/${engagementId}`);
}

/** Inline-edit / re-tag a candidate (AC-1). Accepts any subset of title/summary/statusTag. */
export async function editCandidateAction(input: {
  id: string;
  engagementId: string;
  title?: string;
  summary?: string | null;
  statusTag?: string;
}): Promise<CurationResult> {
  const ctx = await requireFreelancer();

  const parsed = editCandidateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the field and try again." };
  }
  const { id, engagementId, title, summary, statusTag } = parsed.data;

  try {
    const row = await updateCandidate(ctx, id, { title, summary, statusTag });
    if (!row) return { ok: false, error: GONE };
    revalidateCuration(engagementId);
    return { ok: true };
  } catch (err) {
    console.error("[curation] editCandidateAction failed:", err instanceof Error ? err.message : String(err));
    return { ok: false, error: "Couldn't save that change. Please try again." };
  }
}

/** Dismiss a candidate (AC-1) — it leaves the queue and never reaches the Client. */
export async function dismissCandidateAction(input: {
  id: string;
  engagementId: string;
}): Promise<CurationResult> {
  const ctx = await requireFreelancer();

  const parsed = dismissCandidateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Couldn't dismiss that candidate." };
  }
  const { id, engagementId } = parsed.data;

  try {
    const row = await dismissCandidate(ctx, id);
    if (!row) return { ok: false, error: GONE };
    revalidateCuration(engagementId);
    return { ok: true };
  } catch (err) {
    console.error("[curation] dismissCandidateAction failed:", err instanceof Error ? err.message : String(err));
    return { ok: false, error: "Couldn't dismiss that candidate. Please try again." };
  }
}

/** Bulk-dismiss selected candidates (AC-2, `lg+`). Reports how many actually moved. */
export async function bulkDismissCandidatesAction(input: {
  ids: string[];
  engagementId: string;
}): Promise<BulkDismissResult> {
  const ctx = await requireFreelancer();

  const parsed = bulkDismissSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Select candidates to dismiss." };
  }
  const { ids, engagementId } = parsed.data;

  try {
    const { count } = await dismissCandidates(ctx, ids);
    revalidateCuration(engagementId);
    return { ok: true, count };
  } catch (err) {
    console.error("[curation] bulkDismissCandidatesAction failed:", err instanceof Error ? err.message : String(err));
    return { ok: false, error: "Couldn't dismiss those candidates. Please try again." };
  }
}
