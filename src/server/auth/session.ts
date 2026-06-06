import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { auth } from "./index";

/**
 * The single-domain ROLE GUARD (Story 1.4). Resolves role + Tenant SERVER-SIDE from
 * the session on every request — never from a client-readable cookie. `auth.api.getSession`
 * re-validates the session against the DB each call (we deliberately don't enable
 * Better Auth's cookieCache), so this is a fresh check, not trust-the-cookie.
 *
 * Surface authorization (deny-by-default, no existence disclosure):
 *   - unauthenticated on a guarded surface → redirect to /login (login isn't a secret)
 *   - authenticated but WRONG role/Tenant   → notFound() (neutral 404; a Client must
 *     never learn the Cockpit's shape, and vice-versa)
 *
 * Not wrapped in React `cache()`: the loader takes no args, so cache() would memoize
 * across unit tests; the per-request getSession lookups are cheap. (A request-scoped
 * dedup can revisit this once it's worth the test ergonomics.)
 *
 * ⚠️ POSITIONAL GUARD: protection comes from the layouts calling these guards (and the
 * pages self-guarding). There is no middleware backstop, so EVERY future /app/* or
 * /portal/* route/handler MUST either nest under the guarded layout or call the guard
 * itself — a route group with its own layout, or a route.ts handler, would otherwise
 * render unguarded.
 */

export type AppRole = "freelancer" | "client" | null;

export type AppSession = {
  userId: string;
  name: string;
  email: string;
  emailVerified: boolean;
  tenantId: string | null;
  role: AppRole;
};

/** A guard-validated freelancer principal — also a valid `TenantContext` for the data layer. */
export type FreelancerSession = AppSession & { role: "freelancer"; tenantId: string };

export async function getAppSession(): Promise<AppSession | null> {
  const result = await auth.api.getSession({ headers: await headers() });
  if (!result?.user) return null;
  const u = result.user as {
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
    tenantId?: string | null;
  };
  const tenantId = u.tenantId ?? null;
  // Role is DERIVED from the data model: a user that owns a Tenant (tenantId set) is a
  // freelancer; else null. ⚠️ EPIC 2: Clients are Users linked to an Engagement via
  // ClientAccess — this derivation MUST be extended to emit role:"client" (and
  // requireClient updated) when that lands, or the portal stays permanently 404.
  const role: AppRole = tenantId ? "freelancer" : null;
  return {
    userId: u.id,
    name: u.name,
    email: u.email,
    emailVerified: u.emailVerified,
    tenantId,
    role,
  };
}

/**
 * /app guard: returns the freelancer principal (usable directly as a TenantContext),
 * or redirects / not-founds. `emailVerified` is enforced as defense-in-depth — the
 * primary gate is Better Auth's `requireEmailVerification` (an unverified user gets no
 * session), but checking here means a future misconfig can't silently admit one.
 */
export async function requireFreelancer(): Promise<FreelancerSession> {
  const session = await getAppSession();
  if (!session) redirect("/login");
  if (session.role !== "freelancer" || !session.tenantId || !session.emailVerified) {
    notFound();
  }
  return session as FreelancerSession;
}

/**
 * /portal guard (SCAFFOLD). Clients + Engagements are Epic 2, so today this only
 * enforces the role check — a freelancer (or anonymous) is rejected. The cross-surface
 * guarantee (a freelancer session can never act on the portal) holds now.
 *
 * ⚠️ EPIC 2 (Story 2.6): once `getAppSession` can emit role:"client", resolve the
 * Engagement + ClientAccess here and return a `TenantContext{ role:"client", engagementId }`.
 * Do NOT loosen the check to "any non-freelancer" — bind it to a real ClientAccess row.
 */
export async function requireClient(): Promise<{ userId: string }> {
  const session = await getAppSession();
  if (!session) redirect("/login");
  if (session.role !== "client") notFound();
  return { userId: session.userId };
}
