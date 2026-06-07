import { getAppSession } from "@/server/auth/session";
import { listNotifications } from "@/server/db/repositories/notifications.repository";

// Reads via `withTenant` → the Neon/Drizzle pool (Node-only). Pin the runtime.
export const runtime = "nodejs";

/**
 * The Client notification-center poll (Story 4.1) — authz-scoped JSON, session-keyed (no param;
 * the Client is single-engagement, so the session IS the scope). `getAppSession()` (not
 * `requireClient` — handlers can't redirect) → 401/403. `listNotifications` returns ONLY the
 * caller's own rows (RLS scopes the engagement; the `user_id` filter scopes the recipient).
 * `read_at`/`created_at` serialize to ISO strings; the bell badge + the center share this query.
 */
export async function GET(): Promise<Response> {
  const session = await getAppSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (session.role !== "client" || !session.tenantId || !session.engagementId) {
    return new Response("Forbidden", { status: 403 });
  }

  const rows = await listNotifications({
    tenantId: session.tenantId,
    userId: session.userId,
    role: "client",
    engagementId: session.engagementId,
  });
  return Response.json({ notifications: rows }, { headers: { "Cache-Control": "private, no-store" } });
}
