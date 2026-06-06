import { env } from "@/env";

/** The public install page for the Soloist GitHub App (Story 3.2.1). Null when `GITHUB_APP_SLUG`
 * isn't configured (the Repo Connections tab then can't offer an "Install" link). */
export function githubInstallUrl(): string | null {
  return env.GITHUB_APP_SLUG
    ? `https://github.com/apps/${env.GITHUB_APP_SLUG}/installations/new`
    : null;
}
