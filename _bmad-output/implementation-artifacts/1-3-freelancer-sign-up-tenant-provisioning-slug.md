---
baseline_commit: 859cf95d7d67aaa40f27b562b7f922fe377cee0e
---

# Story 1.3: Freelancer Sign-Up + Tenant Provisioning + Slug

Status: review

<!-- Note: Validation is optional. Run validate-create-story for a quality check before dev-story. -->

## Story

As a dev-freelancer,
I want to sign up with email and password and claim my Tenant,
so that I get my own isolated, branded workspace.

## Acceptance Criteria

1. **Sign-up creates exactly one Tenant, owned by me, with a hashed password.**
   **Given** the sign-up screen
   **When** I register with email + password
   **Then** a `user` is created (password hashed by Better Auth — never stored plaintext) **and** exactly one `tenants` row is provisioned with me as `owner_user_id`, carrying the slug + name I chose. (FR-1, FR-4)

2. **Email verification gates an active Tenant.**
   **Given** I have just signed up
   **When** I have not yet verified my email
   **Then** I cannot obtain a usable Cockpit session (Better Auth `requireEmailVerification` blocks sign-in), a verification email is sent, and the Tenant is marked active (`activated_at` stamped) only after I click the verification link.

3. **Slug is accepted only if valid, unique, and not reserved.**
   **Given** the slug picker on the sign-up form
   **When** I choose a Tenant slug
   **Then** the system accepts it only if it is **format-valid** (DNS-label-safe: lowercase `a–z0–9` and single hyphens, 3–63 chars, no leading/trailing/double hyphen), **not in the reserved-name list**, and **unique** (enforced by the DB unique constraint).
   **And** duplicate / invalid / reserved slugs are rejected with a clear, field-level message — no server error, no tenant/user orphaned in a usable state.

> Login / logout / session-expiry policy / the single-domain **role guard** are **Story 1.4** — out of scope here. This story establishes identity + provisioning; 1.4 builds the guarded session on top.

## Tasks / Subtasks

> Implement in this order (each task is red-green-refactor: write the failing test first). Tasks 1–4 are backend/data and fully unit/integration-testable offline (PGlite + pure fns); Tasks 5–7 wire the UI + ops.

- [x] **Task 1 — Slug rules as a pure, tested module** (AC: 3)
  - [x] Create `src/lib/slug.ts`: `normalizeSlug(raw)`, `isValidSlugFormat(slug)`, `RESERVED_SLUGS` (Set), `validateSlug(raw): { ok: true; slug } | { ok: false; reason: "format" | "reserved" }`.
  - [x] Format rule: `^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$` (3–63 chars, no leading/trailing hyphen) **and** reject `--` (consecutive hyphens). Lowercase-normalize + trim before validating.
  - [x] Reserved list (case-insensitive) — at minimum: `app, portal, invite, api, auth, www, admin, root, signin, signup, login, logout, register, dashboard, settings, account, billing, support, help, status, docs, blog, mail, email, static, assets, public, _next, cdn, ws, soloist, vercel`.
  - [x] `src/lib/__tests__/slug.test.ts` (37 cases): valid slugs pass; too-short / uppercase / leading- / trailing- / double-hyphen / underscore / space / illegal-char fail; each reserved name reserved; normalization (`"  My-Studio "` → `my-studio`, `ABCdef` → `abcdef`) works. NOTE: uppercase is **normalized away** (friendly slug-picker UX) so it's tested via `isValidSlugFormat`; `validateSlug` format-failures use inputs invalid even after normalize.

- [x] **Task 2 — Better Auth schema (core tables) added to the Drizzle schema, NO RLS** (AC: 1, 2)
  - [x] Create `src/server/db/auth-schema.ts` with the four core Postgres tables: `user`, `session`, `account`, `verification`. Ids are **`text`** (Better-Auth-generated, not uuid). **No `pgPolicy` / RLS** on any of them.
  - [x] Add the Better Auth **additional field** `tenantId text("tenant_id")` (nullable) to `user`.
  - [x] Re-export from `schema.ts` (`export * from "./auth-schema";`) so drizzle-kit + the Drizzle client both register them.
  - [x] **Verified on Neon:** `user/session/account/verification` all `relrowsecurity=false, relforcerowsecurity=false` (no RLS); generated migration has no policy/FORCE on them.

