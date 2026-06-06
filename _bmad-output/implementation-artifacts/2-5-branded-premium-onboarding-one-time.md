---
baseline_commit: 13fffd3
---

# Story 2.5: Branded Premium Onboarding (One-Time)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for a quality check before dev-story. -->

## Story

As a Client,
I want a calm, branded welcome on my first visit,
so that I feel I hired an agency before I even see any updates.

## Acceptance Criteria

1. **First authenticated Client session → a one-screen branded Onboarding hero (FR-8, UX-DR10).**
   **Given** my first authenticated Client session
   **When** I enter the portal
   **Then** I'm routed through a one-screen branded **Onboarding hero** — Tenant **logo + accent**, a **serif welcome** ("Welcome to {Tenant}, {my display name}."), **one orientation line** pointing at the Ship Feed, and a single primary CTA — **pure reassurance, no input**.

2. **Completing it sets a server-side flag and lands me on the Ship Feed; never repeats.**
   **Given** I tap the CTA ("Got it")
   **When** the Onboarding completes
   **Then** a **server-side flag** is stamped (on my `ClientAccess`), I land on the Ship Feed (`/portal`), and Onboarding **never shows again** on later sessions — a returning Client goes straight to the feed.

3. **The Client Portal is Tenant-branded (the carry-forward wiring).**
   **Given** any Client Portal surface
   **Then** the Portal root resolves the Tenant's `Branding` from the session and sets `--tenant-accent*`, re-scoping shadcn `--primary` → the Tenant accent so Client primary actions wear the brand (DESIGN.md) — **never the Cockpit**.

## Tasks / Subtasks

- [x] **Task 1 — `onboarded_at` flag on `client_access` + migration + session exposure** (AC: 2)
  - [x] In `src/server/db/schema.ts`, add `onboardedAt timestamptz` (nullable; null = not yet onboarded) to `clientAccess`. `npm run db:generate` → `drizzle/0007_*.sql` (a bare `ALTER TABLE "client_access" ADD COLUMN "onboarded_at" …`). **No RLS/policy change** (existing `client_access_scope` + FORCE already cover the table — confirm `db:generate` emits ONLY the ADD COLUMN, nothing else). `npm run db:migrate` on Neon.
  - [x] `markOnboarded(ctx)` in `client-access.repository.ts` — `withTenant(ctx, …)`: `UPDATE client_access SET onboarded_at = now() WHERE engagement_id = ctx.engagementId AND onboarded_at IS NULL` (idempotent — a double-tap or re-fire is a no-op). RLS-scoped (the client ctx). Return void.
  - [x] Expose it on the session: add `onboardedAt?: Date | null` to `AppSession`; in `getAppSession`'s client branch set `onboardedAt: access.onboardedAt` (the row is already fetched by `findClientAccessByUserId` — **no extra query**). `ClientSession` inherits it; `requireClient` returns it.

- [x] **Task 2 — Portal layout: Tenant branding (the carry-forward)** (AC: 3)
  - [x] Replace the `src/app/portal/layout.tsx` scaffold: `const ctx = await requireClient()` → `Promise.all([getTenant(ctx), getBranding(ctx)])` → `resolveBrandingVars(branding, tenant?.name ?? "")` → set `style={{ ...vars.style, "--primary": "var(--tenant-accent)", "--primary-foreground": "var(--tenant-accent-foreground)" }}` on the portal root `<div data-surface="portal">` so shadcn `primary` is re-scoped to the Tenant accent for all Client surfaces (DESIGN L125). Keep the role guard (requireClient already guards). The Cockpit is untouched (it never sets these).
  - [x] `getBranding(ctx)`/`getTenant(ctx)` are tenant-scoped reads; the client ctx carries `tenantId` (+ `engagementId`), and the `branding`/`tenants` policies key on `tenant_id` only — so they resolve the inviting Tenant's brand correctly. (Note: the layout + the page below each call `requireClient` → 2 session resolves per portal load; acceptable for v1, the `session.ts` cache() note already flags it.)

