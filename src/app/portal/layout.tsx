import type { CSSProperties, ReactNode } from "react";
import { requireClient } from "@/server/auth/session";
import { resolveBrandingVars } from "@/server/branding/branding-vars";
import { getBranding } from "@/server/db/repositories/branding.repository";
import { getTenant } from "@/server/db/repositories/tenants.repository";

// Client Portal surface shell (Tenant-branded, Story 2.5). The role guard runs here: a
// non-client session (e.g. a Freelancer) → not-found; unauthenticated → /login. The Tenant
// `--tenant-accent*` are resolved SERVER-SIDE from the session's Branding (no flash), and
// shadcn `--primary` is re-scoped to the accent so Client primary actions wear the brand —
// the Cockpit never sets these (stays Soloist Ink).
export default async function PortalLayout({ children }: { children: ReactNode }) {
  const ctx = await requireClient();
  const [tenant, branding] = await Promise.all([getTenant(ctx), getBranding(ctx)]);
  const vars = resolveBrandingVars(branding, tenant?.name ?? "");

  const style = {
    ...vars.style,
    "--primary": "var(--tenant-accent)",
    "--primary-foreground": "var(--tenant-accent-foreground)",
  } as CSSProperties;

  return (
    <div data-surface="portal" style={style} className="min-h-dvh bg-background text-foreground">
      {children}
    </div>
  );
}
