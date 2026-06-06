---
baseline_commit: 9b6b563
---

# Story 2.6: Client Portal Shell + Empty Ship Feed

Status: done

<!-- Note: Validation is optional. Run validate-create-story for a quality check before dev-story. -->

## Story

As a Client,
I want a branded, intentional portal home even before any updates exist,
so that my first impression is premium, not a blank screen.

## Acceptance Criteria

1. **A calm, branded empty Ship Feed (UX-DR13).**
   **Given** the Client Portal post-Onboarding
   **When** I view the home (`/portal`) with no published updates yet
   **Then** I see the **calm empty state** — a serif (display) reassurance "{Tenant} is getting set up. Your first update will land here soon." — with the Tenant branding, **never** "no data."

2. **A minimal, mobile-first, thumb-reachable shell (UX-DR17, UX-DR15).**
   **Given** any Client Portal surface
   **Then** the portal is **single-column, mobile-first** (`max-w-2xl` centered, `portal-gutter` margins) with **minimal nav — Updates · Documents · a bell · an avatar** (two destinations max + the bell + the avatar; no dashboards, no tabs to learn), every interactive element has a **≥44px hit area**, and the avatar menu lets me **log out**.

3. **The portal is onboarding-gated and each surface has a designed empty state.**
   **Given** I haven't completed Onboarding
   **When** I open any portal surface
   **Then** I'm routed to the Onboarding hero first; and **Documents** + the **notification center** each show a calm designed empty state ("No documents yet." / "You're all caught up.") — never a blank.

## Tasks / Subtasks

- [x] **Task 1 — `requireOnboardedClient()` gate helper** (AC: 3)
  - [x] In `src/server/auth/session.ts`, add `requireOnboardedClient(): Promise<ClientSession>` = `requireClient()` then `if (!session.onboardedAt) redirect("/portal/onboarding")`. Every portal surface EXCEPT the onboarding hero uses it (so Onboarding is enforced before Documents/Notifications/Feed, not just the feed). The `/portal/onboarding` page keeps `requireClient` + its own opposite check (no loop). The portal **layout** keeps plain `requireClient` (guard + branding only — it must NOT redirect to onboarding, or it would loop with the onboarding page it wraps).
  - [x] Test (extend `session.test.ts`): a client with `onboardedAt` set → `requireOnboardedClient` returns the ctx; `onboardedAt` null → redirects to `/portal/onboarding`; non-client → notFound; anon → /login.

