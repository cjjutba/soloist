---
baseline_commit: ecb8150abac0f7ac368ae58a9db218a14c629b58
---

# Story 2.2: Engagement Dashboard

Status: done

<!-- Note: Validation is optional. Run validate-create-story for a quality check before dev-story. -->

## Story

As a Freelancer,
I want to see all my Engagements at a glance — with status, last-activity, and a "needs curation" signal —
so that I know where my attention is needed without opening each one.

## Acceptance Criteria

1. **The dashboard reads at a glance, sorted to float "needs attention" up (FR-7, UX-DR8).**
   **Given** Engagements in my Tenant
   **When** I open the Cockpit home (`/app`)
   **Then** I see each Engagement with its **status** (Active/Paused/Completed/Archived) and its **last-activity** as a relative timestamp (the most recent of {candidate pulled, update published, Invoice sent, Client viewed} — for now this is `last_activity_at`, bumped on create/edit; Epic 3+ extends the sources),
   **And** the list is sorted by **last-activity (most recent first), then by candidate-count (most first)**, so the Engagements that need attention rise to the top.

2. **A candidate-count badge signals unpublished work; opening a row enters the tabbed detail shell.**
   **Given** the candidate-count badge component
   **When** an Engagement has unpublished candidates
   **Then** a **Soloist-Iris** pill shows the count (and is **absent at zero**, never "0") — it reads absent now and populates once Epic 3 produces candidate Ship Updates,
   **And** clicking a row navigates to the **tabbed Engagement-detail shell** at `/app/engagements/[id]` with tabs **Ship Feed (curation queue · default) · Repos · Client · Documents** — each a calm placeholder now, wired by Epics 3/5; editing details/archiving is reachable from the shell header.

## Tasks / Subtasks

- [x] **Task 1 — Last-activity rendering + dashboard sort + candidate-count seam** (AC: 1, 2)
  - [x] `src/lib/relative-time.ts`: a pure `formatRelativeTime(date: Date, now?: Date): string` → compact relative string (`just now`, `5m ago`, `3h ago`, `2d ago`, `3w ago`, `4mo ago`, `1y ago`); a future date clamps to `just now`. Use plain arithmetic (no new dep). Unit-test the bucket boundaries + future-clamp.
  - [x] In `engagements.repository.ts`, add a pure comparator `compareDashboard(a, b)` — sort key **`b.lastActivityAt - a.lastActivityAt`, then `b.candidateCount - a.candidateCount`** (both descending) — and `listDashboard(ctx)` that calls `listEngagements(ctx)` (active only, RLS-scoped), maps each row to `{ ...e, candidateCount: 0 }`, and returns them `.sort(compareDashboard)`. **Candidate-count seam:** leave a comment that Epic 3 replaces `0` with `COUNT(ship_updates WHERE engagement_id = e.id AND state = 'candidate')` (the `ship_updates` table does not exist yet — `0`/absent is correct now). Export `compareDashboard` + a `DashboardEngagement` type.
  - [x] Unit-test (PGlite, mock `../index`): `listDashboard` returns rows with `candidateCount: 0`, ordered by `last_activity_at` desc (seed distinct stamps). Separately unit-test `compareDashboard` with **synthetic non-zero counts** to prove the secondary key (equal last-activity → higher candidate-count first) and the last-activity primary key.
  - [x] Wire `src/app/app/page.tsx` to `listDashboard` (replaces `listEngagements`); render the **last-activity** per row as a relative timestamp in `font-mono text-xs text-muted-foreground` (the "Numeric — Geist Mono" rule, DESIGN L145).

- [x] **Task 2 — Candidate-count badge (Soloist Iris, absent at zero)** (AC: 2)
  - [x] Add `CandidateBadge({ count }: { count: number })` to `src/components/ui/badge.tsx`: **returns `null` when `count <= 0`** (zero state = absent, NOT "0" — DESIGN L179); else a small pill in **Soloist Iris `#5b5bd6`** with white text, the number in `font-mono`. **Use the static Iris (`bg-[#5b5bd6] text-white`), NOT `--tenant-accent`** — the Cockpit candidate badge is Soloist's own chrome, never the per-Tenant color (DESIGN L125/L134). Add an `aria-label` like `"3 updates need curation"`.
  - [x] Render `<CandidateBadge count={e.candidateCount} />` on each dashboard row (next to the status badge). It renders nothing now (all counts 0) — that's the correct empty state.

