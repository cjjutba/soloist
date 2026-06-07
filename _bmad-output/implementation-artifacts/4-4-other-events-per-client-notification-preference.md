---
baseline_commit: f8c339b
---

# Story 4.4: Other Events + Per-Client Notification Preference

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Client,
I want notifications for key events and a simple way to turn them off,
so that I stay informed on my terms (FR-15).

## Acceptance Criteria

1. **The fan-out is event-type-generic — a new event fires through the SAME path (FR-15).**
   **Given** the `ship/update.published` Inngest fan-out (Story 3.6)
   **When** a future key event needs to notify a Client (Epic 5's **invoice sent**; a later **engagement-start**)
   **Then** it fires through the **same fan-out mechanism** — one event-agnostic recipient-resolve + pref-gate + the already-type-generic `createNotification` (`type` is a free string; `ship_update_id` is nullable) — with **no per-event rework**. **4.4 adds NO new concrete event** (invoice is Epic 5; a client "engagement started" ping duplicates the Onboarding welcome — both deferred, CJ-confirmed "pure seam"); the deliverable is the **generic seam + a documented extension point**, proven by the pref-gate being shared and event-agnostic.

2. **A simple per-Client on/off — a global mute (FR-15, UX EXPERIENCE.md L50).**
   **Given** my notification preference (**default ON** for every Client)
   **When** I toggle notifications **off** from my portal
   **Then** the fan-out sends me **no further notifications of any kind** — no in-app notification row, no email, and (transitively) no toast — until I turn them back on; **the `/portal` Ship Feed still shows published updates** (the feed reads `ship_updates`, not `notifications`, so the product surface is never muted). It is a **simple per-Client on/off — NO granular per-channel prefs in v1** (CJ-confirmed "global mute").

## Tasks / Subtasks

- [x] **Task 1 — The preference column (schema + migration)** (AC: 2)
  - [x] `src/server/db/schema.ts` (MODIFY): add `notificationsEnabled: boolean("notifications_enabled").notNull().default(true)` to the **`clientAccess`** table (the pref lives on the existing 1-client↔1-engagement row — CJ-confirmed shape). A short comment: "Per-Client global notification on/off (Story 4.4); the fan-out gates on it BEFORE sending. Default true." **No new RLS policy** — the column inherits `client_access_scope` + the table's existing FORCE (migration 0006). Add nothing to the `pgPolicy` list.
  - [x] **Migration** (`npm run db:generate` → `drizzle/0013_*.sql`): a **bare `ALTER TABLE "client_access" ADD COLUMN "notifications_enabled" boolean NOT NULL DEFAULT true;`** (the same minimal shape as 2.5's `onboarded_at` (0007) and 3.4's `edited_at` (0011)). **No FORCE/policy line to append** (the table already ENABLEs+FORCEs RLS from 0006 — verified). Apply to Neon during Task 5.
  - [x] **Test** (`src/server/db/__tests__/isolation.test.ts`, EXTEND the client_access matrix): a Client ctx can **read + UPDATE only their own** `notifications_enabled` (RLS-scoped); a Client scoped to engagement E1 cannot flip E2's flag (the dual-scope `client_access_scope` already proves this shape — add the column to the existing assertions, don't rebuild the harness).

