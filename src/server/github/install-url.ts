import { env } from "@/env";

/** The public install page for the Soloist GitHub App (Story 3.2.1). Null when `GITHUB_APP_SLUG`
 * isn't configured. `state` (the Engagement id) round-trips through GitHub's install → OAuth
 * redirect so the Setup page can send the Freelancer back to the Engagement's Repo Connections
 * tab instead of the Cockpit home. */
export function githubInstallUrl(state?: string): string | null {
  if (!env.GITHUB_APP_SLUG) return null;
  const base = `https://github.com/apps/${env.GITHUB_APP_SLUG}/installations/new`;
  return state ? `${base}?state=${encodeURIComponent(state)}` : base;
}
