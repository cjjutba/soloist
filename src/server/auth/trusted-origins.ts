/**
 * Origin allow-list for Better Auth's CSRF / origin check.
 *
 * Production trusts ONLY the canonical origin (`BETTER_AUTH_URL`, e.g. https://soloist.cjjutba.com)
 * — never loosen this; a permissive origin list defeats CSRF protection.
 *
 * In development the Next dev port floats (3000/3001/3002…) and the browser posts from whatever
 * port it's served on, so a fixed single-port allow-list 403s ("Invalid origin: http://localhost:3002").
 * We therefore also trust any localhost port in dev via Better Auth's wildcard pattern support
 * (`http://localhost:*`) — gated strictly to non-production.
 */
export function buildTrustedOrigins(
  baseUrl: string,
  nodeEnv: string | undefined = process.env.NODE_ENV,
): string[] {
  if (nodeEnv === "production") return [baseUrl];
  return [baseUrl, "http://localhost:*", "http://127.0.0.1:*"];
}
