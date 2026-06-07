"use server";

import { z } from "zod";
import { requireClient } from "@/server/auth/session";
import { setNotificationsEnabled } from "@/server/db/repositories/client-access.repository";
import {
  markAllNotificationsRead,
  markNotificationsRead,
} from "@/server/db/repositories/notifications.repository";

export type MarkReadResult = { ok: true } | { ok: false };

const idsSchema = z.array(z.uuid()).max(200);
const prefSchema = z.object({ enabled: z.boolean() });

/**
 * Mark specific notifications read (Story 4.1). The repo scopes to `ctx.userId`, so a stray id is
 * harmless — but we reject malformed input. No `revalidatePath`: the bell/center are `useQuery`
 * islands, so the CLIENT invalidates `['notifications']` after this resolves.
 */
export async function markNotificationsReadAction(ids: string[]): Promise<MarkReadResult> {
  const ctx = await requireClient();
  const parsed = idsSchema.safeParse(ids);
  if (!parsed.success) return { ok: false };
  try {
    await markNotificationsRead(ctx, parsed.data);
    return { ok: true };
  } catch (err) {
    console.error("[notifications] markNotificationsReadAction failed:", err instanceof Error ? err.message : String(err));
    return { ok: false };
  }
}

/** Mark ALL the caller's unread notifications read (Story 4.1, "Mark all as read"). */
export async function markAllNotificationsReadAction(): Promise<MarkReadResult> {
  const ctx = await requireClient();
  try {
    await markAllNotificationsRead(ctx);
    return { ok: true };
  } catch (err) {
    console.error("[notifications] markAllNotificationsReadAction failed:", err instanceof Error ? err.message : String(err));
    return { ok: false };
  }
}

/**
 * Set the Client's global notification on/off preference (Story 4.4). `requireClient` → the repo
 * scopes the write to the caller's own engagement (RLS). No `revalidatePath`: the toggle is an
 * optimistic `useState` island that reverts on `{ ok: false }`; the value re-reads from the session
 * on the next page load.
 */
export async function setNotificationPrefAction(input: { enabled: boolean }): Promise<MarkReadResult> {
  const ctx = await requireClient();
  const parsed = prefSchema.safeParse(input);
  if (!parsed.success) return { ok: false };
  try {
    await setNotificationsEnabled(ctx, parsed.data.enabled);
    return { ok: true };
  } catch (err) {
    console.error("[notifications] setNotificationPrefAction failed:", err instanceof Error ? err.message : String(err));
    return { ok: false };
  }
}
