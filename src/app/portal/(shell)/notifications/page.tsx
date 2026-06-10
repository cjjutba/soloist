import { requireOnboardedClient } from "@/server/auth/session";
import { listNotifications } from "@/server/db/repositories/notifications.repository";
import { NotificationCenter } from "../notification-center";
import type { NotificationRow } from "../notifications";

// The route-based notification center (Story 4.1; EXPERIENCE: "the mobile fullscreen notification
// center even if it's a route"). RSC seeds the first paint; the NotificationCenter island polls
// the shared ["notifications"] query (the bell shares it). The empty state lives inside the island.
export default async function NotificationsPage() {
  const session = await requireOnboardedClient();
  const rows: NotificationRow[] = (await listNotifications(session)).map((n) => ({
    id: n.id,
    type: n.type,
    readAt: n.readAt?.toISOString() ?? null,
    createdAt: n.createdAt.toISOString(),
    shipUpdateId: n.shipUpdateId,
    title: n.title,
    statusTag: n.statusTag,
    invoiceId: n.invoiceId,
    invoiceNumber: n.invoiceNumber,
  }));

  return <NotificationCenter initialRows={rows} />;
}
