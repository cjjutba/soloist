import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Better Auth is a server-only package that DYNAMICALLY imports optional native
  // adapters (bun/node/D1 sqlite via kysely) it never uses with our pg/Drizzle setup.
  // Bundling it makes Turbopack statically trace those branches and choke on the
  // kysely sqlite dialect (kysely 0.29 dropped a constant it references). Marking it
  // external leaves it as a runtime import from node_modules — the unused sqlite path
  // is never loaded (we use pg), so the broken import is never reached.
  serverExternalPackages: ["better-auth", "@better-auth/kysely-adapter"],
  // Tenant logo upload goes through a Server Action (≤1MB); the default 1MB cap is tight
  // once form overhead is added, so allow a little headroom (Story 1.6).
  experimental: { serverActions: { bodySizeLimit: "2mb" } },
};

export default nextConfig;
