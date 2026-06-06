import { notFound } from "next/navigation";
import { requireFreelancer } from "@/server/auth/session";
import { getTenant } from "@/server/db/repositories/tenants.repository";

export default async function CockpitPage() {
  // Self-guard via the canonical guard (don't re-derive — avoids drift with the layout):
  // returns the freelancer principal, which is also a TenantContext. Then read the Tenant
  // THROUGH the repository → withTenant → RLS, proving guard → data-layer → isolation.
  const session = await requireFreelancer();
  const tenant = await getTenant(session);
  if (!tenant) notFound(); // session.tenantId is a ghost (deleted Tenant) → deny, don't degrade

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-foreground">
      <h1 className="text-center font-display text-4xl">Welcome, {tenant.name}</h1>
      <p className="max-w-md text-center text-muted-foreground">
        Signed in as {session.email}. Walking skeleton — engagements, curation, and
        invoices arrive in later stories.
      </p>
    </main>
  );
}