- [x] **Task 3 — Extend `tenants` for ownership + activation; migrate** (AC: 1, 2, 3)
  - [x] `tenants` += `ownerUserId text notNull().unique().references(user.id, cascade)` + `activatedAt timestamptz` (nullable). `slug` unique + RLS policy unchanged.
  - [x] `npm run db:generate` → `drizzle/0003_clumsy_tombstone.sql`: auth tables CREATE **before** the FKs ✅; no RLS on auth tables ✅; tenants ALTER adds both columns + FK + `tenants_owner_user_id_unique` ✅; no policy drift ✅.
  - [x] `npm run db:migrate` applied to Neon. **Verified:** auth tables `rls=false`; `tenants`/`branding` still `rls=true, forced=true`; unique constraints `tenants_slug_unique` + `tenants_owner_user_id_unique` both present; `tenants` empty (0 rows → NOT NULL add safe).

- [x] **Task 4 — `provisionTenant` repository (stays inside the NFR-2 choke point) + activation** (AC: 1, 2, 3)
  - [x] Replace/extend `createTenant` in `src/server/db/repositories/tenants.repository.ts` with `provisionTenant({ ownerUserId, slug, name })`: generate `uuidv7()` for the id, `withTenant({ tenantId: id, userId: ownerUserId, role: "freelancer" }, …)` → `insert(tenants).values({ id, slug, name, ownerUserId }).returning()`, then `update(user).set({ tenantId: id }).where(eq(user.id, ownerUserId))` (user has no RLS — this runs inside the same scoped tx; the user write is unaffected by the Tenant GUC). Returns the tenant row.
  - [x] Map unique-violation (`23505`) by constraint: `tenants_slug_unique` → throw `SlugTakenError`; `tenants_owner_user_id_unique` → throw `AlreadyProvisionedError`. (Inspect `err.constraint` / message; see Dev Notes.) Everything else rethrows.
  - [x] Add `activateTenant(ownerUserId, tenantId)`: `withTenant({ tenantId, userId: ownerUserId, role: "freelancer" }, tx => update(tenants).set({ activatedAt: sql\`now()\` }).where(eq(tenants.id, tenantId)))`. (Scoped by the known `tenantId`, so the `tenant_self` policy permits the UPDATE.)
  - [x] Tests (PGlite, extend `isolation.test.ts` infra — apply the 0003 migration in the harness): seed a `user` row; `provisionTenant` creates the tenant with `owner_user_id` + stamps `user.tenantId`; **duplicate slug → `SlugTakenError`**; **second tenant for same owner → `AlreadyProvisionedError`**; `activateTenant` sets `activated_at`; an **unscoped** read of `tenants` still returns only the active Tenant (RLS unbroken — regression guard for the 1.2 fix).

- [x] **Task 5 — Better Auth instance, route handler, client, email transport** (AC: 1, 2)
  - [x] Create `src/server/auth/index.ts`: `betterAuth({ database: drizzleAdapter(db, { provider: "pg", schema }), emailAndPassword: { enabled: true, requireEmailVerification: true, minPasswordLength: 8 }, emailVerification: { sendOnSignUp: true, autoSignInAfterVerification: true, afterEmailVerification }, user: { additionalFields: { tenantId: { type: "string", required: false, input: false } } }, secret: env.BETTER_AUTH_SECRET, baseURL: env.BETTER_AUTH_URL, trustedOrigins: […], plugins: [nextCookies()] /* nextCookies MUST be last */ })`. `afterEmailVerification(user)` → `if (user.tenantId) await activateTenant(user.id, user.tenantId)`.
  - [x] Create `src/server/auth/email.ts`: `sendVerificationEmail({ user, url })` — if `env.RESEND_API_KEY` is set, send via Resend `from: env.EMAIL_FROM` (default `onboarding@resend.dev`, which sends without domain verification — good enough for dogfood; **Epic 4.3 replaces with a branded template + verified domain**); else `console.info` the URL (dev). Wire this into `emailVerification.sendVerificationEmail`.
  - [x] Create `src/app/api/auth/[...all]/route.ts`: `export const { GET, POST } = toNextJsHandler(auth)` (from `better-auth/next-js`). Runs on the Node runtime (Better Auth requires Node, not Edge).
  - [x] Create `src/server/auth/client.ts`: `createAuthClient({ baseURL: … })` from `better-auth/react` for client components (`signUp`, `useSession`, `signOut`). **No db import here** — safe outside the db layer.
  - [x] Add `src/server/auth/**` to the ESLint `no-restricted-imports` exemption (it legitimately needs the raw adapter + `db`) — see Dev Notes → *ESLint*.