- [x] **Task 2 — The portal shell (layout chrome + nav)** (AC: 2)
  - [x] Update `src/app/portal/layout.tsx` (keep the 2.5 branding + guard): wrap children in the shell — a sticky top **header** (Tenant **logo** or name wordmark on the left, the `<PortalNav>` on the right) + a single-column **`<main className="mx-auto w-full max-w-2xl px-5 …">`** content area (`portal-gutter` = `px-5`/20px). Resolve `getBranding`/`getTenant` once (already done for branding) and pass `{ logoUrl, tenantName, monogram }` + the session `{ name, email }` to `<PortalNav>` as props (no re-fetch in the nav).
  - [x] `src/app/portal/portal-nav.tsx` (client): **Updates** (`/portal`) + **Documents** (`/portal/documents`) nav links (active via `usePathname`), a **bell** icon-link (`/portal/notifications`), and an **avatar** menu (the Client's initial; a hand-rolled dropdown — `useState` open + an outside-click/`Esc` close, no new dep) showing the email + a **Log out** action (reuse the `signOut` pattern from `app/logout-button.tsx` → on success `router.push("/")`). Icons from `lucide-react`. **Every control ≥44px hit area** (`min-h-11 min-w-11` / generous padding). The bell/avatar wear the re-scoped `--primary` (Tenant accent) where appropriate (active states), per DESIGN.
  - [x] a11y: the nav is a `<nav aria-label="Portal">`; the active link has `aria-current="page"`; the avatar trigger has an accessible label + `aria-expanded`; the menu traps nothing heavy but closes on `Esc` and returns focus to the trigger.

- [x] **Task 3 — The branded empty Ship Feed** (AC: 1)
  - [x] Replace the `src/app/portal/page.tsx` 2.5 scaffold: `const session = await requireOnboardedClient()` → resolve the Tenant name (`getTenant(session)`) → render the **empty feed**: a focus-on-mount `<h1>` (reuse the `WelcomeHeading` focus pattern — extract a shared `FocusHeading` if cleaner) in **`font-display`** (serif), copy **"{Tenant} is getting set up. Your first update will land here soon."**, calm + centered, with the Tenant brand context (the accent/logo already on the shell). An `aria-live="polite"` region placeholder is fine (no live updates until Epic 3) — keep the structure minimal. **Never "no data."**

- [x] **Task 4 — Documents + Notifications empty placeholders** (AC: 3)
  - [x] `src/app/portal/documents/page.tsx`: `requireOnboardedClient()` → a calm empty state "**No documents yet.**" (quiet, no CTA — the Client can't create one; EXPERIENCE L124), `font-display` h1 focused on mount, single column.
  - [x] `src/app/portal/notifications/page.tsx`: `requireOnboardedClient()` → a calm empty state "**You're all caught up.** New updates and invoices will show here." (the route-based notification center per EXPERIENCE L157; Epic 4 fills it), h1 focused.
  - [x] A shared `src/app/portal/portal-empty.tsx` (server component) for these calm empty states (title + body, centered, `font-display` title, focus-on-mount) — used by the feed/documents/notifications so the "designed empty state" is one component, not three copies.

- [x] **Task 5 — Tests + gates + deploy** (AC: 1, 2, 3)
  - [x] `requireOnboardedClient` tests (Task 1). No new component-render tests (the repo has none / vitest is `node`); the shell/empty states are covered by the live smoke + the build. Don't regress the 169 prior tests.
  - [x] `npm run lint && npm run typecheck && npm test && npm run build` clean. **No schema change** (confirm `db:generate` says nothing to migrate). 
  - [x] Deploy. Live smoke (the Client account): after Onboarding, `/portal` shows the branded empty feed (Tenant name/accent, serif copy, not "no data"); the nav (Updates · Documents · bell · avatar) is present, mobile-first single-column, tappable; **Documents** → "No documents yet."; the **bell** → "You're all caught up."; the **avatar** → Log out works (→ landing); an un-onboarded direct hit on `/portal/documents` → redirected to Onboarding; a Freelancer session still can't reach `/portal`.

## Dev Notes

### Architecture compliance

[Source: architecture.md L222, L251, L358–L362; EXPERIENCE.md L21, L41, L52]
- **Mobile-first, Tenant-branded, deliberately minimal.** "The Client Portal is a *reading* surface, not a project-management cockpit. No charts, burndowns, or backlogs." Single column, `max-w-2xl` centered (DESIGN L153). Navigation is **two destinations max (Ship Feed + Documents) plus the bell and avatar** [EXPERIENCE L52] — do NOT add a dashboard.
- **Branding is already wired (Story 2.5):** the portal layout sets `--tenant-accent*` + re-scopes `--primary` → the accent. This story adds the shell CHROME inside that branded root. The Cockpit is never touched.
- **Route structure** [architecture L358–L362]: `app/portal/page.tsx` (Ship Feed home), `app/portal/documents/page.tsx` (invoice view — Epic 5), `app/portal/onboarding/page.tsx` (done, 2.5). The notification center is a **route** (`app/portal/notifications`) — "the mobile fullscreen notification center even if it's a route" [EXPERIENCE L157].
- **The feed itself is empty by construction** until Epic 3 publishes ShipUpdates (no `ship_updates` table yet — this story renders the empty state, not a feed query). The live feed transport (poll `GET /api/feed/[engagementId]`) is Epic 3 [architecture L251] — **do not build it here**.
- **Guard discipline (NFR-2):** every `/portal/*` route nests under the guarded layout AND self-guards (`requireOnboardedClient`/`requireClient`) — the positional-guard rule from `session.ts`. `requireClient()` returns the engagement-scoped `TenantContext`; reads go through the repos.

### The UX (premium empty states + a11y)

[Source: EXPERIENCE.md L41, L46, L48–L52, L86, L115, L120, L124, L144, L157–L159; DESIGN.md L125, L153]
- **Empty Ship Feed** (the headline, most-seen day-one state): `display-sm` **serif** reassurance — **"{Tenant} is getting set up. Your first update will land here soon."** Calm, branded, **never "no data."** [L120/L86] "Empty and error states carry the premium weight — they're where cheap products feel cheap." [L115]
- **Documents empty:** "No documents yet." — quiet, **no CTA** (the Client can't create one). [L124] **Notifications empty:** calm "all caught up." [L109/L157]
- **Nav vocabulary:** Ship Feed (home) · Documents (one affordance) · bell (notification center) · avatar (account: password/notif toggle — the menu only needs **Log out** in v1). [L46–L52]
- **a11y (the floor):** **≥44px touch targets** on every Client interactive element (bell, avatar, nav, close) — padding may exceed the visual size. [L159] On route change move focus to the new view's `<h1>`; **one `<main>` landmark per surface**. [L158] Visible focus rings (the accent ring, or Soloist Ink when the accent fails 3:1 — `resolveBrandingVars.focusRingFallback` already computes this). No hover-only affordances on touch. [L144/L157]
- **Brand:** logo (or the Tenant-initial **monogram** fallback from `resolveBrandingVars`) in the header; the accent is already on the root. [L73]

### Previous-story intelligence (Stories 2.5, 2.4, 1.6 — read first)

- **2.5 wired the branded layout + the onboarding gate this story extends:** `src/app/portal/layout.tsx` already resolves `getTenant`/`getBranding` → `resolveBrandingVars` → sets `--tenant-accent*` + re-scopes `--primary`. `requireClient()` (`session.ts`) returns `ClientSession` (with `onboardedAt`). `/portal/page.tsx` currently gates on `onboardedAt` + shows a scaffold — replace the scaffold with the empty feed (and move the gate into `requireOnboardedClient`). The `WelcomeHeading` (`onboarding/welcome-heading.tsx`) is the focus-on-mount pattern to reuse/generalize.
- **Logout:** `app/logout-button.tsx` shows the `signOut` (`@/server/auth/client`) pattern — `signOut()` → check `error` → `router.push("/")` + `refresh()`. The avatar menu reuses it (push to `/` is fine for a client).
- **UI kit + icons:** `lucide-react` is installed (icons for bell/menu/chevron). `Button`/`buttonVariants`/`Card` exist; **no shadcn DropdownMenu/Popover + no `@radix-ui`** — hand-roll the avatar dropdown (a `"use client"` toggle + a full-screen transparent backdrop button to close on outside-click + an `Esc` handler). Design tokens only (the accent is `--tenant-accent`/the re-scoped `--primary`); the logo is a plain `<img>` (blob host not in `next.config` — matches branding-form/invite). `sonner` is global.
- **No schema change** — this story is pure UI + a session helper. Gates still run the migration-drift step (it must say "nothing to migrate"). Don't regress the 169 tests.

### Project Structure Notes

- **New:** `src/app/portal/portal-nav.tsx` (client shell nav + avatar menu), `src/app/portal/portal-empty.tsx` (shared calm empty state), `src/app/portal/documents/page.tsx`, `src/app/portal/notifications/page.tsx`.
- **Modified:** `src/server/auth/session.ts` (+ `requireOnboardedClient`); `src/server/auth/__tests__/session.test.ts`; `src/app/portal/layout.tsx` (+ shell header/nav + single-column main); `src/app/portal/page.tsx` (scaffold → empty feed via `requireOnboardedClient`). Optionally generalize `onboarding/welcome-heading.tsx` → a shared `FocusHeading` (or keep both — your call; one focus-on-mount heading is cleaner).
- **Do NOT:** build the live Ship Feed / poll / `ship_updates` (Epic 3), real Invoices (Epic 5), or the real notification center (Epic 4) — all are designed EMPTY states here; add `@radix-ui`/a heavy menu lib (hand-roll); let the Cockpit wear the accent; add a dashboard/charts to the portal; introduce a schema change.
- **Watch:** the onboarding gate must live in `requireOnboardedClient` used by the pages (feed/documents/notifications), NOT in the layout (the layout wraps `/portal/onboarding`, so a layout redirect would loop). One `<main>` per surface (the layout provides the single-column `<main>`; the pages render content INTO it — do NOT nest a second `<main>`).

### Testing requirements

- **`requireOnboardedClient`** (session.test.ts) — onboarded client → ctx; un-onboarded → redirect `/portal/onboarding`; non-client → notFound; anon → /login.
- **Live smoke** — empty feed (branded, serif, not "no data"); nav present + mobile single-column + tappable; Documents/Notifications empty states; avatar Log out; un-onboarded → onboarding; Freelancer can't reach `/portal`.
- No component-render tests (codebase has none; vitest `node`). Don't regress the 169 prior tests.

### References

- [Source: epics.md#Story 2.6 + #Story 2.5 + Epic 2 intro (closes Epic 2)]
- [Source: architecture.md L222 (portal branding), L251 (feed = poll, Epic 3), L358–L362 (portal route structure)]
- [Source: EXPERIENCE.md L21/L41 (mobile-first, minimal), L46–L52 (nav: Feed·Documents·bell·avatar, two-destinations-max), L86/L120 (empty-feed copy), L115/L124 (designed empty states), L144/L157–L159 (touch ≥44px, focus the h1, one main, route announce)]
- [Source: DESIGN.md L125 (accent on Client surfaces, re-scope primary), L153 (mobile-first single column max-w-2xl)]
- [Source: src/app/portal/{layout,page}.tsx + onboarding/* (2.5 — the branded root + focus-on-mount to extend); src/server/auth/session.ts (requireClient/ClientSession/onboardedAt); src/app/app/logout-button.tsx (signOut pattern); src/server/branding/branding-vars.ts; lucide-react]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (1M context)

### Debug Log References

- Moving the shell pages into the `(shell)` route group left a STALE `.next/types/validator.ts`
  referencing the old `portal/page.tsx` → a phantom typecheck error. A fresh `npm run build`
  regenerates the route types; typecheck is clean after.

### Completion Notes List

- **Task 1** — `requireOnboardedClient()` in `session.ts` (requireClient → redirect to the hero
  if `!onboardedAt`). 3 new session tests.
- **Task 2** — the shell via a **`(shell)` route group** (so the full-screen Onboarding hero
  stays OUTSIDE the chrome): `(shell)/layout.tsx` = sticky header (brand logo/wordmark +
  `PortalNav`) + single-column `max-w-2xl` `<main>`; `portal-nav.tsx` (client) = Updates ·
  Documents · bell · avatar menu (hand-rolled dropdown, Esc-close + focus-return, ≥44px,
  focus rings, lucide icons, `signOut`). The `(shell)` layout is the single onboarding gate.
- **Task 3** — `(shell)/page.tsx` = the branded empty Ship Feed ("{Tenant} is getting set up…").
- **Task 4** — `(shell)/documents` + `(shell)/notifications` empty placeholders; shared
  `portal-empty.tsx` + a generalized `FocusHeading` (replaces 2.5's `WelcomeHeading`).
- **Task 5** — gates clean: typecheck ✓, lint ✓, **172 tests** ✓ (+3), build ✓, **no schema change**.

### File List

**New:**
- `src/components/ui/focus-heading.tsx` (shared focus-on-route heading)
- `src/app/portal/portal-empty.tsx`
- `src/app/portal/(shell)/layout.tsx`, `(shell)/portal-nav.tsx`, `(shell)/page.tsx`, `(shell)/documents/page.tsx`, `(shell)/notifications/page.tsx`

**Modified:**
- `src/server/auth/session.ts` (+ `requireOnboardedClient`)
- `src/server/auth/__tests__/session.test.ts`
- `src/app/portal/onboarding/page.tsx` (use shared `FocusHeading`)

**Removed:** `src/app/portal/onboarding/welcome-heading.tsx` (→ generalized `FocusHeading`).
**Moved:** `portal/{page,documents/page,notifications/page}.tsx` → `portal/(shell)/…` (URLs unchanged).

## Senior Developer Review (AI)

**Outcome:** Approved (changes applied). 2-angle review. The headline — the `(shell)` route-group
guard restructure — verified **sound**: an un-onboarded Client is redirected to the hero before
any shell chrome (the `(shell)` layout's `requireOnboardedClient` runs first); the Onboarding hero
lives outside the group (no nav, no loop — it checks the opposite condition); a freelancer/anon
gets a clean `notFound()`/`/login` on every portal route; exactly one `<main>` per surface; no
schema change; no Cockpit accent leak.

**Action items resolved (all a11y, several spec-named):**

1. **[a11y] `FocusHeading` didn't re-fire on in-shell navigation** — the `(shell)` layout persists,
   so Updates→Documents reused the node and the mount-only effect never re-ran, leaving focus
   stale. Now depends on `pathname` → re-focuses the heading on every route change.
2. **[a11y] The avatar menu didn't return focus to the trigger on Esc** (the spec names this) —
   added a `triggerRef` and focus it on Esc-close.
3. **[a11y] No visible focus rings** on the hand-rolled controls (the spec requires them) — added
   the standard `focus-visible` ring to every nav link, the bell, the avatar trigger, and Log out.
4. **[a11y] `role="menu"` with a non-menuitem `<p>` child** overstated the ARIA pattern (no roving
   focus implemented) — simplified to a plain labelled popover.
5. **[Low branding] The active bell used Ink** instead of the accent — now `text-primary` (the
   re-scoped Tenant accent), matching the avatar.

**Noted, not changed (judged):** the per-render read fan-out (the `(shell)` layout + leaf-page
double-gate + duplicate `getTenant`/`getBranding`) is perf-only — the `session.ts` `cache()` note
already flags a request-scoped dedup as the right future fix; exact-match active-link logic is
correct for the current flat portal routes.

## Change Log

| Date       | Version | Description                              | Author |
| ---------- | ------- | ---------------------------------------- | ------ |
| 2026-06-06 | 0.1     | Story drafted (ultimate context engine). | Scrum  |
| 2026-06-06 | 1.0     | Implemented Tasks 1–5; all gates green.              | Dev    |
| 2026-06-06 | 1.1     | Code-review: 5 a11y/branding items resolved; 172 tests.| Dev    |
