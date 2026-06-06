import { notFound } from "next/navigation";
import { requireFreelancer } from "@/server/auth/session";
import {
  listActiveRepoFullNames,
  listConnections,
} from "@/server/db/repositories/repo-connections.repository";
import { isGithubConfigured, listConnectableRepos, type ConnectableRepo } from "@/server/github/app";
import { isUuid } from "@/lib/uuid";
import { Card } from "@/components/ui/card";
import { ConnectRepoForm } from "./connect-repo-form";
import { RepoConnectionCard } from "./repo-connection-card";

/** Repo Connections tab (Story 3.2). The `(detail)` layout already guarded the Engagement
 * (requireFreelancer + getEngagement → notFound); the `isUuid` guard here is defensive (the
 * page and layout render concurrently — a non-uuid id must not reach a uuid column). */
export default async function ReposTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const ctx = await requireFreelancer();
  const connections = await listConnections(ctx, id);

  const configured = isGithubConfigured();
  let available: ConnectableRepo[] = [];
  let githubError = false;
  if (configured) {
    try {
      available = await listConnectableRepos();
    } catch {
      githubError = true; // GitHub unreachable → degraded banner, never a 500
    }
  }

  const active = connections.filter((c) => c.status !== "disconnected");
  const activeHere = new Set(active.map((c) => c.repoFullName));

  // The picker excludes every repo the Tenant has ACTIVELY connected ANYWHERE (not just this
  // Engagement), so it never offers a repo that would 23505 on connect.
  const tenantActive =
    configured && !githubError ? new Set(await listActiveRepoFullNames(ctx)) : new Set<string>();
  const pickable = available.filter((r) => !tenantActive.has(r.fullName));

  // "Previously connected": disconnected repos not currently active, one card per repo name.
  const seen = new Set<string>();
  const disconnected = connections.filter((c) => {
    if (c.status !== "disconnected" || activeHere.has(c.repoFullName) || seen.has(c.repoFullName)) {
      return false;
    }
    seen.add(c.repoFullName);
    return true;
  });

  return (
    <div className="flex flex-col gap-6">
      {!configured ? (
        <Card className="flex flex-col items-center gap-2 p-12 text-center">
          <p className="font-medium">Connect GitHub isn’t set up yet</p>
          <p className="max-w-md text-sm text-muted-foreground">
            Finish the GitHub App setup (the app id + private key) to connect repositories and
            auto-pull activity. Until then you can write updates by hand.
          </p>
        </Card>
      ) : githubError ? (
        <Card className="flex flex-col items-center gap-2 border-destructive/40 p-8 text-center">
          <p className="font-medium">Couldn’t reach GitHub</p>
          <p className="max-w-md text-sm text-muted-foreground">
            Auto-updates are paused — your published feed is unaffected. Reload to retry.
          </p>
        </Card>
      ) : null}

      {active.length > 0 ? (
        <div className="flex flex-col gap-3">
          {active.map((c) => (
            <RepoConnectionCard key={c.id} connection={c} engagementId={id} />
          ))}
        </div>
      ) : null}

      {configured && !githubError ? (
        <ConnectRepoForm engagementId={id} repos={pickable} hasConnections={active.length > 0} />
      ) : null}

      {disconnected.length > 0 ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">Previously connected</p>
          {disconnected.map((c) => (
            <RepoConnectionCard key={c.id} connection={c} engagementId={id} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