- [x] **Task 6 — Sign-up Server Action + UI** (AC: 1, 2, 3)
  - [x] `signUpFreelancer` Server Action (`src/app/(auth)/signup/actions.ts`): zod-validate `{ name, email, password, slug }`; `validateSlug` first (fast reject: format/reserved); call `auth.api.signUpEmail({ body: { name, email, password } })` → `user`; then `provisionTenant({ ownerUserId: user.id, slug, name })`; on `SlugTakenError`/`AlreadyProvisionedError` → **delete the just-created orphan user** (`auth.api` admin delete or direct `db.delete(user)`) and return a field error (`slug`) — leaves no usable account behind (AC-3). On success, return a "check your email to verify" state (with `requireEmailVerification`, no Cockpit session exists yet).
  - [x] UI at `src/app/(auth)/signup/page.tsx` + a `signup-form` client component: Soloist-branded (route group `(auth)` for pre-auth chrome), fields name/email/password/slug, react-hook-form + `@hookform/resolvers/zod`, `sonner` for toasts. Reuse the design tokens (`bg-background`, `font-display`, `rounded-[var(--radius-md)]`, `--primary`) seen in `src/app/page.tsx` / `globals.css`. Scaffold the shadcn/ui primitives you need (`button`, `input`, `label`, `card`, `form`) into `src/components/ui/` — none exist yet.
  - [x] On the success/"verify" state, show the email-sent confirmation; after verification (`autoSignInAfterVerification`) the user lands signed-in — redirect target `/app` (still an open skeleton until the 1.4 guard).
  - [x] Update `src/app/page.tsx` landing CTA to point at `/signup` (in addition to / instead of the raw `/app` link).

