import type { Metadata } from "next";
import { requireFreelancer } from "@/server/auth/session";
import { getBranding } from "@/server/db/repositories/branding.repository";
import { getTenant } from "@/server/db/repositories/tenants.repository";
import { BrandingForm } from "./branding-form";

export const metadata: Metadata = { title: "Branding · Soloist" };

export default async function BrandingSettingsPage() {
  // Self-guard (positional-guard discipline) — the /app layout also guards the subtree.
  const ctx = await requireFreelancer();
  const [tenant, branding] = await Promise.all([getTenant(ctx), getBranding(ctx)]);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6 sm:p-8">
      <header>
        <h1 className="font-display text-3xl">Branding</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your logo and accent color appear on everything your clients see — never on your
          Cockpit.
        </p>
      </header>
      <BrandingForm
        tenantName={tenant?.name ?? "Your workspace"}
        initialAccent={branding?.accentHex ?? null}
        initialLogoUrl={branding?.logoBlobUrl ?? null}
      />
    </main>
  );
}
