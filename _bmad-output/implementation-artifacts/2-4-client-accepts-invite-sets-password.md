---
baseline_commit: a168ff5
---

# Story 2.4: Client Accepts Invite & Sets Password

Status: done

<!-- Note: Validation is optional. Run validate-create-story for a quality check before dev-story. -->

## Story

As an invited Client,
I want to accept my invite and set a password,
so that I can enter my Engagement's portal.

## Acceptance Criteria

1. **Accept a valid invite → a Client account scoped to one Engagement (FR-5, FR-4).**
   **Given** a valid invite link at `soloist.cjjutba.com/invite/[token]`
   **When** I set a password
   **Then** a `client` `User` is created (the invite token is the email proof — created **already verified**, no second verification email), a `ClientAccess` row scopes me to **that one Engagement**, the `invitations.accepted_at` is stamped, and I am **logged in scoped to it** and routed to `/portal`.

2. **Expired/invalid token → branded dead-end, no disclosure.**
   **Given** an expired, already-accepted, or unknown token
   **When** I open `/invite/[token]`
   **Then** I see the branded "ask {Tenant} for a new link" state — **no account/email detail is leaked**, no set-password form.

3. **The session layer can finally emit `role:"client"` (the Epic-2 carry-forward).**
   **Given** a logged-in Client (a `ClientAccess` row)
   **Then** `getAppSession` derives `role:"client"` + resolves the Engagement, `requireClient` returns an engagement-scoped `TenantContext{ role:"client", tenantId, engagementId }`, and `/portal` becomes reachable for that Client (the scaffold page until Story 2.6) — while a Freelancer/anon still gets `notFound()` there.

## Tasks / Subtasks

- [x] **Task 1 — `client_access` table + tenant-AND-engagement RLS + migration + isolation test** (AC: 1, 3)
  - [x] In `src/server/db/schema.ts`, add `clientAccess` (uuid v7 `id`; `tenantId uuid NOT NULL → tenants.id cascade`; `engagementId uuid NOT NULL UNIQUE → engagements.id cascade`; `userId text NOT NULL UNIQUE → user.id cascade` — **one Engagement per Client, one Client per Engagement, v1**; `role text NOT NULL default 'client'`; `invitedAt timestamptz`; `acceptedAt timestamptz NOT NULL defaultNow()`; `createdAt timestamptz NOT NULL defaultNow()`). Export `ClientAccess` type.
  - [x] RLS policy `client_access_scope` reusing `currentTenant`/`currentEngagement` (engagement clause on `engagement_id`): ``using/withCheck: sql`tenant_id = ${currentTenant} AND (${currentEngagement} IS NULL OR engagement_id = ${currentEngagement})` ``.
  - [x] `npm run db:generate` → review `drizzle/0006_*.sql` (CREATE + 3 FKs + 2 unique + ENABLE RLS + policy). **Append `ALTER TABLE "client_access" FORCE ROW LEVEL SECURITY;`**. `npm run db:migrate` on Neon; verify `relforcerowsecurity=true` + policy + uniques.
  - [x] Extend `isolation.test.ts`: seed a `client_access` in Tenant A (E1) + Tenant B (E3); prove freelancer-A-sees-own, cross-tenant, fail-closed, WITH-CHECK-blocks-forged-tenant (forge into a clean engagement so only the policy can reject — see the 2.3 (o) fix).

- [x] **Task 2 — The pre-auth + scope-resolution reads (the sanctioned RLS bypass)** (AC: 1, 3)
  - [x] `findInvitationByTokenHash(tokenHash)` in `invitations.repository.ts`: a **raw `db` query (NOT `withTenant`)**, selecting ONLY by `token_hash`. **WHY this is safe + why it must bypass RLS:** the invitee is pre-auth (no session → no Tenant scope to set), so the lookup cannot go through `withTenant`. The connection role `neondb_owner` has BYPASSRLS, so a query without `SET LOCAL ROLE soloist_app` bypasses RLS even under FORCE — exactly what's needed. It is safe because the key is the **unguessable 256-bit `token_hash`** (never email/engagement, which would enumerate). Return the full row or null. Document this heavily (it is the ONE intentional bypass).
  - [x] `src/server/db/repositories/client-access.repository.ts`:
    - `findClientAccessByUserId(userId)` — same **raw `db` (no `withTenant`)** bypass, keyed on the **authenticated user's own id** (the scope-resolution read for `getAppSession`: we must read `ClientAccess` to LEARN the scope, before any scope exists — a bootstrap). Safe: a session can only carry its own `userId`. Returns the row or null.
    - `acceptInvitationTx(ctx, { engagementId, userId, invitedAt })` — **scoped** via `withTenant(ctx, …)` where `ctx` is the invitation-derived `{ tenantId, engagementId, userId, role:"client" }`: in ONE transaction, INSERT the `clientAccess` row AND `UPDATE invitations SET accepted_at = now()` for that engagement. Both satisfy WITH CHECK under the invitation-derived scope. Return the new `ClientAccess`.
  - [x] Unit-test (PGlite): the token-hash lookup finds an unscoped invitation by hash; `findClientAccessByUserId` finds by user id; `acceptInvitationTx` inserts the access + stamps the invitation in one go (and is rejected if the scope disagrees with the row — WITH CHECK).