- [x] **Task 3 — Onboarding gate + the branded hero** (AC: 1, 2)
  - [x] `src/app/portal/page.tsx` (the Ship Feed home — still a calm scaffold until 2.6): `const session = await requireClient()` → **if `!session.onboardedAt` → `redirect("/portal/onboarding")`**; else render the existing calm placeholder (2.6 builds the real empty feed). This is the gate: an un-onboarded Client can't reach the feed.
  - [x] `src/app/portal/onboarding/page.tsx` (server): `const session = await requireClient()` → **if `session.onboardedAt` → `redirect("/portal")`** (never repeats) → resolve the Client's display name (`getEngagement(ctx, session.engagementId)` → `clientDisplayName`) + Tenant name/logo (`getTenant` + `getBranding` → `resolveBrandingVars`) → render the **Onboarding hero**: Tenant logo (or monogram), a serif (`font-display`) welcome "Welcome to {Tenant}, {clientDisplayName}.", one orientation line ("Here's where you'll see progress as {Tenant} ships — newest first."), and the CTA. **Initial focus on the `<h1>`** (EXPERIENCE a11y: autoFocus the heading). No input fields.
  - [x] `src/app/portal/onboarding/onboarding-cta.tsx` (client): a single "Got it" `Button` (inherits the re-scoped `--primary` = Tenant accent) → `completeOnboardingAction()` → on ok `router.push("/portal")` + `router.refresh()`. Disabled while pending.
  - [x] `src/server/portal/onboarding.actions.ts` (`"use server"`): `completeOnboardingAction()` → `requireClient()` → `markOnboarded(ctx)` → `revalidatePath("/portal")` → return `{ ok: true }` (the client navigates). Typed result; never throw.

- [x] **Task 4 — Tests + gates + deploy** (AC: 1, 2, 3)
  - [x] Unit-test `markOnboarded` (PGlite, extend `client-access.repository.test.ts`): stamps `onboarded_at` once; a second call is a no-op (idempotent, `IS NULL` guard); cross-tenant scoped. Extend `session.test.ts`: a client session carries `onboardedAt`. Test `completeOnboardingAction` (hoisted-mock `requireClient` + `markOnboarded`): calls `markOnboarded(ctx)` + returns `{ ok }`.
  - [x] `npm run lint && npm run typecheck && npm test && npm run build` clean; commit `drizzle/0007_*`; `db:generate` reports nothing new after. Don't regress the 166 prior tests.
  - [x] Apply 0007 to Neon, deploy. Live smoke (the Client account from the 2.4 test): first `/portal` visit → redirected to the branded Onboarding hero (Tenant logo/accent, serif welcome with the client name); tap "Got it" → lands on `/portal` (the feed scaffold); reload `/portal` → straight to the feed (no repeat); `/portal/onboarding` after completing → redirects to `/portal`.

## Dev Notes

### Architecture compliance

[Source: architecture.md L189–L195, L222, L358–L362; FR-8]
- **Onboarding flag is server-side, on the Client's access grant.** "completing it sets a server-side flag and lands me on the Ship Feed; it never repeats." The natural home is `ClientAccess` (the per-Client-per-Engagement row) — `onboarded_at`. [epics 2.5]
- **The Client Portal sets `--tenant-accent` server-side in the layout** "from the resolved Tenant's `Branding` (inline style on the layout), and re-scopes shadcn `--primary` → `--tenant-accent`. The Cockpit never sets these (stays Soloist Ink). Server-resolved so there's no flash." [architecture L222] This story finally wires it (the Epic-2 carry-forward, now that `requireClient` resolves a real ctx).
- **Route structure:** `app/portal/onboarding/page.tsx` (FR-8 one-time) + `app/portal/page.tsx` (FR-14 Ship Feed home) under `app/portal/layout.tsx` (sets `--tenant-accent`). [architecture L358–L362]
- **All reads through the choke point**: `markOnboarded` via `withTenant`; `getBranding`/`getTenant`/`getEngagement` are the existing RLS-scoped repos. `requireClient()` returns the engagement-scoped `TenantContext`. No request-supplied tenant/engagement.

### The UX (premium, calm — get the feel right)

[Source: EXPERIENCE.md L45, L72, L89, L111, L120, L157, L177, L199; DESIGN.md L125, L153]
- **Onboarding hero** (`{components.onboarding-hero}`): "Branded hero + a single orientation screen pointing at the Ship Feed; 'Got it'/scroll proceeds. One-time; flagged complete server-side so it never repeats. **pure reassurance, no Client input** — fastest path to the day-one 'wow.' The premium is in the craft (branded hero, serif welcome, calm), not in steps." [L111] Its only job: "convert anxiety to confidence in <15 seconds." [L177]
- **Copy:** serif welcome with the Tenant + the Client's display name — "Welcome to {Tenant}, {clientDisplayName}." (L89's "Welcome to CJ's workspace, Maya."). One orientation line pointing at the feed. The voice is founder-warm, never corporate (L83/L89 anti-examples).
- **Branding:** the Tenant accent applies to "all Client-facing surfaces (Onboarding hero, … primary buttons/links/active states via re-scoped `primary`)" — **never the Cockpit.** [L72] The hero's CTA = `primary` (now the accent). Logo (or Tenant-initial monogram fallback from `resolveBrandingVars`).
- **Mobile-first, single column** (`max-w-2xl` centered; `portal-gutter`): the Portal is a reading surface, never a dashboard. [DESIGN L153] **a11y:** Onboarding sets initial focus to its `<h1>` (L157); ≥44px touch target on the CTA.

