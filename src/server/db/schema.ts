import { sql } from "drizzle-orm";
import { pgPolicy, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";
import { user } from "./auth-schema";

// Better Auth identity tables (user/session/account/verification) — re-exported so
// drizzle-kit (single-file `schema`) and the Drizzle client both register them.
// They carry NO RLS (see auth-schema.ts).
export * from "./auth-schema";

/**
 * RLS predicate. The app's repository layer sets `app.tenant_id` per request
 * (see scope.ts › applyTenantScope). The `, true` makes current_setting tolerate a
 * missing GUC, and `NULLIF(..., '')` maps an UNSET value to NULL — a custom GUC
 * reverts to '' (empty string), not NULL, once it has been set on a connection, so
 * without NULLIF an unscoped query on a reused/pooled connection would error on
 * `''::uuid`. With it, the policy fails CLOSED to 0 rows.
 */
const currentTenant = sql`nullif(current_setting('app.tenant_id', true), '')::uuid`;

export const tenants = pgTable(
  "tenants",
  {
    // uuid v7 generated app-side (time-sortable; no dependency on the PG version/extension).
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    // Internal identifier (reserved for future custom domains) — NOT URL-facing in v1.
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    // Story 1.3: the Freelancer who owns this Tenant. UNIQUE ⇒ one Tenant per owner.
    // text FK → Better Auth user.id (which is text, not uuid). FK validation bypasses
    // RLS by Postgres design, so this is safe despite FORCE RLS on tenants.
    ownerUserId: text("owner_user_id")
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: "cascade" }),
    // Stamped by Better Auth's afterEmailVerification hook — the Tenant lifecycle
    // marker (AC-2). Real access enforcement rides on requireEmailVerification.
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  () => [
    // A Tenant can see / act on only itself.
    pgPolicy("tenant_self", {
      for: "all",
      using: sql`id = ${currentTenant}`,
      withCheck: sql`id = ${currentTenant}`,
    }),
  ],
);

export const branding = pgTable(
  "branding",
  {
    tenantId: uuid("tenant_id")
      .primaryKey()
      .references(() => tenants.id, { onDelete: "cascade" }),
    logoBlobUrl: text("logo_blob_url"),
    accentHex: text("accent_hex"),
    accentTextHex: text("accent_text_hex"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  () => [
    // Tenant-owned rows scoped by tenant_id.
    pgPolicy("branding_tenant", {
      for: "all",
      using: sql`tenant_id = ${currentTenant}`,
      withCheck: sql`tenant_id = ${currentTenant}`,
    }),
  ],
);

export type Tenant = typeof tenants.$inferSelect;
export type Branding = typeof branding.$inferSelect;