- [x] **Task 3 — Tabbed Engagement-detail shell** (AC: 2)
  - [x] `src/app/app/engagements/[id]/layout.tsx` (server): `requireFreelancer()` → UUID-guard `id` (bad → `notFound()`) → `getEngagement(ctx, id)` → `notFound()` if null. Render a header (engagement **name**, `StatusBadge`, `clientDisplayName`, an **Edit** link → `/app/engagements/[id]/edit`, and the `ArchiveButton`) + the tab nav + `{children}`. The layout guards the whole `[id]` subtree (the `edit` page keeps its own guard as defense-in-depth).
  - [x] `src/app/app/engagements/[id]/engagement-tabs.tsx` (client): a tab bar of `Link`s — **Ship Feed** (`/app/engagements/[id]`), **Repos** (`…/repos`), **Client** (`…/client`), **Documents** (`…/documents`) — using `usePathname()` to mark the active tab (active = accent underline/`text-foreground`, inactive = `text-muted-foreground`). ≥44px touch targets.
  - [x] `src/app/app/engagements/[id]/page.tsx` — the **Ship Feed (curation queue)** default tab: a calm placeholder ("Connect a repo to auto-pull updates, or write one by hand — arriving in Epic 3."). No data fetch (the layout already loaded the engagement).
  - [x] `…/[id]/repos/page.tsx`, `…/[id]/client/page.tsx`, `…/[id]/documents/page.tsx` — calm placeholders ("Repo connections — Epic 3.", "Invite your client — Epic 2.3.", "Invoices — Epic 5."). Each is a static server component.
  - [x] In `src/app/app/page.tsx`, change the row's primary `Link` target from `/app/engagements/[id]/edit` → **`/app/engagements/[id]`** (the shell). Keep the inline quick **Edit** (→ `/edit`) + **Archive** for at-a-glance actions.

- [x] **Task 4 — Gates + deploy** (AC: 1, 2)
  - [x] `npm run lint && npm run typecheck && npm test && npm run build` clean; no new Drizzle migration (this story adds **no** schema change — confirm `db:generate` says "nothing to migrate"). Don't regress the 115 prior tests.
  - [x] Deploy to Vercel production. Live smoke (signed-in freelancer): `/app` shows each Engagement with status + a relative last-activity, no `0` badge; clicking a row opens the detail shell; the four tabs switch and stay scoped; Edit/Archive still work from the shell header and the dashboard.

## Dev Notes

### Architecture compliance (what this story must honor)

[Source: architecture.md L36, L171, L208, L249, L344–L355]
- **The Engagement is the core aggregate; the Cockpit dashboard is its FR-7 surface with the candidate-count signal.** [L36] Data model is unchanged from 2.1: `Engagement — id, tenant_id, client_display_name, name, scope, status(active|paused|completed|archived), last_activity_at, created_at`. [L171] **No schema change in this story.**
- **`last_activity_at` is the sort/display key.** Architecture: the **publish** Server Action bumps `Engagement.last_activity_at` (L249); Epic 3+ adds candidate-pull / invoice-sent / client-viewed as the other sources. For 2.2 it is whatever 2.1 already maintains (create + every `updateEngagement`). Render it as a **relative timestamp** (UX: "shown as a relative timestamp (numeric)").
- **Reads go through the choke point.** The dashboard reads via the repository (`listDashboard` → `listEngagements` → `withTenant` → RLS). `requireFreelancer()` returns the `TenantContext`. No raw `db` in pages. [L208]
- **Route structure (architecture's intended shape):** `app/app/engagements/page.tsx` = FR-7 dashboard; `app/app/engagements/[engagementId]/{page,repos,client,documents}.tsx` = the detail tabs (curation queue / FR-9 / FR-5 / FR-16–18). [L344–L355] **Reconciliation:** Story 1.1/2.1 placed the dashboard at the Cockpit home `app/app/page.tsx` (path-based routing course-correction); 2.2 keeps the dashboard there and builds the detail shell at `app/app/engagements/[id]/` (using `[id]`, the param name already established by 2.1's `[id]/edit`). Same surfaces, one segment up — an intentional, documented variance.

### The dashboard model (UX — get the details right)

