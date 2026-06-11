import type { ReactNode } from "react";
import Link from "next/link";
import { requireOnboardedClient } from "@/server/auth/session";
import { resolveBrandingVars } from "@/server/branding/branding-vars";
import { getBranding } from "@/server/db/repositories/branding.repository";
import { getTenant } from "@/server/db/repositories/tenants.repository";
import { isRealtimeConfigured } from "@/server/realtime/ably";
import { NotificationToaster } from "./notification-toaster";
import { PortalNav } from "./portal-nav";
import { RealtimeProvider } from "./realtime-provider";

// The Client Portal SHELL (Story 2.6) — header (brand + minimal nav) + single-column,
// mobile-first content. Wraps only the post-Onboarding surfaces (Feed/Documents/
// Notifications); the Onboarding hero lives OUTSIDE this route group (full-screen, no nav).
// `requireOnboardedClient` is the single onboarding gate for the whole shell — an
// un-onboarded Client is routed to the hero before any shell chrome renders.
export default async function PortalShellLayout({ children }: { children: ReactNode }) {
  const session = await requireOnboardedClient();
  const [tenant, branding] = await Promise.all([getTenant(session), getBranding(session)]);
  const vars = resolveBrandingVars(branding, tenant?.name ?? "");
  const tenantName = tenant?.name?.trim() || "Portal";

  return (
    <RealtimeProvider userId={session.userId} enabled={isRealtimeConfigured()}>
      <div className="min-h-dvh">
        <header className="sticky top-0 z-10 border-b border-border bg-background/85 backdrop-blur">
          <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3 px-5 py-2">
            <Link
              href="/portal"
              aria-label={`${tenantName} — home`}
              className="flex min-h-11 items-center"
            >
              {vars.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- Tenant logo from Blob; matches branding-form
                <img src={vars.logoUrl} alt={tenantName} className="h-7 w-auto max-w-[160px] object-contain" />
              ) : (
                <span className="font-display text-lg">{tenantName}</span>
              )}
            </Link>
            <PortalNav clientName={session.name} clientEmail={session.email} />
          </div>
        </header>
        <main className="mx-auto w-full max-w-2xl px-5 py-8">{children}</main>
        {/* Story 4.2: render-null — toasts a new published update while the Client is active. */}
        <NotificationToaster />
      </div>
    </RealtimeProvider>
  );
}
