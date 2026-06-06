"use server";

import { revalidatePath } from "next/cache";
import { requireFreelancer } from "@/server/auth/session";
import { getEngagement } from "@/server/db/repositories/engagements.repository";
import { listInstallationIds } from "@/server/db/repositories/github-installations.repository";
import { connectRepo, disconnectRepo } from "@/server/db/repositories/repo-connections.repository";
import { listReposForInstallations } from "@/server/github/app";
import { connectRepoSchema, disconnectRepoSchema } from "./repo-connections.schema";

export type RepoConnectionResult = { ok: true } | { ok: false; error: string };

const reposPath = (engagementId: string) => `/app/engagements/${engagementId}/repos`;

/** Connect one of the App's installed repos to an Engagement (AC-1). Verifies the repo is
 * actually available to the App (so we capture the real `gh_repo_id`/`gh_installation_id`,
 * never trusting a client-supplied id), then inserts the scoped connection. */
export async function connectRepoAction(input: {
  engagementId: string;
  repoFullName: string;
}): Promise<RepoConnectionResult> {
  const ctx = await requireFreelancer();

  const parsed = connectRepoSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  }
  const { engagementId, repoFullName } = parsed.data;

  try {
    const engagement = await getEngagement(ctx, engagementId);
    if (!engagement) return { ok: false, error: "That engagement no longer exists." };

    // Scope to the caller Tenant's OWN installations (Story 3.2.1) — a repo from another Tenant's
    // installation is never listed and is rejected here.
    const installationIds = await listInstallationIds(ctx);
    const match = (await listReposForInstallations(installationIds)).find(
      (r) => r.fullName === repoFullName,
    );
    if (!match) {
      return { ok: false, error: "That repo isn't available to the app — is it still installed?" };
    }

    await connectRepo(ctx, {
      engagementId,
      ghInstallationId: match.installationId,
      ghRepoId: match.repoId,
      repoFullName: match.fullName,
    });
    revalidatePath(reposPath(engagementId));
    return { ok: true };
  } catch (err) {
    // The partial unique (one ACTIVE connection per repo) surfaces as Postgres 23505.
    if (isUniqueViolation(err)) {
      return { ok: false, error: "That repo is already connected to an engagement." };
    }
    // Log the MESSAGE only — an Octokit error object can carry the App JWT (minted from the
    // private key) in its request config, which we must not serialize into logs.
    console.error(
      "[repo-connections] connectRepoAction failed:",
      err instanceof Error ? err.message : String(err),
    );
    return { ok: false, error: "Couldn't reach GitHub to connect that repo. Please try again." };
  }
}

/** Disconnect a repo from an Engagement (AC-2) — soft (stops feeding, keeps history). */
export async function disconnectRepoAction(input: {
  engagementId: string;
  connectionId: string;
}): Promise<RepoConnectionResult> {
  const ctx = await requireFreelancer();

  const parsed = disconnectRepoSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  }

  try {
    const row = await disconnectRepo(ctx, parsed.data.connectionId);
    if (!row) return { ok: false, error: "That connection no longer exists." };
    revalidatePath(reposPath(parsed.data.engagementId));
    return { ok: true };
  } catch (err) {
    console.error("[repo-connections] disconnectRepoAction failed:", err);
    return { ok: false, error: "Couldn't disconnect that repo. Please try again." };
  }
}

/** Postgres unique-violation detector (the active-connection partial unique). Walks the
 * Drizzle/Neon error cause chain for SQLSTATE `23505`, then falls back to the specific
 * constraint name / a precise message (the only unique on the table is the active-repo one). */
function isUniqueViolation(err: unknown): boolean {
  for (let e: unknown = err, depth = 0; e != null && depth < 6; depth += 1) {
    if ((e as { code?: string }).code === "23505") return true;
    e = (e as { cause?: unknown }).cause;
  }
  const msg = err instanceof Error ? err.message : String(err);
  return /repo_connections_active_repo|duplicate key value/i.test(msg);
}
