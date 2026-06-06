import { requireOnboardedClient } from "@/server/auth/session";
import { PortalEmpty } from "../../portal-empty";

// The route-based notification center (EXPERIENCE: "the mobile fullscreen notification
// center even if it's a route"). A designed empty state for v1; Epic 4 fills it.
export default async function NotificationsPage() {
  await requireOnboardedClient();
  return (
    <PortalEmpty
      title="You're all caught up"
      body="New updates and invoices will show up here as they land."
    />
  );
}
