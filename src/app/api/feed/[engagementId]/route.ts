import { getAppSession } from "@/server/auth/session";
import { listPublishedUpdates } from "@/server/db/repositories/ship-update.repository";

// Reads via `withTenant` → the Neon/Drizzle pool (Node-only). Pin the runtime.
export const runtime = "nodejs";

/**
 * The Client Ship Feed poll (Story 3.7) — authz-scoped JSON. A Client polls ONLY their own
 * Engagement's PUBLISHED updates. `getAppSession()` (not `requireClient` — Route Handlers can't
 * redirect) resolves the session; the explicit `engagementId === session.engagementId` check is
 * defense-in-depth atop RLS (a Client can't poll another Engagement even by editing the URL).
 * `listPublishedUpdates` returns the Client-safe projection only — never `raw_meta`, never a
 * candidate. `publishedAt` (a Date) serializes to an ISO string through `Response.json`.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ engagementId: string }> },
): Promise<Response> {
  const session = await getAppSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (session.role !== "client" || !session.tenantId || !session.engagementId) {
    return new Response("Forbidden", { status: 403 });
  }

  const { engagementId } = await params;
  if (engagementId !== session.engagementId) {
    return new Response("Forbidden", { status: 403 });
  }

  // After the guards, tenantId/engagementId are non-null — build the Client-scoped TenantContext.
  const updates = await listPublishedUpdates(
    { tenantId: session.tenantId, userId: session.userId, role: "client", engagementId: session.engagementId },
    session.engagementId,
  );
  // Per-session authenticated data — never let a proxy / bf-cache retain one Client's feed.
  return Response.json({ updates }, { headers: { "Cache-Control": "private, no-store" } });
}
