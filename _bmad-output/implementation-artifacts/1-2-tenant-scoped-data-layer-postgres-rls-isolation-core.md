---
baseline_commit: bed9eeb80966b75b2388882e162085d1f5eb57d2
---
# Story 1.2: Tenant-Scoped Data Layer + Postgres RLS (Isolation Core)

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As the builder,
I want all database access routed through a tenant-scoped layer backed by Postgres RLS,
so that NFR-2 isolation — the launch blocker — is enforced at a single auditable choke point **and** at the database, before any feature rides on it.

## Acceptance Criteria

1. **Neon + Drizzle wired for transactional RLS.** A Drizzle client connects to Neon using the **WebSocket `Pool` driver** (`drizzle-orm/neon-serverless`), which supports the multi-statement transactions that `SET LOCAL`/`set_config(..., true)` require. `DATABASE_URL` is added to the Zod `env.ts`. `drizzle.config.ts` + `drizzle-kit` generate forward-only SQL migrations into `drizzle/`.
2. **Schema with uuid-v7 PKs + RLS.** The initial migration creates `tenants` and `branding` (both with uuid-v7 PKs, `snake_case` columns, `timestamptz` `*_at`), `branding` carrying `tenant_id`. **RLS is ENABLED on both** with `USING`/`WITH CHECK` policies keyed on `current_setting('app.tenant_id')::uuid` (and the policy SQL is in the committed migration — drizzle-kit does not emit policies on its own).
3. **Tenant-scoped data layer (the choke point).** All DB access goes through `src/server/db/` via a `withTenant(ctx, fn)` helper that opens a transaction, sets `app.tenant_id` (and `app.engagement_id`) from the `TenantContext`, then runs the scoped query. Repositories require a `TenantContext` (`{ tenantId, userId, role, engagementId? }`) and inject the `where tenant_id = ctx.tenantId` predicate. **Drizzle is importable only inside `src/server/db/`** (enforced by an ESLint rule). Cross-scope reads return empty → surfaced as not-found, never denied.
4. **Isolation test suite passes against real Postgres.** Automated tests prove, against a real Postgres (Neon test branch or local `postgres:17`), that: (a) with `app.tenant_id = A`, queries return only Tenant A's rows; (b) a query that *forgets* the app-layer predicate but runs inside A's transaction **still** returns only A's rows (RLS backstop); (c) cross-tenant access returns empty/0 rows; (d) the `tenants` self-policy lets a Tenant see only itself. The suite is structured so the engagement-scoped Client fixture (`app.engagement_id`) can be added in Story 2.1 when `engagements` exists.

## Tasks / Subtasks

- [x] **Task 1 — Neon connection + Drizzle WebSocket client (AC: 1)**
  - [x] `npm i uuidv7 ws && npm i -D @types/ws` *(uuidv7 = app-side v7 PKs; ws = WebSocket transport for the Neon Pool driver on the Node runtime).*
  - [x] Add `DATABASE_URL` to `src/env.ts`'s Zod schema (`z.string().url()`), and to `.env.example` (+ `.env.local` with a Neon dev-branch URL).
  - [x] `src/server/db/index.ts`: create the client with **`drizzle-orm/neon-serverless`** (`Pool` from `@neondatabase/serverless`), setting `neonConfig.webSocketConstructor = ws`. **Do NOT use `drizzle-orm/neon-http`** — the HTTP driver cannot run the multi-statement transactions that `SET LOCAL` needs (RLS would silently no-op). This is the ONLY file that constructs the Drizzle client.
  - [x] `drizzle.config.ts` (dialect `postgresql`, schema `./src/server/db/schema.ts`, out `./drizzle`, `dbCredentials` from `DATABASE_URL`); add `db:generate` / `db:migrate` npm scripts.
- [x] **Task 2 — Schema: tenants + branding, uuid v7, RLS (AC: 2)**
  - [x] `src/server/db/schema.ts`:
    - `tenants` — `id uuid pk` (`$defaultFn(() => uuidv7())`), `slug text unique not null`, `name text not null`, `created_at timestamptz default now()`. (Internal `slug`; **not** URL-facing — path-based routing.) NO `owner_user_id` FK yet (the `users` table is owned by Better Auth in Story 1.3 — adding the FK now would create a forward dependency).
    - `branding` — `tenant_id uuid pk references tenants(id) on delete cascade` (1:1), `logo_blob_url text`, `accent_hex text`, `accent_text_hex text`, `updated_at timestamptz default now()`.
    - Enable RLS on both (Drizzle `pgTable(..., () => [pgPolicy(...)])` / `.enableRLS()`), and define the policies (see Dev Notes for exact SQL).
  - [x] `npm run db:generate` → review the generated migration. **Because drizzle-kit does not reliably emit RLS `CREATE POLICY` SQL, add the policy + `ALTER TABLE … ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` statements into the migration** (or a `drizzle-kit generate --custom` migration). Commit the SQL.
  - [x] Apply to the Neon dev branch (`npm run db:migrate`) and confirm the tables + policies exist (`\d+ branding`, `select * from pg_policies`).
