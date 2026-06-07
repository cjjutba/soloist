import { sql } from "drizzle-orm";
import { jsonb, pgPolicy, pgTable, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
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

/**
 * A pending Client invite for one Engagement (Story 2.3). The raw token lives only in the
 * emailed URL; we store ONLY its SHA-256 hash (`token_hash`) — an account-takeover
 * credential at rest otherwise (NFR-3). One active invite per Engagement (v1). The accept
 * flow (Story 2.4) hashes the presented token, looks it up by `token_hash`, and creates
 * the `ClientAccess` + `User`. ⚠️ Story 2.4: the lookup MUST also enforce
 * `expires_at > now()` AND `accepted_at IS NULL` (single-use, unexpired) — the columns
 * exist here but nothing structurally prevents replaying an expired/consumed token.
 */
export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    // UNIQUE → one active invite per Engagement; resend replaces the row in place.
    engagementId: uuid("engagement_id")
      .notNull()
      .unique()
      .references(() => engagements.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    // sha256(token) hex — never the raw token. UNIQUE for the pre-auth hash lookup (2.4).
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }), // stamped on accept (2.4)
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  () => [
    // Tenant-scoped for the Freelancer; engagement-scoped for a Client (the clause keys on
    // engagement_id). Same NULLIF-fail-closed dual-scope shape as `engagements`.
    pgPolicy("invitation_scope", {
      for: "all",
      using: sql`tenant_id = ${currentTenant} AND (${currentEngagement} IS NULL OR engagement_id = ${currentEngagement})`,
      withCheck: sql`tenant_id = ${currentTenant} AND (${currentEngagement} IS NULL OR engagement_id = ${currentEngagement})`,
    }),
  ],
);

/**
 * A Client's access grant to exactly one Engagement (Story 2.4), created when they accept
 * an Invitation. v1 is strictly 1:1:1 — `engagement_id` UNIQUE (one Client per Engagement)
 * and `user_id` UNIQUE (one Engagement per Client). `getAppSession` resolves a Client's
 * scope from this row (`engagement_id` comes from HERE, never the request — NFR-2).
 */
export const clientAccess = pgTable(
  "client_access",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    engagementId: uuid("engagement_id")
      .notNull()
      .unique()
      .references(() => engagements.id, { onDelete: "cascade" }),
    // text FK → Better Auth user.id (text, no RLS — like tenants.owner_user_id).
    userId: text("user_id")
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("client"),
    invitedAt: timestamp("invited_at", { withTimezone: true }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull().defaultNow(),
    // Stamped when the Client finishes the one-time branded Onboarding (Story 2.5);
    // null = not yet onboarded → route them through the hero.
    onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  () => [
    pgPolicy("client_access_scope", {
      for: "all",
      using: sql`tenant_id = ${currentTenant} AND (${currentEngagement} IS NULL OR engagement_id = ${currentEngagement})`,
      withCheck: sql`tenant_id = ${currentTenant} AND (${currentEngagement} IS NULL OR engagement_id = ${currentEngagement})`,
    }),
  ],
);

/**
 * A unit of progress on an Engagement (Story 3.1 — the Ship Feed moat). Auto-pulled from
 * GitHub (or authored by hand) as a `candidate`, then PUBLISHED by an explicit Freelancer
 * action (Story 3.6) to become Client-visible. **`raw_meta` (SHAs/branches/diffs) is a
 * SEPARATE column the Client query layer NEVER selects** — the privacy boundary is in the
 * schema, not just the UI. `state='candidate'` rows are Freelancer-only.
 */
export const shipUpdates = pgTable(
  "ship_updates",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => engagements.id, { onDelete: "cascade" }),
    statusTag: text("status_tag").notNull(), // shipped | in_progress | next (FR-10)
    title: text("title").notNull(), // founder-readable — never a raw dev artifact
    summary: text("summary"),
    state: text("state").notNull().default("candidate"), // candidate | published | dismissed
    source: text("source").notNull(), // github | manual
    // Idempotency key for the GitHub pipeline (stable per logical event). UNIQUE per
    // Engagement so duplicate webhook deliveries / Inngest retries don't dupe. NULL for
    // manual updates (Postgres treats NULLs as distinct → no false conflicts).
    sourceEventKey: text("source_event_key"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    // Story 3.4 kill-signal: stamped by the Story 3.5 curation edit (was this candidate edited
    // before publish?) — the input to the rendering-quality stat. NULL = rendered as-is.
    editedAt: timestamp("edited_at", { withTimezone: true }),
    // Raw payload detail (SHAs, diffs, full refs, branch names) — kept off the founder-facing
    // title/summary (NFR-3, Story 3.4), never client-queried directly. The Client feed reads only
    // published rows' {status_tag,title,summary,published_at} (3.7). architecture L185.
    rawMeta: jsonb("raw_meta"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("ship_updates_engagement_source_event_key").on(t.engagementId, t.sourceEventKey),
    // Tenant-scoped for the Freelancer; engagement-scoped for a Client — same dual-scope
    // shape as `engagements` (the Client feed in 3.7 reads only published rows, projection-only).
    pgPolicy("ship_update_scope", {
      for: "all",
      using: sql`tenant_id = ${currentTenant} AND (${currentEngagement} IS NULL OR engagement_id = ${currentEngagement})`,
      withCheck: sql`tenant_id = ${currentTenant} AND (${currentEngagement} IS NULL OR engagement_id = ${currentEngagement})`,
    }),
  ],
);

/**
 * A GitHub repo connected to one Engagement (Story 3.2). Stores ONLY the GitHub App
 * `installation_id` + `repo_id` (+ `repo_full_name`) — never a long-lived token (NFR-3);
 * short-lived installation tokens are minted on demand from the App private key. The webhook
 * pipeline resolves a repo → its Engagement by `repo_full_name` (the system read in
 * repo-connections.repository), which is why a repo may be ACTIVELY connected to at most one
 * Engagement (the partial unique below), while many repos can feed one Engagement.
 */
export const repoConnections = pgTable(
  "repo_connections",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => engagements.id, { onDelete: "cascade" }),
    ghInstallationId: text("gh_installation_id").notNull(),
    ghRepoId: text("gh_repo_id").notNull(),
    repoFullName: text("repo_full_name").notNull(),
    // connected | pulling | error | disconnected. 3.2 reaches connected/disconnected;
    // pulling/error + last_pull_at/last_error are driven by Story 3.3's pull + reconciliation.
    status: text("status").notNull().default("connected"),
    lastPullAt: timestamp("last_pull_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // At most one ACTIVE connection per repo → the webhook resolve-by-full-name is unambiguous;
    // a disconnected row stays as history + lets the repo be reconnected (a fresh row).
    uniqueIndex("repo_connections_active_repo")
      .on(t.repoFullName)
      .where(sql`status <> 'disconnected'`),
    // Tenant-scoped for the Freelancer; engagement-scoped — same dual-scope shape as engagements.
    pgPolicy("repo_connection_scope", {
      for: "all",
      using: sql`tenant_id = ${currentTenant} AND (${currentEngagement} IS NULL OR engagement_id = ${currentEngagement})`,
      withCheck: sql`tenant_id = ${currentTenant} AND (${currentEngagement} IS NULL OR engagement_id = ${currentEngagement})`,
    }),
  ],
);

