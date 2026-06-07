---
baseline_commit: c2da41b
---

# Story 3.7: Client Ship Feed (Live via Polling)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Client,
I want a live, status-tagged feed of published updates,
so that I see momentum the moment it happens, on my phone (FR-14, NFR-5, UX-DR5/15, AR-10).

## Acceptance Criteria

1. **The published feed — newest-first cards, filterable, privacy-safe (FR-14, UX-DR5, NFR-2/3).**
   **Given** published updates on my Engagement
   **When** I open the `/portal` Ship Feed
   **Then** I see **only published** updates, newest-first, as read-only **Ship Update cards** (status tag ✅/🚧/📦 + plain-English title + 1–2 line summary + relative time), **filterable by status** (All / Shipped / In Progress / Next). I **never** see source code, raw repo contents, candidates, dismissed updates, or another Engagement's data. Before the first publish, a calm **branded empty state** ("{Tenant} is getting set up. Your first update will land here soon.").

2. **Live via polling — ~30 s, announced, motion-safe (AR-10, NFR-5, UX-DR15).**
   **Given** the polling transport
   **When** a new update is published while I'm viewing
   **Then** the feed refreshes within ~30 s (TanStack Query `GET /api/feed/[engagementId]` at a ~20 s interval **+ on window focus**, paused while the tab is hidden), the new card appears at the top **announced via `aria-live="polite"`** ("New update: {title}, {status label}") **without moving keyboard focus**, and its entrance **honors `prefers-reduced-motion`** (animates under `motion-safe`, instant under reduce).

## Tasks / Subtasks