- [x] **Task 3 — Accept-invite orchestration (auth infra layer)** (AC: 1, 2)
  - [x] `src/server/auth/accept-invite.ts` (the infra layer, like `sign-up.ts` — may use raw `db` + `auth.api`): `acceptInvite({ token, password, name? })`:
    1. `hashToken(token)` → `findInvitationByTokenHash`. **Validate: exists AND `accepted_at IS NULL` AND `expires_at > now()`** — else return `{ ok:false, reason:"invalid" }` (one neutral reason; never distinguish expired/unknown/accepted to the client — AC-2 no disclosure).
    2. **Existing-email guard (v1 scope):** if a `user` with `invitation.email` already exists → return `{ ok:false, reason:"email-taken" }` ("This email already has a Soloist account — ask {Tenant} to invite a different address."). v1 ships the **new-Client** path; linking an existing user to an Engagement is a documented fast-follow (architecture "creates the User (or links existing)").
    3. Create a **verified** Client `User` + credential with the password — **primary:** Better Auth internal adapter (`const ctx = await auth.$context; const hashed = await ctx.password.hash(password); const u = await ctx.internalAdapter.createUser({ email, name, emailVerified: true }); await ctx.internalAdapter.createAccount({ userId: u.id, providerId: "credential", accountId: u.id, password: hashed });`) so **no verification email is sent** (the token already proved the email). **Verify this exact API for Better Auth ^1.6 during dev;** fallback = `auth.api.signUpEmail` then mark `email_verified = true` (accepting the stray verification email). `name` defaults to the invitation email's local-part if not provided.
    4. `acceptInvitationTx(ctx, …)` with `ctx = { tenantId: inv.tenantId, engagementId: inv.engagementId, userId: u.id, role:"client" }`. **On ANY failure after user creation → `deleteUserById(u.id)`** (mirror sign-up's orphan cleanup) so a retry isn't blocked by the half-created user / the existing-email guard.
    5. Sign in: `auth.api.signInEmail({ body: { email, password }, headers: await headers() })` (allowed now — `emailVerified`), which sets the session cookie via the `nextCookies` plugin.
    6. Return `{ ok:true }`; the Server Action wrapper then `redirect("/portal")`.
  - [x] `src/server/auth/accept-invite.actions.ts` (`"use server"`): `acceptInviteAction({ token, password })` → Zod-validate `password` (min 8, matching `minPasswordLength`) → `acceptInvite` → on ok `redirect("/portal")`; on `{ ok:false }` return the typed result for inline display. Never throw to the client.
  - [x] Test (hoisted-mock `findInvitationByTokenHash`, `userExists`, the Better Auth context, `acceptInvitationTx`, `signInEmail`, `deleteUserById`): valid token + new email → user created verified + access tx + signed in; expired/accepted/unknown → `{reason:"invalid"}`, no user; existing email → `{reason:"email-taken"}`, no user; tx failure → orphan user deleted.

- [x] **Task 4 — Session layer emits `role:"client"` (the carry-forward)** (AC: 3)
  - [x] Extend `getAppSession` (`src/server/auth/session.ts`): keep the freelancer short-circuit (`tenantId` set → freelancer, no extra query). For a user with NO `tenantId`, call `findClientAccessByUserId(u.id)`; if found → `{ role:"client", tenantId: access.tenantId, engagementId: access.engagementId, … }`; else `role:null`. Add `engagementId?: string` to `AppSession`.
  - [x] Update `requireClient`: return an engagement-scoped `TenantContext` `{ tenantId, userId, role:"client", engagementId }` (bind to the REAL `ClientAccess` — do NOT loosen to "any non-freelancer"). Unauth → `/login`; non-client → `notFound()`. Export a `ClientSession` type (a valid `TenantContext`).
  - [x] Tests (extend `session.test.ts`): a user with a `ClientAccess` → `getAppSession` role `client` + `engagementId`; `requireClient` returns the scoped ctx; a freelancer or anon at `requireClient` → `notFound`/redirect; a freelancer session still resolves `freelancer` with NO client lookup (short-circuit preserved).

- [x] **Task 5 — The `/invite/[token]` accept UI (branded, pre-auth)** (AC: 1, 2)
  - [x] Replace the placeholder `src/app/invite/[token]/page.tsx` (server): `hashToken` the param → `findInvitationByTokenHash` → validate (unaccepted + unexpired). **Resolve the inviting Tenant's branding** (logo/accent) for the screen (scoped read with `{ tenantId: inv.tenantId }` → `getBranding`/tenant name; the accent IS correct here — Client-facing pre-auth surface, set `--tenant-accent` on this screen like the Portal does). Render either the **set-password** form (valid) or the **branded expired/invalid** state (AC-2). Do NOT echo the email or any account detail in the invalid state.
  - [x] `src/app/invite/[token]/accept-form.tsx` (client, react-hook-form + zod + `Field`): a single **password** field (min 8, requirements stated up front — EXPERIENCE a11y floor: label, `aria-describedby` hint, `role="alert"` error) → `acceptInviteAction({ token, password })`; on the returned `{ok:false}` show the inline reason; success is handled by the action's `redirect("/portal")`.
  - [x] Keep the pre-auth route OUTSIDE all guards (it's intentionally public — the token IS the credential). The `/invite/[token]` route already sits at `src/app/invite/[token]/` (not under `/app` or `/portal`), so no guard wraps it — confirm it stays that way.

- [x] **Task 6 — Gates + deploy** (AC: 1, 2, 3)
  - [x] `npm run lint && npm run typecheck && npm test && npm run build` clean; commit `drizzle/0006_*`; `db:generate` reports nothing new after. Don't regress the 149 prior tests.
  - [x] Apply 0006 to Neon, deploy. Live smoke (use a **second** email as the client): Freelancer sends an invite (Story 2.3) → open the emailed `/invite/<token>` → branded screen with the Tenant logo/accent → set a password → land on `/portal` (the scaffold) as a logged-in Client; the Cockpit Client tab now shows **Accepted**; re-opening the same link shows the branded "ask for a new link" (already accepted); an Engagement's portal is unreachable by the Freelancer session.

## Dev Notes

### Architecture compliance (the auth + isolation spine — non-negotiable)

[Source: architecture.md L160, L167–L173, L189–L197; NFR-2, NFR-3, FR-4, FR-5]
- **Data model (exact):** `ClientAccess — id, tenant_id, engagement_id, user_id, role('client'), invited_at, accepted_at`. `User — id, email, hashed_password, name, email_verified_at` (Better Auth). `Invitation` (Story 2.3) gets `accepted_at` stamped here. [L167–L173]
- **Client identity is app-level, Engagement-grained** (finer than org membership — why we use a custom `ClientAccess`, not Better Auth's org plugin). "The Client invite uses a custom Engagement-scoped Invitation → on accept, creates the `User` (or links existing) + `ClientAccess`, then routes to Onboarding." [L192]
- **Request authz:** "Client (`/portal`) requests must have a `ClientAccess` row for the Engagement being accessed. Anything else → not-found." [L195] "The data layer takes `engagementId` from the resolved `ClientAccess` row, **never from the request**." [L160] — so `requireClient` resolves it from the session's `ClientAccess`, and the portal data layer scopes by it.
- **Passwords hashed by Better Auth (scrypt/argon2); plaintext never stored (FR-4).** [L197] The credential lives in `account.password` (auth-schema.ts).
- **The pre-auth invitation lookup is the ONE sanctioned RLS bypass.** Pre-auth = no session = no scope. The lookup keys ONLY on the unguessable `token_hash`; the connection role bypasses RLS (see `scope.ts` — "Neon's connection role has BYPASSRLS, so RLS is INERT … even with FORCE"), so a raw `db` query is correct and safe here. Everything ELSE (the `ClientAccess` insert, the `invitations` stamp) goes through `withTenant` with the **invitation-derived** scope — never a request-supplied tenant/engagement.

### The session bootstrap (get this exactly right)

- `getAppSession` runs on every guarded request. **Preserve the Freelancer short-circuit** (`tenantId` set → freelancer, no extra query — the 1.4 hot path). Only a user WITHOUT `tenantId` triggers `findClientAccessByUserId`. That lookup is the **scope-resolution bootstrap**: it must read `ClientAccess` to learn `(tenantId, engagementId)` *before* any scope is set, so it bypasses RLS (raw `db`, keyed on the session's own `userId` — a user can only ever resolve their own access).
- After this story, `AppSession` carries `engagementId?: string` (set for clients). `requireClient` returns `{ tenantId, userId, role:"client", engagementId }` — a valid `TenantContext` whose `engagementId` will scope the Portal's reads to exactly one Engagement (the Client case the 2.1 isolation tests already proved at the RLS layer).
- **Email verification:** the Client `User` is created `emailVerified:true` (the token is the proof) so `requireEmailVerification` doesn't block sign-in. Do NOT send a verification email to a Client (use the internal adapter, not `signUpEmail` with `sendOnSignUp`).

### Previous-story intelligence (Stories 2.3, 1.3, 1.4 — read first)

- **2.3 built the invitation half:** `invitations` (token_hash UNIQUE, expires_at, accepted_at), `token.ts` (`hashToken` — reuse for the lookup), `invitations.repository.ts`. The schema comment on `invitations` already says 2.4 MUST enforce `expires_at > now()` AND `accepted_at IS NULL` — honor it.
- **The table + dual-scope RLS + migration + FORCE pattern** (2.1/2.3): `pgPolicy` in `schema.ts`, append `FORCE` to the generated SQL, verify on Neon. `currentTenant`/`currentEngagement` helpers exist. The 2.3 isolation-test (o) fix: forge into a CLEAN engagement so only the WITH CHECK can reject.
- **Better Auth integration** (`src/server/auth/` — ESLint-exempt infra): `sign-up.ts` shows the orchestration pattern (validate → `auth.api.signUpEmail` → cleanup orphan on failure via `deleteUserById`). `auth/index.ts` config: `requireEmailVerification:true`, `minPasswordLength:8`, `nextCookies()` last plugin (handles Set-Cookie in Server Actions), `cookieCache` OFF (every `getSession` re-validates). `users.ts` has `userExists`/`deleteUserById` (raw `db` on the global, no-RLS `user` table). Mirror the orphan-cleanup discipline.
- **Result/Action pattern:** typed `{ ok }`, never throw to the client (1.3). Server Actions that succeed `redirect(...)` (a thrown redirect is expected control flow — return the failure result, let success redirect). react-hook-form + zod + `Field` for the form (signup-form/engagement-form). `sonner` global.
- **Branding pre-auth:** `resolveBrandingVars` (1.6, `branding-vars.ts`) maps Branding → `--tenant-accent*`; the Portal layout sets it from the session. Here, set it from the **invitation-derived Tenant** (a scoped `getBranding({ tenantId: inv.tenantId })` read). The accept screen IS a Client-facing surface → the Tenant accent is correct (unlike the Cockpit).

### Project Structure Notes

- **New:** `src/server/db/repositories/client-access.repository.ts` (+ test); `src/server/auth/accept-invite.ts`; `src/server/auth/accept-invite.actions.ts` (+ test); `src/app/invite/[token]/accept-form.tsx`; `drizzle/0006_*`.
- **Modified:** `src/server/db/schema.ts` (+ `clientAccess` + `ClientAccess` type); `src/server/db/repositories/invitations.repository.ts` (+ `findInvitationByTokenHash`); `src/server/auth/session.ts` (`getAppSession` client branch + `requireClient` + `engagementId`); `src/server/auth/__tests__/session.test.ts`; `src/server/db/__tests__/isolation.test.ts` (client_access fixtures); `src/app/invite/[token]/page.tsx` (placeholder → real accept screen).
- **Do NOT:** build the Onboarding hero (Story 2.5) or the Portal shell/feed (Story 2.6) — accept just lands on the existing `/portal` scaffold; let a request-supplied tenant/engagement reach the data layer (always invitation- or session-derived); send a Client a verification email; store the raw token; reveal which failure (expired vs unknown vs accepted) in the invalid state; implement the existing-email **link** path (documented fast-follow — reject neutrally for v1).
- **Watch:** the `user` table is global/no-RLS (Better Auth queries it as the connection role) — the `ClientAccess.user_id` text FK is fine. The orphan-cleanup on accept failure is REQUIRED (else the existing-email guard blocks the retry).

### Testing requirements

- **Isolation** — `client_access` tenant-scope: freelancer-sees-own, cross-tenant, fail-closed, WITH-CHECK-forged-tenant (mirror 2.3 m–p).
- **Repository** — token-hash lookup (unscoped, by hash); `findClientAccessByUserId`; `acceptInvitationTx` inserts access + stamps invitation in one tx.
- **Accept orchestration** — valid+new→created/verified/access/signed-in; expired/accepted/unknown→`invalid` (no user); existing-email→`email-taken` (no user); tx-failure→orphan deleted. (Mock Better Auth + the repos.)
- **Session** — client `ClientAccess` → role `client` + `engagementId`; `requireClient` scoped ctx; freelancer short-circuit preserved (no client lookup); anon→redirect.
- **Live smoke** — full accept with a second email → `/portal`; Cockpit shows Accepted; re-open → branded already-used state; Freelancer can't reach the portal.
- Don't regress the 149 prior tests.

### References

- [Source: epics.md#Story 2.4 + #Story 2.5/2.6 (what comes after — Onboarding + Portal shell) + Epic 2 intro]
- [Source: architecture.md L160 (engagementId from ClientAccess, never request), L167–L173 (User/ClientAccess/Invitation model), L189–L197 (auth mapping, hashing, request authz, Client = ClientAccess)]
- [Source: EXPERIENCE.md L128 (expired copy, no disclosure), L161 (Invite/set-password form a11y), L198/L203 (accept → set password → /portal; expired = branded ask-for-new-link)]
- [Source: DESIGN.md L125 (Tenant accent on Client surfaces incl. pre-auth invite), L184 (composed shadcn controls)]
- [Source: src/server/auth/{index,sign-up,users,session,email}.ts; src/server/db/{schema,scope,context}.ts; src/server/db/auth-schema.ts; repositories/{invitations,engagements,branding}.repository.ts; src/server/invitations/token.ts; src/app/invite/[token]/page.tsx; src/app/portal/{layout,page}.tsx]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (1M context)

### Debug Log References

- Verified the Better Auth ^1.6.14 internal-adapter API against the installed dist before
  building on it: `auth.$context` → `ctx.password.hash`, `ctx.internalAdapter.createUser`
  (returns the row → `.id`), `ctx.internalAdapter.createAccount({userId, providerId, accountId, password})`.
- **Design deviation from the spec (intentional):** Task 3 said the action would
  `redirect("/portal")`. Shipped instead: the action returns `{ ok:true }` and the client
  `router.push("/portal")` + `router.refresh()`. Reason: `nextCookies` (last plugin) sets the
  sign-in cookie on the action response, so a client navigation is unambiguous and matches
  the codebase's `login-form` idiom — no redirect-throw-vs-cookie-timing ambiguity.
- `react-hooks/purity` would flag `Date.now()` in the page body → the validity check lives in
  the shared `isInvitationAcceptable` (module scope).

### Completion Notes List

- **Task 1** — `client_access` table (engagement_id + user_id UNIQUE = 1:1:1) + dual-scope RLS
  + migration 0006 (FORCE; applied to Neon, verified). Isolation tests q–t.
- **Task 2** — the sanctioned RLS-bypass reads: `findInvitationByTokenHash` (pre-auth, by the
  unguessable hash) + `findClientAccessByUserId` (scope bootstrap, by own userId), both raw
  `db`; `acceptInvitationTx` (scoped, atomic access-insert + invite-stamp). 4 repo tests.
- **Task 3** — `accept-invite.ts` (validate → existing-email guard → verified-user via the
  internal adapter, NO verification email → access tx → sign in; orphan cleanup on any
  post-create failure) + the action. 7 tests.
- **Task 4** — `getAppSession` emits `role:"client"` (freelancer short-circuit preserved) +
  `requireClient` returns an engagement-scoped `TenantContext`; `engagementId` on `AppSession`.
  4 session tests.
- **Task 5** — the `/invite/[token]` accept UI: branded set-password (valid) / neutral
  no-disclosure state (invalid), Tenant-accent CTA; `accept-form.tsx`.
- **Task 6** — gates clean: typecheck ✓, lint ✓, **166 tests** ✓ (+17), build ✓, no drift.

### File List

**New:**
- `drizzle/0006_famous_reptil.sql` (+ `drizzle/meta/0006_snapshot.json`)
- `src/server/db/repositories/client-access.repository.ts` (+ `db/__tests__/client-access.repository.test.ts`)
- `src/server/auth/accept-invite.ts` (+ `auth/__tests__/accept-invite.test.ts`)
- `src/server/auth/accept-invite.actions.ts`
- `src/app/invite/[token]/accept-form.tsx`

**Modified:**
- `src/server/db/schema.ts` (+ `clientAccess` + `ClientAccess` type)
- `src/server/db/repositories/invitations.repository.ts` (+ `findInvitationByTokenHash`, `isInvitationAcceptable`)
- `src/server/auth/session.ts` (`getAppSession` client branch + `requireClient` + `ClientSession`/`engagementId`)
- `src/server/auth/users.ts` (+ `userExistsByEmail`)
- `src/server/auth/__tests__/session.test.ts`; `src/server/db/__tests__/isolation.test.ts` (client_access q–t)
- `src/app/invite/[token]/page.tsx` (placeholder → branded accept screen)

## Senior Developer Review (AI)

**Outcome:** Approved (changes applied). xhigh review, 9 finder angles, weighted to the
auth/RLS-bypass/session-bootstrap surface (this story creates accounts + does a pre-auth
RLS bypass). The spine verified sound: the pre-auth lookup keys ONLY on the unguessable
`token_hash` (raw `db`, owner-bypass by design); `findClientAccessByUserId` is keyed on the
session's OWN userId; the freelancer short-circuit is preserved (no recursion, no extra query);
the Client User is created `emailVerified:true` (no verification email, not a verification
bypass for freelancers); the password is Better-Auth-hashed; `acceptInvitationTx` is scoped by
the invitation-derived tenant/engagement (never the request); migration 0006 ↔ schema parity
with `FORCE`; the `/invite` route is intentionally public and the invalid path discloses nothing.

**Action items resolved:**

1. **[High] `createAccount` failure orphaned the user** → permanent "email-taken" on retry
   (only the access-tx catch cleaned up). Now the user-creation catch deletes the orphan too (+ test).
2. **[Med] Single-use wasn't atomic** — the `accepted_at` check was read up-front but stamped
   at the end (TOCTOU). `acceptInvitationTx` now stamps **conditionally** (`WHERE accepted_at
   IS NULL`, returning) and throws `InvitationAlreadyAcceptedError` on 0 rows → the whole tx
   rolls back. Single-use is now enforced in the DB, not by an incidental UNIQUE collision (+ test).
3. **[Low] Defensive `email.toLowerCase()`** in the accept flow — aligns the existing-email
   guard + createUser with Better Auth's lowercased storage.
4. **[Low] Duplicated token-validity logic** (page + accept, opposite polarity) → extracted one
   shared `isInvitationAcceptable` type-guard, used by both.

**Noted, not changed (judged):** the "email-taken" message is **not a practical enumeration
oracle** — to "probe" an address you must read its invite email (only your own); the synthetic
pre-auth `ctx` is documented-safe (the data layer never branches on `role`/`userId`); the
new-user-only scoping (`user_id` UNIQUE = 1:1:1) is the documented v1 cut — **linking an
existing user to a second engagement is a fast-follow that needs a schema change**; the shared
`Field` `aria-describedby` gap is pre-existing across all forms (a separate shared-component fix).

## Change Log

| Date       | Version | Description                                          | Author |
| ---------- | ------- | ---------------------------------------------------- | ------ |
| 2026-06-06 | 0.1     | Story drafted (ultimate context engine).             | Scrum  |
| 2026-06-06 | 1.0     | Implemented Tasks 1–6; all gates green.              | Dev    |
| 2026-06-06 | 1.1     | xhigh code-review: 4 items resolved; 166 tests green.| Dev    |
