import { requireOnboardedClient } from "@/server/auth/session";
import { getTenant } from "@/server/db/repositories/tenants.repository";
import { listPublishedUpdates } from "@/server/db/repositories/ship-update.repository";
import { ShipFeed } from "./ship-feed";
import type { FeedUpdate } from "./feed";

// The Ship Feed home (Story 3.7) — the live, status-tagged feed of PUBLISHED updates. RSC seeds
// the first paint (fast mobile, NFR-5); the ShipFeed island polls from there. Onboarding is
// enforced by requireOnboardedClient (un-onboarded → the hero). The branded empty state lives
// INSIDE ShipFeed so polling continues from empty → the first update appears live.
export default async function PortalPage() {
  const session = await requireOnboardedClient();
  const [rows, tenant] = await Promise.all([
    listPublishedUpdates(session, session.engagementId),
    getTenant(session),
  ]);
  const tenantName = tenant?.name?.trim() || "Your freelancer";
  const updates: FeedUpdate[] = rows.map((r) => ({
    id: r.id,
    statusTag: r.statusTag,
    title: r.title,
    summary: r.summary,
    publishedAt: r.publishedAt?.toISOString() ?? null,
  }));

  return <ShipFeed engagementId={session.engagementId} initialUpdates={updates} tenantName={tenantName} />;
}
