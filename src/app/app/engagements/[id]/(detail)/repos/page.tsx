import { notFound } from "next/navigation";
import { requireFreelancer } from "@/server/auth/session";
import { listInstallationIds } from "@/server/db/repositories/github-installations.repository";
import {
  listActiveRepoFullNames,
  listConnections,
} from "@/server/db/repositories/repo-connections.repository";
import { isGithubConfigured, listReposForInstallations, type ConnectableRepo } from "@/server/github/app";
import { githubInstallUrl } from "@/server/github/install-url";
import { Suspense } from "react";
import { isUuid } from "@/lib/uuid";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConnectRepoForm } from "./connect-repo-form";
import { GithubDegradedBanner } from "./github-degraded-banner";
import { InstallToast } from "./install-toast";
import { RepoConnectionCard } from "./repo-connection-card";

/** Repo Connections tab (Stories 3.2 / 3.2.1). Lists/connects only repos from THIS Tenant's own
 * GitHub installation(s) — never another Tenant's. The `(detail)` layout already guarded the
 * Engagement; `isUuid` here is defensive (page + layout render concurrently). */
export default async function ReposTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const ctx = await requireFreelancer();
  const connections = await listConnections(ctx, id);

  const configured = isGithubConfigured();
  const installationIds = configured ? await listInstallationIds(ctx) : [];
  const hasInstallation = installationIds.length > 0;

  let available: ConnectableRepo[] = [];
  let githubError = false;
  if (configured && hasInstallation) {
    try {
      available = await listReposForInstallations(installationIds);
    } catch {
      githubError = true; // GitHub unreachable → degraded banner, never a 500
    }
  }

  const active = connections.filter((c) => c.status !== "disconnected");
  const activeHere = new Set(active.map((c) => c.repoFullName));
  const showPicker = configured && hasInstallation && !githubError;
  // Only needed for the picker — skip the query in the not-configured / no-installation / degraded states.
  const tenantActive = showPicker ? new Set(await listActiveRepoFullNames(ctx)) : new Set<string>();
  const pickable = available.filter((r) => !tenantActive.has(r.fullName));

  const seen = new Set<string>();
  const disconnected = connections.filter((c) => {
    if (c.status !== "disconnected" || activeHere.has(c.repoFullName) || seen.has(c.repoFullName)) {
      return false;
    }
    seen.add(c.repoFullName);
    return true;
  });

  const installUrl = githubInstallUrl(id); // carry the engagement through the install round-trip

  return (
    <div className="flex flex-col gap-6">
      <Suspense fallback={null}>
        <InstallToast />
      </Suspense>
      {!configured ? (
        <Card className="flex flex-col items-center gap-2 p-12 text-center">
          <p className="font-medium">Connect GitHub isn’t set up yet</p>
          <p className="max-w-md text-sm text-muted-foreground">
            Finish the GitHub App setup (the app id + private key) to connect repositories and
            auto-pull activity. Until then you can write updates by hand.
          </p>
        </Card>
      ) : !hasInstallation ? (
        <Card className="flex flex-col items-center gap-3 p-12 text-center">
          <p className="font-medium">Install the GitHub App</p>
          <p className="max-w-md text-sm text-muted-foreground">
            Connect your GitHub account so Soloist can list your repositories and auto-pull
            activity. You choose exactly which repos — only yours are ever shown.
          </p>
          {installUrl ? (
            <a href={installUrl} className={buttonVariants({})}>
              Install on GitHub
            </a>
          ) : (
            <p className="text-xs text-muted-foreground">
              (Set <code>GITHUB_APP_SLUG</code> to enable the install link.)
            </p>
          )}
        </Card>
      ) : githubError ? (
        <Card className="flex flex-col items-center gap-2 border-destructive/40 p-8 text-center">
          <p className="font-medium">Couldn’t reach GitHub</p>
          <p className="max-w-md text-sm text-muted-foreground">
            Auto-updates are paused — your published feed is unaffected. Reload to retry.
          </p>
        </Card>
      ) : null}

      {/* Story 3.9: a non-blocking banner when a connected repo's auto-pull is erroring. */}
      <GithubDegradedBanner count={active.filter((c) => c.status === "error").length} />

      {active.length > 0 ? (
        <div className="flex flex-col gap-3">
          {active.map((c) => (
            <RepoConnectionCard key={c.id} connection={c} engagementId={id} />
          ))}
        </div>
      ) : null}

      {showPicker ? (
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
