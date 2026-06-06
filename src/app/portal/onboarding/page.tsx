import { redirect } from "next/navigation";
import { requireClient } from "@/server/auth/session";
import { resolveBrandingVars } from "@/server/branding/branding-vars";
import { getBranding } from "@/server/db/repositories/branding.repository";
import { getEngagement } from "@/server/db/repositories/engagements.repository";
import { getTenant } from "@/server/db/repositories/tenants.repository";
import { OnboardingCta } from "./onboarding-cta";
import { WelcomeHeading } from "./welcome-heading";

// One-time branded Onboarding hero (Story 2.5, FR-8). Pure reassurance, no input — the
// fastest path to the day-one "wow". Shown only on the FIRST Client session; once
// `onboarded_at` is stamped, a returning Client is redirected straight to the feed.
export default async function OnboardingPage() {
  const session = await requireClient();
  if (session.onboardedAt) redirect("/portal"); // already done → never repeats

  const [engagement, tenant, branding] = await Promise.all([
    getEngagement(session, session.engagementId),
    getTenant(session),
    getBranding(session),
  ]);
  const tenantName = tenant?.name?.trim() || "your workspace";
  const clientName = engagement?.clientDisplayName?.trim() || "there";
  const vars = resolveBrandingVars(branding, tenantName);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col items-center justify-center gap-8 p-6 text-center">
      {vars.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- Tenant logo from Blob; matches branding-form
        <img src={vars.logoUrl} alt={tenantName} className="h-14 w-auto max-w-[220px] object-contain" />
      ) : (
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--tenant-accent)] font-display text-2xl text-[var(--tenant-accent-foreground)]">
          {vars.monogram}
        </div>
      )}

      <div className="flex flex-col items-center gap-3">
        <WelcomeHeading>
          Welcome to {tenantName}, {clientName}.
        </WelcomeHeading>
        <p className="max-w-md text-lg text-muted-foreground">
          Here&rsquo;s where you&rsquo;ll see real progress as {tenantName} ships — newest
          first, in plain English. Nothing to set up.
        </p>
      </div>

      <OnboardingCta />
    </main>
  );
}