### Previous-story intelligence (Stories 2.4, 1.6, 2.1 — read first)

- **2.4 just shipped the session plumbing this story consumes:** `requireClient()` (`src/server/auth/session.ts`) returns `ClientSession` (a `TenantContext` with `tenantId` + `engagementId`); `getAppSession` resolves the Client via `findClientAccessByUserId` (which returns the full `client_access` row — `onboarded_at` will be on it after Task 1, so exposing it is free). `client_access` table + `client-access.repository.ts` exist. The `/portal` layout + page are still scaffolds (replace them).
- **Branding (1.6):** `resolveBrandingVars(branding, tenantName)` (`branding-vars.ts`) → `{ style, monogram, logoUrl }`; `getBranding(ctx)` returns the row (nullable accent/logo → it falls back to Soloist Iris + a monogram). The `/invite` accept screen (2.4) already branded a Client-facing surface this exact way (logo `<img>`, accent CTA, `--tenant-accent` on the root) — mirror it.
- **Migration + repo + action patterns:** `pgPolicy`/FORCE only on NEW tables — this story ADDS A COLUMN to an existing table, so 0007 is a bare `ADD COLUMN` (no policy/FORCE). Repos via `withTenant`; actions return typed `{ ok }`, never throw; the client navigates with `router.push` (the 2.4 accept pattern; `nextCookies` isn't involved here — it's a same-session action). Tests: PGlite + `vi.mock("../index")` (repo), hoisted mocks (action/session).
- **The Cockpit must NEVER wear the Tenant accent** — only the Portal layout sets `--primary` → `--tenant-accent`. Use the `branding-form` `<img>` (plain, blob host not in `next.config`). Gates include CI migration-drift — commit `0007`.

### Project Structure Notes

- **New:** `src/app/portal/onboarding/page.tsx`, `src/app/portal/onboarding/onboarding-cta.tsx`, `src/server/portal/onboarding.actions.ts`, `drizzle/0007_*`.
- **Modified:** `src/server/db/schema.ts` (+ `onboardedAt` on `clientAccess`); `src/server/db/repositories/client-access.repository.ts` (+ `markOnboarded`); `src/server/auth/session.ts` (`onboardedAt` on `AppSession`/client branch); `src/app/portal/layout.tsx` (scaffold → branded); `src/app/portal/page.tsx` (scaffold → onboarding gate); the repo/session tests.
- **Do NOT:** build the real Ship Feed / empty-feed state (Story 2.6 — `/portal` stays a calm scaffold, just gated); add Client INPUT to onboarding (pure reassurance); let the Cockpit wear the accent; add an RLS policy in 0007 (column-only).
- **Watch:** redirect-loop safety — the GATE is split (`/portal` redirects to onboarding when `!onboardedAt`; `/portal/onboarding` redirects to `/portal` when onboarded). Each page checks the OPPOSITE condition, so there's no loop. The layout must NOT also redirect (it only brands + guards).

### Testing requirements

- **`markOnboarded`** (PGlite) — stamps once; idempotent no-op on a second call (`onboarded_at IS NULL` guard); RLS-scoped.
- **`getAppSession`** — a client session carries `onboardedAt` from the `ClientAccess` row.
- **`completeOnboardingAction`** — calls `markOnboarded(ctx)`, returns `{ ok }` (mock `requireClient` + repo).
- **Live smoke** — first visit → branded hero → "Got it" → feed; reload → no repeat; `/portal/onboarding` post-complete → redirect to feed.
- Don't regress the 166 prior tests.

### References

