import { App } from "@octokit/app";
import { Octokit } from "@octokit/rest";
import { throttling } from "@octokit/plugin-throttling";
import { retry } from "@octokit/plugin-retry";
import { env } from "@/env";

/**
 * The GitHub App integration boundary (Stories 3.2 / 3.2.1) — the ONLY place that talks to the
 * GitHub API. Stores NO token (NFR-3): short-lived installation/user tokens are minted on demand.
 * Multi-tenant-safe: repo listing is scoped to SPECIFIC installations (the caller Tenant's), and
 * the install binding is OAuth-verified so an installation_id can't be spoofed.
 */

export type ConnectableRepo = {
  installationId: string;
  repoId: string;
  fullName: string;
  private: boolean;
};

/** What the reconciliation cron pulls from a connected repo (Story 3.3) — the recent activity the
 * mapper turns into candidates. Only qualifying items (merged/open PRs, published releases, the
 * default-branch head commit) are included. */
export type PulledActivity = {
  headCommit?: { sha: string; message: string; branch: string };
  pulls: { number: number; title: string; merged: boolean; branch: string; headSha: string }[];
  releases: { tag: string; name: string | null }[];
};

/** App identity + key — required to reach GitHub at all. */
export function isGithubConfigured(): boolean {
  return Boolean(env.GITHUB_APP_ID && env.GITHUB_APP_PRIVATE_KEY);
}

/** OAuth-during-install (Story 3.2.1) — client id + secret gate the install-binding verification. */
export function isOauthConfigured(): boolean {
  return Boolean(env.GITHUB_APP_CLIENT_ID && env.GITHUB_APP_CLIENT_SECRET);
}

// The PEM is stored with literal `\n` (per docs/github-app-setup.md) → real newlines.
function normalizePrivateKey(key: string): string {
  return key.includes("\\n") ? key.replace(/\\n/g, "\n") : key;
}

const AppOctokit = Octokit.plugin(throttling, retry).defaults({
  throttle: {
    onRateLimit: (_retryAfter: number, _options: unknown, _octokit: unknown, retryCount: number) =>
      retryCount < 2,
    onSecondaryRateLimit: (_retryAfter: number, _options: unknown, _octokit: unknown, retryCount: number) =>
      retryCount < 2,
  },
});

let cached: App | null = null;
let cachedWithOauth = false;
function getApp(): App | null {
  if (!isGithubConfigured()) return null;
  const oauth = isOauthConfigured();
  // Rebuild if the OAuth-config state changed since caching — @octokit/app v16's `app.oauth` is a
  // getter that THROWS forever if the App was built without oauth options, so a stale cache built
  // before the client secret loaded would break getUserInstallations permanently.
  if (!cached || cachedWithOauth !== oauth) {
    cached = new App({
      appId: env.GITHUB_APP_ID!,
      privateKey: normalizePrivateKey(env.GITHUB_APP_PRIVATE_KEY!),
      Octokit: AppOctokit,
      ...(oauth
        ? { oauth: { clientId: env.GITHUB_APP_CLIENT_ID!, clientSecret: env.GITHUB_APP_CLIENT_SECRET! } }
        : {}),
    });
    cachedWithOauth = oauth;
  }
  return cached;
}

/**
 * Repos for SPECIFIC installations — the caller Tenant's own installation(s), never all of them
 * (Story 3.2.1, the multi-tenant fix). Returns `[]` for an empty id list or when unconfigured.
 * Lets GitHub API errors throw (the RSC catches → degraded banner). Mints one short-lived
 * installation token per installation.
 */
