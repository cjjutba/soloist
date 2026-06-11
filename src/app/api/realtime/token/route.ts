import { NextResponse } from "next/server";
import { getAppSession } from "@/server/auth/session";
import { listEngagementIds } from "@/server/db/repositories/engagements.repository";
import { getAblyRest } from "@/server/realtime/ably";
import { buildCapability } from "@/server/realtime/channels";

export const runtime = "nodejs";

/**
 * Mint an Ably capability token scoped to exactly the channels the caller may subscribe to — their
 * own user channel (the notification bell) plus their engagement channel(s). The Ably client SDK
 * POSTs here via `authUrl` and exchanges the returned TokenRequest, re-authing on expiry.
 *
 * Deny-by-default, like the other authed route handlers: 401 when there's no valid session, 503
 * when realtime isn't configured (the client then falls back to polling). Channel access is scoped
 * the same way RLS scopes data — a client only ever gets their one engagement; a freelancer only
 * their own engagements (an RLS-scoped query). Clients are subscribe-only; the server publishes.
 */
const noStore = { "Cache-Control": "private, no-store" };

export async function POST(): Promise<Response> {
  const session = await getAppSession();
  if (!session || !session.role || !session.tenantId || !session.emailVerified) {
    return new Response("Unauthorized", { status: 401, headers: noStore });
  }
  const rest = getAblyRest();
  if (!rest) return new Response("Realtime not configured", { status: 503, headers: noStore });

  let engagementIds: string[] = [];
  if (session.role === "client") {
    if (session.engagementId) engagementIds = [session.engagementId];
  } else {
    engagementIds = await listEngagementIds({
      tenantId: session.tenantId,
      userId: session.userId,
      role: "freelancer",
    });
  }

  const capability = buildCapability({ userId: session.userId, engagementIds });
  const tokenRequest = await rest.auth.createTokenRequest({
    capability: JSON.stringify(capability),
    clientId: session.userId,
  });
  return NextResponse.json(tokenRequest, { headers: noStore });
}
