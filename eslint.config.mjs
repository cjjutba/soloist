import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // NFR-2 choke point: feature code must go through src/server/db repositories +
  // withTenant — never the raw Drizzle client/schema. (The db layer itself is exempt below.)
  {
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "drizzle-orm",
                "drizzle-orm/*",
                "@neondatabase/serverless",
                "pg",
                "postgres",
              ],
              message:
                "Access the database only through src/server/db repositories + withTenant (NFR-2 tenant-scoping choke point).",
            },
            {
              // Glob (not just the @/ alias) so a relative import can't sneak past the guard.
              group: ["**/server/db/index", "**/server/db/schema"],
              message:
                "Don't import the raw DB client or schema. Use a repository + TenantContext from @/server/db/context.",
            },
          ],
        },
      ],
    },
  },
  // The data-access layer is the one place allowed to touch Drizzle directly.
  {
    files: ["src/server/db/**"],
    rules: { "no-restricted-imports": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