export async function listReposForInstallations(installationIds: string[]): Promise<ConnectableRepo[]> {
  const app = getApp();
  if (!app || installationIds.length === 0) return [];
  const out: ConnectableRepo[] = [];
  for (const installationId of installationIds) {
    if (!/^\d+$/.test(installationId)) continue; // a non-numeric id can't mint a token — skip it
    const octokit = await app.getInstallationOctokit(Number(installationId));
    for (let page = 1; ; page += 1) {
      const { data } = await octokit.request("GET /installation/repositories", { per_page: 100, page });
      for (const repo of data.repositories) {
        out.push({
          installationId,
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

/**
 * The installations the OAuth-authenticated USER actually controls (Story 3.2.1). The Setup flow
 * exchanges the install `code` for a user token and confirms the redirect's `installation_id` is
 * in this list BEFORE binding — so a spoofed/guessed `installation_id` the user does NOT control
 * is rejected. Returns `[]` if OAuth isn't configured. Lets errors throw (the page handles them).
 */
export async function getUserInstallations(
  code: string,
): Promise<{ id: string; accountLogin: string | null }[]> {
  const app = getApp();
  if (!app || !isOauthConfigured()) return [];
  const octokit = await app.oauth.getUserOctokit({ code });
  const { data } = await octokit.request("GET /user/installations", { per_page: 100 });
  return data.installations.map((i) => ({
    id: String(i.id),
    accountLogin: i.account && "login" in i.account ? i.account.login : null,
  }));
}

/**
 * Pull a connected repo's recent activity for the reconciliation cron (Story 3.3). Mints a
 * short-lived installation token and fetches the default-branch head commit, recent merged/open
 * PRs, and published releases. Each fetch is isolated (a missing scope / 404 on one doesn't lose
 * the others); a fully-unreachable repo throws to the caller, which marks the connection `error`.
 */
export async function pullRecentActivity(
  installationId: string,
  repoFullName: string,
): Promise<PulledActivity> {
  const out: PulledActivity = { pulls: [], releases: [] };
  const app = getApp();
  if (!app || !/^\d+$/.test(installationId)) return out;
  const [owner, repo] = repoFullName.split("/");
  if (!owner || !repo) return out;
  const octokit = await app.getInstallationOctokit(Number(installationId));

  // Probe the repo (existence + default branch). A failure HERE means the repo is gone / the App
  // lost access — let it THROW so the cron marks the connection `error`, not a false-success empty
  // pull. (The sub-fetches below are best-effort: a repo with no commits/PRs/releases is normal.)
  const { data: repoData } = await octokit.request("GET /repos/{owner}/{repo}", { owner, repo });
  const branch = repoData.default_branch;

  // Default-branch head commit → a push-equivalent keyed by its SHA (matches the webhook's `after`).
  try {
    const { data: commits } = await octokit.request("GET /repos/{owner}/{repo}/commits", {
      owner,
      repo,
      sha: branch,
      per_page: 1,
    });
    const head = commits[0];
    if (head) out.headCommit = { sha: head.sha, message: head.commit.message, branch };
  } catch {
    /* no commits on the default branch — skip the push signal */
  }

  // Merged + open PRs (open-but-draft and closed-unmerged are dropped by the mapper's filter).
  try {
    const { data: pulls } = await octokit.request("GET /repos/{owner}/{repo}/pulls", {
      owner,
      repo,
      state: "all",
      sort: "updated",
      direction: "desc",
      per_page: 30,
    });
    for (const pr of pulls) {
      const merged = pr.merged_at != null;
      const openable = pr.state === "open" && !pr.draft;
      if (merged || openable) {
        out.pulls.push({
          number: pr.number,
          title: pr.title,
          merged,
          branch: pr.head.ref,
          headSha: pr.head.sha,
        });
      }
    }
  } catch {
    /* no pull_requests access — skip */
  }

  // Published (non-draft) releases.
  try {
    const { data: releases } = await octokit.request("GET /repos/{owner}/{repo}/releases", {
      owner,
      repo,
      per_page: 10,
    });
    for (const rel of releases) {
      if (!rel.draft && rel.tag_name) out.releases.push({ tag: rel.tag_name, name: rel.name ?? null });
    }
  } catch {
    /* no releases / contents access — skip */
  }

  return out;
}
