---
baseline_commit: 18506ea
---

# Story 2.3: Invite a Client (Engagement-Scoped)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for a quality check before dev-story. -->

## Story

As a Freelancer,
I want to invite my client by email from an Engagement's Client tab,
so that they can securely access just their Engagement.

## Acceptance Criteria

1. **Send a unique, hashed, expiring invite + a branded email (FR-5, NFR-3).**
   **Given** an Engagement's Client tab
   **When** I send an invite to the client's email
   **Then** an `invitations` row is created (or replaced) for that Engagement with a **unique, expiring token whose HASH is stored** (never the raw token), and a **branded transactional email** (basic Resend send carrying my logo + accent + a CTA to `…/invite/<rawToken>`) is delivered to that address.

2. **See invite state and resend.**
   **Given** an Engagement I've invited a client to
   **When** I open the Client tab
   **Then** I see the invite **state — not-sent / sent (pending) / accepted** (plus an *expired* sub-state of sent) — derived from the row,
   **And** I can **resend** (which regenerates the token + expiry and re-sends the email).

## Tasks / Subtasks

- [x] **Task 1 — `invitations` table + tenant-AND-engagement RLS + migration + isolation test** (AC: 1)
  - [x] In `src/server/db/schema.ts`, add `invitations` (uuid v7 `id`; `tenantId uuid NOT NULL → tenants.id cascade`; `engagementId uuid NOT NULL UNIQUE → engagements.id cascade` — **one active invite per Engagement, v1**; `email text NOT NULL`; `tokenHash text NOT NULL UNIQUE`; `expiresAt timestamptz NOT NULL`; `acceptedAt timestamptz` nullable — set by Story 2.4; `createdAt timestamptz NOT NULL defaultNow()`). Export `Invitation` type.
  - [x] RLS policy `invitation_scope` reusing the existing `currentTenant` / `currentEngagement` GUC helpers (the engagement clause keys on **`engagement_id`**, not `id`): ``using/withCheck: sql`tenant_id = ${currentTenant} AND (${currentEngagement} IS NULL OR engagement_id = ${currentEngagement})` ``. Freelancer (no `app.engagement_id`) → sees all their Tenant's invitations; a Client (Story 2.4) is engagement-scoped.
  - [x] `npm run db:generate` → review `drizzle/0005_*.sql` (CREATE + 2 FKs + 2 unique + ENABLE RLS + the policy). **Manually append `ALTER TABLE "invitations" FORCE ROW LEVEL SECURITY;`** (drizzle-kit omits FORCE — see 0004). `npm run db:migrate` on Neon; verify `relforcerowsecurity=true` + the policy + both unique constraints.
  - [x] Extend `src/server/db/__tests__/isolation.test.ts`: seed an invitation in Tenant A (E1) + one in Tenant B (E3); prove **(freelancer A)** sees only A's; **(cross-tenant)** B sees only B's; **(fail-closed)** no GUCs → 0 rows; **(WITH CHECK)** a Tenant-A-scoped INSERT stamped `tenant_id = B` `.rejects.toThrow()`. (Reuse the `asTenant` harness + the existing engagement/owner seeds.)

- [x] **Task 2 — Invite-token util (hash-at-rest; reused by Story 2.4)** (AC: 1)
  - [x] `src/server/invitations/token.ts`: `generateInviteToken(): string` (`crypto.randomBytes(32).toString("base64url")` — URL-safe, ~43 chars) and `hashToken(token: string): string` (`crypto.createHash("sha256").update(token).digest("hex")` — 64 hex chars). Pure except for `randomBytes`. **Only the hash is ever stored;** the raw token lives only in the email URL. (Use `node:crypto`.)
  - [x] Unit-test: `hashToken` is deterministic + equals a known SHA-256 of a fixed input + is 64 hex chars; `generateInviteToken` returns distinct, URL-safe (`[A-Za-z0-9_-]+`) strings across calls.

