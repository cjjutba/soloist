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

  // Unknown host → neutral not-found (NFR-2: no disclosure).
  if (surface === "not-found") {
    url.pathname = NOT_FOUND;
    return NextResponse.rewrite(url);
  }

  // The internal surface prefixes are not directly reachable by clients.
  if (path.startsWith("/cockpit") || path.startsWith("/portal")) {
    url.pathname = NOT_FOUND;
    return NextResponse.rewrite(url);
  }

  const suffix = path === "/" ? "" : path;

  if (surface === "cockpit") {
    url.pathname = `/cockpit${suffix}`;
    return NextResponse.rewrite(url);
  }

  // surface === "portal" — carry the resolved slug to server components via a header.
  url.pathname = `/portal${suffix}`;
  const res = NextResponse.rewrite(url);
  if (slug) res.headers.set("x-tenant-slug", slug);
  return res;
}