- [x] **Task 1 — The authz-scoped feed Route Handler (the poll endpoint)** (AC: 1, 2)
  - [x] `src/app/api/feed/[engagementId]/route.ts` (NEW): `export const runtime = "nodejs"` (DB via the Neon pool). `GET(req, { params })` — resolve the session with **`getAppSession()`** (it already calls `auth.api.getSession` + resolves role/engagementId, and does NOT redirect — route handlers can't); **401** if no session; **403** if `role !== "client"` or no `engagementId`, OR if `params.engagementId !== session.engagementId` (a Client can only poll their OWN feed — defense-in-depth atop RLS); else `listPublishedUpdates(session, session.engagementId)` → `Response.json({ updates })`. The `publishedAt` `Date` serializes to an ISO string through `Response.json`. This is the codebase's FIRST authenticated Route Handler — mirror the `runtime`/`Response` shape of `api/webhooks/github/route.ts`.
  - [x] **Test** (`src/app/api/feed/[engagementId]/__tests__/route.test.ts`, mock `getAppSession` + `listPublishedUpdates`): no session → 401; a freelancer / a client with no engagement → 403; a client whose `engagementId` ≠ the path param → 403 (can't poll another engagement); a client polling their own → 200 with `{ updates: [...] }`. (The privacy of `listPublishedUpdates` itself — no candidates/raw_meta — is already proven in `ship-update.repository.test.ts` from 3.6.)

- [x] **Task 2 — Pure feed helpers (filter + new-item announcement)** (AC: 1, 2)
  - [x] `src/app/portal/(shell)/feed.ts` (NEW, pure + node-testable): export `type FeedUpdate = { id: string; statusTag: string; title: string; summary: string | null; publishedAt: string | null }` (publishedAt is the ISO string from the route/RSC). `filterUpdates(updates, filter: "all" | ShipStatus)` → the status-filtered list (filter via `toShipStatus` so an unknown tag is bucketed, never dropped). `newTopAnnouncement(prevTopId: string | null, updates: FeedUpdate[], statusLabel: (tag) => string)` → an announcement string ("New update: {title}, {label}") when `updates[0]` is a NEW id (and `prevTopId` was set — not the first render), else `null`. Keep ALL detection math here so it's unit-tested without a DOM.
  - [x] **Test** (`src/app/portal/(shell)/__tests__/feed.test.ts`): `filterUpdates` returns only matching-status items for each filter and the whole list for "all"; an unknown statusTag is bucketed to `in_progress` (not dropped). `newTopAnnouncement` returns null on first render (prevTopId null) and when the top is unchanged; returns the formatted string when a new id is at the top.

- [x] **Task 3 — The read-only Ship Update card** (AC: 1)
  - [x] `src/app/portal/(shell)/ship-update-card.tsx` (NEW): a presentational read-only card (the DESIGN ship-update-card anatomy — Paper fill, warm border, rounded-lg): `<ShipStatusTag status>` (top), the plain-English **title** (`font-medium`), the 1–2 line **summary** (`text-muted-foreground`), and the relative timestamp (`<time>` `font-mono`, `formatRelativeTime(new Date(publishedAt))` — guard a null `publishedAt`). **No edit/dismiss/publish affordances** (this is the Client surface — read-only). **Never render `raw_meta`** (it isn't even in `FeedUpdate`). Reuse `ShipStatusTag` (`@/components/ui/ship-status-tag`) + `formatRelativeTime` (`@/lib/relative-time`).

- [x] **Task 4 — The polling feed client island** (AC: 1, 2)
  - [x] `src/app/portal/(shell)/ship-feed.tsx` (NEW, `"use client"`): props `{ engagementId, initialUpdates: FeedUpdate[], tenantName: string }`. **`useQuery`** (the codebase's first) `{ queryKey: ["feed", engagementId], queryFn: () => fetch(\`/api/feed/${engagementId}\`).then(r => { if (!r.ok) throw…; return r.json() }).then(d => d.updates as FeedUpdate[]), initialData: initialUpdates, refetchInterval: 20_000 }` — `refetchOnWindowFocus` is inherited from `providers.tsx` (true); `refetchInterval` auto-pauses while the tab is hidden (the default), meeting "paused when hidden". Render: a **status filter** (segmented All/✅/🚧/📦 buttons, `aria-pressed`, local `useState`) → `filterUpdates(data, filter)` → a list of `<ShipUpdateCard>`; when the (unfiltered) list is empty, the **branded empty state** (reuse `PortalEmpty` / `FocusHeading`: "{tenantName} is getting set up. Your first update will land here soon."); when filtered-empty but unfiltered-non-empty, a calm "No {label} updates yet." A visually-hidden `aria-live="polite"` region driven by `newTopAnnouncement(prevTopId, data, …)` (track `prevTopId` in a ref; update it after announcing — **do not move focus**). New cards animate in under `motion-safe:` (use `tailwindcss-animate`'s `animate-in fade-in slide-in-from-top-2` if present, else a small `@keyframes` in `globals.css`); `motion-reduce` → instant. Use the existing `useState`/`useRef` idiom (no new state lib).
  - [x] `src/app/portal/(shell)/page.tsx` (MODIFY): `const session = await requireOnboardedClient();` → `const [rows, tenant] = await Promise.all([listPublishedUpdates(session, session.engagementId), getTenant(session)]);` → map `rows` → `FeedUpdate[]` (`publishedAt: r.publishedAt?.toISOString() ?? null`) → `const tenantName = tenant?.name?.trim() || "Your freelancer";` → render `<ShipFeed engagementId={session.engagementId} initialUpdates={updates} tenantName={tenantName} />`. **Always mount `ShipFeed`** (even when empty) so polling continues from the empty state → the first update appears live (the empty state lives INSIDE the island, SSR'd on first paint for fast mobile). Keep `requireOnboardedClient` as the guard.

- [x] **Task 5 — Gates + deploy** (AC: 1, 2)
  - [x] `lint && typecheck && test && build` green (don't regress the 293 prior tests). **No schema change, no migration** (the feed reads the existing `listPublishedUpdates`). Deploy (`vercel --prod`; verify `.env.local` checksum `ecedc7314b8e405f0a7bba826b19ef73` unchanged) + push. **No Inngest re-sync** (no function change).
  - [x] **Live validation (CJ):** as a Client (the 2nd-account engagement), open `/portal` → see the branded empty state; publish a candidate from the Cockpit → within ~30 s the card appears at the top of the Client feed (or on focus), announced, with the status filter working; confirm no candidate/source/raw data is ever visible and another engagement's feed is unreachable.

## Dev Notes

### What exists vs net-new (read this first)

[Source: code map — `portal/(shell)/`, `auth/session.ts`, `ship-update.repository.ts`, `providers.tsx`, `ship-status-tag.tsx`]

- **Reused (don't rebuild):**
  - **The feed read is DONE** — `listPublishedUpdates(ctx, engagementId)` (Story 3.6) returns the Client-safe projection `{id,statusTag,title,summary,publishedAt}` (**never `raw_meta`**, `state='published'` only). 3.7 is the UI + the poll endpoint over it. No schema change.
  - **Auth:** `getAppSession()` resolves the Better Auth session → role + `tenantId` + (for clients) `engagementId`, and **returns null instead of redirecting** — so it's the right primitive INSIDE a Route Handler (`requireClient`/`requireOnboardedClient` call `redirect`/`notFound`, which only work in RSC). `ClientSession` (= `AppSession & { role:"client"; tenantId; engagementId }`) is usable directly as a `TenantContext`.
  - **TanStack Query is mounted app-wide** (`providers.tsx` → root `layout.tsx`, covers `/portal`) with `refetchOnWindowFocus: true` + `staleTime: 15_000`. This story adds the **first `useQuery`** in the codebase (the feed poll); query key `["feed", engagementId]` (architecture L302).
  - **Presentational:** `ShipStatusTag` (read-only pill), `SHIP_STATUS`/`toShipStatus` (status vocab), `formatRelativeTime`, `FocusHeading`, `PortalEmpty` (the calm empty state from 2.6). The portal shell (header/nav/branded layout, `--tenant-accent`) is built (2.5/2.6) — the feed renders INSIDE `(shell)`.
  - **Tenant name** for the empty copy: `getTenant(session)` (the `(shell)/page.tsx` already does this) → `tenant?.name?.trim() || "Your freelancer"`.

- **Net-new (this story):** the authz-scoped `GET /api/feed/[engagementId]` Route Handler; the `ship-feed.tsx` polling island (first `useQuery`); the read-only `ship-update-card.tsx`; the pure `feed.ts` helpers (filter + announce); the page wiring.

### The privacy boundary (NFR-2/3 — the Client surface)

[Source: architecture.md L185/L251; EXPERIENCE.md › Privacy & Visibility]

- The feed shows **only `state='published'`** — guaranteed by `listPublishedUpdates` (the state filter + the projection that omits `raw_meta`), proven by the 3.6 client-ctx test. RLS scopes the Client to their Engagement; the Route Handler adds an explicit `params.engagementId === session.engagementId` check (defense-in-depth — a Client can't poll another engagement even by editing the URL; RLS would also return 0 rows, but the 403 is explicit).
- The `FeedUpdate` shape carries no `raw_meta` (it isn't selected, isn't serialized, isn't rendered). The card renders only status/title/summary/time. There is no path from the Client feed to source code, diffs, branches, SHAs, candidates, or another Engagement.

### Live transport (AR-10, NFR-5/6) — the poll, resolved

[Source: architecture.md L141/L214/L251 (polling, no websockets — NFR-6); epics.md#3.7 AC; EXPERIENCE.md L129/L158 (the open real-time-vs-poll question)]

- **Decision: polling, auto-refresh + `aria-live` announce.** EXPERIENCE.md L129/L158 left an OPEN question (real-time vs poll) and floated a "Load new updates" control on the poll branch — **the epic AC resolves it the other way**: "the feed refreshes within ~30 s … announces via `aria-live="polite"` without moving focus." So new cards auto-insert at the top + an `aria-live=polite` region announces them (no focus move), `motion-safe` entrance. (No "Load new updates" button.)
- `refetchInterval: 20_000` + inherited `refetchOnWindowFocus` → ≤~30 s (NFR-5). `refetchInterval` pauses while the tab is hidden (TanStack default — `refetchIntervalInBackground` is false), saving a backgrounded phone's battery/data (NFR-1/6). Zero realtime infra (NFR-6).
- **No websockets / SSE / managed realtime** (vetoed by NFR-6). The transport stays behind the `useQuery` seam.

### Accessibility (NFR-7 / UX-DR15 / EXPERIENCE.md L158/L162)

- New cards announced via **`aria-live="polite"` aria-atomic** ("New update: {title}, {status label}") — never `assertive`, never the full body, and the insert **does not move keyboard focus** (the announce region is a separate visually-hidden node; the cards just render).
- Entrance animation honors `prefers-reduced-motion` (`motion-safe:` animate in; `motion-reduce:` → instant). Status is emoji **+ text label** (not color-only) via `ShipStatusTag`. The route/`<h1>` focus on navigation is already handled by the portal shell + `FocusHeading`. Touch targets ≥44px on the filter buttons.

### Project Structure Notes

- **NEW:** `src/app/api/feed/[engagementId]/route.ts` (+ `__tests__/route.test.ts`); `src/app/portal/(shell)/{ship-feed.tsx, ship-update-card.tsx, feed.ts}` (+ `__tests__/feed.test.ts`).
- **MODIFIED:** `src/app/portal/(shell)/page.tsx` (empty → mount `ShipFeed`); possibly `src/app/globals.css` (one `@keyframes` if `tailwindcss-animate` isn't available).
- **Naming:** Route Handler under `app/api/feed/[engagementId]/route.ts`; component files `kebab-case.tsx` → `PascalCase` exports; the pure helper `feed.ts` like 3.5's `keyboard.ts`.
- **Watch:** (1) `getAppSession()` (not `requireClient`) in the route — redirects don't work there. (2) `publishedAt` is a `Date` from Drizzle → ISO string over the wire (`Response.json` + the page's `.toISOString()`); the card does `new Date(publishedAt)`. Keep `FeedUpdate.publishedAt` a `string`. (3) Mount `ShipFeed` even when empty so the poll runs from the empty state. (4) `refetchInterval` is on the query, not the global default — set it explicitly. (5) Don't move focus on a live insert.

### Testing requirements

- **Route Handler (`route.test.ts`, mocks):** 401 (no session) · 403 (freelancer / no-engagement / wrong-engagement param) · 200 (own engagement → `{updates}`). Proves the authz scoping (the read's privacy is 3.6-tested).
- **Pure helpers (`feed.test.ts`):** `filterUpdates` per status + "all" + unknown-tag bucketing; `newTopAnnouncement` null-on-first / null-on-unchanged / string-on-new-top.
- **Regression:** the 293 prior tests stay green; no schema/migration.
- The React island (poll/aria-live/filter render) is validated live (CJ's Task 5) — consistent with how 3.5's queue UI was validated.

### References

- [Source: epics.md#Story 3.7 (the AC: published-only newest-first cards, status filter, ~30s poll + on-focus, aria-live, reduced-motion, never source/candidates/other-engagement); #Story 3.6 (`listPublishedUpdates` — the read this renders); #Story 3.8 manual update / #Story 4.1 notification center (out of scope)]
- [Source: architecture.md L141 (polling transport — no websockets, NFR-6), L214/L251 (RSC first paint + TanStack poll, `/api/feed/[engagementId]` scoped via ClientAccess), L206/L212 (Route Handlers for IO, authz-scoped JSON), L302 (`['feed', engagementId]` query key); EXPERIENCE.md L46/L100 (Ship Feed is the home; the read-only card), L120 (empty pre-first-publish copy), L129/L158/L162 (live-arrival a11y: aria-live polite, no focus move, reduced-motion)]
- [Source: src/server/db/repositories/ship-update.repository.ts (`listPublishedUpdates`); src/server/auth/session.ts (`getAppSession`/`requireOnboardedClient`/`ClientSession`); src/app/providers.tsx (QueryClient); src/app/portal/(shell)/{layout,page}.tsx + portal-empty.tsx; src/components/ui/ship-status-tag.tsx + ship-status.ts; src/lib/relative-time.ts; src/app/api/webhooks/github/route.ts (Route Handler shape)]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (1M context)

### Debug Log References

- Gates: `npx tsc --noEmit` clean · `eslint` clean · `vitest run` **300 passed (37 files)** (+7 over the 293 baseline) · `next build` ✓ Compiled · `drizzle-kit generate` → "No schema changes" (no migration — reads the existing `listPublishedUpdates`).

### Completion Notes List

- **AC-1 (the feed):** the `/portal` Ship Feed renders the Client-safe published projection (3.6's `listPublishedUpdates`) as read-only `ShipUpdateCard`s (status tag + title + summary + relative time), newest-first, **filterable by status** (All/✅/🚧/📦 — pure `filterUpdates`, an unknown tag bucketed not dropped). Before the first publish: a calm branded empty hero. **No candidate/source/raw_meta/other-engagement path** — the read's projection (no `raw_meta`) + `state='published'` filter (3.6) + the route's authz scoping guarantee it; `FeedUpdate` carries only the safe fields.
- **AC-2 (live):** the **first authenticated Route Handler** `GET /api/feed/[engagementId]` (`getAppSession` — not `requireClient`, which redirects — → 401/403 guards → `listPublishedUpdates` → `Response.json` with `Cache-Control: private, no-store`). The **first `useQuery`** polls it (`refetchInterval: 20_000` + inherited `refetchOnWindowFocus`; auto-paused while hidden) seeded by the RSC first paint (`initialData`). A new top item is announced via a visually-hidden `aria-live="polite"` region (`newTopAnnouncement`, pure) **without moving focus**; cards animate in under `motion-safe` (tw-animate-css `animate-in fade-in slide-in-from-top-2`), instant under reduce.
- **Privacy (NFR-2/3):** the route double-scopes — an explicit `params.engagementId === session.engagementId` check (403 on mismatch, fail-fast) atop RLS (the Client ctx sets both tenant + engagement GUCs, so a foreign engagement is also RLS-blocked). The route test pins the 401/403(no-engagement)/403(wrong-engagement)/200 matrix + the `publishedAt` ISO wire contract.
- **No schema change** — pure UI + one route over the 3.6 read.
- **Review fixes (xhigh, 2 angles):** the server side came back clean (the authz invariant holds; 2 test-coverage notes applied + Cache-Control hardening). The UI finder caught the one real bug — the **FocusHeading focus-steal**: the empty→populated transition mounted a fresh `FocusHeading` whose mount effect grabbed focus on a *data* change (violating "without moving focus"). Fixed by making the h1 a **single stable** sr-only `FocusHeading` (focuses on navigation only) + a bespoke empty hero. Also: `suppressHydrationWarning` on the card `<time>` (the relative time differs server/client at a bucket boundary); filter touch targets `min-h-9`→`min-h-11` (≥44px).

### File List

- **NEW:** `src/app/api/feed/[engagementId]/route.ts` (+ `__tests__/route.test.ts`); `src/app/portal/(shell)/{ship-feed.tsx, ship-update-card.tsx, feed.ts}` (+ `__tests__/feed.test.ts`).
- **MODIFIED:** `src/app/portal/(shell)/page.tsx` (empty → mounts `ShipFeed`).

## Senior Developer Review (AI)

**Reviewer:** CJ (via Claude xhigh code-review — 2 parallel finder angles + verify) · **Date:** 2026-06-07 · **Outcome:** ✅ Approve

**Finder A — the route + privacy + page: clean.** Verified: `getAppSession` returns null (doesn't redirect) → correct in a Route Handler; the guard chain (401 → 403 role/tenant/engagement → 403 param-mismatch) is airtight; `role:"client"` is hardcoded (not trusted from the session) and `tenantId` is provably non-null after the guard; the double-scoping holds (explicit check + RLS); the page maps rows 1:1 to the safe `FeedUpdate` shape and always mounts `ShipFeed`; `runtime="nodejs"` + async `params` correct. Applied 2 hardening notes (the missing-engagement 403 test + the `publishedAt` ISO assertion) and `Cache-Control: private, no-store`.

**Finder B — the polling island + a11y: 1 real fix + hardening.** Verified clean: `refetchInterval` pauses while hidden (TanStack default); `refetchOnWindowFocus` inherited; `initialData` keeps `data` defined (no undefined deref); a transient poll error keeps the last data (graceful, NFR-4); `structuralSharing` keeps `data` ref-stable on no-op polls (no spurious re-announce); the aria-live region is separate and never `.focus()`'d; `motion-safe` correctly gates the animation off under reduce; stable keys → only new cards animate. **Fixes:** the FocusHeading focus-steal (the real bug — stable sr-only h1); hydration `<time>` (`suppressHydrationWarning`); touch target (`min-h-11`).

**Action Items:**
- [x] **[High]** FocusHeading focus-steal on the empty→populated transition — fixed (single stable sr-only h1).
- [x] **[Med]** Hydration mismatch on the relative `<time>` — fixed (`suppressHydrationWarning`).
- [x] **[Low]** Filter touch targets ≥44px + route `Cache-Control` + the 2 route tests — applied.
- [ ] **[Low — deferred]** A genuinely-new top item with an identical title+status to the just-announced one won't be re-read (`setAnnouncement` of the same string is a no-op). Rare; revisit if it matters.
- [ ] **[Low — deferred]** No "reconnecting/stale" indicator if the poll fails persistently (the feed shows stale data — graceful per NFR-4, but silent). Epic 4 / a polish pass.

## Change Log

| Date       | Version | Description                                                       | Author |
| ---------- | ------- | ---------------------------------------------------------------- | ------ |
| 2026-06-07 | 0.1     | Story drafted (context-engineered).                              | Scrum  |
| 2026-06-07 | 1.0     | Implemented Tasks 1–5; xhigh review (2 angles, 5 fixes); done.   | Dev    |
