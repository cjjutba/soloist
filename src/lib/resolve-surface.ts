export type Surface = "cockpit" | "portal" | "not-found";

export interface SurfaceResolution {
  surface: Surface;
  /** Tenant subdomain slug — present only for the portal surface. */
  slug?: string;
}

/**
 * Pure host → surface decision. The middleware is thin glue around this; this
 * function is what we unit-test (Story 1.1, AC3).
 *
 * - `${cockpitSub}.${rootDomain}`  → cockpit  (the Soloist back-office)
 * - `<slug>.${rootDomain}`         → portal   (that Tenant's Client Portal)
 * - apex / www / unrecognized host → not-found (neutral, no disclosure — NFR-2)
 *
 * Also resolves localhost dev hosts (set `rootDomain=localhost`) and Vercel
 * preview hosts (`*.vercel.app` → cockpit, so previews are usable).
 *
 * NOTE: this story does NOT look up whether a Tenant actually exists for a slug
 * (no DB yet) — any non-cockpit subdomain resolves to `portal`. The real
 * "unknown slug → not-found" check lands in Story 1.5.
 */
export function resolveSurface(
  rawHost: string | null | undefined,
  rootDomain: string,
  cockpitSub: string,
): SurfaceResolution {
  if (!rawHost) return { surface: "not-found" };

  const host = rawHost.split(":")[0].trim().toLowerCase();
  if (!host) return { surface: "not-found" };

  // Vercel preview deployments → cockpit (so a preview URL is usable).
  if (host.endsWith(".vercel.app")) return { surface: "cockpit" };

  const root = rootDomain.trim().toLowerCase();
  const cockpit = cockpitSub.trim().toLowerCase();

  // Apex or www → neutral not-found in v1 (a marketing/landing page is future work).
  if (host === root || host === `www.${root}`) return { surface: "not-found" };

  // A subdomain of the root domain?
  if (host.endsWith(`.${root}`)) {
    const sub = host.slice(0, host.length - root.length - 1); // strip the trailing ".root"
    if (!sub) return { surface: "not-found" };
    if (sub === cockpit) return { surface: "cockpit" };
    return { surface: "portal", slug: sub };
  }

  // Unknown domain, bare localhost, raw IP, etc. → not-found.
  return { surface: "not-found" };
}
