import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { requireFreelancer } from "@/server/auth/session";
import { listEngagements } from "@/server/db/repositories/engagements.repository";
import { getTenant } from "@/server/db/repositories/tenants.repository";
import { ArchiveButton } from "./engagements/archive-button";

export default async function CockpitPage() {
  // Self-guard via the canonical guard (returns the freelancer principal = a TenantContext),
  // then read THROUGH the repository → withTenant → RLS.
  const session = await requireFreelancer();
  const [tenant, engagements] = await Promise.all([getTenant(session), listEngagements(session)]);
  if (!tenant) notFound(); // session.tenantId is a ghost (deleted Tenant) → deny, don't degrade

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-8">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl">Engagements</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Each engagement is one client&apos;s branded workspace.
          </p>
        </div>
        <Link href="/app/engagements/new" className={buttonVariants()}>
          New engagement
        </Link>
      </header>

      {engagements.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-12 text-center">
          <p className="text-muted-foreground">No engagements yet — create your first.</p>
          <Link href="/app/engagements/new" className={buttonVariants({ variant: "outline" })}>
            New engagement
          </Link>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {engagements.map((e) => (
            <li key={e.id}>
              <Card className="flex items-center justify-between gap-4 p-4">
                <Link
                  href={`/app/engagements/${e.id}/edit`}
                  className="flex min-w-0 flex-1 flex-col gap-1 rounded-[var(--radius-md)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="flex items-center gap-2">
                    <span className="truncate font-medium">{e.name}</span>
                    <StatusBadge status={e.status} />
                  </span>
                  <span className="truncate text-sm text-muted-foreground">{e.clientDisplayName}</span>
                </Link>
                <div className="flex shrink-0 items-center gap-2">
                  <Link
                    href={`/app/engagements/${e.id}/edit`}
                    className={buttonVariants({ variant: "ghost", size: "sm" })}
                  >
                    Edit
                  </Link>
                  <ArchiveButton id={e.id} name={e.name} />
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
