---
baseline_commit: 4116944
---

# Story 3.5: Curate Candidates (Edit, Status, Dismiss)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Freelancer,
I want to review, inline-edit, re-tag, and dismiss candidate Ship Updates from the curation queue,
so that only meaningful, well-worded progress reaches my client — and my dashboard shows how many candidates actually need attention (FR-12, UX-DR5/6/7/18).

## Acceptance Criteria

1. **Inline curation — edit, re-tag, dismiss (FR-12, UX-DR5/6/7).**
   **Given** an Engagement's **Ship Feed tab = the curation queue** (the default tab, today a placeholder)
   **When** I open a candidate row
   **Then** I can **inline-edit** its title and summary (click-to-edit, **blur-to-save** — no separate edit mode), **cycle its status tag** among ✅ Shipped / 🚧 In Progress / 📦 Next via a segmented toggle, and **dismiss/hide** it so it leaves the queue and **never reaches the Client** (`state` → `dismissed`). Editing a candidate stamps `edited_at` (the Story 3.4 kill-signal that feeds `renderingQualityStat`). The queue lists only `state='candidate'` rows for that Engagement, newest first; a cleared queue shows the calm done-state "All caught up. New activity from GitHub will appear here." **Publish is NOT in this story** (it is the deliberate gate built in Story 3.6) — a candidate can be edited/tagged/dismissed but not yet made Client-visible.

2. **Keyboard primitives + bulk-select + the real candidate-count badge (UX-DR18).**
   **Given** the curation queue
   **When** I work it from the keyboard
   **Then** `j`/`k` move the focused candidate down/up, `e` enters inline-edit on the focused row, `1`/`2`/`3` set its status (✅/🚧/📦), `x` dismisses it, and `Esc` exits an edit — **single-key shortcuts are suppressed while a text field is focused**, and **every shortcut also maps to a visible, focusable control** (shortcuts are never the only path). **Bulk-select** (a checkbox per row, shown on `lg+`) lets me dismiss several at once. **And** the Engagement's candidate-count badge on the dashboard (Story 2.2's `0` seam in `listDashboard`) now reflects the **real** count of `state='candidate'` rows — appearing when >0, absent at zero.

## Tasks / Subtasks