- [~] **Task 7 — Env contract + Vercel ops (FIRST deploy whose UI touches the DB)** (AC: 1, 2) — _code/env/gates done; **prod deploy is a hand-off to CJ** (needs his Vercel secrets + RESEND key + outward go-ahead)._
  - [x] Extend `src/env.ts`: added `BETTER_AUTH_SECRET` (min 32), `BETTER_AUTH_URL` (url), `RESEND_API_KEY` (optional), `EMAIL_FROM` (default `onboarding@resend.dev`). Updated `.env.example` + local `.env.local` (gitignored; dev secret generated, not echoed).
  - [x] Gates all green: `npm run lint`, `npm run typecheck`, `npm test` (56/56), `npm run build` (✓ — `/api/auth/[...all]` mounted, `/signup` renders). Local prod smoke on :3100: `/signup` 200, `GET /api/auth/get-session` → `null` @ 200 (auth + Drizzle adapter live).
  - [x] Build fix: pinned `kysely` to `0.28.17` via `overrides` (better-auth's kysely-adapter imports a constant 0.29.x dropped from its entry; kysely is transitive + unused at runtime) + `serverExternalPackages` for better-auth in `next.config.ts`.
  - [ ] **PENDING CJ — Vercel env (Production + Preview):** `DATABASE_URL` (⚠️ first deployed route importing the DB — unset = 500s the app), `BETTER_AUTH_SECRET` (new prod value), `BETTER_AUTH_URL=https://soloist.cjjutba.com`, `RESEND_API_KEY` (CJ's — required for prod verification email), `EMAIL_FROM`.
  - [ ] **PENDING CJ — Deploy + live smoke:** sign-up → verification email → verified sign-in → `/app` on `soloist.cjjutba.com`.

## Dev Notes

### ⚠️ Load-bearing design decision (confirm with CJ before deep-diving) — Better Auth **core**, not the organization plugin

The epics/architecture say *"Tenant = Better Auth Organization"* (AR-6 names the **organization plugin**). **This story deliberately implements the Tenant as the existing custom `tenants` table extended with `owner_user_id`, using Better Auth's email/password core only — it does NOT install the organization plugin.** Rationale (all three matter):

1. **The org plugin's headline features are unused in Soloist.** The architecture already routes *every* member/invite identity through **app-level** constructs — Clients are `User`s linked to an Engagement via `ClientAccess`, and the Client invite is a **custom Engagement-scoped Invitation** (finer-grained than org membership). None of the 29 v1 stories needs multi-member orgs, teams, or org-level invitations. The plugin would ship machinery (`member`, `invitation` tables, `activeOrganizationId` in session) we never use.
2. **It would force a rewrite of the verified isolation core.** The org plugin's `organization.id` is a Better-Auth-generated **`text`** id. Adopting it for the Tenant means changing `tenants.id` from `uuid` → `text`, which breaks the uuid-based RLS choke point that Story 1.2 built **and empirically verified on Neon** (`nullif(current_setting('app.tenant_id'),'')::uuid`, the `UUID_RE` guard in `scope.ts`). That predicate was the fix for the launch-blocking BYPASSRLS bug — reworking it for zero v1 benefit is unjustified risk.
3. **"Tenant = Organization (owner = Freelancer)" intent is fully preserved.** One isolated workspace per freelancer, freelancer = sole owner — realized by `tenants.owner_user_id` (+ a `UNIQUE` constraint = one Tenant per freelancer) instead of a generic plugin table. Adding the org plugin **later** (if agencies/teams ever land) is a feature-add, not a rewrite.

**This refines AR-6.** It's surfaced to CJ as a decision (recommended default: proceed as written). If CJ wants the literal org plugin, that's a `correct-course` on the architecture + a 1.2 schema migration — flag before starting Task 2.

### Architecture compliance (must follow)

[Source: architecture.md#Authentication & Security]
- Better Auth email/password; **passwords hashed by Better Auth** (scrypt/argon2 default), plaintext never stored (FR-4, NFR-3). ✅ handled by `signUpEmail` (`ctx.context.password.hash`).
- Sessions: httpOnly, secure, SameSite cookies; CSRF on Server Actions (Next origin checks + Better Auth `formCsrfMiddleware`). `nextCookies()` plugin handles `Set-Cookie` in Server Actions — **must be the last plugin**.
- Secrets validated at boot by the Zod `env.ts` — extend it; never read `process.env` directly elsewhere. [Source: src/env.ts]
- Deny-by-default authorization + the **role guard** is **Story 1.4** (path → surface, session → Tenant/Engagement, mismatch → not-found). Not in this story; do not build a host/path guard here.

### Better Auth `^1.6.14` setup (version-checked via context7 @ v1.6.11)

- **Adapter:** `drizzleAdapter(db, { provider: "pg", schema })`. Import from `better-auth/adapters/drizzle` (verify the exact path against the installed version; older docs show `@better-auth/drizzle-adapter`). Reuse the **single** `db` from `src/server/db/index.ts` — do not construct a second Pool.
- **Route handler:** `app/api/auth/[...all]/route.ts` → `export const { GET, POST } = toNextJsHandler(auth)` from `better-auth/next-js`.
- **Server session (1.4 will lean on this):** `await auth.api.getSession({ headers: await headers() })` (`next/headers`). The returned `session.user` includes `tenantId` (our additional field) — the role guard reads Tenant from the session, never the host.
- **Email verification config** (`emailVerification`): `sendVerificationEmail({ user, url, token })`, `sendOnSignUp: true`, `autoSignInAfterVerification: true`, `afterEmailVerification(user, request?)`. With `emailAndPassword.requireEmailVerification: true`, an unverified user gets **no usable session** — that is the real enforcement of AC-2 ("Tenant not active before verification"); `activated_at` is the audit/lifecycle stamp set by `afterEmailVerification`.
- **Reserved word:** Better Auth's default user table is named `user` (a Postgres reserved word). Drizzle always quotes identifiers (`"user"`), so the default is safe; if you hand-write any SQL referencing it, quote it. (Keeping default names avoids adapter-mapping config; acceptable since this story adds no hand-written SQL naming the auth tables.)

### Better Auth data model (Postgres / Drizzle shapes to author in `auth-schema.ts`)

`text` primary keys (Better-Auth-generated), `timestamp` columns, **no RLS**:
- **user**: `id text pk`, `name text notNull`, `email text notNull unique`, `emailVerified boolean default false notNull`, `image text`, `createdAt`/`updatedAt timestamptz notNull`, **+ `tenantId text` (our additional field, nullable)**.
- **session**: `id text pk`, `expiresAt timestamptz notNull`, `token text notNull unique`, `createdAt`/`updatedAt`, `ipAddress text`, `userAgent text`, `userId text notNull → user.id (cascade)`.
- **account**: `id text pk`, `accountId text notNull`, `providerId text notNull`, `userId text notNull → user.id (cascade)`, `password text` (the credential hash lives here), token/expiry columns, `createdAt`/`updatedAt`.
- **verification**: `id text pk`, `identifier text notNull`, `value text notNull`, `expiresAt timestamptz notNull`, `createdAt`/`updatedAt`.

> Generating instead of hand-writing: the Better Auth CLI (`npx @better-auth/cli generate`) can emit this Drizzle schema from your `auth` config. Either approach is fine; if you generate, place output in `auth-schema.ts` and keep the `tenantId` additional field.

### How provisioning + activation stay inside the NFR-2 choke point (critical)

The 1.2 isolation core is **load-bearing — do not regress it.** Tenant lifecycle is the one set of ops that legitimately "creates/touches a Tenant," and they still go **through `withTenant`**, not around it:
- **Provision:** generate the id app-side, scope the tx to the *new* id. The `tenant_self` `WITH CHECK (id = app.tenant_id)` passes because they're equal — exactly the existing `createTenant` pattern. The `update(user).set({ tenantId })` in the same tx writes the (non-RLS) `user` table; the Tenant GUC doesn't affect it. [Source: src/server/db/repositories/tenants.repository.ts]
- **Activate:** the `afterEmailVerification` hook has `user.tenantId` (forward link), so `activateTenant` scopes by that known id and the `tenant_self` `USING/WITH CHECK` permits the self-UPDATE. No privileged/cross-tenant read needed.
- **Why `user.tenantId` (forward link) AND `tenants.owner_user_id` (inverse + UNIQUE):** the forward field lets the **session** (which carries `user`) resolve the Tenant with **zero** privileged cross-tenant DB reads on every guarded request (1.4 hot path) — RLS would otherwise block a `tenants WHERE owner_user_id = ?` reverse lookup. The inverse `UNIQUE(owner_user_id)` enforces "one Tenant per freelancer" + FK integrity at the DB. The small denormalization is the justification. (FK checks bypass RLS by Postgres design, so the `owner_user_id → user.id` FK validates fine despite FORCE RLS on `tenants`.)
- **Auth tables run as the connection role (`neondb_owner`), never `soloist_app`.** They have no RLS, so Better Auth's own queries (sign-up, session) work as owner. Our app code never reads `user`/`session` through `withTenant`/`soloist_app`. `soloist_app` will inherit `GRANT`s on the new tables via 0001's `ALTER DEFAULT PRIVILEGES` — harmless (we never route auth-table reads through it).

### Slug + duplicate handling (AC-3)

- Slug is the **internal** Tenant identifier (reserved for future custom domains — **not** URL-facing in v1; paths are `/app`,`/portal`). Validate to DNS-label rules now so it's domain-ready later. [Source: src/server/db/schema.ts L22]
- **No pre-existence SELECT.** RLS (`tenant_self`) blocks reading another Tenant's row, so you *cannot* check "does this slug exist" with a scoped query — the **DB unique constraint + `23505` catch is the authoritative guard** (as the 1.2 review concluded). Format + reserved checks are pure/in-app (no DB).
- Two unique constraints now exist on `tenants` (`slug`, `owner_user_id`); disambiguate the `23505` via the constraint name to return the right message.
- **Orphan window:** user is created (Better Auth) before the tenant insert; on a rare slug-race `23505`, delete the orphan user so AC-3 holds ("no user left in a usable state"). Accept this small window for v1; a future hardening could pre-reserve the slug.

### ESLint

`src/server/auth/**` needs the raw `db` + `drizzleAdapter` — add it to the existing `files: ["src/server/db/**"]` exemption block in `eslint.config.mjs` (make it `["src/server/db/**", "src/server/auth/**"]`) with a comment that auth is infra that owns the adapter. `src/server/auth/client.ts` does **not** import db and can stay un-exempt, but it's simplest to cover the whole folder. [Source: eslint.config.mjs L38-42]

### Previous-story intelligence (Story 1.2 — read before coding)

[Source: 1-2-tenant-scoped-data-layer-postgres-rls-isolation-core.md]
- **The choke point exists and is verified:** `withTenant` (`SET LOCAL ROLE soloist_app` + `set_config(...,true)`), repository predicate, RLS FORCED on Neon. The `soloist_app` NOBYPASSRLS role (migration 0001) is what makes RLS actually apply — **never** query Tenant tables outside `withTenant`.
- **Driver:** Neon **WebSocket `Pool`** (`drizzle-orm/neon-serverless` + `ws`) — required for the multi-statement transactions `withTenant` uses. Do not switch to the HTTP driver.
- **Tests:** in-process **PGlite** (offline, deterministic). Scoped work runs as a non-superuser role so policies apply. Extend `src/server/db/__tests__/isolation.test.ts`'s harness (apply migrations incl. 0001 + the new 0003) for Task 4. Test framework: **vitest** (`npm test`).
- **uuid v7** app-side via `uuidv7`. Repos use `sql\`now()\`` (not `new Date()`).
- **Deploy note carried forward:** `DATABASE_URL` is **not yet on Vercel** — Task 7 adds it. This is the first story whose deployed route imports the DB.

### Project structure (files)

**New:** `src/lib/slug.ts` · `src/lib/__tests__/slug.test.ts` · `src/server/db/auth-schema.ts` · `src/server/auth/index.ts` · `src/server/auth/client.ts` · `src/server/auth/email.ts` · `src/app/api/auth/[...all]/route.ts` · `src/app/(auth)/signup/page.tsx` · `src/app/(auth)/signup/actions.ts` · sign-up form client component · `src/components/ui/*` (shadcn primitives: button/input/label/card/form) · `drizzle/0003_*.sql` (auth tables + tenants ALTER) · provisioning tests (extend `isolation.test.ts` or a new `provision.test.ts`).

**Modified:** `src/server/db/schema.ts` (+`export * from "./auth-schema"`; `tenants` +`owner_user_id`,+`activated_at`) · `src/server/db/repositories/tenants.repository.ts` (`createTenant`→`provisionTenant` + `activateTenant` + 23505 mapping) · `src/env.ts` (+`BETTER_AUTH_SECRET`,`BETTER_AUTH_URL`,`RESEND_API_KEY`,`EMAIL_FROM`) · `.env.example` · `eslint.config.mjs` (exempt `src/server/auth/**`) · `src/app/page.tsx` (CTA → `/signup`) · `package.json` (deps already present: `better-auth`,`resend`,`react-hook-form`,`@hookform/resolvers`,`zod`,`sonner`; add `@better-auth/cli` devDep only if you generate the schema).

### Project Structure Notes

- Route group `(auth)` holds pre-auth, Soloist-branded screens (`/signup` now; `/login` in 1.4). Keeps sign-up **outside** `/app` so the 1.4 role guard (which will require a session for `/app/*`) doesn't lock out the sign-up flow.
- `src/server/auth/` is a new infra layer peer to `src/server/db/` — both may import `db`; feature code may not.
- Do **not** add RLS to auth tables; do **not** change `tenants.id` to `text`; do **not** install the organization plugin (see the load-bearing decision above).

### Testing requirements

- **Pure unit (vitest):** `slug.ts` — full validation matrix (Task 1).
- **Integration (PGlite, vitest):** provisioning + activation + RLS regression (Task 4) — the **unscoped-read still isolates** assertion is the guard that the 1.2 fix isn't regressed by the new columns/FK.
- **Config assertions:** `requireEmailVerification === true`; `nextCookies` is the last plugin; `afterEmailVerification` calls `activateTenant`. (Unit-test the wiring where practical; full HTTP sign-up E2E is optional for v1 — prefer testing the Server Action's orchestration with a stubbed `auth.api`.)
- Gates before "done": `npm run lint && npm run typecheck && npm test && npm run build` all green; live smoke test of the verification round-trip.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.3 / #Story 1.4 (folds in 1.5)]
- [Source: _bmad-output/planning-artifacts/architecture.md#Authentication & Security]
- [Source: _bmad-output/planning-artifacts/prd.md#FR-1, FR-4 (sign-up, hashed passwords); NFR-2 (isolation), NFR-3 (security)]
- [Source: 1-2-tenant-scoped-data-layer-postgres-rls-isolation-core.md#Dev Agent Record — choke point, soloist_app role, PGlite, DATABASE_URL-on-Vercel]
- [Source: src/server/db/{schema,scope,context,index}.ts; repositories/tenants.repository.ts; src/env.ts; eslint.config.mjs]
- Better Auth `^1.6` (context7 `/better-auth/better-auth/v1.6.11`): Next.js handler (`toNextJsHandler`), `nextCookies()` last, `auth.api.getSession({ headers })`, `emailVerification` type, `drizzleAdapter(provider:"pg")`, `signUpEmail` flow.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (Claude Opus 4.8, 1M context)

### Debug Log References

- **Build blocker — kysely export gap (resolved).** `next build` (Turbopack) failed tracing `@better-auth/kysely-adapter`'s sqlite dialects, which `import { DEFAULT_MIGRATION_TABLE } from "kysely"`. The installed `kysely@0.29.2` entry (`dist/index.js`) does **not** export that constant (it lives un-re-exported in `dist/migration/migrator.js`); the adapter (peer `^0.28.17 || ^0.29.0`) needs it. `serverExternalPackages` alone didn't help (externals-tracing still analyzed the dynamic `await import()` sqlite branches). Fixed by pinning `kysely` → `0.28.17` via `package.json` `overrides` (its ESM entry re-exports the constant via `export *`; CJS `require('kysely').DEFAULT_MIGRATION_TABLE === 'kysely_migration'` confirms). kysely is only a transitive dep of the kysely-adapter, which our pg/Drizzle setup never loads at runtime — zero runtime impact. Kept `serverExternalPackages: ["better-auth", "@better-auth/kysely-adapter"]` as correct server-only handling.
- **Local prod smoke ran on :3100**, not :3000 — port 3000 was held by CJ's separate `cjjutba.com` dev server (left untouched).
- `npm install` reports 6 moderate transitive vulnerabilities (pre-existing / from the kysely pin) — noted, not addressed in this story.

### Completion Notes List

- **Implementation complete; ACs 1–3 satisfied and tested. Prod deploy (Task 7 tail) is a hand-off to CJ** (needs his Vercel access + a real `RESEND_API_KEY` so verification emails actually send + an outward go-ahead).
- **Auth model = Better Auth CORE + custom `tenants`** (no org plugin) — CJ-approved refinement of AR-6; architecture.md amended. `tenants` += `owner_user_id` (text FK→`user.id`, UNIQUE = one Tenant/freelancer) + `activated_at`. Auth tables (`user/session/account/verification`) carry **NO RLS** — verified on Neon (`rls=false`); `tenants`/`branding` still `forced=true`.
- **NFR-2 choke point respected.** `provisionTenant` scopes the tx to the new uuid (WITH CHECK passes) + stamps `user.tenantId` in-tx; `activateTenant` (called from `afterEmailVerification`) scopes by the known id. No privileged cross-tenant reads. The forward link `user.tenantId` lets the 1.4 role guard resolve the Tenant from the session with zero extra DB reads.
- **Email-verification gate** = Better Auth `requireEmailVerification: true` (unverified ⇒ no usable session). `activated_at` is the lifecycle stamp. Verification email via Resend (`onboarding@resend.dev` default — no domain setup needed; Epic 4.3 brands it); dev logs the link when `RESEND_API_KEY` is unset.
- **Slug:** pure `validateSlug` (format + reserved, normalize lowercase). Uniqueness via the DB unique index + `23505`→typed-error mapping (RLS forbids a pre-check) — both `tenants_slug_unique`→`SlugTakenError` and `tenants_owner_user_id_unique`→`AlreadyProvisionedError` proven on real PG (PGlite). Orphan user is deleted on a post-signup slug collision (AC-3).
- **Tests: 56/56** across 4 files — `slug` (37), `provision` (5, real repo vs PGlite via a hoisted live-getter mock of the Neon db), `sign-up` orchestration (7, stubbed `auth.api`), `isolation` (7, regression — seeds updated for the new owner FK). Gates: lint + typecheck clean; `next build` clean; local prod smoke (`/signup` 200, `GET /api/auth/get-session`→`null` @200).
- **ESLint:** `src/server/auth/**` added to the db-layer exemption (auth owns the adapter + raw db). Server Action is a thin wrapper over `src/server/auth/sign-up.ts` so `src/app` never touches the raw db.
- **Scope deferred:** login/logout/session-policy + the single-domain role guard = Story 1.4 (`/app` is still an open skeleton until then).

### File List

**New:** `src/lib/slug.ts` · `src/lib/__tests__/slug.test.ts` · `src/server/db/auth-schema.ts` · `src/server/db/__tests__/provision.test.ts` · `src/server/auth/index.ts` · `src/server/auth/client.ts` · `src/server/auth/email.ts` · `src/server/auth/users.ts` · `src/server/auth/sign-up.ts` · `src/server/auth/__tests__/sign-up.test.ts` · `src/app/api/auth/[...all]/route.ts` · `src/app/(auth)/layout.tsx` · `src/app/(auth)/signup/page.tsx` · `src/app/(auth)/signup/signup-form.tsx` · `src/app/(auth)/signup/actions.ts` · `src/components/ui/{button,input,label,card}.tsx` · `drizzle/0003_clumsy_tombstone.sql` · `drizzle/meta/0003_snapshot.json`

**Modified:** `src/server/db/schema.ts` (+`export * from ./auth-schema`; `tenants` +`owner_user_id`,+`activated_at`) · `src/server/db/repositories/tenants.repository.ts` (`createTenant`→`provisionTenant` + `activateTenant` + 23505 mapping) · `src/server/db/__tests__/isolation.test.ts` (seed owners for the new FK) · `src/env.ts` (+auth/email vars) · `.env.example` · `.env.local` (gitignored) · `eslint.config.mjs` (exempt `src/server/auth/**`) · `next.config.ts` (`serverExternalPackages`) · `package.json` + `package-lock.json` (`overrides.kysely=0.28.17`) · `src/app/page.tsx` (CTA → `/signup`) · `drizzle/meta/_journal.json` · `_bmad-output/planning-artifacts/architecture.md` (AR-6 refinement)

## Senior Developer Review (AI)

**Reviewed:** 2026-06-06 · **Effort:** extra-high (9 finder angles × ≤8 + verify + sweep) · **Outcome:** Changes Requested → **all required fixes applied + re-verified (59/59 tests, build clean)**.

**CRITICAL — fixed:**
- [x] **Duplicate-email broke sign-up + defeated enumeration protection.** With `requireEmailVerification:true`, Better Auth's `signUpEmail` returns a GENERIC success with a **synthetic, non-persisted** user (sign-up.mjs:161–207) — it does NOT throw. The old code assumed a throw → fed the synthetic id to `provisionTenant` → **FK violation 23503** (not 23505) → raw rethrow → Server Action crash + email enumeration leak. **Fix:** detect the synthetic user via `userExists(userId)` and return the SAME generic "check your email" success without provisioning (`sign-up.ts`). Verified against the better-auth source + a new unit test.

**HIGH — fixed:**
- [x] `signUpEmail` catch swallowed ALL errors as "email in use" → now logs + returns a neutral form error (a throw is no longer the duplicate path).
- [x] Unknown `provisionTenant` error was `throw err` → crashed the Server Action / client → now logs + returns a neutral form error (action always returns a `SignUpResult`). Client `onSubmit` also wrapped in try/catch (toast fallback).
- [x] `signUpEmail` now receives `headers: await headers()` (origin checks / rate-limit / cookie handling).

**MEDIUM — fixed:**
- [x] `activateTenant` now binds `owner_user_id = ownerUserId` in the predicate (RLS `tenant_self` only binds `id`) — a caller can never activate a Tenant it doesn't own (0 rows). New negative test.
- [x] `email.ts`: verification-token URL is logged only in dev; **prod throws** if `RESEND_API_KEY` is unset (no silent token leak to prod logs). Resend client hoisted to module scope.
- [x] Client slug validation now reuses `validateSlug` from `@/lib/slug` (single source of truth; client no longer accepts slugs the server rejects).
- [x] `EMAIL_FROM=""` (copied template) coerced to the default via `z.preprocess` (`.default()` only fires when absent); `.env.example` comments it out.
- [x] `route.ts` declares `export const runtime = "nodejs"`; `deleteUserById` documents the cascade hazard / caller contract; `zod` `path[0]` guarded to a string.
- [x] Test order-dependence removed — `provision.test.ts` tests are now self-contained (distinct owner/slug each).

**NOTED (accepted for v1 / future hardening, not blocking):**
- Orphan-window + "verification email sent before provisioning": user is created before the tenant; on a rare slug-race the orphan user is deleted but a verify email may already be sent (link 404s). Deeper fix = provision inside `afterEmailVerification` or reserve slug first — deferred (collisions are rare; pre-validated).
- `tenants.owner_user_id` migration adds NOT NULL without default → not replayable on a non-empty `tenants` (greenfield-safe today).
- `user.tenantId` (forward) vs `tenants.owner_user_id` (inverse) denormalization has no enforced invariant — fine while set atomically in `provisionTenant`; revisit if an owner-transfer feature lands.
- `kysely` override is upgrade-fragility (a future better-auth needing kysely 0.29 would conflict) — documented in `package.json`/`next.config.ts`.

**REFUTED:**
- "kysely override is inert (not in lockfile)" — npm 11 applies the package.json override during resolution (`npm ls` shows `kysely@0.28.17 overridden`; every kysely in the tree is 0.28.17; `npm ci` reproduces it).

## Change Log

| Date       | Version | Description                                                                 | Author |
| ---------- | ------- | --------------------------------------------------------------------------- | ------ |
| 2026-06-06 | 0.1     | Story drafted (ultimate context engine).                                    | Scrum  |
| 2026-06-06 | 1.0     | Implemented Tasks 1–6 + Task 7 code/env/gates: Better Auth core, tenant provisioning + slug, sign-up UI. 56/56 tests, build clean. Prod deploy pending CJ. | Dev (Opus 4.8) |
| 2026-06-06 | 1.1     | Code review (xhigh): fixed launch-blocking duplicate-email synthetic-user bug + error-handling/anti-enumeration, activateTenant owner-binding, prod token-log guard, client slug reuse, EMAIL_FROM coercion, route runtime, self-contained tests. 59/59 tests, build clean. | Review (Opus 4.8) |
