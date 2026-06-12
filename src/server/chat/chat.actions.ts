"use server";

import { requireClient, requireFreelancer } from "@/server/auth/session";
import { getEngagement } from "@/server/db/repositories/engagements.repository";
import {
  createMessage,
  markChatReadAsClient,
  markChatReadAsFreelancer,
} from "@/server/db/repositories/messages.repository";
import { publishToEngagement } from "@/server/realtime/publish";
import { isUuid } from "@/lib/uuid";
import { sendMessageSchema } from "./chat.schema";

export type ChatActionResult = { ok: true } | { ok: false; error: string };

/**
 * Chat send/read actions (realtime slice 3). All are role-guarded and RLS-scoped, and best-effort
 * publish a no-payload signal so the OTHER party refreshes live ("signal, not data" — the message
 * body never rides the wire; the recipient refetches `GET /api/chat/[engagementId]`):
 *   - `message` after a send → the thread + unread badge refetch (the refetch also carries the
 *     sender's advanced read cursor, so the recipient's "Read" receipt updates in the same round-trip)
 *   - `seen`    after a passive read → the other side's "Read" receipt updates with no new message
 */

/** Client → freelancer. The engagement is the client's own (from the session), never request input. */
export async function sendMessageAsClientAction(input: { body: string }): Promise<ChatActionResult> {
  const ctx = await requireClient();
  const parsed = sendMessageSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check your message and try again." };
  }
  try {
    await createMessage(ctx, { engagementId: ctx.engagementId, senderRole: "client", body: parsed.data.body });
    await markChatReadAsClient(ctx); // the sender has, by definition, read up to their own message
    await publishToEngagement(ctx.engagementId, "message");
    return { ok: true };
  } catch (err) {
    console.error("[chat] sendMessageAsClientAction failed:", err instanceof Error ? err.message : String(err));
    return { ok: false, error: "Couldn't send that. Please try again." };
  }
}

/**
 * Freelancer → client. The `getEngagement` guard is LOAD-BEARING: a freelancer ctx sets no
 * `app.engagement_id`, so the `message_scope` WITH CHECK gates ONLY `tenant_id` — RLS alone would
 * accept a row stamped to the caller's tenant but pointing at a foreign engagement. The RLS-scoped
 * `getEngagement` (null for a non-caller's engagement) is what blocks that (mirrors createManualUpdate).
 */
export async function sendMessageAsFreelancerAction(input: {
  engagementId: string;
  body: string;
}): Promise<ChatActionResult> {
  const ctx = await requireFreelancer();
  if (!isUuid(input.engagementId)) return { ok: false, error: "That engagement no longer exists." };
  const parsed = sendMessageSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check your message and try again." };
  }
  try {
    const engagement = await getEngagement(ctx, input.engagementId);
    if (!engagement) return { ok: false, error: "That engagement no longer exists." };
    await createMessage(ctx, { engagementId: input.engagementId, senderRole: "freelancer", body: parsed.data.body });
    await markChatReadAsFreelancer(ctx, input.engagementId);
    await publishToEngagement(input.engagementId, "message");
    return { ok: true };
  } catch (err) {
    console.error("[chat] sendMessageAsFreelancerAction failed:", err instanceof Error ? err.message : String(err));
    return { ok: false, error: "Couldn't send that. Please try again." };
  }
}

/** Client opened/viewed the thread → advance their read cursor + nudge the freelancer's "Read". */
export async function markChatReadAsClientAction(): Promise<void> {
  const ctx = await requireClient();
  await markChatReadAsClient(ctx);
  await publishToEngagement(ctx.engagementId, "seen");
}

/** Freelancer opened/viewed the thread → advance their read cursor + nudge the client's "Read". */
export async function markChatReadAsFreelancerAction(engagementId: string): Promise<void> {
  if (!isUuid(engagementId)) return;
  const ctx = await requireFreelancer();
  const engagement = await getEngagement(ctx, engagementId);
  if (!engagement) return;
  await markChatReadAsFreelancer(ctx, engagementId);
  await publishToEngagement(engagementId, "seen");
}