- [x] **Task 1 — Curation repository functions (RLS-scoped)** (AC: 1, 2)
  - [x] `src/server/db/repositories/ship-update.repository.ts`: add `listCandidates(ctx, engagementId)` → `withTenant`, `WHERE engagement_id = ? AND state = 'candidate'`, `ORDER BY created_at DESC`. (RLS already scopes to the tenant; the explicit `engagement_id` filter narrows to this Engagement.)
  - [x] `updateCandidate(ctx, id, { title?, summary?, statusTag? })` → `withTenant`; **allow-list** only those three mutable columns (never spread caller input — mirror `updateEngagement`'s explicit destructure so `tenant_id`/`state`/`id` can't be moved); **always set `edited_at = now()`** (this path exists only for curation, so any edit is the kill-signal); guard `WHERE id = ? AND state = 'candidate'` (can't edit a published/dismissed row through the curation path); `.returning()` → row or null. **Validate `statusTag` against the allowed set in the action layer, not raw.**
  - [x] `dismissCandidate(ctx, id)` → `withTenant`, `UPDATE … SET state='dismissed' WHERE id=? AND state='candidate'` `.returning()` → row or null (null = already dismissed/published/not-yours; idempotent + RLS-safe).
  - [x] `dismissCandidates(ctx, ids)` (bulk) → `withTenant`, `inArray(id, ids)` + `state='candidate'` guard; return the count dismissed. Empty `ids` → no-op `{ count: 0 }`.
  - [x] `countCandidatesByEngagement(ctx)` → `withTenant`, `SELECT engagement_id, COUNT(*) … WHERE state='candidate' GROUP BY engagement_id` → return a `Map<engagementId, number>` (or `Record`). RLS-scoped → only the caller's tenant's rows. (Drives Task 4's badge.)
  - [x] **Tests** (`src/server/db/__tests__/ship-update.repository.test.ts`, PGlite): listCandidates returns only `candidate` rows for the given engagement, newest-first, and is RLS-isolated (Tenant B sees none of A's); updateCandidate stamps `edited_at`, patches only the allow-listed fields, returns null for a non-candidate/foreign row; dismissCandidate flips to `dismissed` once then returns null on replay; dismissCandidates bulk-dismisses only candidates and reports the count; countCandidatesByEngagement groups correctly, **ignores `dismissed`/`published`**, and is cross-tenant isolated.

- [x] **Task 2 — Curation Server Actions + Zod schema** (AC: 1, 2)
  - [x] `src/server/ship-feed/curation.schema.ts` (NEW): `editCandidateSchema` = `{ id: uuid, title?: string (1..200, trimmed), summary?: string | null (≤2000), statusTag?: enum(SHIP_STATUS keys) }` with **at least one of title/summary/statusTag present** (a `.refine`); `dismissCandidateSchema` = `{ id: uuid }`; `bulkDismissSchema` = `{ ids: uuid[] (1..100) }`. Reuse the `SHIP_STATUS` keys from Task 3's constant as the single source of truth for the status enum.
  - [x] `src/server/ship-feed/curation.actions.ts` (NEW, `"use server"`): `editCandidateAction(input)`, `dismissCandidateAction(input)`, `bulkDismissCandidatesAction(input)` — each: `const ctx = await requireFreelancer()` → `schema.safeParse` (return `{ ok:false, error }` on failure with the first issue message) → repository call → `revalidatePath` the **dashboard `/app`** (badge count changed) **and** the engagement detail path (`/app/engagements/${engagementId}` — pass `engagementId` through, or resolve it from the returned row) → return `{ ok:true }` / `{ ok:true, count }`. Mirror the `repo-connections.actions.ts` shape exactly (typed result union, `console.error` of `err.message` only — never the full object). A null repository result (foreign/published/already-dismissed id) → a friendly `{ ok:false, error: "That candidate is no longer in your queue." }`.
  - [x] **Tests** (`src/server/ship-feed/__tests__/curation.actions.test.ts`, NEW — mirror `repo-connections.actions.test.ts`: hoisted `vi.mock` of `@/server/auth/session` (`requireFreelancer`) and the repository): a valid edit calls `updateCandidate` with the parsed patch + returns `{ok:true}`; an invalid `statusTag`/missing-all-fields is rejected by Zod before any repo call; dismiss + bulk-dismiss happy paths; a null repo result maps to the friendly error.

- [x] **Task 3 — `ShipStatusTag` component + the `SHIP_STATUS` single source of truth** (AC: 1)
  - [x] `src/components/ui/ship-status-tag.tsx` (NEW): export `SHIP_STATUS` — an **ordered** record keyed by `shipped|in_progress|next` with `{ label, emoji, order, classes }` using the DESIGN tokens: ✅ Shipped `text-[#15803D] bg-[#ECFDF3]`; 🚧 In Progress `text-[#92400E] bg-[#FEF6E7]`; 📦 Next `text-[#475569] bg-[#F1F5F9]` (soft tinted pills, `rounded-full`, emoji + label). Export `ShipStatusTag({ status })` (read-only pill, falls back to `in_progress` via `Object.hasOwn` like `StatusBadge` — never trust free-text) for reuse by the Client feed (3.7) + emails (3.6). Export `SHIP_STATUS_KEYS` (the cycle order for `1/2/3` + the segmented toggle).
  - [x] **Test** (`src/components/ui/__tests__/ship-status-tag.test.tsx` or `.ts`): the three keys map to the right label/emoji; an unknown status falls back to `in_progress` (the `Object.hasOwn` guard); `SHIP_STATUS_KEYS` is `["shipped","in_progress","next"]` length-3.
  - [x] `src/components/ui/checkbox.tsx` (NEW, minimal): a styled checkbox for bulk-select — a native `<input type="checkbox">` with the project's focus-ring + radius classes, `forwardRef`, accepts `checked`/`onCheckedChange` or standard props + an `aria-label`. (No new dependency — don't pull in Radix; keep it a styled native input.)

- [x] **Task 4 — Real candidate-count badge** (AC: 2)
  - [x] `src/server/db/repositories/engagements.repository.ts`: in `listDashboard`, replace the hardcoded `candidateCount: 0` with the real count — call `countCandidatesByEngagement(ctx)` (Task 1) once, then `candidateCount: counts.get(e.id) ?? 0`. Keep the `compareDashboard` sort (last-activity, then candidate-count). **One grouped query, not N+1.** Remove/replace the now-stale "ship_updates doesn't exist yet → 0" comment.
  - [x] **Test** (`src/server/db/__tests__/engagements.repository.test.ts`): seed candidates across two engagements (+ one `dismissed` + one `published` that must NOT count) → `listDashboard` returns the right per-engagement counts and the badge-driving order; an engagement with zero candidates → `candidateCount: 0`; cross-tenant: Tenant B's dashboard never reflects A's candidates.

- [x] **Task 5 — The curation queue UI (the Ship Feed tab)** (AC: 1, 2)
  - [x] `src/app/app/engagements/[id]/(detail)/page.tsx`: replace the `TabPlaceholder` with the real queue. Server component: `const { id } = await params; if (!isUuid(id)) notFound(); const ctx = await requireFreelancer();` → `const candidates = await listCandidates(ctx, id);` → render the **empty done-state** when none, else `<CurationQueue engagementId={id} candidates={candidates} />`. (The parent `(detail)/layout.tsx` already guards the engagement; this page re-guards + reads — match the `repos/page.tsx` shape.)
  - [x] `src/app/app/engagements/[id]/(detail)/keyboard.ts` (NEW, pure + testable): `shouldSuppressShortcut(target)` → true when the event target is an `INPUT`/`TEXTAREA`/`[contenteditable]` (so `1/2/3/x` never fire mid-edit); `nextIndex(current, len, dir)` → clamped j/k navigation (no wrap past the ends, or wrap — pick one and test it). Keep ALL focus/selection math here so it's unit-tested without a DOM-heavy harness.
  - [x] `src/app/app/engagements/[id]/(detail)/curation-queue.tsx` (NEW, `"use client"`): owns `focusedIndex` + a `Set<string>` selection; a `window` keydown listener using `shouldSuppressShortcut` + `nextIndex` for `j/k`, and `e`/`1`/`2`/`3`/`x` dispatching to the focused row's handlers (each calls the matching action, then `router.refresh()`); renders a `CandidateRow` per candidate (passing focused state + a ref for `scrollIntoView`); on `lg+` shows the bulk-select column + a sticky bulk bar ("Dismiss N selected") wired to `bulkDismissCandidatesAction`; a `?`-key toggles a small keyboard-shortcuts overlay (lists `j/k/e/1/2/3/x`). Use the existing `useState`+`await action`+`toast`+`router.refresh()` mutation pattern (the repo has **no** `useOptimistic`/`useTransition` — stay consistent; optionally hold a local optimistic value for the inline fields and reconcile on refresh).
  - [x] `src/app/app/engagements/[id]/(detail)/candidate-row.tsx` (NEW, `"use client"`): one row = a `ship-update-card` in edit mode (Paper card, the DESIGN anatomy). **Inline-edit:** title renders as text → click (or `e`) swaps to an `Input` autofocused → **blur saves** (`editCandidateAction({ id, title })` if changed) and `Esc` reverts+exits; summary same with `Textarea`. **Status:** the three `SHIP_STATUS` as a segmented toggle (each a real `<button>` with `aria-pressed`) calling `editCandidateAction({ id, statusTag })`. **Dismiss:** a visible button (and the `x` shortcut) → `dismissCandidateAction({ id })` with a toast. Show the relative timestamp (reuse `src/lib/relative-time.ts`). **No Publish button** (Story 3.6 adds it). Toast on every save/dismiss; revert local state + `toast.error` on `{ ok:false }`.

- [x] **Task 6 — Gates + deploy** (AC: 1, 2)
  - [x] `lint && typecheck && test && build` green (don't regress the 246 prior tests). Commit `drizzle/` only if a migration was generated — **none is expected** (every column used already exists: `state`, `status_tag`, `title`, `summary`, `edited_at`). Run `npm run db:generate` to PROVE no drift. Deploy (`vercel --prod`; verify `.env.local` checksum `ecedc7314b8e405f0a7bba826b19ef73` unchanged) + push. No Inngest re-sync (no function change).
  - [x] **Live validation (CJ):** in prod, open an Engagement with auto-pulled candidates → inline-edit a title (blur saves), cycle a status with `1/2/3`, dismiss noise with `x`, bulk-dismiss on a wide screen → confirm the dashboard candidate-count badge drops accordingly and dismissed/edited rows behave. (Real candidates already exist from the 3.1–3.3 pipeline.)

## Dev Notes

### What exists vs net-new (read this first)

[Source: code map — `ship-update.repository.ts`, `engagements.repository.ts`, `(detail)/` route group, `repo-connections.actions.ts`, `badge.tsx`]

- **Reused (don't rebuild):**
  - `shipUpdates` table **already has every column** this story needs — `state` (`candidate|published|dismissed`), `statusTag` (`shipped|in_progress|next`), `title`, `summary`, **`edited_at`** (added by Story 3.4, migration 0011), `created_at`. **No schema change, no migration.** The RLS policy `ship_update_scope` + FORCE (migration 0008) already governs reads/writes.
  - The **RLS scoping is automatic.** A `requireFreelancer()` ctx carries `tenantId` but **no `engagementId`**, so the policy `tenant_id = app.tenant_id AND (app.engagement_id IS NULL OR engagement_id = app.engagement_id)` reduces to `tenant_id = app.tenant_id` — the freelancer can curate any candidate across **all** their own engagements (correct), and can never touch another tenant's. The explicit `engagement_id` filter in `listCandidates` is for *scoping the view to one Engagement*, not for security (RLS is the security).
  - `createCandidate`/`findCandidateBySourceEventKey`/`renderingQualityStat` (the same file) + the `withTenant(ctx, tx => …)` choke point + the `updateEngagement` allow-list pattern (explicit destructure, never spread into `.set()`).
  - The Server-Action shape: `requireFreelancer` → `safeParse` → repo → `revalidatePath` → typed `{ok}` union (`repo-connections.actions.ts`/`engagements.actions.ts`). Actions are unit-tested by mocking `requireFreelancer` + the repo (`repo-connections.actions.test.ts`).
  - The `(detail)` route group: `layout.tsx` guards the engagement (`requireFreelancer` + `getEngagement` + `notFound`); the **Ship Feed page is the default index tab** (`page.tsx`, currently `TabPlaceholder`); `engagement-tabs.tsx` is route-based nav. `repos/page.tsx` is the closest pattern (async server read + a client interaction island + a Suspense/toast client component).
  - Client mutation pattern (`repos/disconnect-button.tsx`, `repos/install-toast.tsx`): `"use client"`, `useState` busy, `await action()`, `toast.success/error` (from `sonner`, Toaster mounted in `src/app/providers.tsx`), `router.refresh()`. **No `useOptimistic`/`useTransition` anywhere — don't introduce a new state paradigm; match the existing one.**
  - UI primitives present: `button` (has a `loading` prop), `input`, `textarea`, `card`, `field`, `label`, `badge`. **Missing → add minimal:** `checkbox.tsx` (styled native input) and `ship-status-tag.tsx` (the three status pills + the `SHIP_STATUS` constant).
  - `src/lib/relative-time.ts` (the `<time>` relative formatter from Story 2.2) for the row timestamp; `src/lib/uuid.ts` `isUuid()`.

- **Net-new (this story):** the five curation repository functions; the curation actions + schema; the `ShipStatusTag`/`SHIP_STATUS` component + a `checkbox`; the real candidate-count in `listDashboard`; and the curation-queue UI (the page + a keyboard-driven client manager + the inline-edit row + a pure `keyboard.ts` helper).

### Scope guardrails (what NOT to build)

- **No Publish.** Publish is the single privacy gate, built in Story 3.6 (it flips `state=published`, sets `published_at`, bumps `last_activity_at`, emits Inngest `ship.published`). 3.5 stops at edit/tag/dismiss. The keyboard map here is exactly `j/k/e/1/2/3/x` + `Esc` — **no `p`** (the UX `p`=publish lands with 3.6), and **bulk-select drives bulk *dismiss*** (bulk publish is 3.6). Leave the row's layout with room for a future Publish control but don't add it.
- **No manual authoring** (Story 3.8), **no Client feed** (3.7), **no LLM summarizer** (fast-follow — the heuristic from 3.1/3.4 already produced these candidates). Don't touch the webhook/cron pipeline.
- **Don't add an `edited_at`-only "was edited" flag elsewhere** — `renderingQualityStat` (3.4) already reads `edited_at`; this story just *populates* it.

### Architecture compliance

[Source: architecture.md L175–185 (ShipUpdate model + the privacy projection), L208 (Server Actions: "curate (edit title/summary, set status, dismiss)" is an explicitly named action), L220–223 (client islands for "curation queue editing", `sonner` toasts, RHF+Zod), L249 (candidates are Freelancer-only; publish is the *only* path to Client-visible — so dismiss/edit never cross the boundary), L277–279 (naming: `*.actions.ts` `verbNoun`, `ship-update.repository.ts`, `ShipStatusTag` PascalCase)]

- **The curation queue is Freelancer-only by construction:** every row is `state='candidate'`, which no Client query ever selects (the Client feed, 3.7, reads `state='published'` projections). Dismiss = `state='dismissed'` keeps the row for history but out of both the queue and any future Client view. So 3.5 operates entirely inside the privacy boundary — there is no client-exposure surface to get wrong here, but **never render `raw_meta`** in a row (title/summary/status/timestamp only — the DESIGN ship-update-card anatomy).
- **`edited_at` semantics (the kill-signal):** stamp it on **any** curation edit (title, summary, or statusTag) via `updateCandidate`. Rationale: all three are heuristic outputs (3.4's `mapEvent` derived them); a freelancer touching any of them means the auto-render wasn't publish-ready, which is exactly the "% edited before publish" quality proxy `renderingQualityStat` measures. Document this so 3.6's publish-time metric reads correctly. (A pure re-tag is still "needed curation.")
- **Status vocabulary is fixed** (✅ Shipped / 🚧 In Progress / 📦 Next) and shared across the Cockpit queue, the Client feed, and emails — hence `SHIP_STATUS` as the one source of truth (DESIGN.md L128–130/L177–182). The DB stores `shipped|in_progress|next`; the emoji/label/color live only in the component.

### Accessibility floor (non-negotiable — UX-DR18 / EXPERIENCE.md L158–164)

- **Every shortcut maps to a visible, focusable control** (edit button, the three status buttons with `aria-pressed`, a dismiss button, row checkboxes). Shortcuts are an accelerator, never the only path.
- **Single-key shortcuts are suppressed while a text input/textarea is focused** — `shouldSuppressShortcut` gates `e/1/2/3/x` (and `j/k`) so typing a summary that contains "x" or "1" never dismisses/retags. `Esc` is the one key that *should* work inside a field (exit edit).
- **Focus management:** the focused candidate gets a visible focus ring + `scrollIntoView({ block: "nearest" })`; entering edit moves focus into the field; `Esc`/blur returns focus to the row. A `?` overlay lists the shortcuts (EXPERIENCE.md L160).
- **Bulk-select is `lg+` only** (responsive utility classes — `hidden lg:flex` etc.); on smaller screens the per-row dismiss is the path (EXPERIENCE.md L171).
- Checkbox + toggle buttons need accessible names (`aria-label`/`aria-pressed`); the status toggle announces the current selection.

### Project Structure Notes

- **NEW:** `src/server/ship-feed/curation.actions.ts`, `src/server/ship-feed/curation.schema.ts`, `src/server/ship-feed/__tests__/curation.actions.test.ts`; `src/components/ui/ship-status-tag.tsx` (+ `__tests__/ship-status-tag.test.tsx`), `src/components/ui/checkbox.tsx`; `src/app/app/engagements/[id]/(detail)/curation-queue.tsx`, `candidate-row.tsx`, `keyboard.ts` (+ `__tests__/keyboard.test.ts`).
- **MODIFIED:** `src/server/db/repositories/ship-update.repository.ts` (+5 functions), `src/server/db/repositories/engagements.repository.ts` (real `candidateCount`), `src/app/app/engagements/[id]/(detail)/page.tsx` (placeholder → queue), the two repo test files.
- **Naming:** repository fns `verbNoun` in `ship-update.repository.ts`; actions `verbNounAction` in `curation.actions.ts`; component files `kebab-case.tsx` exporting `PascalCase`. The status DB values stay `snake_case` (`in_progress`).
- **Watch:** (1) `revalidatePath` must hit **both** `/app` (badge) and the engagement detail page — a dismiss that doesn't refresh the dashboard badge looks broken. (2) Keep `countCandidatesByEngagement` a **single grouped query** — don't loop per engagement. (3) The `updateCandidate`/`dismissCandidate` `state='candidate'` guard is what makes them idempotent + prevents editing a published row. (4) The inline-edit blur-to-save must **not** fire a save when the value is unchanged (avoid a needless write + `edited_at` bump on a focus-then-blur with no typing).

### Testing requirements

[Source: existing test patterns — PGlite repos run every `drizzle/*.sql` migration then exercise `withTenant`; action tests hoist-mock `requireFreelancer` + the repo; `isolation.test.ts` proves cross-tenant RLS.]

- **Repository (PGlite, `ship-update.repository.test.ts`):** the five new fns — candidate-only filtering, newest-first order, `edited_at` stamping, allow-listed patch, the `state='candidate'` guard (null on replay/foreign), bulk count, grouped count ignoring `dismissed`/`published`, and **cross-tenant isolation** for each (Tenant B sees/affects nothing of A's). Consider adding rows to `isolation.test.ts` if a new access path warrants it (the existing ship_updates isolation rows already cover the policy).
- **Actions (`curation.actions.test.ts`):** valid edit/dismiss/bulk → repo called with the parsed input + `{ok:true}`; Zod rejects bad `statusTag`, empty patch, non-uuid, oversized bulk; null repo result → friendly error; `requireFreelancer` mocked.
- **Component/pure (`ship-status-tag.test`, `keyboard.test`):** status key→label/emoji + unknown→fallback; `SHIP_STATUS_KEYS` order; `shouldSuppressShortcut` true for input/textarea/contenteditable & false otherwise; `nextIndex` clamps/wraps as specified.
- **Dashboard (`engagements.repository.test.ts`):** `listDashboard` real counts + order + zero + cross-tenant.
- **Regression:** the 246 prior tests stay green (no pipeline/summarizer change).

### References

- [Source: epics.md#Story 3.5 (AC: inline-edit click-to-edit/blur-to-save, cycle status, dismiss/hide, `j/k/e/1/2/3/x` suppressed-in-field, bulk-select lg+, real candidate-count badge); #Story 3.6 (publish is the next gate — out of scope here); #Story 3.4 (`edited_at` + `renderingQualityStat` this story populates)]
- [Source: ux-designs/ux-soloist-2026-06-05/EXPERIENCE.md L100–103 (Ship Update card / curation queue row anatomy + actions), L139–141 (keyboard map, inline-edit, bulk-select lg+), L158–164 (a11y floor: shortcuts map to controls, suppressed-in-field, `?` overlay), L123 (empty done-state copy); DESIGN.md L27–31/L128–130/L177–182 (status-tag tokens, candidate-badge absent-at-zero, curation row = card in edit mode)]
- [Source: architecture.md L175–185 (ShipUpdate model + privacy projection), L208 (curate Server Action), L220–223 (client islands + sonner + RHF/Zod), L249 (candidate→published gate), L277–279 (naming)]
- [Source: src/server/db/repositories/ship-update.repository.ts (createCandidate/withTenant pattern + the file to extend); src/server/db/repositories/engagements.repository.ts (listDashboard `0` seam + updateEngagement allow-list); src/server/repo-connections/repo-connections.actions.ts (action shape) + its test (mock pattern); src/app/app/engagements/[id]/(detail)/{layout,page,repos/page,repos/disconnect-button,repos/install-toast}.tsx (route-group + client-island patterns); src/components/ui/badge.tsx (StatusBadge Object.hasOwn fallback to copy for ShipStatusTag); src/app/providers.tsx (Toaster mount)]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (1M context)

### Debug Log References

- Gates: `npx tsc --noEmit` clean · `eslint` clean · `vitest run` **269 passed (31 files)** (+23 over the 246 baseline) · `next build` ✓ Compiled · `drizzle-kit generate` → "No schema changes" (zero migration — every column already existed).

### Completion Notes List

- **AC-1 (inline curation):** five RLS-scoped repository functions in `ship-update.repository.ts` — `listCandidates` (engagement-filtered, `state='candidate'`, newest-first), `updateCandidate` (allow-listed title/summary/statusTag, **always stamps `edited_at`**, guarded `state='candidate'`), `dismissCandidate` + `dismissCandidates` (bulk; both guard `state='candidate'` → idempotent, can't un-publish), `countCandidatesByEngagement` (one grouped `count(*)::int`). Server actions `editCandidateAction`/`dismissCandidateAction`/`bulkDismissCandidatesAction` (`curation.actions.ts` + Zod `curation.schema.ts`) mirror the repo-connections shape: `requireFreelancer` → `safeParse` → repo → revalidate **both** `/app` and the engagement path → typed `{ok}` union; a null repo result maps to a friendly "no longer in your queue" (RLS + the state guard make foreign/published ids null). The Ship Feed tab (`(detail)/page.tsx`) is now the real queue (placeholder removed); a cleared queue shows the calm "All caught up." done-state. **Publish is deliberately absent** (the 3.6 gate) — the keymap is `j/k/e/1/2/3/x` + `Esc`, bulk-select drives bulk *dismiss*.
- **AC-2 (keyboard + bulk + real badge):** `curation-queue.tsx` (client) wires a `window` keydown — `j/k` navigate, `e` edits, `1/2/3` set ✅/🚧/📦, `x` dismisses, `?` toggles a shortcuts overlay — all **suppressed while a text field is focused** (the pure `keyboard.ts` `isEditableTarget`), each mapped to a visible control. `candidate-row.tsx` is the inline-edit row (click/`e` → blur saves, Esc discards; status segmented toggle with `aria-pressed`; dismiss button). Bulk-select checkbox + sticky bar are `lg+` only. `listDashboard` now calls `countCandidatesByEngagement` → the Story 2.2 candidate-count badge is **real** (absent at zero, appears at >0). The status vocabulary is a single source of truth split into pure data (`ship-status.ts`: `SHIP_STATUS`/`SHIP_STATUS_KEYS`/`toShipStatus`) + a presentational `ShipStatusTag` (`ship-status-tag.tsx`) reusable by the 3.7 feed + 3.6 emails; a minimal native `checkbox.tsx` (no Radix).
- **No schema change** — `ship_updates` already carried `state`/`status_tag`/`title`/`summary`/`edited_at`/`created_at`. RLS is automatic: a freelancer ctx has no `engagementId`, so `ship_update_scope` reduces to `tenant_id = app.tenant_id`; the explicit `engagement_id` filter in `listCandidates` scopes the *view*, not security. `raw_meta` is never projected to the client (`CandidateView` carries only id/title/summary/statusTag/createdAt).
- **Self-caught + fixed before review (2 interaction bugs):** (1) Esc-to-cancel was about to *save* — `setEditing(false)` unmounts the input → fires `onBlur` → `commit` ran with the still-edited value; fixed with a `cancel` ref that `commit` checks first (Esc just sets it + blurs). (2) Typing `?` in a field toggled the help overlay — moved the suppress-in-field guard ahead of the `?` handler.
- **Test strategy:** the node test env (no jsdom) drove a clean split — all DOM-free logic is pure and unit-tested (the 5 repo fns + cross-tenant RLS via PGlite; the 3 actions via hoisted mocks; `keyboard.ts`; the `SHIP_STATUS` vocabulary; the real dashboard count). The React inline-edit/keyboard wiring is validated live (CJ's Task 6 step). +23 tests.

### Senior Developer Review (AI)

**Reviewer:** CJ (via Claude xhigh code-review — 2 parallel finder angles + verify) · **Date:** 2026-06-07 · **Outcome:** ✅ Approve

**Scope:** the curation data layer + actions (finder A) and the keyboard/inline-edit UI (finder B).

**Finder A — data layer/actions: clean.** Verified: RLS isolation holds for every new function (freelancer ctx → `engagementId` undefined → policy reduces to `tenant_id`); the `updateCandidate` allow-list can't move `tenant_id`/`state`/`id`/`engagement_id`; `edited_at` stamps on any edit incl. a pure re-tag (intended kill-signal); `state='candidate'` guards make dismiss idempotent and block editing published rows; `count(*)::int` returns a real JS number and excludes dismissed/published; one grouped query (no N+1); actions auth-first, Zod-validated, null→friendly error, revalidate both paths, log `.message` only. Two cosmetic non-issues accepted (dashboard count is a 2-query eventual-consistency snapshot — fine for a badge; a whitespace-only summary writes `""` not null — renders identically).

**Finder B — UI: two real fixes applied.**
- **[High] Focus survived a list change wrong** — index-based focus meant dismissing a *middle* row left the ring/shortcuts pointing at whichever candidate slid into that index (a subsequent `x`/`1`/`2`/`3` could hit the wrong row). **Fixed:** focus is now tracked by **candidate ID** — after a dismiss/refresh the ring follows the same candidate or clears if it's gone; never re-points silently.
- **[Med] Register-effect churn** — the parent passed a fresh inline `register` arrow each render, negating the row's memoization and re-registering every row on every `j/k`. **Fixed:** the parent passes its stable `register` useCallback directly; the row calls `register(candidate.id, …)`.
- **[Low] Focus-steal on click-to-edit** (clicking an unfocused row's title) — **hardened:** the row's focus effect no longer grabs the container while a field is being edited (and returns focus to the row on exit).
- **[cleanup] Removed `editedAt`** from `CandidateView` — it was projected but unused by the UI.

**Action Items:**
- [x] **[High]** Focus-by-ID reconciliation after the list shrinks — applied.
- [x] **[Med]** Stabilize the `register` callback (no per-render re-registration) — applied.
- [x] **[Low]** Guard the focus effect against stealing focus mid-edit — applied.
- [ ] **[Low — deferred]** A whitespace-only summary saves `""` rather than null. Cosmetic (renders blank like null); normalize if a clean DB invariant is later wanted.

## Change Log

| Date       | Version | Description                                                       | Author |
| ---------- | ------- | ---------------------------------------------------------------- | ------ |
| 2026-06-07 | 0.1     | Story drafted (context-engineered).                              | Scrum  |
| 2026-06-07 | 1.0     | Implemented Tasks 1–6; xhigh review (3 UI fixes applied); done.  | Dev    |
