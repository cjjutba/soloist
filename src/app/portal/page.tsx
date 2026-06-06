import { redirect } from "next/navigation";
import { requireClient } from "@/server/auth/session";

// The Ship Feed home (Story 2.5 gates it; Story 2.6 builds the real empty feed). An
// un-onboarded Client is routed through the one-time branded Onboarding hero first.
export default async function PortalPage() {
  const session = await requireClient();
  if (!session.onboardedAt) redirect("/portal/onboarding");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col items-center justify-center gap-3 p-6">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
        Ship Feed
      </p>
      <h1 className="text-center font-display text-3xl">You&rsquo;re all set</h1>
      <p className="max-w-sm text-center text-muted-foreground">
        Your first update will land here soon. The live Ship Feed arrives in Epic&nbsp;3.
      </p>
    </main>
  );
}
