import { App } from "@octokit/app";
import { Octokit } from "@octokit/rest";
import { throttling } from "@octokit/plugin-throttling";
import { retry } from "@octokit/plugin-retry";
import { env } from "@/env";

/**
 * The GitHub App integration boundary (Story 3.2) — the ONLY place that talks to the GitHub
 * API. Stores NO token (NFR-3): a short-lived installation token is minted on demand from the
 * App private key to list the repos a Freelancer can connect. Reconciliation/auto-pull is
 * Story 3.3, behind this same module.
 */

export type ConnectableRepo = {
  installationId: string;
  repoId: string;
  fullName: string;
  private: boolean;
};

/** Both the App identity AND the private key are required to reach GitHub. DSN-optional in
 * `env.ts` → the Repo Connections tab renders a "not configured" panel until these are set. */
export function isGithubConfigured(): boolean {
  return Boolean(env.GITHUB_APP_ID && env.GITHUB_APP_PRIVATE_KEY);
}

// The PEM is stored with literal `\n` (per docs/github-app-setup.md) → real newlines.
function normalizePrivateKey(key: string): string {
  return key.includes("\\n") ? key.replace(/\\n/g, "\n") : key;
}

const AppOctokit = Octokit.plugin(throttling, retry).defaults({
  throttle: {
    // Rate-limit-aware (NFR-5): retry a couple of times, then give up so the caller can
    // surface the GitHub-degraded banner rather than hang.
    onRateLimit: (_retryAfter: number, _options: unknown, _octokit: unknown, retryCount: number) =>
      retryCount < 2,
    onSecondaryRateLimit: (_retryAfter: number, _options: unknown, _octokit: unknown, retryCount: number) =>
      retryCount < 2,
  },
});

let cached: App | null = null;
function getApp(): App | null {
  if (!isGithubConfigured()) return null;
  if (!cached) {
    cached = new App({
      appId: env.GITHUB_APP_ID!,
      privateKey: normalizePrivateKey(env.GITHUB_APP_PRIVATE_KEY!),
      Octokit: AppOctokit,
    });
  }
  return cached;
}

/**
 * The repos the App is installed on (across all installations) — the connect picker's source.
 * Returns `[]` when the App is unconfigured. Lets GitHub API errors **throw** (the RSC catches
 * them → the degraded banner). One short-lived installation token is minted per installation.
 */
export async function listConnectableRepos(): Promise<ConnectableRepo[]> {
  const app = getApp();
  if (!app) return [];
  const out: ConnectableRepo[] = [];
  for await (const { octokit, installation } of app.eachInstallation.iterator()) {
    // Manual pagination via `request` (the iterator's octokit type doesn't expose `.paginate`).
    for (let page = 1; ; page += 1) {
      const { data } = await octokit.request("GET /installation/repositories", {
        per_page: 100,
        page,
      });
      for (const repo of data.repositories) {
        out.push({
          installationId: String(installation.id),
          repoId: String(repo.id),
          fullName: repo.full_name,
          private: repo.private,
        });
      }
      if (data.repositories.length < 100) break;
    }
  }
  return out;
}