- [x] **Task 3 — `invitations.repository.ts` (through the choke point)** (AC: 1, 2)
  - [x] `src/server/db/repositories/invitations.repository.ts` — all via `withTenant(ctx, …)`:
    - `upsertInvitation(ctx, { engagementId, email, tokenHash, expiresAt })` → insert, `onConflictDoUpdate` on the `engagement_id` unique (set `email`, `tokenHash`, `expiresAt`, `acceptedAt = null`) → resend/re-invite replaces the row. Stamp `tenantId: ctx.tenantId`. Return the row.
    - `getInvitationByEngagement(ctx, engagementId)` → the row or null.
  - [x] Unit-test (PGlite, `vi.mock("../index")` + seed a tenant/engagement like `engagements.repository.test.ts`): upsert creates → getByEngagement returns it; a second upsert on the same engagement **updates in place** (new tokenHash/expiry, same single row, `acceptedAt` reset to null), does not duplicate; cross-tenant read → null.

- [x] **Task 4 — Invitations feature module: schema + token + email + Server Actions** (AC: 1, 2)
  - [x] `src/server/invitations/invitations.schema.ts`: Zod — `email` (`z.string().trim().toLowerCase().email()`), and an `inviteExpiry` constant (7 days).
  - [x] `src/server/invitations/email.ts` (mirror `src/server/auth/email.ts`): `sendInviteEmail({ to, inviteUrl, tenantName, logoUrl, accentHex })`. Build a **branded** email: render the React Email template (Task 4 sub) to HTML + a plain-text fallback; `resend.emails.send({ from: env.EMAIL_FROM, to, subject, html, text })`. **No `RESEND_API_KEY`:** in dev `console.info` the invite URL and return; in **production throw** (a missing key must fail loudly — same policy as `auth/email.ts`; do NOT silently drop an invite).
  - [x] `src/emails/invite-email.tsx`: a React Email template (`@react-email/components`) — Tenant `logoUrl` (or a text wordmark fallback when null), a serif-ish welcome line, one orientation sentence, and a **CTA button colored with `accentHex`** (the Tenant accent — this is a Client-facing surface, so the accent is correct here, unlike the Cockpit). Render via `await render(<InviteEmail … />)` (`render` from `@react-email/components`; if that export is absent in v1.0.12, fall back to `@react-email/render`). Keep it "basic" — Epic 4.3 does the polished template system + email a11y.
  - [x] `src/server/invitations/invitations.actions.ts` (`"use server"`): `sendInviteAction(engagementId, email)` and `resendInviteAction(engagementId)`. Each: `requireFreelancer()` → `getEngagement(ctx, engagementId)` (null → `{ ok:false }`, proves ownership) → Zod-validate email → `generateInviteToken()` + `hashToken` + `expiresAt = now + 7d` → `upsertInvitation` → read `getBranding(ctx)` + tenant name → `sendInviteEmail` with `inviteUrl = ${env.BETTER_AUTH_URL}/invite/${rawToken}` → `revalidatePath` the Client tab. `resendInviteAction` reads the existing invitation for the stored email (null → `{ ok:false }`), then runs the same generate→upsert→send. Typed `{ ok }` results; never throw to the client (the established pattern). **The raw token is used ONLY to build the URL — never persisted, never returned to the client.**
  - [x] Test the action orchestration (hoisted-mock the repo + `getEngagement` + `getBranding` + `sendInviteEmail` + `requireFreelancer`): valid email → repo upsert called with a `tokenHash` (NOT the raw token) + `sendInviteEmail` called with a URL containing the raw token; invalid email → `{ ok:false }`, no upsert, no send; engagement not owned (`getEngagement` → null) → `{ ok:false }`, no send.