/**
 * Binds a GitHub App installation to the Tenant that installed it (Story 3.2.1). The shared
 * Soloist App can be installed by many accounts; this map is what makes that multi-tenant-safe —
 * the connect picker lists only repos from the caller Tenant's installation(s). The binding is
 * created from the AUTHENTICATED Setup-URL redirect (the webhook can't know which Tenant).
 */
export const githubInstallations = pgTable(
  "github_installations",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    // A GitHub installation is globally unique → one binding per installation (re-install
    // re-asserts ownership to the current caller via onConflictDoUpdate).
    ghInstallationId: text("gh_installation_id").notNull().unique(),
    accountLogin: text("account_login"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  () => [
    // Tenant-owned (no engagement dimension) — single-clause scope like `branding`.
    pgPolicy("github_installation_scope", {
      for: "all",
      using: sql`tenant_id = ${currentTenant}`,
      withCheck: sql`tenant_id = ${currentTenant}`,
    }),
  ],
);

/**
 * GitHub webhook idempotency ledger (Story 3.1). Written by the PRE-TENANT webhook handler
 * (it dedupes on `gh_delivery_id` before any Tenant context exists), so — like the Better
 * Auth identity tables — it carries **NO RLS** and is queried as the connection role. It
 * holds no Tenant data, only delivery metadata.
 */
export const webhookEvents = pgTable("webhook_events", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  ghDeliveryId: text("gh_delivery_id").notNull().unique(),
  eventType: text("event_type").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
});

/**
 * In-app notifications (Story 3.6). Created by the `ship/update.published` Inngest fan-out for
 * the Engagement's Client; Epic 4 builds the center/toast/prefs that read them. Dual-scope RLS
 * (same shape as ship_updates) — a Client (engagement ctx) sees their Engagement's rows. The
 * partial unique on (user_id, ship_update_id) makes the fan-out idempotent (a retry can't dupe).
 */
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => engagements.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }), // the recipient (the Client)
    type: text("type").notNull(), // ship_published (v1) | invoice_sent | engagement_start (later)
    shipUpdateId: uuid("ship_update_id").references(() => shipUpdates.id, { onDelete: "cascade" }),
    readAt: timestamp("read_at", { withTimezone: true }), // Epic 4 marks read
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Fan-out idempotency: one ship_published notification per (recipient, ship_update). The
    // partial WHERE leaves future null-ship_update_id rows (invoice/engagement) unconstrained.
    uniqueIndex("notifications_ship_dedup")
      .on(t.userId, t.shipUpdateId)
      .where(sql`ship_update_id IS NOT NULL`),
    pgPolicy("notification_scope", {
      for: "all",
      using: sql`tenant_id = ${currentTenant} AND (${currentEngagement} IS NULL OR engagement_id = ${currentEngagement})`,
      withCheck: sql`tenant_id = ${currentTenant} AND (${currentEngagement} IS NULL OR engagement_id = ${currentEngagement})`,
    }),
  ],
);

export type Tenant = typeof tenants.$inferSelect;
export type Branding = typeof branding.$inferSelect;
export type Engagement = typeof engagements.$inferSelect;
export type Invitation = typeof invitations.$inferSelect;
export type ClientAccess = typeof clientAccess.$inferSelect;
export type ShipUpdate = typeof shipUpdates.$inferSelect;
export type WebhookEvent = typeof webhookEvents.$inferSelect;
export type RepoConnection = typeof repoConnections.$inferSelect;
export type GithubInstallation = typeof githubInstallations.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
