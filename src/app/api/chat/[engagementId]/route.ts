import { getAppSession } from "@/server/auth/session";
import type { TenantContext } from "@/server/db/context";
import { getEngagement } from "@/server/db/repositories/engagements.repository";
import { loadClientChatPayload, loadFreelancerChatPayload } from "@/server/chat/chat.read";
import { isUuid } from "@/lib/uuid";

// Reads via `withTenant` → the Neon/Drizzle pool (Node-only). Pin the runtime.
export const runtime = "nodejs";

const noStore = { "Cache-Control": "private, no-store" };

/**
 * The chat-thread poll (realtime slice 3) — authz-scoped JSON for BOTH parties of an engagement.
 * `getAppSession()` (not a require* guard — Route Handlers can't redirect) → 401/403. A Client may
 * read ONLY their own engagement (`engagementId === session.engagementId`, defense-in-depth atop
 * RLS); a Freelancer is RLS-tenant-scoped and additionally `getEngagement`-guarded so a foreign
 * engagement is a 403, not an empty 200. The payload shape comes from the shared chat loaders.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ engagementId: string }> },
): Promise<Response> {
  const session = await getAppSession();
  if (!session) return new Response("Unauthorized", { status: 401, headers: noStore });
  if (!session.tenantId || !session.role) {
    return new Response("Forbidden", { status: 403, headers: noStore });
  }
  const { engagementId } = await params;

  if (session.role === "client") {
    if (!session.engagementId || engagementId !== session.engagementId) {
      return new Response("Forbidden", { status: 403, headers: noStore });
    }
    const ctx: TenantContext = {
      tenantId: session.tenantId,
      userId: session.userId,
      role: "client",
      engagementId: session.engagementId,
    };
    const payload = await loadClientChatPayload(ctx, engagementId);
    return Response.json(payload, { headers: noStore });
  }

  // Freelancer: tenant-scoped. uuid-guard before the id is cast in the query, then confirm it's theirs.
  if (!isUuid(engagementId)) return new Response("Not found", { status: 404, headers: noStore });
  const ctx: TenantContext = { tenantId: session.tenantId, userId: session.userId, role: "freelancer" };
  const engagement = await getEngagement(ctx, engagementId);
  if (!engagement) return new Response("Forbidden", { status: 403, headers: noStore });
  const payload = await loadFreelancerChatPayload(ctx, engagementId);
  return Response.json(payload, { headers: noStore });
}