[Source: EXPERIENCE.md L31–L35, L104; DESIGN.md L125, L131, L134, L145, L179]
- **Engagement row** shows **name · status · last-activity · candidate-badge (when > 0)**; click → detail. Status enum **Active · Paused · Completed · Archived**. "Last-activity = the most recent of {candidate pulled, update published, Invoice sent, Client viewed}", relative timestamp. **Sort by last-activity, then candidate-count** so "needs attention" floats up. [EXPERIENCE L104]
- **Candidate-count badge** — **Cockpit only, Soloist Iris pill**, "N updates need curation". **Zero state: badge ABSENT, not "0."** [DESIGN L179] It is Soloist's own chrome — **the Cockpit never wears the Tenant accent**; `primary` stays Soloist Ink and Iris appears only as Soloist chrome like this badge. [DESIGN L125/L134] Iris `#5b5bd6` is a brand constant (= `DEFAULT_ACCENT` in `contrast.ts`, = `--ring`). Hardcode it for this badge (`bg-[#5b5bd6]`) — do **not** read `--tenant-accent` (that's the runtime per-Tenant color).
- **Numeric = Geist Mono, 14px** — counts and relative timestamps render in `font-mono` (the project exposes `--font-mono`; `font-mono` class works). [DESIGN L145]
- **Engagement detail = a tabbed working surface:** Ship Feed (curation queue) · Repo Connections · Client (status, invite) · Documents (Invoices). The curation queue is the default tab. [EXPERIENCE L32–L35] All four are placeholders in 2.2; they get built in Epics 3 (feed/repos), 2.3 (client invite), 5 (documents).
- **Tabs primitive:** DESIGN lists shadcn `Tabs` as "use as-is" — but here the tabs are **separate routes** (architecture L351–L355), so implement them as **route-based `Link` tabs** (active via `usePathname`), not Radix `Tabs` state. No new dependency.

### Previous-story intelligence (Stories 2.1, 1.6, 1.4 — read first)

- **2.1 already shipped the list + primitives this story extends:** `src/app/app/page.tsx` (the list — status badge, inline Edit/Archive, empty state), `src/components/ui/badge.tsx` (`StatusBadge` + exported `STATUS_LABELS`), `engagements.repository.ts` (`listEngagements` orders by `last_activity_at desc`, hides archived), `[id]/edit/page.tsx` (+ `engagement-form.tsx`, `archive-button.tsx`). Reuse them — do NOT re-implement. `ArchiveButton` takes an optional `redirectTo`.
- **Pages read repos directly** (`/app/page.tsx` imports `getTenant`/`listEngagements`; `[id]/edit` imports `getEngagement`) — that's the established convention; the detail layout does the same (`getEngagement`). The feature-module actions are for *mutations*.
- **`requireFreelancer()`** (`@/server/auth/session`) returns the freelancer principal which **is** a `TenantContext`. The `/app` layout guards the subtree; the new `[id]/layout.tsx` self-guards (and is itself the guard for its tab pages — but the 2.1 review added a UUID guard on the edit page, so mirror that `notFound()` on a malformed id in the layout).
- **The Cockpit is Soloist-branded — never the Tenant accent.** Use design tokens, never hardcode hex — **except** the candidate badge's Soloist Iris, which is a deliberate brand constant (note it inline).
- **Tests are logic/PGlite only** — the repo has **no** `@testing-library/react` and vitest runs `environment: "node"`. Do NOT add React render tests; keep coverage on pure helpers (`formatRelativeTime`, `compareDashboard`) + the PGlite repo query (the established `vi.mock("../index")` + PGlite pattern). Pure utils + their tests live under `src/lib/` (see `slug.ts` + `src/lib/__tests__/`).
- **Gates** include the CI **migration-drift** step — but this story adds no schema, so `db:generate` must report "nothing to migrate" (if it wants to emit anything, something drifted — stop and investigate). Don't regress the 115 prior tests.

### Project Structure Notes

