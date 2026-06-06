import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { findClientAccessByUserId } from "@/server/db/repositories/client-access.repository";
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
  // Set only for Clients (Story 2.4) — the one Engagement their ClientAccess scopes them to.
  engagementId?: string;
  // Client Onboarding flag (Story 2.5): null = not yet onboarded → route through the hero.
  onboardedAt?: Date | null;
};

/** A guard-validated freelancer principal — also a valid `TenantContext` for the data layer. */
export type FreelancerSession = AppSession & { role: "freelancer"; tenantId: string };

/** A guard-validated client principal — a valid engagement-scoped `TenantContext`. */
export type ClientSession = AppSession & {
  role: "client";
  tenantId: string;
  engagementId: string;
};

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
  const base = { userId: u.id, name: u.name, email: u.email, emailVerified: u.emailVerified };

  // Role is DERIVED from the data model. A user that owns a Tenant (tenantId set) is a
  // freelancer — short-circuit, no extra query (the 1.4 hot path).
  if (u.tenantId) {
    return { ...base, tenantId: u.tenantId, role: "freelancer" };
  }
  // Otherwise, a Client? Resolve scope from ClientAccess (Story 2.4) — the bootstrap read
  // (RLS-bypass, keyed on this session's own userId) that learns (tenantId, engagementId).
  const access = await findClientAccessByUserId(u.id);
  if (access) {
    return {
      ...base,
      tenantId: access.tenantId,
      role: "client",
      engagementId: access.engagementId,
      onboardedAt: access.onboardedAt, // already on the fetched row — no extra query
    };
  }
  return { ...base, tenantId: null, role: null };
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
 * /portal guard (Story 2.4). Returns the client principal — an engagement-scoped
 * `TenantContext` (its `engagementId` comes from the ClientAccess row, never the request).
 * Unauthenticated → /login; a Freelancer or any non-client → notFound() (the cross-surface
 * guarantee: a Freelancer session can never act on the portal). The role is bound to a REAL
 * ClientAccess row (getAppSession), never loosened to "any non-freelancer".
 */
export async function requireClient(): Promise<ClientSession> {
  const session = await getAppSession();
  if (!session) redirect("/login");
  if (session.role !== "client" || !session.tenantId || !session.engagementId) {
    notFound();
  }
  return session as ClientSession;
}

/**
 * /portal guard for surfaces that require the one-time Onboarding done first (Story 2.6):
 * the Ship Feed, Documents, Notifications. An un-onboarded Client is routed to the hero. The
 * portal LAYOUT must NOT use this (it wraps `/portal/onboarding` → a layout redirect would
 * loop); only the leaf pages do, and the onboarding page checks the opposite condition.
 */
export async function requireOnboardedClient(): Promise<ClientSession> {
  const session = await requireClient();
  if (!session.onboardedAt) redirect("/portal/onboarding");
  return session;
}
