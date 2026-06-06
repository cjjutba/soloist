---
baseline_commit: c5578ca224bfea368030dc805c7e5d6f0ba96594
---

# Story 1.4: Authentication, Sessions & Single-Domain Role Guard

Status: done

<!-- Note: Validation is optional. Run validate-create-story for a quality check before dev-story. -->

## Story

As a Freelancer,
I want to log in and out securely with a single-domain session protected by a role guard,
so that my workspace is protected and a Client's portal session can never act on the Cockpit.

## Acceptance Criteria

1. **Login + logout + session expiry (FR-4).**
   **Given** a registered, verified Freelancer
   **When** I log in with email + password and later log out
   **Then** a session is established (httpOnly/secure/SameSite cookie) and can be ended, and sessions expire per an explicit policy.

2. **Server-side role + Tenant re-check on every request; client→Cockpit = not-found.**
   **Given** the single-domain session + role guard
   **When** any guarded request is served
   **Then** role + Tenant are resolved **server-side** from the session (DB-validated, never trusted from a client-readable cookie), so a `client`-role session presented to the Cockpit is rejected → neutral **not-found**
   **And** Cockpit routes are inaccessible without a `freelancer` session (unauthenticated → redirected to `/login`).

3. **Path → surface authorization (folds in former Story 1.5).**
   **Given** the role guard
   **When** a request hits a guarded surface
   **Then** `/app` requires a `freelancer` session (Tenant = the session's own Tenant — single domain carries no Tenant in the path), `/portal` requires a `client` session for the Engagement; **mismatch/unauthorized → not-found** (no existence disclosure).

> **Scope boundary — `/portal` is SCAFFOLDED here, not finished.** Clients, Engagements, and `ClientAccess` are **Epic 2**. In 1.4 there are no client users yet, so the `/portal` guard enforces the *role* check (non-client → not-found) but **cannot resolve a real Engagement** — that lands in Story 2.6 (Client Portal Shell). The fully-testable behavior now is the Cockpit (`/app`) guard + the cross-surface rejection (a `freelancer` session on `/portal` → not-found).

## Tasks / Subtasks

- [x] **Task 1 — Session policy + the reusable server-side guard module** (AC: 1, 2, 3)
  - [x] Add an explicit session policy to `src/server/auth/index.ts`: `session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 }` (7-day expiry, 1-day sliding refresh). **Do NOT enable `session.cookieCache`** — leaving it off means `getSession` re-validates against the `session` table on every request (AC-2: "never trusted from the cookie"). Add a comment saying so.
  - [x] Create `src/server/auth/session.ts`:
    - `getAppSession()` wrapped in React `cache()` (per-request dedup): `auth.api.getSession({ headers: await headers() })` → maps to `{ userId, email, emailVerified, tenantId, role }`. **Role is derived:** `tenantId` present ⇒ `"freelancer"`; else `null` (client = a `ClientAccess` row, Epic 2 — none yet). Returns `null` when there's no session.
    - `requireFreelancer(): Promise<TenantContext>` — `getAppSession()`; **no session → `redirect("/login")`**; `role !== "freelancer" || !tenantId → notFound()`; else return `{ tenantId, userId, role: "freelancer" }` (the `TenantContext` the data layer consumes).
    - `requireClient()` — `getAppSession()`; no session → `redirect("/login")`; `role !== "client" → notFound()`; return the client identity. **Leave an explicit `// Epic 2 (2.6): resolve Engagement + ClientAccess → TenantContext{ role:"client", engagementId }` seam.** (Today this always `notFound()`s a freelancer — that IS the cross-surface guard.)
  - [x] `src/server/auth/__tests__/session.test.ts` (mock `../index` `auth.api.getSession`, `next/headers`, `next/navigation`): `getAppSession` derives `freelancer` from `tenantId` and `null` otherwise; `requireFreelancer` returns the `TenantContext` for a freelancer, calls `redirect("/login")` with no session, calls `notFound()` for a client/no-tenant session; `requireClient` `notFound()`s a freelancer and `redirect`s with no session.

- [x] **Task 2 — Wire the guards into the guarded surfaces** (AC: 2, 3)
  - [x] `src/app/app/layout.tsx` → async server component: `await requireFreelancer()` before rendering `children` (redirect/not-found happen here). Keep the `data-surface="cockpit"` wrapper.
  - [x] `src/app/portal/layout.tsx` → async: `await requireClient()` (scaffold — a freelancer or anon is rejected; clients arrive Epic 2). Keep `data-surface="portal"`.
  - [x] Confirm `notFound()` renders the existing neutral `src/app/not-found.tsx` (no tenant/role disclosure).

- [x] **Task 3 — Login page + form; cross-link with sign-up** (AC: 1)
  - [x] `src/app/(auth)/login/page.tsx` + `login-form.tsx` (client) using the **client** `authClient.signIn.email({ email, password })` from `@/server/auth/client`. On success → `router.push("/app")` + `router.refresh()`. Map errors: unverified email (`EMAIL_NOT_VERIFIED`) → "Verify your email — we've sent a new link." (Better Auth blocks unverified sign-in under `requireEmailVerification`); bad credentials → generic "Invalid email or password." (no enumeration). Reuse the `(auth)` shell + shadcn primitives + `sonner`.
  - [x] Cross-links: login form → "Need an account? Create one" (`/signup`); update `signup-form.tsx`'s footer "Back home" to also offer "Already have a workspace? **Log in**" (`/login`).
  - [x] `metadata.title = "Log in · Soloist"`.

- [x] **Task 4 — Logout + a signed-in Cockpit** (AC: 1, 2)
  - [x] `src/app/app/page.tsx` → async server component: `const ctx = await requireFreelancer()`; fetch the Tenant via the **repository** (`getTenant(ctx)`) and greet by `tenant.name` + show the freelancer's email (`getAppSession()` — deduped via `cache()`). This proves guard → data-layer → RLS end-to-end.
  - [x] A `logout-button.tsx` (client) calling `authClient.signOut({ fetchOptions: { onSuccess: () => { router.push("/"); router.refresh(); } } })`. Place it in the Cockpit (small header in `app/layout.tsx` or on the page).
  - [x] Do NOT fetch the DB in `app/layout.tsx` beyond the guard — keep the guard cheap (one `getSession`, deduped).

- [x] **Task 5 — Gates + deploy** (AC: 1, 2, 3)
  - [x] `npm run lint && npm run typecheck && npm test && npm run build` clean.
  - [x] Deployed to Vercel production (`dpl_…n7x6tu6nu`) → https://soloist.cjjutba.com. Live smoke: unauthenticated `/app` + `/portal` → **307 → /login**, `/login`/`/signup`/`/` → 200, `/api/auth/get-session` → `null` @200. Authenticated round-trip (sign-in → Cockpit greets by Tenant → logout → `/`; freelancer on `/portal` → 404) is CJ's to run (needs a verified account).

## Dev Notes

### Architecture compliance (must follow)

[Source: architecture.md#Authentication & Security]
- **Deny-by-default.** Role guard resolves the surface from the **path** (`/app`→Cockpit, `/portal`→Portal, `/invite/[token]`→pre-auth) and the **session** — **never from the host**. `/app` ⇒ freelancer-of-this-Tenant; `/portal` ⇒ client-of-this-Engagement; mismatch / unknown / unauthorized-Engagement → neutral **not-found** (no existence disclosure).
- **Request authz in the data layer** is already enforced: Cockpit requests build a `TenantContext` (from `requireFreelancer()`) and go through `withTenant` (RLS-scoped). The guard is the surface gate; `withTenant` + RLS is the backstop (NFR-2).
- Sessions: httpOnly, secure, SameSite cookies (Better Auth defaults); CSRF on Server Actions (Next origin checks + `nextCookies`).

### Load-bearing decisions (flagged for CJ)

1. **Guard in server-side layouts + a session module, NOT middleware.** The architecture says "role guard (**middleware/server**)" — I choose **server**. Reasons: (a) it's the most secure (RSC + DB-validated `getSession`; Better Auth itself warns against treating middleware as the security boundary); (b) Next layouts `redirect()`/`notFound()` cleanly before render; (c) avoids a redundant coarse middleware layer + the Node-middleware footguns. The **per-request** guarantee (AC-2) holds because (i) `getSession` re-validates the session against the DB each call and (ii) every Cockpit data read/write builds its `TenantContext` from `requireFreelancer()` (not a cached cookie). If CJ wants a middleware pre-filter too, it's additive later.
2. **Unauthenticated → `redirect("/login")`; wrong-role/tenant → `notFound()`.** The architecture's blanket "anything else → not-found" is about **no existence disclosure to an unauthorized party**. `/login` is a public page — redirecting an anon there discloses nothing tenant-specific and is the expected UX. The **security-critical** path is the *authenticated-but-wrong-role* case (a Client must not learn the Cockpit's shape) → that stays a neutral **not-found**. (If CJ prefers a hard 404 even for anon, it's a one-line change.)
3. **Single domain removes the cross-tenant path probe.** With path-based routing, `/app` carries **no** Tenant — the Tenant is always the session's own. So "freelancer session for the matching Tenant" reduces to "has a freelancer session with a `tenantId`"; there's no other Tenant to mismatch. (The old subdomain design needed host-vs-session reconciliation; that's gone.)

### Better Auth `^1.6` specifics (context7-verified)

- **Sign in (client):** `authClient.signIn.email({ email, password, callbackURL?, rememberMe? })` → `{ data, error }`. Cookies are set by the `/api/auth` route automatically. On `error`, inspect `error.code` (`EMAIL_NOT_VERIFIED`, invalid creds) / `error.message`.
- **Sign out (client):** `authClient.signOut({ fetchOptions: { onSuccess } })`.
- **Server session:** `auth.api.getSession({ headers: await headers() })` → `{ session, user }` (user includes the `tenantId` additional field) or `null`. Node runtime (already set on the auth route; layouts/Server Components run on Node).
- **`requireEmailVerification: true`** (set in 1.3) blocks unverified sign-in — surface as "verify your email", not "wrong password".
- **Session policy:** `session.expiresIn` (absolute), `session.updateAge` (sliding refresh). Omitting `session.cookieCache` keeps every `getSession` DB-backed (the AC-2 guarantee).

### Previous-story intelligence (Story 1.3 — read first)

[Source: 1-3-freelancer-sign-up-tenant-provisioning-slug.md]
- The `auth` instance is in `src/server/auth/index.ts`; the **client** is `src/server/auth/client.ts` (`signIn/signOut/useSession` exported). `src/server/auth/**` is ESLint-exempt (may import the raw db). The Server Action pattern (thin wrapper over an auth-layer fn) is established.
- `session.user.tenantId` is the **forward link** set at provisioning (additional field, `input:false`) — this is exactly what the role guard reads to resolve Tenant + role with zero extra DB reads.
- `TenantContext = { tenantId, userId, role: "freelancer"|"client", engagementId? }` (from `@/server/db/context` → `scope.ts`). `getTenant(ctx)` reads the caller's Tenant through `withTenant` (RLS).
- **Testing pattern that works:** `vi.hoisted` + `vi.mock` of the dependency modules (see `sign-up.test.ts`). For `session.ts`, mock `../index` (`auth.api.getSession`), `next/headers`, and `next/navigation` (`redirect`/`notFound` — assert they're called; they throw `never` so the test asserts via the mock, e.g. `redirect.mockImplementation(() => { throw new Error("REDIRECT") })`).
- Gates: vitest (`npm test`), `npm run typecheck`, `npm run lint`, `npm run build`. Build uses Turbopack; `serverExternalPackages` + the `kysely@0.28.17` override are in place (don't remove).

### Project structure (files)

**New:** `src/server/auth/session.ts` (the guard module) · `src/server/auth/__tests__/session.test.ts` · `src/app/(auth)/login/page.tsx` · `src/app/(auth)/login/login-form.tsx` · `src/app/app/logout-button.tsx`.

**Modified:** `src/server/auth/index.ts` (+session policy) · `src/app/app/layout.tsx` (guard + optional header w/ logout) · `src/app/app/page.tsx` (signed-in Cockpit via `requireFreelancer` + `getTenant`) · `src/app/portal/layout.tsx` (client guard scaffold) · `src/app/(auth)/signup/signup-form.tsx` (login cross-link).

### Project Structure Notes

- `/login` lives in the `(auth)` route group (pre-auth shell), **outside** `/app`, so the guard never locks out login. Symmetric with `/signup`.
- The guard module is server-only (`next/headers`, `next/navigation`, `auth` → db/env). Never import it into a client component; client components use `@/server/auth/client` (`authClient`).
- `redirect()`/`notFound()` from `next/navigation` throw control-flow errors — call them at the top of guards; TS narrows the value as non-null afterward (they return `never`).

### Testing requirements

- **Unit (vitest, mocked):** the guard module — role derivation + all three outcomes per guard (return ctx / redirect / not-found). This is the security-critical logic and must be airtight (especially: a non-freelancer session on `/app` → `notFound`, a freelancer session on `/portal` → `notFound`).
- **Config assertion (where practical):** `cookieCache` is not enabled; `expiresIn`/`updateAge` set. (Constructing `auth` pulls env/db, so prefer asserting the exported option object if reachable, else cover via the live smoke.)
- **Live smoke (Task 5):** logged-out `/app` → `/login`; sign-in → Cockpit greets by Tenant; logout → `/`; freelancer on `/portal` → 404.
- Do not regress the 1.2/1.3 suites (59 tests).

### References

- [Source: epics.md#Story 1.4 (folds in superseded 1.5)]
- [Source: architecture.md#Authentication & Security — role guard, deny-by-default, not-found, data-layer authz]
- [Source: prd.md#FR-4 (auth/sessions); NFR-2 (isolation), NFR-3 (security)]
- [Source: src/server/auth/{index,client}.ts; src/server/db/context.ts (TenantContext); src/app/app/*, src/app/portal/*, src/app/(auth)/*]
- Better Auth `^1.6` (context7 `/better-auth/better-auth/v1.6.11`): `signIn.email`, `signOut`, `auth.api.getSession({ headers })`, session `expiresIn`/`updateAge`/`cookieCache`.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (Claude Opus 4.8, 1M context)

### Debug Log References

- Local prod smoke (:3100, prod build): unauthenticated `/app` → **307 → /login**, `/portal` → **307 → /login**, `/login`/`/signup`/`/` → 200. `/app` + `/portal` correctly compile as **ƒ (Dynamic)** now (the per-request guard runs `getSession` with headers).

### Completion Notes List

- **Role guard implemented as server-side layout guards + a session module** (`src/server/auth/session.ts`), not middleware — most secure (RSC + DB-validated `getSession`), matches "re-checked server-side." `/app`→`requireFreelancer()`, `/portal`→`requireClient()`.
- **DEVIATION from the spec (deliberate):** `getAppSession()` is **NOT** wrapped in React `cache()`. A no-arg `cache()` memoizes globally per process and would poison the unit tests (every call returns the first result); the per-request `getSession` lookups are cheap (one in the `/app` layout guard + one in the page = 2). Documented in code. A future request-scoped dedup can revisit.
- **Role derivation:** `session.user.tenantId` set ⇒ `freelancer`; else `null`. Clients (`role:"client"`) require `ClientAccess` → **Epic 2**, so `requireClient()` today only enforces the reject path (a freelancer/anon on `/portal` → not-found / login). The cross-surface guarantee holds.
- **Outcomes:** unauthenticated on a guarded surface → `redirect("/login")` (login isn't a secret); authenticated wrong-role/no-tenant → `notFound()` (neutral 404 — the security-critical path). _(Minor refinement of the architecture's blanket "→ not-found"; flagged in Dev Notes.)_
- **Session policy:** explicit `expiresIn` 7d + `updateAge` 1d in the auth instance; `cookieCache` left OFF so every `getSession` re-validates against the `session` table (AC-2).
- **Login:** `/login` (client form, `signIn.email`) — maps unverified/`403` → "verify your email", bad creds → generic "Invalid email or password" (no enumeration). **Logout:** `logout-button.tsx` (`signOut` → `/`). Cockpit greets by Tenant name (via `getTenant` through `withTenant` → RLS) + shows the signed-in email + a header logout. Sign-up ↔ login cross-linked.
- **Tests: 67/67** (8 new guard tests: role derivation + all three outcomes for `requireFreelancer`, + the cross-surface `requireClient` rejections). lint/typecheck/build clean. No regression to the 59 prior tests.
- **Deferred:** real Client/Engagement portal resolution (Epic 2 / Story 2.6); the `/portal` happy path is therefore not yet testable (no clients exist).

### File List

**New:** `src/server/auth/session.ts` · `src/server/auth/__tests__/session.test.ts` · `src/app/(auth)/login/page.tsx` · `src/app/(auth)/login/login-form.tsx` · `src/app/app/logout-button.tsx` · `src/components/ui/field.tsx` (shared, review)

**Modified:** `src/server/auth/index.ts` (+session policy) · `src/server/auth/client.ts` (+`"use client"`, review) · `src/app/app/layout.tsx` (guard + header/logout) · `src/app/app/page.tsx` (guarded Cockpit via `requireFreelancer` + `getTenant`) · `src/app/portal/layout.tsx` (client guard scaffold) · `src/app/(auth)/signup/signup-form.tsx` (login cross-link + shared `Field`)

## Senior Developer Review (AI)

**Reviewed:** 2026-06-06 · **Effort:** extra-high (6 finder angles + verify) · **Outcome:** **the guard is fail-closed — three independent security passes found NO role-bypass path.** `role`/`tenantId` can't be forged (`input:false` → Better Auth rejects client writes), `cookieCache` off ⇒ every check is DB-validated, logout clears server-side. Findings were hardening + drift-risk; required fixes applied + re-verified (68/68).

**Fixed:**
- [x] **Drift risk (HIGH):** `app/page.tsx` re-implemented the guard via `getAppSession` + manual checks → now calls the canonical `requireFreelancer()` (returns the freelancer principal, also a `TenantContext`); added `if (!tenant) notFound()` for a ghost/deleted Tenant.
- [x] **`requireFreelancer` now enforces `emailVerified`** (defense-in-depth — closes the "reads it but ignores it" false-assurance; primary gate remains `requireEmailVerification`). New test: unverified freelancer → not-found.
- [x] **`logout-button`:** wrapped in try/catch/finally + error toast — a failed sign-out no longer strands the button on "Signing out…".
- [x] **`login-form`:** try/catch around `signIn.email` (network reject → toast, not a silent re-enable); narrowed the unverified detection to `error.code === "EMAIL_NOT_VERIFIED"` only (dropped the broad `|| status===403` that mis-labelled rate-limit/CSRF as "verify your email").
- [x] **`client.ts` gets `"use client"`** — a stray Server Component import now fails at build, not runtime.
- [x] **Extracted the duplicated `Field`** into `src/components/ui/field.tsx` (login + signup shared it) — one source for the a11y-critical label/hint/error markup.
- [x] **Strengthened Epic-2 comments** in `session.ts`: role derivation must be extended to emit `"client"`, `requireClient` must bind a real `ClientAccess` row (don't loosen), and the **positional-guard** warning (no middleware backstop — every future `/app`/`/portal` route/handler must self-guard or nest under the guarded layout).

**Noted (accepted for v1 / Epic 2):**
- **No middleware backstop** — the guard is positional (layout + page self-guard). Deliberate (server-side is the secure boundary; middleware has known "don't trust it" caveats). Mitigated: the page now self-guards via `requireFreelancer()`, and the risk is documented. A middleware matcher is additive later if route groups/handlers proliferate.
- `role` derived from `tenantId` truthiness only (no independent role column) — correct + fail-closed today; Epic 2 must extend it (commented).
- `requireClient` happy path is untestable until Epic 2 (no client sessions exist); the reject paths (freelancer/anon) are tested.
- `cookieCache`-off is not unit-asserted (constructing `auth` needs env/db) — covered by the explicit comment + the live smoke. Double `getSession` per `/app` load is accepted (cheap; request-scoped dedup deferred).

## Change Log

| Date       | Version | Description                                                                 | Author |
| ---------- | ------- | --------------------------------------------------------------------------- | ------ |
| 2026-06-06 | 0.1     | Story drafted (ultimate context engine).                                    | Scrum  |
| 2026-06-06 | 1.0     | Implemented Tasks 1–5: session policy + server-side role guard, login/logout, signed-in Cockpit. 67/67 tests, build clean, local guard smoke green. | Dev (Opus 4.8) |
| 2026-06-06 | 1.1     | Code review (xhigh, guard fail-closed): page→canonical guard, emailVerified enforcement, login/logout try-catch, "use client" on client, shared Field, Epic-2/positional-guard docs. 68/68 tests, build clean. | Review (Opus 4.8) |
| 2026-06-06 | 1.2     | Deployed to production → https://soloist.cjjutba.com (READY). Live guard smoke green (unauth /app + /portal → 307 /login). Story done. | Dev (Opus 4.8) |
