---
baseline_commit: 8d8fbba
---

# Story 4.1: In-App Notification Center

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Client,
I want an in-app inbox of my updates with a bell that shows what's new,
so that I can catch up on what shipped in one place (FR-15, UX-DR11).

## Acceptance Criteria

1. **The notification center — published-update events, newest-first, read/unread, linked (FR-15, UX-DR11).**
   **Given** notifications created on publish (Epic 3's fan-out already inserts a `ship_published` row per published update)
   **When** I open the bell (→ `/portal/notifications`)
   **Then** I see my notifications **newest-first** with clear **read/unread** state, each showing the update's status tag + plain title + relative time and **linking to the Ship Feed**; clicking one marks it read, and a **"Mark all as read"** clears the rest. I only ever see **my own** notifications for **my** Engagement (never another Client's, never another Engagement's).

2. **The bell shows unread, live via the same polling as the feed (FR-15, NFR-5).**
   **Given** the polling transport (AR-10)
   **When** an update is published while I'm in the portal
   **Then** the **bell's unread count** updates within ~30 s (TanStack Query `GET /api/notifications` at a ~20 s interval **+ on focus**, paused while hidden) — the **same `['notifications']` query feeds the bell badge AND the center** (one poll), and marking read updates both immediately (the action invalidates the query).

## Tasks / Subtasks

- [x] **Task 1 — Notification reads + mark-read (RLS + user-scoped)** (AC: 1, 2)
  - [x] `src/server/db/repositories/notifications.repository.ts`: add `listNotifications(ctx)` → `withTenant`, `WHERE user_id = ctx.userId` (their OWN — the `notification_scope` RLS scopes to the Engagement, but a notification carries a `user_id` recipient, so filter it explicitly), **LEFT JOIN `ship_updates`** for `{ statusTag, title }`, `ORDER BY created_at DESC`. Return rows `{ id, type, readAt, createdAt, shipUpdateId, title, statusTag }` (the ship-update title/status may be null for non-`ship_published` types — fine). `markNotificationsRead(ctx, ids)` → `UPDATE … SET read_at = now() WHERE id = ANY(ids) AND user_id = ctx.userId AND read_at IS NULL` (RLS + own + idempotent) → returns the count. `markAllNotificationsRead(ctx)` → same without the id filter (all the user's unread). Use `ctx.userId` everywhere — never trust an input userId.
  - [x] **Tests** (`src/server/db/__tests__/notifications.repository.test.ts`, PGlite): `listNotifications` returns the user's own rows newest-first with the joined title/status, **and NOT another user's row in the same engagement** (the `user_id` filter — seed a 2nd recipient); `markNotificationsRead` stamps `read_at` once (a replay/already-read → no-op count 0), only the caller's own; `markAllNotificationsRead` clears all the user's unread; cross-tenant isolation (Tenant B sees/marks none of A's).

- [x] **Task 2 — The authz-scoped poll Route Handler** (AC: 2)
  - [x] `src/app/api/notifications/route.ts` (NEW): `export const runtime = "nodejs"`. `GET` — `getAppSession()` (not `requireClient` — handlers can't redirect) → **401** no session / **403** if `role !== "client"` or no `tenantId`/`engagementId` → `listNotifications({ tenantId, userId, role:"client", engagementId })` → `Response.json({ notifications }, { headers: { "Cache-Control": "private, no-store" } })`. NO `[engagementId]` param (the architecture's `GET /api/notifications` is session-keyed — the Client is single-engagement; the session IS the scope). Mirror `api/feed/[engagementId]/route.ts` exactly minus the param.
  - [x] **Test** (`src/app/api/notifications/__tests__/route.test.ts`, mock `getAppSession` + `listNotifications`): no session → 401; a freelancer / client-without-engagement → 403; a client → 200 with `{ notifications: [...] }` + the `readAt`/`createdAt` ISO-string wire shape. (The read's privacy is repo-tested in Task 1.)

- [x] **Task 3 — The mark-read Server Actions** (AC: 1)
  - [x] `src/server/portal/notifications.actions.ts` (NEW, `"use server"`): `markNotificationsReadAction(ids: string[])` and `markAllNotificationsReadAction()` — each `requireClient()` → repo call → return `{ ok: true } | { ok: false }`. **Do NOT `revalidatePath`** — the bell/center are `useQuery` islands; the CLIENT invalidates `['notifications']` after the action (no RSC re-render needed). Mirror `src/server/portal/onboarding.actions.ts`. Validate `ids` are uuids (a small Zod `z.array(z.uuid()).max(200)`); the repo already scopes to `ctx.userId` so a stray id is harmless, but reject malformed input.
  - [x] **Test** (`src/server/portal/__tests__/notifications.actions.test.ts`, mock `requireClient` + the repo): valid mark-read calls the repo with the ids + `{ok:true}`; mark-all calls `markAllNotificationsRead`; a repo throw → `{ok:false}` (logged); non-uuid ids → rejected.

- [x] **Task 4 — The bell badge + the notification center UI** (AC: 1, 2)
  - [x] `src/app/portal/(shell)/notifications.ts` (NEW, pure): `type NotificationRow = { id; type; readAt: string | null; createdAt: string; shipUpdateId: string | null; title: string | null; statusTag: string | null }` (ISO strings over the wire); `unreadCount(rows): number` (count `readAt == null`). Tiny, node-unit-tested.
  - [x] `src/app/portal/(shell)/notification-bell.tsx` (NEW, `"use client"`): replaces the bell `<Link>` in `portal-nav.tsx`. `useQuery({ queryKey: ["notifications"], queryFn: fetch /api/notifications → json.notifications, refetchInterval: 20_000 })` (refetchOnWindowFocus inherited); render the existing `<Bell>` Link to `/portal/notifications` (keep the ≥44px hit area + `aria-current` + focus ring) with an **unread badge** (Soloist-Iris pill, absent at zero — mirror `CandidateBadge`) showing `unreadCount(data)`; the badge has an accessible label ("N unread"). The bell is on every portal page → the count is live everywhere.
  - [x] `src/app/portal/(shell)/portal-nav.tsx` (MODIFY): swap the inline bell `<Link>` for `<NotificationBell />`. No other change (keep Updates/Documents/avatar + the Esc dropdown).
  - [x] `src/app/portal/(shell)/notification-center.tsx` (NEW, `"use client"`): the center list. `useQuery(["notifications"], …, { initialData: initialRows, refetchInterval: 20_000 })` (shared key → dedups with the bell). Render newest-first rows: an **unread dot** (visual + the row tinted until read), the `<ShipStatusTag>` (when `statusTag`), the `title` (or a generic "New update" for non-ship types), relative `<time>` (`suppressHydrationWarning`, like the feed card), and the whole row is a link to `/portal` that **marks it read on click** (`markNotificationsReadAction([id])` → `queryClient.invalidateQueries({ queryKey: ["notifications"] })` → bell+center refresh). A **"Mark all as read"** button (shown when any unread) → `markAllNotificationsReadAction()` → invalidate. Empty → the calm `PortalEmpty` ("You're all caught up"). This is the codebase's first `useQueryClient`/`invalidateQueries`.
  - [x] `src/app/portal/(shell)/notifications/page.tsx` (MODIFY): `const session = await requireOnboardedClient(); const rows = (await listNotifications(session)).map(toIso);` → render `<NotificationCenter initialRows={rows} />` (RSC first paint, then the island polls). A stable sr-only `<FocusHeading>Notifications</FocusHeading>` (route-nav focus, like the 3.7 feed h1 fix — don't let a data change steal focus).

- [x] **Task 5 — Gates + deploy** (AC: 1, 2)
  - [x] `lint && typecheck && test && build` green (don't regress the 317 prior tests). **No schema change, no migration** (the `notifications` table + `read_at` already exist). Deploy (`vercel --prod`; verify `.env.local` checksum `ecedc7314b8e405f0a7bba826b19ef73` unchanged) + push. **No Inngest re-sync** (no function change).
  - [x] **Live validation (CJ):** as the 2nd-account Client, publish updates from the Cockpit → the bell's unread count climbs within ~30 s / on focus → open the bell → the center lists them newest-first → click one (marks read, bell drops) → "Mark all as read" clears the rest. Confirm you never see another Client's/Engagement's notifications.

## Dev Notes

### What exists vs net-new (read this first)

[Source: code map — `notifications.repository.ts`, `portal-nav.tsx`, `notifications/page.tsx`, the 3.7 feed route+island, `onboarding.actions.ts`]

- **Reused / ALREADY DONE (Epic 3 seeded this on purpose):**
  - **The `notifications` table + rows exist** — the 3.6 `ship/update.published` fan-out inserts a `ship_published` row per published update (`user_id` = the Client recipient, `ship_update_id`, `read_at` nullable). The `notification_scope` dual-scope RLS + FORCE + the `notifications_ship_dedup` partial unique are live (migration 0012). 4.1 adds only the READS + mark-read — **no schema change.**
  - **`createNotification` + `loadShipPublishedContext`** (the same file) — the latter's `ship_updates` join is the model for `listNotifications`'s LEFT JOIN.
  - **The 3.7 feed is the pattern to mirror EXACTLY:** the authz-scoped Route Handler (`getAppSession` → 401/403 → repo → `Response.json` + `Cache-Control: private, no-store`); the `useQuery` poll island (`queryKey`, `queryFn` fetch, `initialData`, `refetchInterval: 20_000`, inherited `refetchOnWindowFocus`/paused-while-hidden); the ISO-string-over-the-wire date handling (`new Date(str)` + `suppressHydrationWarning`); the stable sr-only `FocusHeading`.
  - **The bell already exists** in `portal-nav.tsx` — a `<Link href="/portal/notifications">` with the ≥44px hit area + `aria-current` + focus ring, **no badge yet**. The notifications page is a `PortalEmpty` placeholder.
  - **The Server-Action pattern** (`requireClient` → repo → typed `{ok}`) from `onboarding.actions.ts`; the `CandidateBadge` (absent-at-zero, Soloist-Iris pill) for the unread badge; `ShipStatusTag`/`formatRelativeTime`/`FocusHeading`/`PortalEmpty`.
  - `getAppSession` is now `cache()`-wrapped (the prep commit) → the route + any nested guard dedupe the session resolution.

- **Net-new (this story):** `listNotifications`/`markNotificationsRead`/`markAllNotificationsRead`; the `GET /api/notifications` route; the mark-read actions; the `NotificationBell` (polled badge) + `NotificationCenter` (the list, the **first `useQueryClient`/`invalidateQueries`**) + a tiny pure `notifications.ts`; the page wiring. **No schema/migration, no Inngest function.**

### The privacy/scoping boundary (NFR-2)

[Source: schema.ts `notification_scope`; architecture.md L179]

- A notification's `notification_scope` RLS scopes to the Tenant + (for a Client ctx) the Engagement — but it does NOT filter by `user_id`. Since a Client could in principle share an Engagement's notification rows with the Freelancer (who also has rows for that engagement once 4.4 adds engagement events), **`listNotifications`/`markNotificationsRead` MUST filter `user_id = ctx.userId`** so each recipient sees/marks only their own. The route + the actions both run under the Client ctx (RLS scopes the engagement; the `user_id` filter scopes the recipient) — belt + suspenders. A test seeds a 2nd recipient in the same engagement to prove the filter.
- The route is authz-scoped exactly like `/api/feed` (Client-only; 401/403). `read_at`/`createdAt` cross the wire as ISO strings; nothing sensitive (no `raw_meta`) is in the projection.

### Architecture compliance

[Source: architecture.md L179 (Notification model: type/ship_update_id/read_at), L208 ("set notification on/off" + the Server-Action shape — the mark-read is a Client mutation), L212 (`GET /api/notifications` — authz-scoped poll JSON), L214 ("notification bell" polls via TanStack), L250 (the toast is the *active poll* picking up the new notification — that's Story 4.2; 4.1 is the center + bell), L302 (`['notifications']` query key); EXPERIENCE.md L49/L109 (center: published-update + invoice events, read/unread, newest-first, each links to its target), L157/L159 (≥44px touch targets, focus management — a route center is acceptable)]

- The center links each notification to its **target** — for `ship_published` that's the Ship Feed (`/portal`); invoice events come in Epic 5. v1 links to `/portal` (no per-update route).
- The mark-read is a Client Server Action (no granular per-channel prefs — that on/off is Story 4.4).
- The bell + center share the `['notifications']` query (the architecture's "notification bell" poll) — one fetch, invalidated on mark-read.

### Project Structure Notes

- **NEW:** `src/app/api/notifications/route.ts` (+ `__tests__/route.test.ts`); `src/server/portal/notifications.actions.ts` (+ `__tests__/notifications.actions.test.ts`); `src/app/portal/(shell)/{notifications.ts, notification-bell.tsx, notification-center.tsx}`.
- **MODIFIED:** `src/server/db/repositories/notifications.repository.ts` (+3 reads/marks); `src/app/portal/(shell)/{portal-nav.tsx (swap the bell), notifications/page.tsx (placeholder → center)}`; `notifications.repository.test.ts`.
- **Naming:** repo `listNotifications`/`markNotificationsRead`/`markAllNotificationsRead`; actions `markNotificationsReadAction`/`markAllNotificationsReadAction`; components `NotificationBell`/`NotificationCenter`.
- **Watch:** (1) the `user_id = ctx.userId` filter on BOTH reads + marks (the load-bearing recipient scope). (2) the bell + center MUST share `queryKey: ["notifications"]` (one poll; mark-read invalidates it). (3) `getAppSession` in the route (not `requireClient`). (4) the date wire shape (ISO strings; `suppressHydrationWarning` on the `<time>`). (5) the center's `FocusHeading` is stable/sr-only — don't steal focus on a poll (the 3.7 lesson). (6) the bell badge is absent at zero (mirror `CandidateBadge`).

### Testing requirements

- **Repository (PGlite):** `listNotifications` user-filter + join + order + cross-tenant; `markNotificationsRead` own/idempotent; `markAllNotificationsRead`; the 2nd-recipient-same-engagement isolation.
- **Route (mocks):** 401/403/200 + the ISO wire shape.
- **Actions (mocks):** valid mark/mark-all → repo + `{ok}`; throw → `{ok:false}`; non-uuid rejected.
- **Pure (`notifications.ts`):** `unreadCount`.
- **Regression:** 317 prior tests green; no schema/migration; the `isolation.test.ts` notifications policy already covers RLS (3.6's (ag)-(aj)).

### References

- [Source: epics.md#Story 4.1 (bell → center, newest-first, read/unread, links to the Ship Update, unread via the same poll); #Story 3.6 (the fan-out that creates the rows), #Story 3.7 (the feed route+poll to mirror), #Story 4.2 (the toast — out of scope here), #Story 4.4 (the per-client on/off — out of scope)]
- [Source: architecture.md L179/L208/L212/L214/L250/L302; EXPERIENCE.md L49/L109/L157/L159]
- [Source: src/server/db/repositories/notifications.repository.ts (createNotification + the join model); src/app/api/feed/[engagementId]/route.ts + src/app/portal/(shell)/ship-feed.tsx (the route+island to mirror); src/app/portal/(shell)/{portal-nav.tsx, notifications/page.tsx}; src/server/portal/onboarding.actions.ts (action shape); src/components/ui/{ship-status-tag.tsx, badge.tsx (CandidateBadge), focus-heading.tsx}; src/lib/relative-time.ts; src/app/providers.tsx (QueryClient)]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (1M context)

### Debug Log References

- Gates: `tsc --noEmit` clean · `eslint` clean · `vitest run` **331 passed (41 files)** (+14) · `next build` ✓ Compiled · `drizzle-kit generate` → no drift (no migration).

### Completion Notes List

- **AC-1/2:** the `notifications` table + rows (3.6 fan-out) are read by three new RLS-scoped repo fns — `listNotifications(ctx)` (LEFT JOIN ship_updates for title/status, newest-first), `markNotificationsRead(ctx, ids)`, `markAllNotificationsRead(ctx)` — all filtering **`user_id = ctx.userId`** (the load-bearing recipient scope, since `notification_scope` RLS only gates tenant+engagement). The session-keyed Route Handler `GET /api/notifications` (getAppSession → 401/403 → `Cache-Control: private, no-store`) feeds the **shared `["notifications"]` query**: `NotificationBell` (polled unread badge, absent-at-zero) AND `NotificationCenter` (the list, read/unread, links to the feed, mark-read + "Mark all as read"). The codebase's **first `useQueryClient`/`invalidateQueries`** — mark-read invalidates the shared query so the bell + center both refresh. **No schema change, no Inngest function** — Epic 3 seeded this.
- **Reuse:** mirrored 3.7's feed route + poll island + ISO-string date handling; the `onboarding.actions` shape; `ShipStatusTag`/`formatRelativeTime`/`CandidateBadge`-style pill.
- **Review (xhigh, 2 finders):** the server side came back clean (the `user_id` recipient invariant holds on all 3 fns; route authz correct) — applied 4 test-coverage hardening adds (mark-side foreign-recipient → count 0; route `Cache-Control` assertion; oversize-ids + markAll-throw). The UI finder caught the one real bug — the **double `FocusHeading`** in the empty state (the center's sr-only h1 + `PortalEmpty`'s own h1 → the 3.7 focus-steal class); fixed with a bespoke empty hero (no nested FocusHeading), and added an **optimistic `setQueryData`** so the bell badge drops instantly on mark-read (then reconciles via invalidate).

### File List

- **NEW:** `src/app/api/notifications/route.ts` (+ test); `src/server/portal/notifications.actions.ts` (+ test); `src/app/portal/(shell)/{notifications.ts (+ test), notification-bell.tsx, notification-center.tsx}`.
- **MODIFIED:** `src/server/db/repositories/notifications.repository.ts` (+3 reads/marks); `src/app/portal/(shell)/{portal-nav.tsx (bell swap), notifications/page.tsx (placeholder → center)}`; `notifications.repository.test.ts`.

## Senior Developer Review (AI)

**Reviewer:** CJ (via Claude xhigh code-review — 2 parallel finder angles) · **Date:** 2026-06-07 · **Outcome:** ✅ Approve

**Finder A — reads/route/privacy: clean.** Verified: `listNotifications`/`markNotificationsRead`/`markAllNotificationsRead` ALL filter `user_id = ctx.userId` (never an input) — a Client can't read/mark a co-recipient's row in their own engagement (RLS passes both, the user_id filter is the gate); mark is idempotent (`read_at IS NULL`) + own-only; the route is session-keyed (no spoofable param), getAppSession-guarded, ISO-serialized, `private, no-store`; the LEFT JOIN handles null shipUpdateId; cross-tenant RLS holds. 4 test-coverage gaps — all added.

**Finder B — bell/center UI: 1 real fix + UX hardening.** Verified clean: the shared `["notifications"]` query (bell + center), the invalidate landing on the persistent bell, the badge a11y (absent-at-zero, `99+`, aria-label on the Link), the `<time suppressHydrationWarning>`, the portal-nav regression (clean Bell removal). **Fixes:** the double-FocusHeading focus-steal (bespoke empty hero); an optimistic `setQueryData` for an instant badge drop.

**Action Items:**
- [x] **[High]** Double-FocusHeading in the empty state (3.7 focus-steal class) → bespoke empty hero — applied.
- [x] **[Low]** Optimistic `setQueryData` on mark-read (instant bell) — applied.
- [x] **[Low]** Test-coverage: mark-side foreign-recipient, route Cache-Control, oversize-ids, markAll-throw — applied.
- (Accepted) Cold-load 0-flash of the bell badge on non-notification pages (no initialData) — within the brief's tolerance; the badge appears after the first poll.

## Change Log

| Date       | Version | Description                                                       | Author |
| ---------- | ------- | ---------------------------------------------------------------- | ------ |
| 2026-06-07 | 0.1     | Story drafted (context-engineered).                              | Scrum  |
| 2026-06-07 | 1.0     | Implemented Tasks 1–5; xhigh review (2 angles, fixes); done.     | Dev    |
