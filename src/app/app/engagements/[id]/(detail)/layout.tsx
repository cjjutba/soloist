import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { requireFreelancer } from "@/server/auth/session";
import { getEngagement } from "@/server/db/repositories/engagements.repository";
import { isUuid } from "@/lib/uuid";
import { ArchiveButton } from "../../archive-button";
import { EngagementTabs } from "./engagement-tabs";

// The tabbed Engagement-detail shell (Story 2.2). This layout guards only the routes
// INSIDE the `(detail)` group (Ship Feed + the repos/client/documents tabs) — it does
// NOT wrap the sibling `[id]/edit` route, which therefore self-guards independently.
// Renders the header + tab nav once; the tab pages are placeholders until Epics 3/2.3/5.
export default async function EngagementDetailLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isUuid(id)) notFound(); // malformed id → 404, not a uuid-cast 500
  const ctx = await requireFreelancer();
  const engagement = await getEngagement(ctx, id);
  if (!engagement) notFound(); // not the caller's (RLS → null) or gone → 404

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-8">
      <header className="flex flex-col gap-4">
        <Link
          href="/app"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          ← Engagements
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex items-center gap-2">
              <h1 className="truncate font-display text-3xl">{engagement.name}</h1>
              <StatusBadge status={engagement.status} />
            </div>
            <p className="truncate text-sm text-muted-foreground">
              {engagement.clientDisplayName}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href={`/app/engagements/${engagement.id}/edit`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Edit details
            </Link>
            {engagement.status !== "archived" ? (
              <ArchiveButton id={engagement.id} name={engagement.name} redirectTo="/app" />
            ) : null}
          </div>
        </div>
        <EngagementTabs id={engagement.id} />
      </header>
      {children}
    </main>
  );
}