- [x] **Task 2 — Data layer: expose + set the pref** (AC: 1, 2)
  - [x] `src/server/db/repositories/client-access.repository.ts` (MODIFY):
    - **`findClientRecipientForEngagement`** — add `notificationsEnabled: clientAccess.notificationsEnabled` to the `.select({…})` so the fan-out can gate on it (it's a raw system read keyed on the trusted `engagementId` — no session — adding a column is trivial). The return type gains `notificationsEnabled: boolean`.
    - **NEW `setNotificationsEnabled(ctx: TenantContext, enabled: boolean)`** — `withTenant(ctx, …)` `UPDATE client_access SET notifications_enabled = $enabled WHERE engagement_id = ctx.engagementId` (RLS-scoped AND engagement-filtered defensively, mirroring `markOnboarded`; a freelancer ctx has no `engagementId` → guard `if (!ctx.engagementId) return`). Idempotent (setting the same value is a no-op write).
  - [x] `src/server/auth/session.ts` (MODIFY): expose **`notificationsEnabled`** on the **client** branch of `getAppSession` (`notificationsEnabled: access.notificationsEnabled` — **already on the `findClientAccessByUserId` row, no extra query**, the exact free pattern used for `onboardedAt`) + add `notificationsEnabled?: boolean` to the `AppSession` type. The settings page reads `session.notificationsEnabled`.
  - [x] **Test** (`client-access.repository` PGlite + `session.test.ts`): `setNotificationsEnabled` flips the row (and only the caller's engagement); `findClientRecipientForEngagement` returns the flag; `getAppSession` surfaces `notificationsEnabled` for a client (and leaves it undefined for a freelancer).

- [x] **Task 3 — The fan-out pref-gate + the generic seam** (AC: 1, 2)
  - [x] `src/server/inngest/functions/ship-published.ts` (MODIFY): **gate the whole fan-out on the pref, BEFORE `createNotification`.** After resolving the recipient, `if (!recipient.notificationsEnabled) return { status: "muted" }` — so a muted Client gets **no in-app row and no email** (and the 4.2 toast is transitively silent — it reads the `['notifications']` query, which gains no new row). Add `"muted"` to the `ShipPublishedResult` union. The `no-recipient` path is unchanged (still no-op when no Client has accepted).
  - [x] **Make the gate event-agnostic (the AC-1 seam):** extract a tiny **`resolveNotifiableRecipient(engagementId)`** (in `client-access.repository.ts` or a thin `notifications` helper) = `findClientRecipientForEngagement` + the `notificationsEnabled` check → returns the recipient or `null` (muted/none). `handleShipPublished` uses it; **document in a comment that a future event handler (Epic 5 `invoice_sent`) calls the SAME helper + `createNotification({ type: "invoice_sent", shipUpdateId: null })`** — that is the "same fan-out" genericity AC-1 asks for. **Do NOT build a speculative event-dispatch registry** (YAGNI — `createNotification` is already `type`-generic; the only shared-new-logic is the pref gate, which this centralizes).
  - [x] **Test** (`ship-published.test.ts`, EXTEND): `notifications_enabled = false` → `handleShipPublished` returns `"muted"`, creates **NO** notification (assert `createNotification` not called / no row) and sends **NO** email; `= true` → unchanged `"sent"`. Keep the existing `no-recipient`/`stale`/dedup tests green.

- [x] **Task 4 — The portal toggle (UI + action)** (AC: 2)
  - [x] `src/server/portal/notifications.actions.ts` (MODIFY) + `…/notifications.schema.ts` (or inline Zod): **NEW `setNotificationPrefAction(input)`** — `requireClient()` → Zod `{ enabled: boolean }` → `setNotificationsEnabled(ctx, enabled)` → `{ ok: true }`. Mirror the existing mark-read actions exactly (requireClient → Zod → repo → typed `{ok}`; **no `revalidatePath`** — the toggle is optimistic client-side and the value also re-reads from the session on next load).
  - [x] `src/app/portal/(shell)/settings/page.tsx` (NEW, RSC): `requireOnboardedClient()`; renders a single titled **switch** seeded from `session.notificationsEnabled ?? true` ("Notify me when something ships" / a one-line helper "Turn this off to stop emails and in-app alerts. Your updates still appear in your feed."). Calm, single-column, `max-w-2xl` like the rest of `(shell)`. A `FocusHeading` h1 (the established portal pattern).
  - [x] `src/app/portal/(shell)/notification-pref-toggle.tsx` (NEW, client island): a `role="switch"` `aria-checked` button (NOT a checkbox-in-a-menu) with a **≥44px hit area** + visible focus ring; **optimistic** (flip local state immediately, call `setNotificationPrefAction`, revert + a sonner error toast on failure). Transitions under **`motion-safe`** only (reduced-motion → instant), consistent with 4.2.
  - [x] `src/app/portal/(shell)/portal-nav.tsx` (MODIFY): add a **"Settings"** entry (a real `<Link href="/portal/settings">`, NOT an interactive toggle nested in the dropdown — cleaner a11y) to the avatar menu, above "Sign out". Keep the menu's Esc-close + focus-return behavior intact.
  - [x] **Test:** pure logic only where it exists (the toggle is mostly interactive/optimistic — assert the action's scope/validation in a node test; the switch's a11y is live-validated). If a `selectX`-style pure helper emerges, unit-test it (the house pattern); otherwise rely on the action + repo tests.

- [x] **Task 5 — Gates + deploy** (AC: 1, 2)
  - [x] `lint && typecheck && test && build` green (don't regress the 343 prior tests). Apply **migration 0013** to Neon (`npm run db:migrate` or the project's apply path). **No Inngest re-sync** — `handleShipPublished`'s logic changed but the function **id/trigger are unchanged** (like 3.3/3.9; re-sync is only for a NEW/renamed function). Deploy (`vercel --prod`; verify `.env.local` checksum `ecedc7314b8e405f0a7bba826b19ef73` unchanged) + push.
  - [x] **Live validation (CJ):** as the 2nd-account Client — open `/portal/settings`, toggle **off** → from the Cockpit publish an update → confirm **no email + no bell increment + no toast**, but the **Ship Feed still shows the new card**; toggle **on** → publish again → the email + bell + toast return. Confirm the switch is keyboard-reachable (Tab/Space), ≥44px, and instant under reduced-motion.

## Dev Notes

### What exists vs net-new (read this first)

[Source: `src/server/inngest/functions/ship-published.ts` (the fan-out, 3.6); `src/server/db/repositories/{client-access,notifications}.repository.ts`; `src/server/db/schema.ts` (clientAccess + notifications); `src/server/auth/session.ts`; `src/app/portal/(shell)/{portal-nav,notification-toaster}.tsx`; EXPERIENCE.md L37/L50; epics.md#Story 4.4]

- **Reused (don't rebuild):**
  - **`createNotification` is ALREADY event-type-generic** — `type: string` + `shipUpdateId?: string | null`, and the `notifications_ship_dedup` partial unique only constrains `ship_published` rows (`WHERE ship_update_id IS NOT NULL`), so a null-ship_update `invoice_sent`/`engagement_start` row inserts freely. The schema `type` comment already lists `ship_published (v1) | invoice_sent | engagement_start (later)`. **The data layer needs NO genericity work** — only the pref-gate is new.
  - **The fan-out chokepoint** `handleShipPublished` — the ONE place a Client notification is created (recipient-resolve → `createNotification` → email). The pref gate goes here, once, before the notification insert.
  - **`findClientRecipientForEngagement`** (raw system read, keyed on the trusted `engagementId`) — extend its `.select` with the flag; do NOT add a session.
  - **The session already loads the `client_access` row** (`findClientAccessByUserId`) and exposes `onboardedAt` "free — already on the fetched row": `notificationsEnabled` is the identical free add.
  - **`markOnboarded`** is the exact template for `setNotificationsEnabled` (RLS-scoped via `withTenant`, engagement-filtered, freelancer-ctx guard).
  - **The mark-read actions** (`src/server/portal/notifications.actions.ts`) are the exact template for `setNotificationPrefAction` (requireClient → Zod → repo → `{ok}`, no revalidate).
  - **The 4.2 toaster** reads the shared `['notifications']` query → muting the in-app row **automatically** silences the toast (no separate toast-gate needed).
  - The portal `(shell)` conventions: `requireOnboardedClient` gate, `max-w-2xl` single column, `FocusHeading`, `motion-safe`, ≥44px touch targets, the avatar-menu pattern in `portal-nav.tsx`.

- **Net-new (this story):** ONE column (`client_access.notifications_enabled`, migration 0013) + its session exposure + `setNotificationsEnabled` + the `resolveNotifiableRecipient` extraction + the `"muted"` fan-out branch + the `/portal/settings` page + the toggle island + the avatar-menu link + `setNotificationPrefAction`. **No new event is fired** (pure seam). **No new table, no new RLS policy, no Inngest function add/rename.**

### The two CJ-confirmed decisions (load-bearing)

[Source: this story's create-story Q&A, 2026-06-07]

1. **"Pure seam" for AC-1 (other events):** 4.4 ships NO concrete new event. Invoice-sent is Epic 5 (no invoices exist yet); a client "engagement started" notification duplicates the 2.5 Onboarding hero; a *freelancer*-recipient "client joined" ping would need a Cockpit notification surface that doesn't exist (no `/app` bell) — all deferred. The AC-1 deliverable is the **event-agnostic fan-out** (the shared `resolveNotifiableRecipient` + the already-generic `createNotification`) **+ a documented extension point** so Epic 5's invoice handler is a drop-in. **Resist building an unused event registry** (an altitude/over-engineering smell — there is exactly one event today).
2. **"Global mute" for AC-2 (pref scope):** OFF mutes the **whole fan-out** (in-app row + email + toast), gated in ONE place (`handleShipPublished`, before `createNotification`). Column name **`notifications_enabled`** (NOT `notify_email` — it is not a per-channel/email-only pref; the AC forbids per-channel granularity in v1). The **Ship Feed is never muted** (it reads `ship_updates`). Muting is forward-only — pre-existing notifications stay ("no FURTHER notifications").

### The load-bearing implementation details

[Source: schema.ts clientAccess (L163) + its `client_access_scope` policy (L190); drizzle/0006 (ENABLE+FORCE); ship-published.ts (L23-58); session.ts (L75-83); markOnboarded (client-access.repository L53)]

- **RLS inheritance (no new policy):** `client_access` already ENABLEs + FORCEs RLS and has the dual-scope `client_access_scope` (using/withCheck = `tenant_id = app.tenant_id AND (app.engagement_id IS NULL OR engagement_id = app.engagement_id)`). The new boolean column is covered by that policy automatically — **a client (engagement ctx) can only read/update their own row's flag** (the `setNotificationsEnabled` update runs under `withTenant`, so the GUCs scope it; the explicit `engagement_id` filter is defense-in-depth). **Append NO FORCE line** to migration 0013 (the table already forces — re-asserting is harmless but unnecessary; keep the migration a bare ADD COLUMN).
- **The gate location is the security/UX crux:** the pref check belongs in **`handleShipPublished`** (the fan-out), NOT in the publish action or the feed. Putting it before `createNotification` means muted = no in-app row = no bell = no toast = no email, in one branch. The publish itself, the `engagement.last_activity_at` bump, and `listPublishedUpdates` are **untouched** → the Client's feed updates regardless of their notification pref (correct: muting silences pings, not the product).
- **`"muted"` vs `"no-recipient"`:** distinct `ShipPublishedResult` variants — `no-recipient` = no Client has accepted yet (the feed still shows it once they join); `muted` = a Client exists but opted out. Both are terminal no-ops for the fan-out, neither is an error (don't throw → no Inngest retry).
- **Session exposure is free + read-only:** `getAppSession` already SELECTs the whole `client_access` row; surface `notificationsEnabled` like `onboardedAt`. The settings page is an RSC that reads `session.notificationsEnabled` — **no extra query, no client fetch on load**; the toggle island only WRITES (via the action), then optimistically reflects.
- **The toggle is a `role="switch"`, not a menu-checkbox:** keep the avatar dropdown a list of links (a nested interactive toggle inside a menu is an a11y trap); the menu links to `/portal/settings`, where the switch lives with a proper label + ≥44px hit area + focus ring + `motion-safe` transition (consistent with the 4.2 reduced-motion discipline).

### Architecture compliance

[Source: architecture.md (the publish fan-out is the Inngest `ship/update.published` job; notifications table is Client-scoped; RLS from day 1); EXPERIENCE.md L37 ("Account · notification defaults"), L50 ("notification on/off [simple toggle]"), L145 ("no settings the Client must configure to get value" → the pref defaults ON, opt-OUT not opt-in), L159 (≥44px touch targets), L157 (focus/Esc); DESIGN.md (the Client primary is the re-scoped Tenant accent — the switch's "on" state may use `--primary`)]

- **Opt-out, not opt-in** (L145): `notifications_enabled` DEFAULTs **true** — every Client is notified by default; the toggle only lets them quiet it. Never make value contingent on configuration.
- **Client-facing surface** → the settings page wears the Tenant brand (the `(shell)` already sets `--tenant-accent*` / re-scoped `--primary`); the switch's active state may use `--primary`. Never the Cockpit.
- Pure additive: the privacy gate, the publish action, the feed read, the email send-policy, and the Inngest function id/trigger are all unchanged.

### Project Structure Notes

- **NEW:** `drizzle/0013_*.sql`; `src/app/portal/(shell)/settings/page.tsx`; `src/app/portal/(shell)/notification-pref-toggle.tsx`.
- **MODIFIED:** `src/server/db/schema.ts` (clientAccess + column); `src/server/db/repositories/client-access.repository.ts` (`findClientRecipientForEngagement` select + `setNotificationsEnabled` + `resolveNotifiableRecipient`); `src/server/inngest/functions/ship-published.ts` (gate + `"muted"`); `src/server/auth/session.ts` (expose the flag); `src/server/portal/notifications.actions.ts` (+ `setNotificationPrefAction`); `src/app/portal/(shell)/portal-nav.tsx` (Settings link); the isolation/repo/session/fan-out tests.
- **Watch:** (1) column name `notifications_enabled` (global), default **true** — not `notify_email`. (2) gate **before** `createNotification`, return `"muted"`, don't throw. (3) the migration is a **bare ADD COLUMN** — no FORCE/policy line (the table already forces). (4) `setNotificationsEnabled` guards `!ctx.engagementId` + filters `engagement_id` (a freelancer must never write it). (5) the avatar menu links to settings — don't nest the switch in the dropdown. (6) the Ship Feed must stay visible when muted (don't gate `listPublishedUpdates`). (7) the toast needs **no** separate gate (it's downstream of the muted in-app row). (8) **no Inngest re-sync** (id/trigger unchanged).

### Testing requirements

- **RLS (PGlite, extend the client_access matrix):** a Client reads/updates only their own `notifications_enabled`; cross-engagement write is blocked by `client_access_scope`.
- **Repo (PGlite):** `setNotificationsEnabled` flips only the caller's engagement; `findClientRecipientForEngagement` returns the flag; the freelancer-ctx guard no-ops.
- **Fan-out (`ship-published.test.ts`, hoisted vi.mock):** `enabled=false` → `"muted"`, no `createNotification`, no email; `enabled=true` → `"sent"`; existing `no-recipient`/`stale`/dedup paths stay green.
- **Session (`session.test.ts`):** `notificationsEnabled` surfaces for a client, undefined for a freelancer.
- **Action:** `setNotificationPrefAction` requires a client + validates `{enabled:boolean}` (reject non-boolean) + calls the repo.
- **Regression:** the 343 prior tests stay green; no schema-beyond-the-column / route / Inngest-function change. (The switch's visual/keyboard/reduced-motion behavior is live-validated — Task 5.)

### References

- [Source: epics.md#Story 4.4 (other events through the same fan-out; simple per-Client on/off, no per-channel prefs in v1); #Story 3.6 (the fan-out + notifications table), #Story 4.1/4.2 (the center + toast that consume the rows)]
- [Source: architecture.md (Inngest `ship/update.published` fan-out; Client-scoped notifications; RLS-from-day-1); EXPERIENCE.md L37/L50/L145/L157/L159; DESIGN.md (Client primary = re-scoped Tenant accent)]
- [Source: src/server/inngest/functions/ship-published.ts; src/server/db/repositories/{client-access,notifications}.repository.ts; src/server/db/schema.ts (clientAccess L163, notifications L346); src/server/auth/session.ts; src/server/portal/notifications.actions.ts; src/app/portal/(shell)/{portal-nav,notification-toaster}.tsx; drizzle/0006 (client_access FORCE), 0007/0011 (bare ADD COLUMN precedent)]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (1M context) — dev-story + 2-angle xhigh review (server/security + UI/altitude).

### Debug Log References

- `npx tsc --noEmit` → clean. `npm run lint` → clean. `npx vitest run` → **352 passed (43 files)**, +9 over the prior 343. `npm run build` → ✓ Compiled. `npm run db:generate` → `drizzle/0013_shallow_katie_power.sql` (bare ADD COLUMN). `npm run db:migrate` → applied to Neon.

### Completion Notes List

- **The pref is one boolean on `client_access`** (`notifications_enabled NOT NULL DEFAULT true`, migration 0013 — a bare ADD COLUMN that inherits the table's existing RLS+FORCE from 0006; **no new policy**). Surfaced **free** on the client `AppSession` (already on the `findClientAccessByUserId` row, like `onboardedAt`); written by `setNotificationsEnabled(ctx, enabled)` (RLS-scoped via `withTenant`, engagement-filtered, freelancer-ctx no-op — the `markOnboarded` template).
- **The fan-out gate is the security crux + the AC-1 seam in one move:** a shared, **event-agnostic** `resolveNotifiableRecipient(engagementId)` folds the recipient lookup and the mute into a 3-state result (`ok`/`no-recipient`/`muted`). `handleShipPublished` consults it **before `createNotification`**, so a muted Client gets **no in-app row, no email, and (transitively) no toast** — the 4.2 toaster reads the `['notifications']` query, which gains no row. The Ship Feed is **never** gated (it reads `ship_updates`) → a muted Client still sees updates in `/portal`. A future event (Epic 5 `invoice_sent`) calls the SAME helper + the already-`type`-generic `createNotification` — that IS the "same fan-out" genericity, **no speculative registry** (AC-1 pure seam; CJ-confirmed).
- **Global mute, not per-channel** (CJ-confirmed): column `notifications_enabled`, one gate, mute is **forward-only** (pre-existing notifications are untouched — "no FURTHER").
- **The toggle** (`/portal/settings`, reached from the avatar-menu "Settings" Link — a Link, not a switch nested in the dropdown): a `role="switch"` button (`aria-checked` + `aria-busy` while writing), **≥44px hit area**, optimistic with revert-on-failure (+ error toast), `motion-safe` knob transition (instant under reduced-motion). The RSC page seeds it from `session.notificationsEnabled ?? true` (opt-OUT default); the island only writes via `setNotificationPrefAction` (requireClient → Zod `{enabled:boolean}` → repo).
- **Scope discipline:** no new event fired, no new table, no new RLS policy, **no Inngest re-sync** (the fan-out function id/trigger are unchanged — only its body gained the gate, like 3.3/3.9).
- **Review (2 finders, both came back clean of correctness/security bugs):** applied 2 hardening items — (1) strengthened the isolation `(t2)` test to use **WHERE-less** UPDATEs (an unqualified write scoped to a foreign engagement must hit 0 rows — proves the RLS *engagement* clause confines it, not an app predicate; would catch a future policy regression the pinned-WHERE form missed); (2) added **`aria-busy={pending}`** to the switch so the in-flight write is legible to AT. The finders confirmed: no double-`FocusHeading` (the `(shell)` layout renders none; the settings page has exactly one), correct optimistic revert (no client/server divergence), correct switch a11y + hit-area math, the Ship Feed never consults the pref, and the action authz is sound.

### File List

- `src/server/db/schema.ts` (MODIFIED) — `clientAccess.notificationsEnabled` + `boolean` import.
- `drizzle/0013_shallow_katie_power.sql` (NEW) — `ADD COLUMN notifications_enabled boolean NOT NULL DEFAULT true`.
- `src/server/db/repositories/client-access.repository.ts` (MODIFIED) — `findClientRecipientForEngagement` selects the flag; NEW `resolveNotifiableRecipient` (+ `NotifiableResolution`/`ClientRecipient` types) + `setNotificationsEnabled`.
- `src/server/inngest/functions/ship-published.ts` (MODIFIED) — the pref gate + `"muted"` result variant.
- `src/server/auth/session.ts` (MODIFIED) — `notificationsEnabled` on the client `AppSession`.
- `src/server/portal/notifications.actions.ts` (MODIFIED) — `setNotificationPrefAction` + `prefSchema`.
- `src/app/portal/(shell)/settings/page.tsx` (NEW) — the RSC settings page.
- `src/app/portal/(shell)/notification-pref-toggle.tsx` (NEW) — the `role="switch"` optimistic island.
- `src/app/portal/(shell)/portal-nav.tsx` (MODIFIED) — the avatar-menu "Settings" Link.
- Tests: `client-access.repository.test.ts`, `isolation.test.ts`, `ship-published.test.ts`, `session.test.ts`, `notifications.actions.test.ts` (all extended).

## Senior Developer Review (AI)

**Reviewer:** CJ (via Claude xhigh review, 2 parallel finders) · **Date:** 2026-06-07 · **Outcome:** ✅ Approve (2 hardening items applied; no correctness/security bug found)

**Scope:** the full 4.4 surface — split into a **server/data/security** finder (RLS column inheritance, the fan-out gate, `setNotificationsEnabled` scope, action authz, session exposure, the muted-vs-no-recipient distinction, the "feed not muted" invariant, test integrity) and a **UI/a11y/altitude** finder (the optimistic toggle, switch a11y + hit-area math, reduced-motion, the FocusHeading focus-steal class, the avatar-menu Link, branding, over-engineering).

**Findings (2; both actioned, both LOW — test-strength + a11y polish):**

1. **[Low — FIXED] The isolation foreign-write test was narrow.** It pinned the foreign UPDATE's `WHERE` to a known id, so it proved RLS suppresses *that* write but wouldn't catch a future regression that dropped the policy's engagement clause. **Fix:** rewrote `(t2)` to use **WHERE-less** UPDATEs — scoped-to-own hits exactly 1 row, scoped-to-foreign hits 0 — so the RLS engagement clause (not an app predicate) is what's proven to confine the write.
2. **[Low — FIXED] No in-flight signal on the switch.** The optimistic toggle had no `aria-busy`/disabled during the write, so a screen-reader user wasn't told the write was pending before a possible revert. **Fix:** added `aria-busy={pending}`.

**Verified clean (no action):** the migration safely inherits RLS+FORCE (no new policy); a muted Client is emailed/notified/toasted by **no** path (the gate is before `createNotification`); the mute is forward-only and never touches the feed read; `setNotificationPrefAction` requires a client + Zod-validates + scopes to the caller's engagement; `notificationsEnabled` surfaces free for clients and stays undefined for freelancers; **no double-`FocusHeading`** (the shell layout renders none; the settings page has exactly one); the optimistic revert can't diverge client/server; the `role="switch"` is keyboard-operable with a correct ≥44px hit area and in-bounds knob math; reduced-motion is honored; the avatar-menu Link preserves Esc-close/focus-return; the hand-rolled switch doesn't reinvent an existing primitive (no shadcn Switch; `checkbox.tsx` is the wrong affordance). The dropped-second-rapid-tap (blocked by the `pending` guard) was judged acceptable (correctness intact; the design brief permits blocking).

## Change Log

| Date       | Version | Description                                  | Author |
| ---------- | ------- | -------------------------------------------- | ------ |
| 2026-06-07 | 0.1     | Story drafted (context-engineered): pure-seam fan-out genericity + global-mute pref on client_access. | Scrum  |
| 2026-06-07 | 1.0     | Implemented: `notifications_enabled` on client_access (mig 0013) + event-agnostic fan-out gate (`resolveNotifiableRecipient`, `"muted"`) + portal settings toggle; xhigh review (2 finders, 2 low hardening fixes); 352 tests green; migrated + deployed. | Dev    |
