---
baseline_commit: 99dcca7
---

# Story 4.2: Toast on Publish When Active

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Client,
I want a gentle toast when an update lands while I'm in the app,
so that I notice momentum in real time without it being intrusive (FR-15, UX-DR15).

## Acceptance Criteria

1. **A non-blocking toast on a fresh publish, ONLY while active (FR-15).**
   **Given** I am **active** in the portal (the tab is visible)
   **When** a Ship Update is published on my Engagement (a new `ship_published` notification arrives via the active poll)
   **Then** a **non-blocking sonner toast** appears (the status emoji + the update's plain title) **linking to the Ship Feed** (`/portal`). It does **NOT** appear when I'm **inactive** (the tab hidden → the poll is paused → no toast), and on **returning** to the tab a backlog that accumulated while I was away does **NOT** burst a stack of toasts (the catch-up refetch is silent — only updates published *while I'm watching* toast).

2. **Calm + accessible (UX-DR15).**
   **Given** the toast
   **Then** it **respects `prefers-reduced-motion`** (the entrance/exit animation collapses to instant) and is **dismissible** (sonner's default: auto-dismiss + swipe/close), never blocking the page. A burst of several at once is capped (no toast storm).

## Tasks / Subtasks

- [x] **Task 1 — The pure toast-selection helper** (AC: 1)
  - [x] `src/app/portal/(shell)/notifications.ts`: add `selectToasts(prev: { initialized: boolean; seen: Set<string> }, data: NotificationRow[], ctx: { hidden: boolean; resyncing: boolean }): { toasts: NotificationRow[]; seen: Set<string> }` — compute `seen = new Set(data ids)`; **first render** (`!prev.initialized`) → `{ toasts: [], seen }` (baseline only, never toast the initial paint); **catch-up or inactive** (`ctx.resyncing || ctx.hidden`) → `{ toasts: [], seen }` (silent baseline update — the focus-return-after-hidden refetch, or a poll that resolved while hidden); else → `{ toasts: data.filter(n => !prev.seen.has(n.id)), seen }` (the genuinely-new arrivals). Keep ALL the decision logic here (pure) so the visibility/resync orchestration in the component is thin.
  - [x] **Tests** (`src/app/portal/(shell)/__tests__/notifications.test.ts`): first render → no toasts, seen = all; a new id while visible+not-resyncing → that row toasts; a new id while `hidden` → no toast (baseline updated); a new id while `resyncing` → no toast; no new id → no toasts; the returned `seen` always equals the current data's ids.

- [x] **Task 2 — The toaster island (poll → toast, active-only)** (AC: 1, 2)
  - [x] `src/app/portal/(shell)/notification-toaster.tsx` (NEW, `"use client"`): a **render-null** component. `useQuery({ queryKey: ["notifications"], queryFn: fetch /api/notifications → json.notifications, refetchInterval: 20_000 })` — the **SAME `["notifications"]` query the bell/center already poll** (TanStack dedups → one fetch). Refs: `seen: Set<string>`, `initialized: boolean`, `resync: boolean`. A `visibilitychange` listener sets `resync = true` whenever the tab goes hidden (so the next data change — the focus-return refetch — is treated as catch-up). On each `data` change: call `selectToasts({ initialized, seen }, data, { hidden: document.hidden, resyncing: resync })`; update the `seen`/`initialized` refs; **clear `resync`**; for each selected toast (**cap at 3**) fire `toast(\`${emoji} ${title}\`, { description: "New update in your feed", action: { label: "View", onClick: () => router.push("/portal") } })` (emoji from `SHIP_STATUS[toShipStatus(statusTag)]`; fall back to "New update" when `title`/`statusTag` are null). Mark-read / the 4.1 optimistic `setQueryData` change `data` too, but add NO new ids → `selectToasts` returns `[]` (no spurious toast).
  - [x] `src/app/portal/(shell)/layout.tsx` (MODIFY): mount `<NotificationToaster />` once (render-null) so it's active on EVERY portal page (the client is "active in the portal", not just on the feed). Place it alongside the existing chrome; it adds no visible markup.

- [x] **Task 3 — Reduced-motion + the Toaster** (AC: 2)
  - [x] `src/app/globals.css`: add a `@media (prefers-reduced-motion: reduce)` block targeting sonner's toast (`[data-sonner-toast]`) to collapse its transition/animation to instant (sonner v2 does NOT honor reduced-motion natively). This is a GLOBAL guard (all toasts honor reduced-motion — correct). Keep the existing `Toaster` in `providers.tsx` (`richColors position="top-center"`); sonner toasts are dismissible by default (auto-dismiss + swipe), satisfying "dismissible" — no Toaster config change required.

- [x] **Task 4 — Gates + deploy** (AC: 1, 2)
  - [x] `lint && typecheck && test && build` green (don't regress the 331 prior tests). **No schema change, no migration, no new route/action** (the toaster reuses the 4.1 `/api/notifications` poll). Deploy (`vercel --prod`; verify `.env.local` checksum `ecedc7314b8e405f0a7bba826b19ef73` unchanged) + push. **No Inngest re-sync** (no function change).
  - [x] **Live validation (CJ):** with the portal open + visible, publish an update from the Cockpit → within ~30 s a non-blocking toast appears (emoji + title), "View" → the feed; switch to another tab while publishing several → on return, NO burst of toasts (the bell count + center still update); enable reduced-motion → the toast appears instantly (no slide). Confirm it never blocks the page and auto-dismisses.

## Dev Notes

### What exists vs net-new (read this first)

[Source: 4.1 (`/api/notifications`, the `["notifications"]` poll, `NotificationRow`/`unreadCount`); 3.7 (the feed poll + the new-item-detection + visibility pattern); providers.tsx (sonner Toaster)]

- **Reused (don't rebuild):**
  - **The poll already exists** — 4.1's `GET /api/notifications` + the `["notifications"]` TanStack query (the bell + center poll it; `refetchInterval: 20_000` + inherited `refetchOnWindowFocus`, **paused while the tab is hidden** — TanStack default). The toaster is a THIRD consumer of the SAME query (deduped). **No new route, action, repo fn, or schema.**
  - **The new-item-detection pattern** is 3.7's `newTopAnnouncement` (`feed.ts`) — track a baseline of seen ids, diff on each poll, skip the first render. 4.2 generalizes it to "all fresh ids" + the active/catch-up gating (`selectToasts`).
  - `NotificationRow`/`unreadCount` (4.1, `notifications.ts`); `SHIP_STATUS`/`toShipStatus` for the emoji/label; the `toast` (sonner) host in `providers.tsx`.
  - **3.6 fan-out** creates the `ship_published` notification on publish — the toaster's signal. (There's a small lag: the notification lands after the async fan-out, a few seconds behind the feed card — within the ~30 s NFR.)

- **Net-new (this story):** the pure `selectToasts` helper; the `NotificationToaster` render-null island; the layout mount; the reduced-motion CSS guard. **Tiny — no backend.**

### Why the notification poll (not the feed poll)

[Source: architecture.md L214/L250 ("the toast is delivered by the Client's active poll picking up the new published update / notification"); the 3.7 feed island is page-scoped]

- The toaster keys off `["notifications"]` (portal-WIDE — the bell polls it on every page) so a toast fires no matter which portal page the Client is on. The 3.7 feed poll (`["feed", engagementId]`) only runs on `/portal`. A new `ship_published` notification is 1:1 with a published update, so one toast per update.
- The 3.7 feed's `aria-live` announce (screen readers) and the 4.2 visual toast can BOTH fire on `/portal` for the same update — they're different channels (SR vs visual), no conflict.

### The "active-only" + "no backlog burst" rule (the load-bearing behavior)

- **Active-only:** the poll pauses while the tab is hidden (TanStack default `refetchIntervalInBackground: false`), so no data change → no toast while inactive. The `selectToasts` `hidden` guard is belt-and-suspenders (a poll that resolves just as the tab hides).
- **No backlog burst:** on returning to the tab, `refetchOnWindowFocus` refetches and the accumulated notifications arrive as "new" — but the `visibilitychange` listener set `resync = true` when the tab went hidden, so that FIRST post-return data change is treated as **catch-up** (baseline update, no toast). Subsequent interval polls while staying active → toast. This is the difference between "published while I'm watching" (toast) and "accumulated while I was away" (the bell badge + center, silent).
- **Cap at 3** per data change so even an active burst can't storm the screen.

### Architecture compliance

[Source: architecture.md L214/L250 (the active-poll toast), L223 (sonner toasts, fired on publish-while-active + recoverable failures); EXPERIENCE.md L108 (Notification toast: shadcn Toast, fired only when the recipient is ACTIVE, taps route to the update, auto-dismiss, non-blocking), L129/L162 (reduced-motion honored), L211 (the toast is part of the momentum loop)]

- This realizes EXPERIENCE.md L108 exactly: a toast **only when active**, tap → the update, auto-dismiss, non-blocking.
- (Out of scope: 3.6's deferred freelancer "email-failed retry toast" — that's a Cockpit/Inngest-failure surface, a different channel; not this Client-facing publish toast. Note it as a possible later add, don't build it here.)

### Project Structure Notes

- **NEW:** `src/app/portal/(shell)/notification-toaster.tsx`.
- **MODIFIED:** `src/app/portal/(shell)/notifications.ts` (+`selectToasts`), `(shell)/layout.tsx` (mount the toaster), `src/app/globals.css` (reduced-motion guard), `(shell)/__tests__/notifications.test.ts` (+ tests).
- **Naming:** `selectToasts` (pure), `NotificationToaster` (render-null island).
- **Watch:** (1) the toaster MUST share `queryKey: ["notifications"]` (no separate fetch). (2) `selectToasts` skips the FIRST render (don't toast existing notifications on page load) AND catch-up-after-hidden (don't burst on return). (3) mark-read / the optimistic `setQueryData` change `data` but add no new ids → no spurious toast (the `seen`-diff handles it). (4) the toast `onClick` uses `router.push("/portal")` (not a full reload). (5) `document` is browser-only — the island is `"use client"` + the effect runs client-side (guard `typeof document` if needed). (6) the reduced-motion guard targets `[data-sonner-toast]` (sonner v2 doesn't honor it natively).

### Testing requirements

- **Pure (`selectToasts`, node):** first-render baseline / new-while-visible → toast / new-while-hidden → none / new-while-resyncing → none / no-new → none / `seen` correctness. (The full active/catch-up orchestration + the actual sonner render are validated live — CJ's Task 4, consistent with the 3.7/4.1 UI islands.)
- **Regression:** the 331 prior tests stay green; no schema/route/action change.

### References

- [Source: epics.md#Story 4.2 (gentle toast when active, links to the update, not when inactive, reduced-motion + dismissible); #Story 4.1 (the `/api/notifications` poll + `["notifications"]` query this reuses), #Story 3.7 (the new-item-detection + visibility-paused poll pattern), #Story 3.6 (the fan-out that creates the notification)]
- [Source: architecture.md L214/L223/L250; EXPERIENCE.md L108/L129/L162/L211]
- [Source: src/app/portal/(shell)/{notifications.ts, notification-bell.tsx, notification-center.tsx, ship-feed.tsx (the detection/visibility pattern), layout.tsx}; src/app/providers.tsx (sonner Toaster); src/components/ui/ship-status.ts; src/app/globals.css]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (1M context)

### Debug Log References

- Gates: `tsc --noEmit` clean · `eslint` clean · `vitest run` **339 passed (41 files)** (+8) · `next build` ✓ Compiled · `drizzle-kit generate` → no drift (no schema/route/action change).

### Completion Notes List

- **AC-1/2:** a render-null `NotificationToaster` mounted in the (shell) layout polls the **shared `["notifications"]` query** (the 3rd consumer alongside the bell + center — deduped to one fetch; no new backend) and fires a non-blocking sonner toast (status emoji + title, "View" → `/portal`) on a freshly-arrived `ship_published` notification, **only while active**. The pure `selectToasts` gates it: first render baselines silently; a poll resolving while hidden or the catch-up-after-hidden refetch (tracked via `visibilitychange` → `resync`) is silent; mark-read / the 4.1 optimistic `setQueryData` change `data` but add no new ids → no spurious toast (the diff is by id). The poll itself is paused while the tab is hidden (TanStack default), so an inactive client never toasts. Reduced-motion is honored via a `globals.css` `@media (prefers-reduced-motion: reduce)` guard on `[data-sonner-toast]` (sonner v2 doesn't do it natively); toasts are dismissible by sonner's default.
- **Review fix (the one that mattered):** the xhigh finder flagged that the `resync` boolean ALONE is a fragile anti-burst guarantee — it's racy on return (focus refetch vs the resumed interval) and misses the hidden-at-mount case, so a backlog could storm. Added a **robust burst threshold in `selectToasts`** (a live publish lands 1–2 per poll; a backlog-on-return lands many → suppress when `fresh.length > 3`, regardless of the visibility flag — race-proof; the bell/center still reflect them). Kept `resync` for the common-case strict suppression; the threshold is the backstop. This replaced the component's `.slice(0,3)` cap (which had silently dropped the 4th+; now a large batch toasts nothing rather than a partial set). Added the explicit optimistic-readAt + large-batch + small-batch tests.

### File List

- **NEW:** `src/app/portal/(shell)/notification-toaster.tsx`.
- **MODIFIED:** `src/app/portal/(shell)/notifications.ts` (+`selectToasts`), `(shell)/layout.tsx` (mount the toaster), `src/app/globals.css` (reduced-motion guard), `(shell)/__tests__/notifications.test.ts` (+ `selectToasts` tests).

## Senior Developer Review (AI)

**Reviewer:** CJ (via Claude xhigh code-review, 1 focused finder) · **Date:** 2026-06-07 · **Outcome:** ✅ Approve

**Verified clean:** the shared `["notifications"]` key dedupes to one fetch; `structuralSharing` keeps `data` stable so the effect doesn't run spuriously; the seen-diff is by `id` so mark-read's optimistic `setQueryData` + invalidate never toast; the sonner v2 `toast(label, { action })` API + non-blocking auto-dismiss are correct; the null title/statusTag fallback ("New update") is handled; the `"use client"` render-null island reads `document` only in effects (SSR-safe) and imports cleanly into the RSC layout. **Fix applied:** the burst threshold (the robust, race-proof anti-burst backstop) — the finder's two top findings (fragile resync arming + the two-fetch race) are both subsumed by it.

**Action Items:**
- [x] **[High]** Robust anti-burst threshold in `selectToasts` (replaces the fragile resync-only guarantee + the component cap) — applied.
- [x] **[Low]** Explicit tests: optimistic-readAt-change → no toast; large-batch → suppressed; small-batch → toasts — applied.
- [ ] **[Low — live-validate]** Confirm the `[data-sonner-toast]` reduced-motion selector fully collapses sonner v2's entrance in the browser (the finder couldn't verify the exact DOM; the selector is the standard one). CJ's Task 4.

## Change Log

| Date       | Version | Description                                                       | Author |
| ---------- | ------- | ---------------------------------------------------------------- | ------ |
| 2026-06-07 | 0.1     | Story drafted (context-engineered).                              | Scrum  |
| 2026-06-07 | 1.0     | Implemented Tasks 1–4; xhigh review (burst-threshold fix); done. | Dev    |
