---
baseline_commit: 55b44ccff93d9f4075f7c9af1fccd9ab621cc652
---

# Story 2.1: Create & Manage Engagement

Status: done

<!-- Note: Validation is optional. Run validate-create-story for a quality check before dev-story. -->

## Story

As a Freelancer,
I want to create and manage Engagements in my Tenant,
so that each client project has its own container for progress and documents.

## Acceptance Criteria

1. **Create an Engagement, scoped to my Tenant (FR-6).**
   **Given** the Cockpit
   **When** I create an Engagement (name, client basics, scope)
   **Then** the `engagements` table is created/used, the Engagement belongs to my Tenant, and exactly one Ship Feed is associated on creation (the feed *is* the Engagement's `ShipUpdate`s — 1:1 by construction; no separate row).

2. **Engagement-scoped RLS + isolation test fixture (pre-mortem guardrail #5).**
   **Given** Engagements now exist
   **Then** the `engagements` table has RLS that scopes to `app.tenant_id` **and**, when a Client session sets `app.engagement_id`, additionally restricts to that one Engagement — and an **isolation test proves a Client scoped to Engagement E1 (within Tenant A) cannot see Engagement E2 of the same Tenant**, before any Client UI exists.

3. **Edit + archive.**
   **Given** an existing Engagement
   **When** I edit or archive it
   **Then** edits persist, and archiving hides it from the active list **without deleting** its history (status → `archived`).

> **Scope:** this story is the Engagement **CRUD + the isolation core for the engagement-scoped case**, plus a functional Cockpit list. The richer **dashboard** (sort by last-activity, candidate-count badge, navigate to a tabbed detail shell) is **Story 2.2**; the tabbed Engagement-detail surface (curation queue · repos · client · documents) is 2.2+/Epic 3. Keep the list here simple (name · client · status · edit · archive).

## Tasks / Subtasks

- [x] **Task 1 — `engagements` table + tenant-AND-engagement RLS + migration** (AC: 1, 2)
  - [x] In `src/server/db/schema.ts`, add `engagements` (uuid v7 id app-side; `tenantId uuid NOT NULL → tenants.id cascade`; `clientDisplayName text NOT NULL`; `name text NOT NULL`; `scope text` (nullable); `status text NOT NULL default 'active'`; `lastActivityAt timestamptz NOT NULL defaultNow()`; `createdAt timestamptz NOT NULL defaultNow()`).
  - [x] RLS policy `engagement_scope` (mirror the `branding`/`tenants` predicate style, with the engagement clause):
    - `using` / `withCheck`: ``sql`tenant_id = ${currentTenant} AND (${currentEngagement} IS NULL OR id = ${currentEngagement})` `` where `currentTenant = nullif(current_setting('app.tenant_id', true), '')::uuid` and `currentEngagement = nullif(current_setting('app.engagement_id', true), '')::uuid`. **Effect:** a Freelancer (no `app.engagement_id`) sees ALL their Tenant's Engagements; a Client (with `app.engagement_id` set) sees ONLY that one Engagement.
  - [x] `npm run db:generate` → review `drizzle/0004_*.sql`: `engagements` CREATE + the FK to `tenants` + `ENABLE ROW LEVEL SECURITY` + the policy. **Manually append `ALTER TABLE "engagements" FORCE ROW LEVEL SECURITY;`** (drizzle doesn't emit FORCE — see the 1.2 migrations). `soloist_app` auto-grants via 0001's `ALTER DEFAULT PRIVILEGES`.
  - [x] `npm run db:migrate` on Neon. Verify: `engagements` `relrowsecurity=true, relforcerowsecurity=true`.

- [x] **Task 2 — Engagement-scoped isolation test (the guardrail)** (AC: 2)
  - [x] Extend `src/server/db/__tests__/isolation.test.ts` (or a new `engagement-isolation.test.ts` using the same PGlite + migrations harness): seed Tenant A with Engagements **E1, E2** and Tenant B with **E3** (each via `asTenant(tenantId, …)` so the WITH CHECK passes; insert owners + a tenant row as the FK targets — reuse the existing seed pattern).
  - [x] Prove:
    - **(freelancer)** scoped to Tenant A with NO engagement → an unscoped `select * from engagements` returns **E1 + E2** only (not E3).
    - **(client)** scoped to Tenant A **with `app.engagement_id = E1`** → returns **only E1** (NOT E2 — the cross-engagement-within-same-tenant case). Add an `asClient(tenantId, engagementId, fn)` helper that calls `applyTenantScope(tx, { tenantId, engagementId })`.
    - **(cross-tenant)** Tenant B scoped → sees only E3.
    - **(fail-closed)** role `soloist_app` with NO GUCs → 0 rows.
  - [x] This satisfies pre-mortem guardrail #5 (isolation covers the Client case before the Client UI exists).

- [x] **Task 3 — `engagements.repository.ts` (through the choke point)** (AC: 1, 3)
  - [x] `src/server/db/repositories/engagements.repository.ts` — all via `withTenant(ctx, …)`:
    - `createEngagement(ctx, { name, clientDisplayName, scope })` → `uuidv7()` id, insert `{ id, tenantId: ctx.tenantId, name, clientDisplayName, scope }`, return the row.
    - `listEngagements(ctx, { includeArchived = false })` → select for the tenant (RLS scopes; the predicate is the primary guard), filter `status != 'archived'` unless `includeArchived`, order by `lastActivityAt desc`.
    - `getEngagement(ctx, id)` → select where `id` (RLS + predicate), null if absent.
    - `updateEngagement(ctx, id, data)` → update name/clientDisplayName/scope/status + `lastActivityAt = now()` where `id`; return the row (null if not found / not owned).
    - `archiveEngagement(ctx, id)` → update `status = 'archived'` where `id`.
  - [x] Unit-test (PGlite, mock `../index` like `provision.test.ts`): create → list (excludes archived) → get → update persists → archive hides from the default list but the row + history remain.

- [x] **Task 4 — Engagement feature module: schema + Server Actions** (AC: 1, 3)
  - [x] `src/server/engagements/engagements.schema.ts`: Zod — `name` (1–120), `clientDisplayName` (1–120), `scope` (optional, ≤2000), `status` enum `["active","paused","completed","archived"]`.
  - [x] `src/server/engagements/engagements.actions.ts` (`"use server"`): `createEngagementAction(input)` (`requireFreelancer` → zod → `createEngagement` → `revalidatePath("/app")` → return `{ ok, id }` / field errors), `updateEngagementAction(id, input)`, `archiveEngagementAction(id)`. Typed results, never throw to the client (the established 1.3 pattern). Feature module imports the sanctioned repo + `requireFreelancer` — no raw db, no ESLint exemption needed.
  - [x] Test the create-action orchestration with a stubbed repo (hoisted-mock pattern): valid → repo called + `{ ok, id }`; invalid (empty name) → field error, no repo call.

- [x] **Task 5 — Cockpit UI: Engagements list + create + edit/archive** (AC: 1, 3)
  - [x] **`src/app/app/page.tsx`** becomes the **Engagements list** (replaces the "Welcome" skeleton): `requireFreelancer()` → `listEngagements(ctx)` → render each row (name · `clientDisplayName` · a **status badge**) with **Edit** + **Archive** actions, a **"New engagement"** button → `/app/engagements/new`, and a calm **empty state** ("No engagements yet — create your first.") when the list is empty. (Keep the existing header/logout from `app/layout.tsx`.)
  - [x] `src/app/app/engagements/new/page.tsx` + a client form (react-hook-form + the shared `Field`/`Card`/`Input`/`Button` + `sonner`): name / client display name / scope → `createEngagementAction` → on ok `router.push("/app")`; on field error show inline.
  - [x] `src/app/app/engagements/[id]/edit/page.tsx` (server: `requireFreelancer` → `getEngagement(ctx, id)`; `notFound()` if null) + a client form pre-filled → `updateEngagementAction` (name/client/scope/**status** select) + an **Archive** button (`archiveEngagementAction` → `/app`). A 404 for an engagement that isn't the caller's (RLS returns null → `notFound()`).
  - [x] A minimal **status badge** component (`src/components/ui/badge.tsx`, shadcn-style, no new dep) with neutral variants — Active/Paused/Completed/Archived. (Don't reach for the per-Tenant accent — the Cockpit is Soloist-branded.)

- [x] **Task 6 — Gates + deploy** (AC: 1, 2, 3)
  - [x] `npm run lint && npm run typecheck && npm test && npm run build` clean; the migration-drift CI step stays green (commit `drizzle/0004_*`).
  - [x] Deploy to Vercel production (migration already applied to Neon). Live smoke (signed-in freelancer): `/app` shows the list/empty state; create an Engagement → appears; edit → persists; archive → drops off the active list.

## Dev Notes

### Architecture compliance (the isolation spine — non-negotiable)

[Source: architecture.md L156–L160, L171–L173, L208]
- **Shared DB / shared schema / discriminator.** Every tenant-owned row carries `tenant_id` (and `engagement_id` where applicable). `engagements` is tenant-owned → `tenant_id`. [L156]
- **Two-layer isolation (NFR-2 launch blocker):** the `withTenant` choke point (app-layer predicate) **and** Postgres RLS (FORCED). Every read/write goes through `withTenant(ctx, …)` → `applyTenantScope` sets `app.tenant_id` (+ `app.engagement_id` when `ctx.engagementId` is set) → the scoped query runs as `soloist_app` (NOBYPASSRLS). [L158–L159]
- **Engagement-level scoping for Clients (the subtle case this story bakes in):** a Client is bound to exactly one Engagement; Client requests are scoped to that `engagement_id`, never the whole Tenant — so within CJ's Tenant, Client A can never see Client B's Engagement. The data layer takes `engagementId` from the resolved `ClientAccess` row (Epic 2.3/2.4); here we **build + test the RLS that enforces it**. [L160, pre-mortem #5]
- **Server Actions** for the mutations: `requireFreelancer` → Zod-parse → repository → `revalidatePath`. Typed `{ ok }` result; never throw to the client. [L208]
- **Data model (exact fields):** `Engagement — id, tenant_id, client_display_name, name, scope, status(active|paused|completed|archived), last_activity_at, created_at`. [L171]

### The RLS predicate (get this exactly right)

`engagements` policy (mirrors `branding`'s NULLIF-fail-closed style + the engagement clause):
```
using/withCheck:
  tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
  AND ( nullif(current_setting('app.engagement_id', true), '') IS NULL
        OR id = nullif(current_setting('app.engagement_id', true), '')::uuid )
```
- Freelancer request (`withTenant` sets only `app.tenant_id`): the engagement clause is `(NULL IS NULL OR …)` → true → sees all their Tenant's Engagements.
- Client request (`withTenant` sets `app.tenant_id` + `app.engagement_id`): restricted to `id = app.engagement_id` → exactly one Engagement.
- Unset/empty GUC → `nullif → NULL` → fails closed (the 1.2 pattern). `::uuid` only applied after NULLIF so a reused pooled connection's `''` can't error.
- **`scope.ts` already sets `app.engagement_id`** from `ctx.engagementId` (Story 1.2) — no change needed there. The `TenantContext` already carries `engagementId?`.

### Previous-story intelligence (Stories 1.2–1.7 — read first)

- **The RLS + migration pattern is established** (Story 1.2): `pgPolicy` in `schema.ts` emits ENABLE + CREATE POLICY via drizzle-kit, but **NOT** `FORCE` — append `ALTER TABLE … FORCE ROW LEVEL SECURITY;` to the generated SQL manually (see `drizzle/0000`/`0003`). `soloist_app` auto-grants on new tables via `0001`'s `ALTER DEFAULT PRIVILEGES`. Verify `relforcerowsecurity=true` on Neon after migrate.
- **`isolation.test.ts`** is the harness to extend: PGlite + apply all `drizzle/*.sql`, `asTenant(tenantId, fn)` runs the REAL `applyTenantScope`. Seeds need `user` rows (FK owners) + `tenants` rows before engagements. Add an `asClient(tenantId, engagementId, fn)` that passes `engagementId` to `applyTenantScope`.
- **Repository + Server Action patterns:** repos live in `src/server/db/repositories/*.repository.ts` (ESLint-exempt, all `withTenant`); feature logic/actions live in `src/server/<feature>/` (Story 1.6 = branding). Actions return `{ ok: true, … } | { ok: false, … }` and never throw (Story 1.3). The hoisted-`vi.mock` test pattern (`provision.test.ts`, `sign-up.test.ts`, `branding.actions.test.ts`) mocks `../index`/the repo to run the real code offline.
- **`requireFreelancer()`** (Story 1.4, `@/server/auth/session`) returns the freelancer principal which **is** a `TenantContext` — pass it straight to the repo. The `/app` layout guards the subtree; pages still self-guard.
- **UI kit:** `src/components/ui/{button,input,label,card,field}.tsx`, `sonner` (global toaster), react-hook-form + `@hookform/resolvers/zod`. Tokens in `globals.css` (use them, never hardcode hex). The Cockpit is **Soloist-branded — never the Tenant accent.**
- Gates: vitest, `npm run typecheck`/`lint`/`build` (Turbopack). The CI **migration-drift** step (`db:generate` + `git diff drizzle`) means you MUST commit the generated `0004` migration.

### Project Structure Notes

- New: `src/server/db/repositories/engagements.repository.ts`, `src/server/engagements/{engagements.schema,engagements.actions}.ts`, `src/app/app/engagements/new/page.tsx` (+form), `src/app/app/engagements/[id]/edit/page.tsx` (+form), `src/components/ui/badge.tsx`, `drizzle/0004_*`, tests.
- Modified: `src/server/db/schema.ts` (+`engagements` + `Engagement` type), `src/app/app/page.tsx` (Cockpit home → Engagements list), `src/server/db/__tests__/isolation.test.ts` (engagement fixtures).
- Do NOT delete archived engagements (soft-archive via `status`). Do NOT build the tabbed Engagement-detail shell here (Story 2.2). Do NOT apply the Tenant accent to the Cockpit.

### Testing requirements

- **Engagement-scoped isolation (the headline)** — the freelancer-sees-all / client-sees-one / cross-tenant / fail-closed matrix on real Postgres (PGlite). This is the pre-mortem guardrail; it must be airtight.
- **Repository** — create/list(excludes archived)/get/update/archive against PGlite.
- **Create action** — orchestration with a stubbed repo (valid → created; invalid → field error, no write).
- **Live smoke** — create/edit/archive round-trip in the deployed Cockpit.
- Don't regress the 92 prior tests.

### References

- [Source: epics.md#Story 2.1 / #Story 2.2 / Epic 2 intro / Pre-mortem guardrail #5]
- [Source: architecture.md L156–L160 (isolation), L171–L173 (Engagement/ClientAccess/Invitation model), L208 (Server Actions)]
- [Source: EXPERIENCE.md — Cockpit IA (Engagements home, Engagement row, status enum Active/Paused/Completed/Archived, last-activity)]
- [Source: src/server/db/{schema,scope,context}.ts; repositories/{tenants,branding}.repository.ts; __tests__/isolation.test.ts; src/server/auth/session.ts; src/app/app/* ]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (1M context)

### Debug Log References

- Engagement isolation test was fragile on ordering: PGlite's `now()` resolution
  collapses sub-millisecond transactions to one timestamp, so a "touch then sort"
  assertion was nondeterministic. Fixed by stamping explicit, distinct `last_activity_at`
  values directly, so the test exercises the `ORDER BY` clause rather than clock
  resolution.
- Update-scope schema bug caught in review of own code: the create-scope transform
  (`undefined → null`) would have wiped an existing scope on every partial edit. Split into
  `createScope` (undefined→null) and `updateScope` (undefined preserved → Drizzle skips the
  key; explicit empty string → null).

### Completion Notes List

- **Task 1** — `engagements` table + dual-scope `engagement_scope` RLS policy added to
  `schema.ts`; migration `0004_youthful_ben_urich.sql` generated, `FORCE ROW LEVEL SECURITY`
  manually appended, applied to Neon (`relrowsecurity=true, relforcerowsecurity=true`
  verified). A Freelancer (no `app.engagement_id`) sees all their Tenant's Engagements; a
  Client (with it set) is restricted to one.
- **Task 2** — extended `isolation.test.ts` with the engagement-scoped fixture (E1/E2 in
  Tenant A, E3 in Tenant B) + an `asClient(tenantId, engagementId, …)` helper. Proves
  freelancer-sees-all, **client-scoped-to-E1-sees-only-E1 (not E2 of the same Tenant)**,
  cross-tenant, and fail-closed. Pre-mortem guardrail #5 satisfied **before** any Client UI.
- **Task 3** — `engagements.repository.ts` (create/list/get/update/archive), all via
  `withTenant`. PGlite repo test (6) proves create → list (hides archived, newest-first) →
  get → update persists → soft-archive hides but keeps history, plus cross-tenant RLS denial.
- **Task 4** — `src/server/engagements/` feature module: Zod `engagements.schema.ts` +
  `"use server"` actions (typed results, never throw to client). Action test (9) covers
  validation, trim/empty-scope mapping, not-found, and repo-failure → neutral error.
- **Task 5** — Cockpit UI: `/app` is now the Engagements list (status badge + Edit/Archive
  + empty state), `/app/engagements/new` (create form), `/app/engagements/[id]/edit` (edit +
  status select + Archive). New primitives: `ui/badge.tsx` (StatusBadge), `ui/textarea.tsx`.
  An engagement that isn't the caller's → `getEngagement` returns null → `notFound()`.
- **Task 6** — gates clean: `typecheck` ✓, `lint` ✓, `vitest` 114/114 ✓, `build` ✓ (3 new
  routes emitted), no Drizzle schema drift.

### File List

**New:**
- `drizzle/0004_youthful_ben_urich.sql`
- `src/server/db/repositories/engagements.repository.ts`
- `src/server/db/__tests__/engagements.repository.test.ts`
- `src/server/engagements/engagements.schema.ts`
- `src/server/engagements/engagements.actions.ts`
- `src/server/engagements/__tests__/engagements.actions.test.ts`
- `src/components/ui/badge.tsx`
- `src/components/ui/textarea.tsx`
- `src/app/app/engagements/engagement-form.tsx`
- `src/app/app/engagements/archive-button.tsx`
- `src/app/app/engagements/new/page.tsx`
- `src/app/app/engagements/[id]/edit/page.tsx`

**Modified:**
- `src/server/db/schema.ts` (engagements table + `currentEngagement` GUC + dual-scope policy)
- `src/server/db/__tests__/isolation.test.ts` (engagement-scoped fixture + `asClient`)
- `src/app/app/page.tsx` (welcome skeleton → Engagements list)

## Senior Developer Review (AI)

**Outcome:** Approved (changes applied). xhigh review, 9 finder angles. The core
tenant/engagement isolation was walked per-principal and found sound: the `engagement_scope`
policy fails closed (no-GUC → `currentTenant` NULL → 0 rows; verified by test `(l)`), the
WITH CHECK mirrors USING, `createEngagement` always stamps `ctx.tenantId`, migration 0004 ↔
schema.ts ↔ snapshot match byte-for-byte, `FORCE RLS` present, and a foreign-tenant `id`
yields a uniform 404 (no existence oracle). The empty-string-`engagementId` "fail-open"
candidate was **refuted** — `scope.ts:36-38` throws on a non-UUID before the truthy guard.

**Action items resolved:**

1. **[Med] `badge.tsx` — `status in LABELS` matched prototype keys.** `status` is free-text
   from the DB; `"toString"`/`"constructor"` slipped past the fallback → invalid variant.
   Fixed with `Object.hasOwn`.
2. **[Med] `engagement-form.tsx` — server errors pinned to the `name` field** (with focus
   steal). Switched to a toast (the `branding-form` convention); removed the unused `setError`.
3. **[Med] `engagements.repository.ts` — `.set({ ...data })` trusted arbitrary keys.**
   Allow-listed the four mutable columns explicitly so `tenant_id`/`id`/`created_at` can't be
   moved through the only mutation path.
4. **[Low] `getEngagementForEdit` dead code** — deleted (the edit page reads the repo
   directly, matching the codebase's page→repo convention).
5. **[Low] Edit page 500 on a malformed `id`** — added a UUID guard → `notFound()` instead of
   a uuid-cast 500.
6. **[Test gap] No real negative WITH CHECK test for engagements** — the "cannot forge" repo
   test only proved the repo stamps `tenantId`. Added isolation test `(k2)`: a Tenant-A-scoped
   forged INSERT into Tenant B `.rejects.toThrow()` (mirrors branding's `(e)`).
7. **[Cleanup] `STATUS_LABELS` duplicated** in badge + form — exported one source from
   `badge.tsx`.

**Noted, not changed (by-design / pre-existing):** the edit `<select>` includes "archived"
(it's the un-archive path); `window.confirm` for archive is acceptable for v1 (no dialog
primitive exists yet — a future AlertDialog primitive can replace it); `TO public` policy +
hand-appended `FORCE` is the established cross-table pattern (drizzle-kit can't emit FORCE).

## Change Log

| Date       | Version | Description                                          | Author |
| ---------- | ------- | ---------------------------------------------------- | ------ |
| 2026-06-06 | 0.1     | Story drafted (ultimate context engine).             | Scrum  |
| 2026-06-06 | 1.0     | Implemented Tasks 1–6; all gates green.              | Dev    |
| 2026-06-06 | 1.1     | xhigh code-review: 7 items resolved; 115 tests green.| Dev    |
