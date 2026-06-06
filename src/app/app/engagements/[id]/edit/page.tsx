import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireFreelancer } from "@/server/auth/session";
import { getEngagement } from "@/server/db/repositories/engagements.repository";
import { isUuid } from "@/lib/uuid";
import { EngagementForm } from "../../engagement-form";
import { ArchiveButton } from "../../archive-button";

export const metadata: Metadata = { title: "Edit engagement · Soloist" };

export default async function EditEngagementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // This route lives OUTSIDE the `(detail)` route group, so the detail layout's guard does
  // NOT cover it — these checks ARE the guard. A malformed id would hit the uuid column
  // cast and 500; treat it as not-found instead.
  if (!isUuid(id)) notFound();
  const ctx = await requireFreelancer();
  // RLS-scoped read: an engagement that isn't the caller's returns null → 404 (not denied).
  const engagement = await getEngagement(ctx, id);
  if (!engagement) notFound();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-8">
      <EngagementForm
        mode="edit"
        id={engagement.id}
        initial={{
          name: engagement.name,
          clientDisplayName: engagement.clientDisplayName,
          scope: engagement.scope,
          status: engagement.status,
        }}
      />
      {engagement.status !== "archived" ? (
        <div className="flex w-full max-w-xl items-center justify-between gap-4 rounded-[var(--radius-lg)] border border-border p-4">
          <div>
            <p className="text-sm font-medium">Archive this engagement</p>
            <p className="text-sm text-muted-foreground">
              Hides it from your active list. History is kept.
            </p>
          </div>
          <ArchiveButton id={engagement.id} name={engagement.name} redirectTo="/app" />
        </div>
      ) : null}
    </main>
  );
}
