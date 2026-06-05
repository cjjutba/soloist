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
};

export default nextConfig;
