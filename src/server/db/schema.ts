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

/**
 * Engagement scope GUC (Story 2.1). A Freelancer request sets ONLY `app.tenant_id`, so
 * this is NULL → the engagement clause is satisfied and they see all their Tenant's
 * Engagements. A Client request also sets `app.engagement_id` → restricted to that one
 * Engagement (a Client can never see another Engagement within the same Tenant). Same
 * NULLIF-then-cast fail-closed shape as `currentTenant`.
 */
const currentEngagement = sql`nullif(current_setting('app.engagement_id', true), '')::uuid`;

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

/**
 * A client project — the core aggregate (Story 2.1). Tenant-owned, and (for Clients)
 * engagement-scoped via RLS. Its Ship Feed is its ShipUpdates (1:1 by construction).
 */
export const engagements = pgTable(
  "engagements",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    clientDisplayName: text("client_display_name").notNull(),
    name: text("name").notNull(),
    scope: text("scope"),
    // active | paused | completed | archived (archived = hidden from the active list).
    status: text("status").notNull().default("active"),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  () => [
    // Tenant-scoped for the Freelancer; additionally Engagement-scoped for a Client.
    pgPolicy("engagement_scope", {
      for: "all",
      using: sql`tenant_id = ${currentTenant} AND (${currentEngagement} IS NULL OR id = ${currentEngagement})`,
      withCheck: sql`tenant_id = ${currentTenant} AND (${currentEngagement} IS NULL OR id = ${currentEngagement})`,
    }),
  ],
);

export type Tenant = typeof tenants.$inferSelect;
export type Branding = typeof branding.$inferSelect;
export type Engagement = typeof engagements.$inferSelect;