- **New:** `src/lib/relative-time.ts` (+ `src/lib/__tests__/relative-time.test.ts`); `src/app/app/engagements/[id]/layout.tsx`, `…/[id]/engagement-tabs.tsx`, `…/[id]/page.tsx`, `…/[id]/repos/page.tsx`, `…/[id]/client/page.tsx`, `…/[id]/documents/page.tsx`.
- **Modified:** `src/server/db/repositories/engagements.repository.ts` (+ `compareDashboard`, `listDashboard`, `DashboardEngagement`); `src/server/db/__tests__/engagements.repository.test.ts` (+ dashboard tests); `src/components/ui/badge.tsx` (+ `CandidateBadge`); `src/app/app/page.tsx` (last-activity + candidate badge + row → shell + `listDashboard`).
- **Do NOT:** add a schema/migration; apply the Tenant accent to the Cockpit; build real curation/repo/invoice behavior (placeholders only — Epics 3/2.3/5); introduce Radix `Tabs` (route-based Links); add a `ship_updates` table (Epic 3) — `candidateCount` is a literal `0` seam.
- **Watch:** `[id]/layout.tsx` wraps **all** `[id]` children including the existing `edit` page — confirm the edit flow still works rendered inside the shell (header + tabs above the form is acceptable; the tab bar simply shows no active tab on `/edit`).

### Testing requirements

- **`formatRelativeTime`** — bucket boundaries (`<60s` → "just now"/seconds, minutes, hours, days, weeks, months, years) and a **future date clamps to "just now"** (deterministic: pass a fixed `now`, since `Date.now()` is the only nondeterminism).
- **`compareDashboard`** — primary last-activity desc; **secondary candidate-count desc on equal last-activity** (use synthetic non-zero counts — the only way to exercise the secondary key before Epic 3).
- **`listDashboard`** (PGlite, `vi.mock("../index")`) — returns active engagements with `candidateCount: 0`, ordered newest-activity first; archived excluded (inherits `listEngagements`).
- **Live smoke** — `/app` relative timestamps + no `0` badge; row → shell; tab switching; Edit/Archive intact.
- Don't regress the 115 prior tests.

### References

- [Source: epics.md#Story 2.2 (Engagement Dashboard) + #Story 2.1 + Epic 2 intro]
- [Source: architecture.md L36 (Engagements/dashboard), L171 (Engagement model), L208 (Server Actions), L249 (publish bumps last_activity_at), L344–L355 (route structure)]
- [Source: EXPERIENCE.md L31–L35 (IA: home + tabbed detail), L104 (Engagement row: fields, status enum, last-activity definition, sort)]
- [Source: DESIGN.md L125/L134 (Cockpit never wears Tenant accent; Iris as Soloist chrome), L145 (Numeric = Geist Mono), L179 (candidate-badge: Iris pill, absent at zero), L172 (Tabs from shadcn)]
- [Source: src/app/app/page.tsx; src/components/ui/badge.tsx; src/server/db/repositories/engagements.repository.ts; src/app/app/engagements/[id]/edit/page.tsx; src/server/auth/session.ts; src/lib/slug.ts (pure-util + test pattern); src/app/globals.css (tokens)]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (1M context)

### Debug Log References

- The `[id]/layout.tsx` would have wrapped the existing `[id]/edit` page (from 2.1),
  nesting `<main>` in `<main>` and showing a redundant header/Archive while editing.
  Resolved by moving the shell into a **`(detail)` route group** — the layout wraps only
  the tab routes; `edit` stays standalone. Route groups are invisible in the URL, so every
  path is unchanged (`/app/engagements/[id]`, `…/repos`, `…/edit`).

### Completion Notes List

- **Task 1** — `src/lib/relative-time.ts` (`formatRelativeTime`, pure, future-clamped) +
  8-case test. `compareDashboard` (pure, exported) + `listDashboard` (active engagements,
  `candidateCount: 0` seam for Epic 3, sorted last-activity→candidate-count) in the repo.
  Dashboard repo tests prove the primary + **secondary** sort keys and the 0-count seam.
  `/app` now renders each row's last-activity as a `font-mono` relative timestamp.
- **Task 2** — `CandidateBadge` in `badge.tsx`: **absent at zero**, static **Soloist Iris
  `#5b5bd6`** (never `--tenant-accent`), count in `font-mono`, `aria-label`. Renders nothing
  now (all counts 0) — the correct empty state.
- **Task 3** — tabbed detail shell under a `(detail)` route group: `layout.tsx` (guard +
  UUID check + `getEngagement` → notFound; header with name/status/client + Edit + Archive),
  `engagement-tabs.tsx` (client, route-based tabs via `usePathname`, ≥44px), Ship Feed
  default `page.tsx` + `repos`/`client`/`documents` placeholders (shared `TabPlaceholder`).
  Dashboard rows now open the shell (`/app/engagements/[id]`); inline Edit/Archive kept.
- **Task 4** — gates clean: typecheck ✓, lint ✓, **126 tests** ✓ (115 + 11 new), build ✓
  (all 5 detail routes emitted; `(detail)` group invisible), no schema drift.

### File List

**New:**
- `src/lib/relative-time.ts`
- `src/lib/__tests__/relative-time.test.ts`
- `src/lib/uuid.ts` (review: shared `isUuid` — de-dups the route guards)
- `src/lib/__tests__/uuid.test.ts`
- `src/app/app/engagements/[id]/(detail)/layout.tsx`
- `src/app/app/engagements/[id]/(detail)/engagement-tabs.tsx`
- `src/app/app/engagements/[id]/(detail)/tab-placeholder.tsx`
- `src/app/app/engagements/[id]/(detail)/page.tsx`
- `src/app/app/engagements/[id]/(detail)/repos/page.tsx`
- `src/app/app/engagements/[id]/(detail)/client/page.tsx`
- `src/app/app/engagements/[id]/(detail)/documents/page.tsx`

**Modified:**
- `src/server/db/repositories/engagements.repository.ts` (+ `DashboardEngagement`, `compareDashboard`, `listDashboard`)
- `src/server/db/__tests__/engagements.repository.test.ts` (+ dashboard sort/list tests)
- `src/components/ui/badge.tsx` (+ `CandidateBadge`)
- `src/app/app/page.tsx` (dashboard: `listDashboard` + last-activity + candidate badge + row → shell)
- `src/app/app/engagements/[id]/edit/page.tsx` (review: use shared `isUuid`; note it self-guards)

## Senior Developer Review (AI)

**Outcome:** Approved (changes applied). xhigh review, 9 finder angles. The structural
change (a `(detail)` route group so the tabbed shell wraps only the tab routes while
`[id]/edit` stays standalone) verified sound: route resolution is correct (the group is
URL-invisible), async `params` awaited, one `<main>` per route, clean server/client split,
`aria-current` on the active tab, ≥44px touch targets, no `--tenant-accent` in the Cockpit.

**Action items resolved:**

1. **[Med] `CandidateBadge` didn't fail closed on NaN** (`NaN <= 0` is false → would render
   "NaN"). Changed to `!(count > 0)`. (latent — count is 0 until Epic 3, but the badge is
   the seam Epic 3 wires.)