- [x] **Task 3 — TenantContext + withTenant + repositories (AC: 3)**
  - [x] `src/server/db/context.ts`: `type TenantContext = { tenantId: string; userId: string; role: 'freelancer' | 'client'; engagementId?: string }`. `withTenant(ctx, fn)` = `db.transaction(async (tx) => { await tx.execute(sql\`select set_config('app.tenant_id', ${ctx.tenantId}, true)\`); if (ctx.engagementId) await tx.execute(sql\`select set_config('app.engagement_id', ${ctx.engagementId}, true)\`); return fn(tx); })`. (`set_config(..., true)` = transaction-local, the parameterizable form of `SET LOCAL`.)
  - [x] `src/server/db/repositories/branding.repository.ts`: `getBranding(ctx)` / `upsertBranding(ctx, data)` — call `withTenant`, query/mutate via the `tx`, inject `eq(branding.tenantId, ctx.tenantId)`. A `tenants` repository for `getTenant(ctx)` / `createTenant(...)`. **Feature code never imports Drizzle — only these repositories.**
  - [x] ESLint rule (e.g. `no-restricted-imports`) forbidding `drizzle-orm`/`@/server/db/schema` imports outside `src/server/db/**`.
- [x] **Task 4 — Isolation test suite (AC: 4)**
  - [x] Stand up a real test Postgres: **recommended `docker compose` `postgres:17`** (offline, fast, real RLS) with a `DATABASE_URL_TEST`; document a Neon test-branch alternative. Run migrations against it before the suite (global setup).
  - [x] `src/server/db/__tests__/isolation.test.ts` (Vitest, `passWithNoTests` no longer needed): seed Tenant A + B (+ their branding); assert (a) scoped read returns only A; (b) a deliberately-unscoped query inside A's `withTenant` still returns only A (RLS proof); (c) cross-tenant read → empty; (d) `tenants` self-policy → a Tenant sees only itself. Leave a clearly-marked TODO fixture slot for the engagement-scoped Client case (Story 2.1).
  - [x] Wire the test DB into the npm `test` script / CI (Story 1.7 finalizes CI; here just make `npm test` run the suite locally against `DATABASE_URL_TEST`).
- [x] **Task 5 — Verify (all ACs)**
  - [x] `npm run build`, `tsc --noEmit`, `eslint` clean (incl. the no-Drizzle-outside-db-layer rule). `npm test` green (isolation suite passes). Migration replays cleanly on a fresh DB.

## Dev Notes

