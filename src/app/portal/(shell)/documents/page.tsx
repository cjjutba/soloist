import { requireOnboardedClient } from "@/server/auth/session";
import { PortalEmpty } from "../../portal-empty";

// Client Documents (invoices) — a designed empty state for v1; Epic 5 fills it. The Client
// can't create documents, so there's no CTA. Onboarding-gated like every portal surface.
export default async function DocumentsPage() {
  await requireOnboardedClient();
  return <PortalEmpty title="No documents yet" body="Invoices your freelancer sends will appear here." />;
}