- [Source: epics.md#Story 2.5 + #Story 2.6 (the feed shell that follows) + Epic 2 intro]
- [Source: architecture.md L189–L195 (auth/portal), L222 (Portal layout sets `--tenant-accent`, re-scopes `--primary`), L358–L362 (route structure)]
- [Source: EXPERIENCE.md L45 (Onboarding = first session only), L72 (accent on Client surfaces, never Cockpit), L89 (welcome copy), L111 (onboarding-hero: one-time, server-flagged, no input), L120 (empty feed copy — 2.6), L157 (focus the h1), L177/L199 (the <15s "wow")]
- [Source: DESIGN.md L125 (re-scope `primary`→accent on the Portal root; Cockpit stays Ink), L153 (mobile-first single column max-w-2xl)]
- [Source: src/server/auth/session.ts (requireClient/ClientSession); src/server/db/repositories/client-access.repository.ts; src/server/branding/branding-vars.ts + repositories/branding.repository.ts; src/app/portal/{layout,page}.tsx; src/app/invite/[token]/page.tsx (the Client-facing branded-surface pattern to mirror)]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (1M context)

### Completion Notes List

- **Task 1** — `onboarded_at` on `client_access` + migration 0007 (bare ADD COLUMN, no RLS
  churn; applied to Neon). `markOnboarded(ctx)` (RLS-scoped + engagement-filtered + idempotent
  `IS NULL` guard). `getAppSession` exposes `onboardedAt` (free — already on the fetched row).
- **Task 2** — portal `layout.tsx`: resolves the session Tenant's Branding → sets
  `--tenant-accent*` + re-scopes `--primary` → the accent (Client surfaces wear the brand;
  the Cockpit never sets these).
- **Task 3** — the gate (split so it can't loop: `/portal` → onboarding when `!onboardedAt`;
  `/portal/onboarding` → `/portal` when onboarded) + the branded hero (logo/monogram, serif
  welcome with Tenant + client name, one orientation line, accent CTA, no input) +
  `completeOnboardingAction`.
- **Task 4** — gates clean: typecheck ✓, lint ✓, **169 tests** ✓ (+3), build ✓, no drift.

### File List

**New:**
- `drizzle/0007_odd_vulcan.sql` (+ `drizzle/meta/0007_snapshot.json`)
- `src/server/portal/onboarding.actions.ts` (+ `src/server/portal/__tests__/onboarding.actions.test.ts`)
- `src/app/portal/onboarding/page.tsx`, `onboarding-cta.tsx`, `welcome-heading.tsx`

**Modified:**
- `src/server/db/schema.ts` (+ `onboardedAt` on `clientAccess`)
- `src/server/db/repositories/client-access.repository.ts` (+ `markOnboarded`)
- `src/server/db/__tests__/client-access.repository.test.ts` (+ markOnboarded test)
- `src/server/auth/session.ts` (`onboardedAt` on `AppSession`/client branch)
- `src/server/auth/__tests__/session.test.ts`
- `src/app/portal/layout.tsx` (scaffold → branded), `src/app/portal/page.tsx` (scaffold → onboarding gate)

## Senior Developer Review (AI)

**Outcome:** Approved (changes applied). 3-angle review. The headline risks verified **sound**:
the onboarding gate **can't loop** (`/portal` and `/portal/onboarding` check exact-complement
conditions; each `requireClient` is a fresh DB read with `cookieCache` off, so the just-stamped
flag is seen immediately; the layout only brands/guards, never redirects); `markOnboarded` is
correctly scoped + engagement-filtered + double-guarded (a freelancer ctx can't reach it and
couldn't mass-onboard if it did); the `--primary`→accent re-scope wears the brand on Client
surfaces with **no Cockpit leak**; migration 0007 is a pure `ADD COLUMN` (no RLS churn).

**Action items resolved:**

1. **[a11y] `autoFocus` on the server-rendered `<h1>` doesn't reliably focus it** (React only
   auto-focuses form controls; SSR `autofocus` is inconsistent). Extracted a `WelcomeHeading`
   client component that focuses the heading on mount (useRef + useEffect) — honoring the
   EXPERIENCE floor.
2. **[Low UX] Empty/whitespace `clientDisplayName`/tenant name** would render "Welcome to …, ."
   (dangling comma). Switched `?? "…"` → `.trim() || "…"`.
3. **[Test hygiene] The `requireClient` test leaned on toEqual's undefined-pruning** for the new
   `onboardedAt` — made it explicit (`onboardedAt: null`).

**Noted, not changed (judged):** the push→refresh + `ok:true`-on-zero-rows "bounce" is **not
reachable** (`/portal` re-reads the session server-side and sees the committed flag); the
double-`requireClient`/read fan-out per portal load is perf-only (the `session.ts` `cache()`
note already flags it — a broader request-scoped-dedup refactor, out of scope here).

## Change Log

| Date       | Version | Description                                          | Author |
| ---------- | ------- | ---------------------------------------------------- | ------ |
| 2026-06-06 | 0.1     | Story drafted (ultimate context engine).             | Scrum  |
| 2026-06-06 | 1.0     | Implemented Tasks 1–4; all gates green.              | Dev    |
| 2026-06-06 | 1.1     | Code-review: 3 items resolved; 169 tests green.      | Dev    |
