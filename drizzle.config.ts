import { defineConfig } from "drizzle-kit";
import { existsSync, readFileSync } from "node:fs";

// drizzle-kit runs outside Next, so load DATABASE_URL from .env.local ourselves.
if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^\s*DATABASE_URL\s*=\s*(.*)\s*$/);
    if (m) process.env.DATABASE_URL = m[1].trim().replace(/^['"]|['"]$/g, "");
  }
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  // RLS policies are authored in the migration SQL (drizzle-kit doesn't emit
  // FORCE ROW LEVEL SECURITY); see drizzle/*.sql.
});
