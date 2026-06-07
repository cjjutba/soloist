"use server";

import { revalidatePath } from "next/cache";
import * as Sentry from "@sentry/nextjs";
import { requireFreelancer } from "@/server/auth/session";
import {
  publishShipUpdate,
  publishShipUpdates,
} from "@/server/db/repositories/ship-update.repository";
import { inngest } from "@/server/inngest/client";
import { bulkPublishSchema, publishCandidateSchema } from "./curation.schema";

export type PublishResult = { ok: true } | { ok: false; error: string };
export type BulkPublishResult = { ok: true; count: number } | { ok: false; error: string };

const GONE = "That candidate is no longer in your queue.";

function revalidateCuration(engagementId: string): void {
  revalidatePath("/app"); // dashboard candidate-count badge
  revalidatePath(`/app/engagements/${engagementId}`); // the curation queue
}

/**
 * Emit `ship/update.published` (the notify+email fan-out). BEST-EFFORT — the publish row tx has
 * already committed (publish is the durable truth), so an enqueue failure is logged + reported but
 * NOT rolled back: the Client still sees the update via the feed; only the ping is missed. This is
 * the OPPOSITE of the webhook's record-before-enqueue compensation (there the DB write must not
 * outlive a failed enqueue).
 */
async function emitPublished(row: { id: string; engagementId: string; tenantId: string }): Promise<void> {
  try {
    await inngest.send({
      name: "ship/update.published",
      data: { shipUpdateId: row.id, engagementId: row.engagementId, tenantId: row.tenantId },
    });
  } catch (err) {
    console.error("[publish] ship/update.published enqueue failed:", err instanceof Error ? err.message : String(err));
    Sentry.captureException(err);
  }
}

/** Publish a candidate (AC-1) — the single gate to Client-visible. */
export async function publishCandidateAction(input: {
  id: string;
  engagementId: string;
}): Promise<PublishResult> {
  const ctx = await requireFreelancer();

  const parsed = publishCandidateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Couldn't publish that update." };
  }
  const { id, engagementId } = parsed.data;

  try {
    const row = await publishShipUpdate(ctx, id);
    if (!row) return { ok: false, error: GONE };
    await emitPublished(row);
    revalidateCuration(engagementId);
    return { ok: true };
  } catch (err) {
    console.error("[publish] publishCandidateAction failed:", err instanceof Error ? err.message : String(err));
    return { ok: false, error: "Couldn't publish that update. Please try again." };
  }
}

/** Bulk-publish selected candidates (AC-1, `lg+`). Reports how many actually published. */
export async function bulkPublishCandidatesAction(input: {
  ids: string[];
  engagementId: string;
}): Promise<BulkPublishResult> {
  const ctx = await requireFreelancer();

  const parsed = bulkPublishSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Select candidates to publish." };
  }
  const { ids, engagementId } = parsed.data;

  try {
    const rows = await publishShipUpdates(ctx, ids);
    // Fan out the events concurrently (each emit is independent + best-effort; emitPublished
    // swallows its own errors, so allSettled never rejects). `rows` are the ACTUALLY-published
    // rows (the state guard skips non-candidates), so the count is the real published count.
    await Promise.allSettled(rows.map(emitPublished));
    revalidateCuration(engagementId);
    return { ok: true, count: rows.length };
  } catch (err) {
    console.error("[publish] bulkPublishCandidatesAction failed:", err instanceof Error ? err.message : String(err));
    return { ok: false, error: "Couldn't publish those updates. Please try again." };
  }
}
