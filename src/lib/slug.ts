/**
 * Tenant slug rules (Story 1.3, AC-3).
 *
 * The slug is the Tenant's INTERNAL identifier — reserved for future custom
 * domains, NOT URL-facing in v1 (paths are /app, /portal). We validate to
 * DNS-label rules now so it is domain-ready later. Uniqueness is NOT checked
 * here: RLS blocks reading another Tenant's row, so the DB unique constraint
 * (+ a 23505 catch in provisionTenant) is the authoritative guard. This module
 * only owns format + reserved-name validation, and is pure/offline-testable.
 */

/** Lowercase + trim. (Intentionally does NOT turn spaces into hyphens — a space
 * yields an invalid slug the user must fix, rather than a silent surprise.) */
export function normalizeSlug(raw: string): string {
  return raw.trim().toLowerCase();
}

// DNS-label safe: lowercase a–z/0–9, single hyphens, 3–63 chars, no leading/
// trailing hyphen. The capture group forces a first + middle(1–61) + last char
// (so min length 3, max 63). Consecutive hyphens are rejected separately.
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;

/** Strict format check on the string AS GIVEN (no normalization). */
export function isValidSlugFormat(slug: string): boolean {
  return SLUG_RE.test(slug) && !slug.includes("--");
}

/** System / routing names a Tenant may never claim (checked case-insensitively
 * against the normalized slug). Forward-looking for custom domains + path safety. */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  "app",
  "portal",
  "invite",
  "api",
  "auth",
  "www",
  "admin",
  "root",
  "signin",
  "signup",
  "login",
  "logout",
  "register",
  "dashboard",
  "settings",
  "account",
  "billing",
  "support",
  "help",
  "status",
  "docs",
  "blog",
  "mail",
  "email",
  "static",
  "assets",
  "public",
  "_next",
  "cdn",
  "ws",
  "soloist",
  "vercel",
]);

export type SlugValidation =
  | { ok: true; slug: string }
  | { ok: false; reason: "format" | "reserved" };

/** Normalize, then validate format, then reserved. Returns the normalized slug
 * to persist on success. */
export function validateSlug(raw: string): SlugValidation {
  const slug = normalizeSlug(raw);
  if (!isValidSlugFormat(slug)) return { ok: false, reason: "format" };
  if (RESERVED_SLUGS.has(slug)) return { ok: false, reason: "reserved" };
  return { ok: true, slug };
}
