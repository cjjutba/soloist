/**
 * Soloist's OWN brand for PLATFORM emails (email verification, password reset). These are sent
 * BY Soloist to a user — at sign-up and forgot-password — OUTSIDE any Tenant context, so they
 * wear Soloist Iris and the "Soloist" name, never a Tenant's accent/logo (those belong to the
 * client-facing invite / invoice / ship-published emails). The accent mirrors `DEFAULT_ACCENT`
 * in src/server/branding/contrast.ts — duplicated here so an email template never imports a
 * server/branding module.
 */
export const SOLOIST_EMAIL_BRAND = {
  name: "Soloist",
  logoUrl: null as string | null,
  accentHex: "#5b5bd6", // Soloist Iris
} as const;