2. **[Low] `aria-label` subject-verb agreement** at count = 1 ("1 update **need**…"). Fixed
   to "update needs / updates need".
3. **[Low] `formatRelativeTime` rendered "NaNy ago"** for an invalid Date. Added a
   `Number.isFinite` clamp + test.
4. **[Med — doc] The `(detail)/layout.tsx` comment falsely claimed it guards `edit`.** A
   route-group layout does NOT wrap a sibling route — `[id]/edit` self-guards as its
   *primary* guard. Corrected the comment in both files (a "loaded gun" for a future dev).
5. **[Cleanup] `UUID_RE` duplicated 3×** — extracted `src/lib/uuid.ts` `isUuid()` (+ test),
   used in the detail layout and the edit page.
6. **[Low — a11y] Last-activity was a lossy relative string only** — wrapped in
   `<time dateTime title>` (stable UTC ISO, hydration-safe) so AT/hover get the exact moment.
7. **[Low] Tab active-match was exact-only** — made section tabs prefix-aware so Epic 3's
   nested routes (e.g. `/repos/[repoId]`) keep the tab highlighted.

**Noted, not changed:** the hardcoded Iris `#5b5bd6` is deliberate (the Cockpit badge must
stay Soloist Iris even after a Tenant customizes — coupling to `--tenant-accent`/`--ring`
would be wrong; the comment documents it); the `getTenant` ghost-check round-trip is the
established 2.1 pattern; hand-rolled relative-time is justified (compact `2mo ago` mono
format, not `Intl`'s "2 months ago"); row → placeholder Ship Feed is the intended shell
destination (the `candidateCount` `0` seam + placeholders are Epic-3 forward wiring).

## Change Log

| Date       | Version | Description                                          | Author |
| ---------- | ------- | ---------------------------------------------------- | ------ |
| 2026-06-06 | 0.1     | Story drafted (ultimate context engine).             | Scrum  |
| 2026-06-06 | 1.0     | Implemented Tasks 1–4; all gates green.              | Dev    |
| 2026-06-06 | 1.1     | xhigh code-review: 7 items resolved; 129 tests green.| Dev    |
