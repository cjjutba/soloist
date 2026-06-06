import { requireOnboardedClient } from "@/server/auth/session";
import { getTenant } from "@/server/db/repositories/tenants.repository";
import { PortalEmpty } from "../portal-empty";

// The Ship Feed home (Story 2.6). Empty by construction until Epic 3 publishes updates — so
// it's a DESIGNED, branded calm state, never "no data." Onboarding is enforced by
// requireOnboardedClient (un-onboarded → the hero).
export default async function PortalPage() {
  const session = await requireOnboardedClient();
  const tenant = await getTenant(session);
  const tenantName = tenant?.name?.trim() || "Your freelancer";

  return (
    <PortalEmpty
      title={`${tenantName} is getting set up`}
      body="Your first update will land here soon — newest first, in plain English."
    />
  );
}