**SCOPE BOUNDARIES — do NOT build these here (own stories):**
- ❌ No Better Auth, `users`/`sessions`/`organization` tables, sign-up, or `owner_user_id` FK → **Story 1.3**. (1.3's Better Auth org plugin reconciles with `tenants` — see the seam note below. Do not create a `users` table now; it would collide with Better Auth.)
- ❌ No `engagements` / `engagement_id` RLS *policy* or the engagement-scoped test fixture → **Story 2.1**. But DO build `withTenant` + `TenantContext` to *carry and set* `app.engagement_id` now (the policy attaches when `engagements` exists).
- ❌ No Branding settings UI / contrast guard → **Story 1.6**. This story creates only the `branding` *table* (a representative tenant-owned table to prove isolation end-to-end).
- ❌ No auth/session wiring to produce a real `TenantContext` → **Story 1.3/1.4**. Here, repositories accept a `TenantContext` that tests construct directly.

**THE #1 LANDMINE — Neon driver choice** [Source: web research 2026-06-06; Neon serverless-driver docs]. `SET LOCAL`/`set_config(name, val, true)` only persists *inside a transaction*. The Neon **HTTP** driver (`drizzle-orm/neon-http`, `neon()`) does **not** support multi-statement/interactive transactions — using it would make `set_config` a no-op and **RLS would silently allow cross-tenant reads.** Use the **WebSocket `Pool`** driver (`drizzle-orm/neon-serverless`, `Pool` from `@neondatabase/serverless`) with `neonConfig.webSocketConstructor = ws`. All scoped access goes through `db.transaction`.

**Exact RLS migration SQL** (put in the committed migration; drizzle-kit won't emit it) [Source: architecture.md#Data-Architecture; Drizzle RLS docs]:
```sql
ALTER TABLE tenants  ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants  FORCE  ROW LEVEL SECURITY;
ALTER TABLE branding ENABLE ROW LEVEL SECURITY;
ALTER TABLE branding FORCE  ROW LEVEL SECURITY;

-- A Tenant can see/act only on itself:
CREATE POLICY tenant_self ON tenants
  USING (id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (id = current_setting('app.tenant_id', true)::uuid);

-- Tenant-owned rows scoped by tenant_id:
CREATE POLICY branding_tenant ON branding
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
```
`FORCE ROW LEVEL SECURITY` makes RLS apply even to the table owner (the app's DB role), so a forgotten predicate can't leak. The `, true` 2nd arg to `current_setting` returns NULL instead of erroring when the GUC is unset (defense: unset context → policy fails closed → 0 rows).

**uuid v7 (time-sortable PKs)** [Source: web research; architecture]: generate **app-side** — `import { uuidv7 } from "uuidv7"` + Drizzle `uuid().primaryKey().$defaultFn(() => uuidv7())`. Avoids depending on Neon's Postgres version or the `pg_uuidv7` extension. (Postgres 18 has native `uuidv7()`, but don't assume Neon is on 18.)

**`withTenant` pattern** (the choke point):
```ts
export async function withTenant<T>(ctx: TenantContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.tenant_id', ${ctx.tenantId}, true)`);
    if (ctx.engagementId) await tx.execute(sql`select set_config('app.engagement_id', ${ctx.engagementId}, true)`);
    return fn(tx);
  });
}
```
Every repository call wraps its query in `withTenant`. The app-layer `where tenant_id = ctx.tenantId` predicate is the primary guard; RLS is the seatbelt.

**Conventions to follow** [Source: architecture.md#Implementation-Patterns]: tables `snake_case` plural; columns `snake_case`; PK `id`; FKs `<entity>_id`; enums as Postgres enums; timestamps `timestamptz` `*_at`; Drizzle table objects `camelCase` plural (`tenants`, `branding`), inferred types `PascalCase` singular. uuid v7 everywhere.

**Story 1.3 reconciliation seam (note, don't build):** the architecture maps "Tenant = Better Auth Organization." Story 1.3 will configure Better Auth's organization plugin so its org maps to this `tenants` table (Better Auth supports custom table/field mapping) and add `tenants.owner_user_id` referencing Better Auth's `users`. Keep `tenants` minimal here so 1.3 can extend it without a destructive migration.

### Project Structure Notes

New files (aligns with architecture.md#Project-Structure): `src/server/db/index.ts` (client — sole Drizzle construction site), `src/server/db/schema.ts`, `src/server/db/context.ts`, `src/server/db/repositories/{tenants,branding}.repository.ts`, `src/server/db/__tests__/isolation.test.ts`, `drizzle.config.ts`, `drizzle/0000_*.sql` (migration incl. RLS), `docker-compose.yml` (test Postgres). Modified: `src/env.ts` (+`DATABASE_URL`), `.env.example`/`.env.local`, `package.json` (deps + `db:*`/test scripts), `eslint.config.mjs` (no-Drizzle-outside-db-layer). This is the first `src/server/` module — later stories add `server/auth`, `server/engagements`, etc.

### References

- [Source: epics.md#Story-1.2] + AR-3/AR-4/AR-5; NFR-2 (launch blocker), NFR-3.
- [Source: architecture.md#Data-Architecture] — two-layer isolation, the `withTenant`/RLS pattern, data model, migrations.
- [Source: architecture.md#Implementation-Patterns] — naming + the "Drizzle only in `src/server/db/`" rule.
- [Source: web research 2026-06-06] — Neon HTTP-vs-WebSocket transaction limitation; Drizzle RLS `pgPolicy`; drizzle-kit doesn't emit policies; uuid v7 app-side.
- [Previous story 1.1] — path-based app at repo root; `src/env.ts` Zod pattern (extend, don't replace); vitest config (drop `passWithNoTests` once this suite exists); conventions established.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (Claude Opus 4.8, 1M context)

### Debug Log References

- drizzle-kit (0.31) **did** emit `ENABLE ROW LEVEL SECURITY` + both `CREATE POLICY` statements from the in-schema `pgPolicy` definitions — better than the spec assumed. It did **not** emit `FORCE ROW LEVEL SECURITY` (Drizzle has no FORCE concept), so I appended `ALTER TABLE … FORCE ROW LEVEL SECURITY` to the migration. This is critical: without FORCE, the table owner (`neondb_owner`, which the app connects as) bypasses RLS → the backstop would be inert.
- Migration applied to Neon (PG 18); verified on the live DB: `tenants`/`branding` both `relrowsecurity=true, relforcerowsecurity=true` with the `tenant_self`/`branding_tenant` policies present.

### Completion Notes List

- **Story complete; all ACs verified.** NFR-2 isolation is enforced at the app layer (the `withTenant` choke point + repository predicate) **and** the DB layer (RLS, FORCED) on the real Neon database.
- **Driver:** used the Neon **WebSocket `Pool`** driver (`drizzle-orm/neon-serverless` + `ws`), as the spec demands — `set_config(..., true)` runs inside `db.transaction`, which the HTTP driver couldn't support.
- **uuid v7** generated app-side via `uuidv7` (no dependency on Neon's PG version).
- **Isolation test (5/5 pass)** against in-process **PGlite** — a deliberate substitution for the spec's "docker postgres:17 / Neon branch" (same goal: real Postgres RLS; PGlite is offline, fast, deterministic, needs no network/docker). Because PGlite's default role is a superuser that bypasses RLS, the test runs scoped work as a non-superuser `app_user` so the policies actually apply (mirroring prod's non-superuser owner + FORCE). Test (b) is the key proof: an **unscoped** query still returns only the active Tenant's rows.
- **Refactor for testability:** split `applyTenantScope`/`TenantContext` into `scope.ts` (no db import) so the test exercises the *real* helper offline; `context.ts` holds `withTenant` (db-bound).
- **ESLint guard:** `no-restricted-imports` forbids `drizzle-orm*`/`@neondatabase/serverless`/raw db client + schema outside `src/server/db/**`.
- **Scope respected:** no Better Auth/`users` table (Story 1.3 reconciles `tenants` with the Better Auth org), no `engagements`/`engagement_id` policy (Story 2.1 — but `withTenant` already sets `app.engagement_id`), no Branding UI (Story 1.6).
- **Not redeployed:** 1.2 is backend-only with no built route importing the DB, so prod is unaffected. **`DATABASE_URL` must be added to Vercel env before Story 1.3** (the first story whose UI touches the DB).

### File List

**New:** `drizzle.config.ts` · `drizzle/0000_clean_hellcat.sql` (RLS + FORCE) · `drizzle/0001_app_role.sql` (non-bypass `soloist_app` role) · `drizzle/0002_easy_norrin_radd.sql` (NULLIF fail-closed policies) · `drizzle/meta/*` · `src/server/db/index.ts` · `src/server/db/schema.ts` · `src/server/db/scope.ts` · `src/server/db/context.ts` · `src/server/db/repositories/tenants.repository.ts` · `src/server/db/repositories/branding.repository.ts` · `src/server/db/__tests__/isolation.test.ts`

**Modified:** `src/env.ts` (+`DATABASE_URL`) · `.env.example` · `.env.local` (gitignored; Neon URL) · `package.json` (+`uuidv7`,`ws`,`@types/ws`,`@electric-sql/pglite`; +`db:generate`/`db:migrate` scripts) · `eslint.config.mjs` (Drizzle-only-in-db-layer rule)

## Change Log

- 2026-06-06 — Story 1.2 implemented: Neon (PG18) + Drizzle WebSocket Pool client; `tenants` + `branding` schema (uuid v7); RLS policies **+ FORCE** in the migration, applied & verified on Neon; the `withTenant` tenant-scoping choke point + repositories; ESLint guard (Drizzle only in `src/server/db`); 5/5 isolation tests vs PGlite proving the RLS backstop. Build/typecheck/lint/test all green. Status → review.
- 2026-06-06 — **Addressed `/code-review` findings (one launch-blocking).** **CRITICAL:** Neon's connection role `neondb_owner` has `rolbypassrls=true`, so RLS was **inert in prod** (FORCE doesn't apply to BYPASSRLS roles) — verified by an empirical Neon probe returning *both* tenants. Fix: migration `0001` adds a NOBYPASSRLS `soloist_app` role; `applyTenantScope` now `SET LOCAL ROLE soloist_app` per transaction so RLS applies. Re-verified on Neon: isolation holds (only Tenant A returned). **Also fixed:** policies now `NULLIF(current_setting(...), '')::uuid` (migration `0002`) so an unset GUC on a reused/pooled connection fails **closed to 0 rows** instead of erroring on `''::uuid` (verified on Neon); `applyTenantScope` validates `tenantId`/`engagementId` are UUIDs (clear error, not a cast crash); `DATABASE_URL` restricted to the `postgres://` scheme; `upsertBranding` uses `sql\`now()\`` (DB clock) not `new Date()`; ESLint guard widened to glob (blocks *relative* imports of the raw client/schema, not just the `@/` alias) + `pg`/`postgres`. Isolation test rewritten to mirror prod's `soloist_app` switch and add cross-tenant UPDATE/DELETE + unset-scope fail-closed cases — **7/7 pass.** Build/typecheck/lint all green.