- [x] **Task 5 — Client tab UI: invite control (send / state / resend)** (AC: 1, 2)
  - [x] Replace the placeholder `src/app/app/engagements/[id]/(detail)/client/page.tsx` with the real tab (server): `requireFreelancer()` → `getInvitationByEngagement(ctx, id)` → render `<ClientInvite>` with the derived state. (The `(detail)` layout already guarded the engagement; this page only needs `ctx` + the invitation.)
  - [x] `…/(detail)/client/client-invite.tsx` (client component, composes shadcn `Input` + `Button` + state `Badge` per DESIGN L184): **not-sent** → email `Input` + "Send invite"; **sent (pending)** → "Invited {email} · {relative time}" + a pending `Badge` + "Resend"; **expired** (`expiresAt <= now`, not accepted) → "Invite expired" + "Resend"; **accepted** → "{email} · accepted" + an active `Badge` (no resend). Calls `sendInviteAction` / `resendInviteAction`; `sonner` toast + `router.refresh()` on ok; inline error on failure. Use `formatRelativeTime` for the sent time. Errors `role="alert"`, label on the email field (EXPERIENCE a11y floor).
  - [x] Derive the state on the server (pass a discriminated prop) so the client component is presentational — don't recompute expiry drift on the client.

- [x] **Task 6 — Gates + deploy** (AC: 1, 2)
  - [x] `npm run lint && npm run typecheck && npm test && npm run build` clean; commit `drizzle/0005_*` (the migration-drift CI step must stay green — `db:generate` reports nothing new after). Don't regress the 129 prior tests.
  - [x] Apply 0005 to Neon, deploy to Vercel production. Live smoke (signed-in freelancer): open an Engagement → **Client** tab → send an invite to your own email → state flips to "pending", the branded email arrives with your logo/accent + a working `…/invite/<token>` link (lands on the Story-2.4 placeholder — that's expected), **Resend** works. (Real email — use your own address.)

## Dev Notes

### Architecture compliance (the security spine — non-negotiable)

[Source: architecture.md L160, L167–L173, L189–L197, L201, L390, L398; NFR-3]
- **Data model (exact fields):** `Invitation — id, tenant_id, engagement_id, email, token_hash, expires_at, accepted_at`. `ClientAccess — id, tenant_id, engagement_id, user_id, role('client'), invited_at, accepted_at`. **This story builds ONLY `invitations`** (the freelancer sends). `ClientAccess` + the `User` are created on **accept (Story 2.4)** — do NOT build them here. [L172–L173]
- **Token = hash-at-rest (NFR-3, "passwords hashed; … the curation boundary is also a security boundary").** The invite token is an account-takeover credential: store **only `sha256(token)`**; the raw token exists solely in the email URL. The 2.4 accept flow will hash the presented token and look it up by `token_hash`. Generate ≥256 bits of entropy (`randomBytes(32)`), URL-safe (`base64url`). Expiry is mandatory (`expires_at`). [L197, NFR-3]
- **Engagement-scoped isolation (the invariant this story extends):** the `invitations` table is Tenant-owned and (for a future Client) Engagement-scoped. Reuse the exact dual-scope RLS shape from `engagements`/2.1 — `tenant_id = currentTenant AND (currentEngagement IS NULL OR engagement_id = currentEngagement)` — so a Freelancer sees all their Tenant's invitations and the isolation backstop is already correct when the Client path lands in 2.4. [L160]
- **Email = Resend; branding reaches emails.** Per-Tenant logo + accent must reach Client surfaces *and* emails [L72]; resolve from the freelancer's session Tenant `Branding`. Email transport mirrors `src/server/auth/email.ts` (feature-local Resend wrapper); React Email templates live in `src/emails/` [L390]. `src/server/notifications/` (the formal Resend wrapper, L398) is an **Epic-4** seam — do NOT build it now; keep the invite send in `src/server/invitations/email.ts` (consistent with auth).
- **The Tenant accent IS correct on this email** (a Client-facing surface) — unlike the Cockpit. Use `accentHex` from Branding (default Soloist Iris) for the CTA. [DESIGN L125/L191]
- **Server Actions** for the mutations: `requireFreelancer` → verify engagement ownership → Zod → repository → email → `revalidatePath`. Typed `{ ok }`; never throw to the client. [L208, Story 1.3/2.1 pattern]

### The pre-auth accept seam (Story 2.4 — do NOT build, but design for it)

- The accept flow at `/invite/[token]` is **pre-auth**: the invitee has no session/Tenant, so the token→invitation lookup **cannot** go through `withTenant` (there is no `ctx`). 2.4 will add a deliberately un-tenant-scoped lookup by `token_hash` (e.g. a `SECURITY DEFINER` function or a service-role query that selects ONLY by the hash, then derives tenant/engagement from the row). **2.3 does not build this** — but do not add anything that would make a hash-only lookup impossible (e.g. don't make `token_hash` non-unique). The existing `src/app/invite/[token]/page.tsx` placeholder stays as-is.

### Previous-story intelligence (Stories 2.1, 2.2, 1.3 — read first)

- **The table + dual-scope RLS + migration pattern is established** (2.1, `engagements`): `pgPolicy` in `schema.ts` emits ENABLE + CREATE POLICY but **NOT FORCE** — append `ALTER TABLE "invitations" FORCE ROW LEVEL SECURITY;` to `drizzle/0005_*` manually. `soloist_app` auto-grants via 0001's `ALTER DEFAULT PRIVILEGES`. `currentTenant` + `currentEngagement` GUC helpers already exist in `schema.ts` — reuse them. The isolation harness `asTenant(tenantId, fn)` + seeds are in `isolation.test.ts`.
- **Repository + feature-module + action patterns** (2.1): repos in `src/server/db/repositories/*.repository.ts` (all `withTenant`); feature logic in `src/server/<feature>/`; actions return `{ ok }` and never throw; hoisted-`vi.mock("../index")` + PGlite for repo tests, hoisted mocks for action tests. `requireFreelancer()` returns the `TenantContext`. `getEngagement(ctx, id)` is the ownership check (RLS → null if not yours). `getBranding(ctx)` (1.6) returns the Tenant's logo/accent.
- **Email transport** (`src/server/auth/email.ts`): `const resend = env.RESEND_API_KEY ? new Resend(...) : null` built once; dev-no-key → `console.info` the link; **prod-no-key → throw**. `env.EMAIL_FROM` is the sender (`hello@cjjutba.com` in prod). Mirror this exactly for invites. `RESEND_API_KEY`/`EMAIL_FROM` are already in `env.ts` (optional) + live in Vercel/`.env.local`.
- **UI:** the Client tab is `…/[id]/(detail)/client/page.tsx` (a placeholder from 2.2 — replace it). Invite control composes shadcn `Input` + `Button` + a state `Badge` (DESIGN L184 — "inherits shadcn", no new visual spec). `Badge` exists (`src/components/ui/badge.tsx` — `StatusBadge`/`CandidateBadge`; the invite uses a neutral state badge, NOT the candidate/Iris one). `formatRelativeTime` (`src/lib/relative-time.ts`) for the sent time. `sonner` toaster is global; forms use react-hook-form (+ zod) per `signup-form`/`engagement-form`.
- **Gates:** vitest + `typecheck`/`lint`/`build` (Turbopack) + the CI **migration-drift** step — commit `drizzle/0005_*`. Don't regress the 129 prior tests.

### Project Structure Notes

- **New:** `src/server/invitations/{token,invitations.schema,invitations.actions,email}.ts` (+ tests for token & actions); `src/server/db/repositories/invitations.repository.ts` (+ test); `src/emails/invite-email.tsx`; `src/app/app/engagements/[id]/(detail)/client/client-invite.tsx`; `drizzle/0005_*`.
- **Modified:** `src/server/db/schema.ts` (+ `invitations` + `Invitation` type); `src/server/db/__tests__/isolation.test.ts` (invitation fixtures); `src/app/app/engagements/[id]/(detail)/client/page.tsx` (placeholder → real invite tab).
- **Do NOT:** build `ClientAccess`, the `User` creation, or the `/invite/[token]` accept flow (Story 2.4); build `src/server/notifications/` (Epic 4); store the raw token; return the raw token to the client; let the invite email omit the expiry/CTA. **Do NOT** apply the Tenant accent to any Cockpit chrome (the email is the only accent-bearing surface here).

### Testing requirements

- **Token** — `hashToken` deterministic + known-vector + 64-hex; `generateInviteToken` distinct + URL-safe. Never store/return the raw token.
- **Repository** — upsert create → get; second upsert on the same engagement updates-in-place (one row, new hash/expiry, `acceptedAt` reset); cross-tenant → null.
- **Isolation** — invitations tenant-scope: freelancer-sees-own, cross-tenant, fail-closed, WITH-CHECK-blocks-forged-tenant (mirror the 2.1 engagement tests).
- **Action** — valid → upsert with a `tokenHash` (not raw) + `sendInviteEmail` with a URL containing the raw token; invalid email → no write/send; engagement-not-owned → no send. Email send is mocked (no real send in tests).
- **Live smoke** — real invite to your own email; state pending→ (link works to the 2.4 placeholder); resend.
- Don't regress the 129 prior tests.

### References

- [Source: epics.md#Story 2.3 (Invite a Client) + #Story 2.4 (accept — the next story) + Epic 2 intro]
- [Source: architecture.md L160 (engagement scope), L167–L173 (User/ClientAccess/Invitation model), L189–L197 (auth/invite mapping + hashing), L201 (RESEND_API_KEY), L222 (branding→emails), L390/L398 (emails/ + notifications/)]
- [Source: EXPERIENCE.md L106 (Invite control: states + resend), L128 (expired copy, no disclosure), L161 (form a11y floor), L191/L197 (branded invite email)]
- [Source: DESIGN.md L125/L191 (Tenant accent on Client surfaces + emails, not Cockpit), L184 (invite control = shadcn Input+Button+Badge)]
- [Source: src/server/auth/email.ts (Resend wrapper to mirror); src/server/db/{schema,scope,context}.ts; repositories/engagements.repository.ts + __tests__; src/server/branding/branding-vars.ts + repositories/branding.repository.ts; src/app/app/engagements/[id]/(detail)/client/page.tsx; src/env.ts]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (1M context)

### Debug Log References

- `react-hooks/purity` flagged `Date.now()` in the Client-tab server component body —
  moved the invite-state derivation to a module-level `deriveInviteView` (impure call out
  of the component), then switched its param type to `Awaited<ReturnType<…>>` because the
  page is barred from importing `@/server/db/schema` (the repository-pattern lint rule).
- React Email: confirmed `render` is exported (async) from `@react-email/components` v1;
  used `createElement(InviteEmail, props)` so `email.ts` stays a `.ts` (no JSX).

### Completion Notes List

- **Task 1** — `invitations` table (id, tenant_id, engagement_id UNIQUE, email, token_hash
  UNIQUE, expires_at, accepted_at, created_at) + dual-scope `invitation_scope` RLS (keys on
  `engagement_id`) + migration 0005 with `FORCE` appended; applied to Neon (verified
  `relforcerowsecurity=true`, policy, both uniques, both FKs). Isolation test extended (m–p):
  freelancer-scoped, cross-tenant, fail-closed, WITH-CHECK-blocks-forged-tenant.
- **Task 2** — `token.ts`: `generateInviteToken` (32 bytes base64url) + `hashToken`
  (sha256 hex). **Only the hash is stored.** 4 tests.
- **Task 3** — `invitations.repository.ts` (`upsertInvitation` onConflict on engagement_id;
  `getInvitationByEngagement`), via `withTenant`. 3 PGlite tests (create, resend-in-place,
  cross-tenant null).
- **Task 4** — feature module: Zod email (trim+lowercase), `email.ts` (Resend wrapper
  mirroring auth; dev-log / prod-throw), `src/emails/invite-email.tsx` (React Email, Tenant
  logo + accent CTA), actions (`sendInviteAction`/`resendInviteAction` — ownership check →
  token → upsert → branded send; typed `{ ok }`). 7 action tests (hash-not-raw stored, URL
  carries raw token, invalid email/non-owner blocked).
- **Task 5** — Client tab: server derives the invite state, `client-invite.tsx` (Input +
  Button + state Badge) sends/resends with toast + refresh.
- **Task 6** — gates clean: typecheck ✓, lint ✓, **149 tests** ✓ (+20), build ✓, 0005
  applied to Neon, no drift.

### File List

**New:**
- `drizzle/0005_heavy_red_skull.sql` (+ `drizzle/meta/0005_snapshot.json`)
- `src/server/invitations/token.ts` (+ `__tests__/token.test.ts`)
- `src/server/invitations/invitations.schema.ts`
- `src/server/invitations/email.ts`
- `src/server/invitations/invitations.actions.ts` (+ `__tests__/invitations.actions.test.ts`)
- `src/server/db/repositories/invitations.repository.ts` (+ `db/__tests__/invitations.repository.test.ts`)
- `src/emails/invite-email.tsx`
- `src/app/app/engagements/[id]/(detail)/client/client-invite.tsx`

**Modified:**
- `src/server/db/schema.ts` (+ `invitations` + `Invitation` type)
- `src/server/db/__tests__/isolation.test.ts` (invitation fixtures m–p)
- `src/app/app/engagements/[id]/(detail)/client/page.tsx` (placeholder → real invite tab)

## Senior Developer Review (AI)

**Outcome:** Approved (changes applied). xhigh review, 9 finder angles, weighted to the
security surface (this story mints an account-takeover credential). The spine verified sound:
the raw token is **never persisted, returned, or logged in prod** (only `sha256` at rest;
the dev-only `console.info` is gated by `NODE_ENV`); 32-byte entropy + URL-safe; migration
0005 ↔ schema parity with `FORCE` (verified on Neon); `invitation_scope` fails closed; the
actions enforce engagement ownership via RLS-scoped `getEngagement` before any write/send.

**Action items resolved:**

1. **[High] Re-invite could silently un-accept a client + mint a fresh takeover token.**
   `resendInviteAction`/`issueInvite` reset `accepted_at = null` with no accepted-state guard
   (the UI hides Resend, but the action is directly callable). Added an authoritative guard:
   reject when `accepted_at` is set (+ test).
2. **[Med] Stale "Invited Nd ago" after resend** — upsert kept the original `created_at`.
   Now re-stamps `created_at = now()` on conflict (the row is the current invite).
3. **[Med] Server actions didn't UUID-guard `engagementId`** — a non-uuid threw *outside*
   the try/catch → unhandled 500. Added `isUuid` guard → neutral `{ ok:false }` (+ test).
4. **[Test validity] Isolation (o) was ambiguous** — forged into an engagement that already
   had an invitation, so the unique constraint (not the WITH CHECK) could be the rejecter.
   Now forges into a clean engagement with a fresh hash → only WITH CHECK can reject.
5. **[Low] Defensive: upsert returning no row** still sent the email — now checked.
6. **[Low a11y/UX] `error` not cleared on email edit + no busy early-return** — both fixed.
7. **[Low] Trailing-slash `BETTER_AUTH_URL`** → `//invite/` — stripped.
8. **[Doc] Strengthened the schema comment** so Story 2.4's accept lookup MUST enforce
   `expires_at > now()` AND `accepted_at IS NULL` (single-use, unexpired).

**Noted, not changed:** rotate-then-send isn't atomic across DB+email (standard pattern — a
failed send is fixed by resending); `email.ts` duplicates `auth/email.ts`'s Resend
init/fail-loud (the shared `src/server/notifications/` seam is deferred to Epic 4); Badge
variant reuse for invite states and the hand-rolled one-field form are acceptable; the
branded email correctly wears the Tenant accent (a Client-facing surface).

## Change Log

| Date       | Version | Description                                          | Author |
| ---------- | ------- | ---------------------------------------------------- | ------ |
| 2026-06-06 | 0.1     | Story drafted (ultimate context engine).             | Scrum  |
| 2026-06-06 | 1.0     | Implemented Tasks 1–6; all gates green.              | Dev    |
| 2026-06-06 | 1.1     | xhigh code-review: 8 items resolved; 149 tests green.| Dev    |
