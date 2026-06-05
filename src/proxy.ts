import { NextResponse, type NextRequest } from "next/server";
import { resolveSurface } from "@/lib/resolve-surface";
import { env } from "@/env";

// Next.js 16 renamed the `middleware` convention to `proxy` (runs on the Node.js
// runtime). This is Soloist's host → surface router.
export const config = {
  // Run on page requests only — skip Next internals, the API tree, and files with an extension.
  matcher: ["/((?!_next/|api/|favicon.ico|.*\\..*).*)"],
};

/** Internal rewrite target with no matching route → renders app/not-found.tsx (404). */
const NOT_FOUND = "/__surface-not-found";

export function proxy(req: NextRequest) {
  const { surface, slug } = resolveSurface(
    req.headers.get("host"),
    env.NEXT_PUBLIC_ROOT_DOMAIN,
    env.NEXT_PUBLIC_COCKPIT_SUBDOMAIN,
  );

  const url = req.nextUrl.clone();
  const path = url.pathname;

  // The proxy is the SOLE authority on the tenant slug — never trust an inbound
  // x-tenant-slug header (a client could spoof it). Strip it on every request,
  // then set it only for the portal surface below.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.delete("x-tenant-slug");

  // Forward the (cleaned) headers to the destination Server Component via the
  // documented request-init channel — `headers()` reads the request, not the response.
  const rewriteTo = (pathname: string) => {
    url.pathname = pathname;
    return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
  };

  // Match the reserved internal prefixes by SEGMENT boundary, so paths like
  // "/cockpit-roadmap" or "/portala" are not misclassified as internal.
  const isInternalPrefix =
    path === "/cockpit" ||
    path.startsWith("/cockpit/") ||
    path === "/portal" ||
    path.startsWith("/portal/");

  // Unknown host (NFR-2: no disclosure) or a client poking the internal prefixes → not-found.
  if (surface === "not-found" || isInternalPrefix) {
    return rewriteTo(NOT_FOUND);
  }

  const suffix = path === "/" ? "" : path;

  if (surface === "cockpit") {
    return rewriteTo(`/cockpit${suffix}`);
  }

  // surface === "portal" — set the slug authoritatively for server components.
  if (slug) requestHeaders.set("x-tenant-slug", slug);
  return rewriteTo(`/portal${suffix}`);
}
