import { redirect } from "next/navigation";
import { requireFreelancer } from "@/server/auth/session";
import { recordInstallation } from "@/server/db/repositories/github-installations.repository";
import { getUserInstallations, isOauthConfigured } from "@/server/github/app";
import { isUuid } from "@/lib/uuid";
import { Card } from "@/components/ui/card";

/**
 * GitHub App "Setup URL" callback (Story 3.2.1). After a Freelancer installs the App, GitHub
 * redirects here (the Freelancer is still authenticated) with
 * `?code=…&installation_id=…&setup_action=install`. We **OAuth-verify the user actually controls
 * that installation** (`getUserInstallations(code)` ⊇ installation_id) before binding it to their
 * Tenant — so a spoofed/guessed `installation_id` can't hijack another Tenant's repos.
 */
export default async function GithubSetupPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; installation_id?: string; setup_action?: string; state?: string }>;
}) {
  const ctx = await requireFreelancer();
  const { code, installation_id, state } = await searchParams;
  // `state` is the Engagement id we passed into the install link — send the Freelancer back to
  // its Repo Connections tab (with a flag the tab turns into a success toast), else the Cockpit.
  const dest = state && isUuid(state) ? `/app/engagements/${state}/repos?installed=1` : "/app";

  const fail = (msg: string) => (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 p-8">
      <Card className="flex flex-col items-center gap-2 p-10 text-center">
        <p className="font-medium">Couldn’t link that installation</p>
        <p className="text-sm text-muted-foreground">{msg}</p>
        <a href="/app" className="text-sm underline">
          Back to the Cockpit
        </a>
      </Card>
    </main>
  );

  if (!isOauthConfigured()) return fail("GitHub sign-in isn’t configured yet.");
  if (!code || !installation_id || !/^\d+$/.test(installation_id)) {
    return fail("Missing or malformed installation details from GitHub.");
  }

  let owned: { id: string; accountLogin: string | null }[] = [];
  try {
    owned = await getUserInstallations(code);
  } catch {
    return fail("Couldn’t verify the installation with GitHub. Please try again.");
  }

  const match = owned.find((i) => i.id === installation_id);
  if (!match) {
    // The signed-in GitHub user does NOT control this installation → refuse to bind it.
    return fail("That installation isn’t one you control.");
  }

  try {
    await recordInstallation(ctx, { ghInstallationId: match.id, accountLogin: match.accountLogin });
  } catch {
    return fail("Couldn’t save the installation. Please try again.");
  }
  redirect(dest); // outside the try — NEXT_REDIRECT must not be swallowed
}
