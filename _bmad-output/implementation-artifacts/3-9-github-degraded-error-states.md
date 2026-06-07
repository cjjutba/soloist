---
baseline_commit: ed4ba4b
---

# Story 3.9: GitHub Degraded & Error States

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Freelancer,
I want clear signals when GitHub integration has trouble,
so that I'm never silently blind and my client's view is never affected (FR-9, NFR-4, UX-DR14).

## Acceptance Criteria

1. **The failure is surfaced — a non-blocking banner + the repo-card error state (FR-9, UX-DR14).**
   **Given** a GitHub failure (rate limit, outage, revoked token) that the reconcile cron records as `status='error'` + a controlled `last_error`
   **When** I view the Engagement's Repo Connections tab
   **Then** the **repo card shows its error state with the `last_error`** (already built, Story 3.2/3.3) **plus a "Retry"** action, AND a **non-blocking banner** appears above the cards explaining auto-updates are paused and reassuring me that **publishing and my client's published feed are unaffected**, and I can still write updates by hand (3.8). The banner is `role="status"` (never blocks the page) and clears when the connection recovers.

2. **Auto-updates pause, nothing else breaks — and Retry re-attempts (NFR-4).**
   **Given** a connection in `error`
   **When** I click **Retry** on its card
   **Then** it re-runs the same pull the cron does (immediately) — on success the card returns to `connected` (`last_error` cleared, candidates pulled) and on a continued failure it stays in `error` with the message refreshed. **Publishing a candidate and the Client's already-published feed work the whole time** — they never read `repo_connections`, so a connection error can't affect them (proven by test).

## Tasks / Subtasks

- [x] **Task 1 — Extract the per-connection pull (cron + Retry share it)** (AC: 2)
  - [x] `src/server/inngest/functions/reconcile-repos.ts`: extract the per-connection try/catch body into an exported `pullAndRecordConnection(conn: { id; tenantId; engagementId; ghInstallationId; repoFullName })` → `{ ok: boolean; candidates: number }`: `pullRecentActivity` → `pulledActivityToEvents` → `createCandidate` (system ctx) per event → on success `markConnectionPulled(id)` + return `{ok:true, candidates}`; on throw `markConnectionError(id, "GitHub returned <status>" | "Couldn't reach GitHub")` + return `{ok:false, candidates:0}`. Rewrite `reconcileConnectedRepos` to loop calling it (same controlled-message + per-connection-isolation behavior — the existing `reconcile-repos.test.ts` must stay green).
  - [x] `src/server/db/repositories/repo-connections.repository.ts`: add `getConnection(ctx, connectionId)` — RLS-scoped read returning the row (`id, tenantId, engagementId, ghInstallationId, repoFullName, status, lastError`) or null (foreign/gone). (The cron uses the system `listConnectionsForReconcile`; Retry needs an RLS-scoped single-connection read.)
  - [x] **Tests** (`reconcile-repos.test.ts`): keep the existing `reconcileConnectedRepos` assertions green; add a direct `pullAndRecordConnection` test — success → `createCandidate` + `markConnectionPulled` + `{ok:true}`; a thrown 404 → `markConnectionError(id, "GitHub returned 404")` + `{ok:false}`; a non-HTTP throw → `"Couldn't reach GitHub"`.

- [x] **Task 2 — The Retry Server Action** (AC: 2)
  - [x] `src/server/repo-connections/repo-connections.actions.ts`: add `retryConnectionAction({ engagementId, connectionId })` — `requireFreelancer` → `safeParse` (a new `retryConnectionSchema = { engagementId: uuid, connectionId: uuid }` in `repo-connections.schema.ts`) → `getConnection(ctx, connectionId)` (null OR `status==='disconnected'` → `{ ok:false, error:"That connection is gone." }`) → `pullAndRecordConnection(conn)` → `revalidatePath` the repos path → `res.ok ? { ok:true } : { ok:false, error:"Still couldn't reach GitHub — auto-updates will keep retrying." }`. Mirror `connectRepoAction`'s shape (typed union, `console.error(.message)` only, never the raw Octokit error).
  - [x] **Tests** (`repo-connections.actions.test.ts`): a Retry on an error'd connection that now succeeds → `pullAndRecordConnection` called + `{ok:true}`; a still-failing pull → `{ok:false, error:"Still couldn't reach GitHub…"}`; a null/disconnected `getConnection` → friendly error, no pull; non-uuid input → zod error.

- [x] **Task 3 — The banner + the per-card Retry UI** (AC: 1)
  - [x] `src/app/app/engagements/[id]/(detail)/repos/github-degraded-banner.tsx` (NEW): a non-blocking banner — `role="status"`, destructive-tinted (`border-destructive/40`, like the existing picker-degraded banner) — shown when ≥1 active connection is in `error`. Copy: **"Auto-updates are paused for {n} repo{s}."** + the reassurance **"Your published feed and publishing are unaffected — and you can still write updates by hand."** Non-dismissible (it auto-clears when the connection recovers); no action of its own (the Retry lives on the card). A plain server-renderable component (no client state).
  - [x] `src/app/app/engagements/[id]/(detail)/repos/retry-button.tsx` (NEW, `"use client"`): a **Retry** button (mirror `disconnect-button.tsx`: `useState` busy, `await retryConnectionAction`, toast, `router.refresh()`). On `ok` → `toast.success("Re-checked — GitHub is reachable again.")`; on `!ok` → `toast.error(res.error)`. Rendered ONLY when `connection.status === "error"`.
  - [x] `src/app/app/engagements/[id]/(detail)/repos/repo-connection-card.tsx` (MODIFY): in the error state, render `<RetryButton engagementId connectionId />` next to Disconnect (the card already shows the `last_error` red text — keep it). No other state changes.
  - [x] `src/app/app/engagements/[id]/(detail)/repos/page.tsx` (MODIFY): after computing `active`, render `<GithubDegradedBanner count={errorCount} />` above the connection list when `active.some(c => c.status === "error")`. Keep the existing `githubError` picker-load banner (a DIFFERENT condition — can't list repos to connect) untouched; the two can coexist.

- [x] **Task 4 — Isolation proof (NFR-4) + gates + deploy** (AC: 2)
  - [x] **Test** (`src/server/db/__tests__/ship-update.repository.test.ts`, PGlite): seed an engagement + a `repo_connections` row with `status='error'` + a candidate ship_update → `publishShipUpdate` still flips it to published + `listPublishedUpdates` still returns it. Proves a connection error can't touch publish/feed (they never read `repo_connections`).
  - [x] `lint && typecheck && test && build` green (don't regress the 307 prior tests). **No schema change, no migration** (`status`/`last_error` already exist). Deploy (`vercel --prod`; verify `.env.local` checksum `ecedc7314b8e405f0a7bba826b19ef73` unchanged) + push. **No Inngest re-sync** (the cron's function id/trigger are unchanged — only its internals were extracted).
  - [x] **Live validation (CJ):** force an error (e.g. revoke the App on a connected repo, or temporarily break the token) → the cron flips the card to `error` with `last_error` + the banner appears; click Retry → it re-attempts; meanwhile publish a candidate → it still reaches the Client feed. Confirm the banner never blocks the page.

## Dev Notes

### What exists vs net-new (read this first)

[Source: code map — `reconcile-repos.ts`, `repo-connection-card.tsx`, `repo-connections.repository.ts`, `repos/page.tsx`; the NFR-4 isolation grep]

- **Reused / ALREADY DONE (don't rebuild):**
  - **The error STATE is fully driven** — the 3.3 reconcile cron's per-connection try/catch already calls `markConnectionError(id, message)` with **controlled** strings (`"GitHub returned <status>"` / `"Couldn't reach GitHub"` — never the raw Octokit error) on failure, and `markConnectionPulled(id)` (clears `last_error`, `status='connected'`) on success. Both guard `status <> 'disconnected'`.
  - **The repo card ALREADY renders the error state + `last_error`** (`repo-connection-card.tsx`: a destructive dot + "Error" label + the red `last_error` text when `status==='error' && lastError`). 3.9 only ADDS a Retry button there.
  - **NFR-4 isolation is STRUCTURAL + proven** — `publishShipUpdate`/`listPublishedUpdates` (3.6) and the Client feed (3.7) read ZERO rows from `repo_connections` (grep: the only readers are the repo-connections repo/actions, the reconcile cron, and the github-installations cascade). A connection `error` cannot affect publishing or the published feed. 3.9 adds a runtime test to pin this AC.
  - The per-connection pull logic (pull → map → `createCandidate` → mark) is **inline in the cron loop** and **fully extractable** (isolated, idempotent via `source_event_key`, system ctx) — extract it so the Retry reuses it verbatim.
  - The Server-Action shape (`requireFreelancer` → `safeParse` → repo guard → repo → `revalidatePath` → typed `{ok}`) + the `disconnect-button.tsx` client pattern (busy/toast/refresh).
  - Manual updates (3.8) are the GitHub-independent fallback the banner points to ("you can still write updates by hand").

- **Net-new (this story):** `pullAndRecordConnection` (extracted) + `getConnection` (RLS read); the `retryConnectionAction` + its schema; the `github-degraded-banner.tsx` + `retry-button.tsx`; the card/page wiring; the NFR-4 isolation test. **No schema/migration; no new Inngest function (the cron id/trigger are unchanged).**

### Architecture compliance

[Source: architecture.md L174 (RepoConnection status/last_error), L246 (cron flips status='error' + last_error → Cockpit banner + repo card, NFR-4), L308 ("GitHub failures → status='error' + Cockpit banner (never block publish/feed — NFR-4)"), L215 (typed result + user copy from EXPERIENCE voice, internal detail logged not shown); EXPERIENCE.md L125 (the degraded banner copy + "your published feed is unaffected · Retry" + manual updates remain), L126 (token-revoked card copy), L115 (designed error states, never blank)]

- The banner copy comes from EXPERIENCE.md's voice (reassuring, momentum-positive); the internal error detail is the CONTROLLED `last_error` (already sanitized in 3.3 — no SHA/token/raw-error leak), shown in the card.
- "Auto-updates pause but publishing + the Client feed are unaffected" is the NFR-4 done-ness gate — the indicator is **banner + card error state** (UX-DR14), and the isolation is enforced by the data model (separate tables), now asserted by a test.
- The Retry re-runs the SAME idempotent pull (dedup via `source_event_key`), so a retry that partially succeeded before can't double-create candidates.

### Project Structure Notes

- **NEW:** `src/server/repo-connections/repo-connections.schema.ts` (+`retryConnectionSchema` — or extend the existing one); `src/app/app/engagements/[id]/(detail)/repos/{github-degraded-banner.tsx, retry-button.tsx}`.
- **MODIFIED:** `reconcile-repos.ts` (extract `pullAndRecordConnection`); `repo-connections.repository.ts` (+`getConnection`); `repo-connections.actions.ts` (+`retryConnectionAction`); `repos/{page.tsx, repo-connection-card.tsx}`; tests (`reconcile-repos.test.ts`, `repo-connections.actions.test.ts`, `ship-update.repository.test.ts`).
- **Naming:** `pullAndRecordConnection` (fn), `retryConnectionAction` (action), `GithubDegradedBanner`/`RetryButton` (components).
- **Watch:** (1) the extraction must preserve the controlled `last_error` strings + per-connection isolation (the cron must not abort on one repo's failure — `pullAndRecordConnection` catches internally + returns, never throws). (2) `getConnection` must be RLS-scoped (a freelancer can only Retry their own connection). (3) the Retry's `pullAndRecordConnection` uses the SYSTEM ctx for `createCandidate` (same as the cron), tenant from the connection row. (4) the banner is `role="status"` (non-blocking), not `role="alert"` (assertive). (5) no Inngest re-sync (the function id `reconcile-repos` + cron trigger are unchanged).

### Testing requirements

- **`pullAndRecordConnection` (reconcile-repos.test.ts, mocks):** success → candidate + `markConnectionPulled` + `{ok:true}`; 404 → `markConnectionError(…, "GitHub returned 404")` + `{ok:false}`; network throw → `"Couldn't reach GitHub"`. The existing `reconcileConnectedRepos` tests stay green.
- **`retryConnectionAction` (repo-connections.actions.test.ts, mocks):** success → `{ok:true}`; continued failure → friendly retry message; null/disconnected connection → error; bad input → zod.
- **NFR-4 isolation (ship-update.repository.test.ts, PGlite):** an `error` connection doesn't block `publishShipUpdate` / `listPublishedUpdates`.
- **Regression:** the 307 prior tests stay green; no schema/migration.
- The banner/card UI is validated live (CJ's Task 4).

### References

- [Source: epics.md#Story 3.9 (banner + repo-card error state with last_error; auto-updates pause but publishing + the Client feed unaffected); #Story 3.3 (the cron that drives status/last_error), #Story 3.2 (the 4-state card), #Story 3.8 (manual fallback the banner points to)]
- [Source: architecture.md L174/L246/L308/L215; EXPERIENCE.md L115/L125/L126]
- [Source: src/server/inngest/functions/reconcile-repos.ts (the loop to extract); src/server/db/repositories/repo-connections.repository.ts (markConnectionError/Pulled, listConnections, +getConnection); src/server/github/app.ts (pullRecentActivity); src/server/ship-feed/github-pull.ts (pulledActivityToEvents); src/app/app/engagements/[id]/(detail)/repos/{page.tsx, repo-connection-card.tsx, disconnect-button.tsx}; src/server/repo-connections/repo-connections.actions.ts]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (1M context)

### Debug Log References

- Gates: `tsc --noEmit` clean · `eslint` clean · `vitest run` **317 passed (38 files)** (+10) · `next build` ✓ Compiled · `drizzle-kit generate` → no drift (no migration).

### Completion Notes List

- **AC-1 (surfaced):** the repo card already showed the error state + `last_error` (3.2/3.3) — 3.9 adds a per-card **Retry** (only when `status==='error'`) + a **`GithubDegradedBanner`** (`role="status"`, non-blocking, shown when ≥1 active connection is in `error`) whose copy reassures that publishing + the Client feed are unaffected and the manual fallback (3.8) is available.
- **AC-2 (Retry + isolation):** extracted the cron's per-connection pull into `pullAndRecordConnection` (verbatim: never throws, controlled `last_error`, idempotent dedup) so `reconcileConnectedRepos` AND the new `retryConnectionAction` share it. The action = requireFreelancer → Zod → **RLS-scoped `getConnection`** (a freelancer can only Retry their own — proven by a new repo RLS test) → `pullAndRecordConnection` → revalidate the **connection's own** engagement page. **No schema change, no Inngest re-sync** (the cron's function id/trigger are unchanged — only internals extracted). The NFR-4 isolation is proven by a PGlite test: a `status='error'` connection doesn't block `publishShipUpdate`/`listPublishedUpdates` (they never read `repo_connections`).
- **Review (xhigh, 1 finder):** no security/correctness defects. Applied 2 hardening fixes — revalidate the **connection's** engagement (not the request's) so the right card refreshes; and a `getConnection` RLS integration test (tenant B reading A's connId → null). Accepted-low: a narrow telemetry divergence if `markConnectionPulled` itself throws after candidates were created (the candidates still persist; counts differ — pre-existing-class, immaterial).

### File List

- **NEW:** `src/app/app/engagements/[id]/(detail)/repos/{github-degraded-banner.tsx, retry-button.tsx}`.
- **MODIFIED:** `reconcile-repos.ts` (extract `pullAndRecordConnection`); `repo-connections.repository.ts` (+`getConnection`); `repo-connections.actions.ts` (+`retryConnectionAction`); `repo-connections.schema.ts` (+`retryConnectionSchema`); `repos/{page.tsx, repo-connection-card.tsx}`; tests (`reconcile-repos.test.ts`, `repo-connections.actions.test.ts`, `repo-connections.repository.test.ts`, `ship-update.repository.test.ts`).

## Senior Developer Review (AI)

**Reviewer:** CJ (via Claude xhigh code-review, 1 focused finder) · **Date:** 2026-06-07 · **Outcome:** ✅ Approve

**Verified clean (no defects):** `pullAndRecordConnection` never throws (the cron loop can't be aborted by one repo); the controlled `last_error` strings are byte-identical (incl. the U+2019 apostrophe) and the raw Octokit error is never stored/logged; the Retry action is requireFreelancer → Zod → RLS-scoped `getConnection` → guard (null OR disconnected) → pull with the connection's OWN tenant/engagement; the system-ctx `createCandidate` writes only to the caller's tenant + dedups idempotently; the banner is `role="status"` (non-blocking) shown only when error-count>0; the card renders Retry only for `status==='error'` and preserves the 4-state layout + the `last_error` text; no circular import; the cron id/trigger are unchanged (no prod re-sync). NFR-4 isolation holds (publish/feed never read `repo_connections`) and is now test-pinned.

**Action Items:**
- [x] **[Low]** Revalidate the connection's own engagement page (not the request's) — applied.
- [x] **[Low]** `getConnection` RLS integration test (cross-tenant → null) — applied.
- (Accepted) A narrow telemetry divergence if `markConnectionPulled` throws post-create — candidates persist; only the returned counts differ. Immaterial, pre-existing class.

## Change Log

| Date       | Version | Description                                                       | Author |
| ---------- | ------- | ---------------------------------------------------------------- | ------ |
| 2026-06-07 | 0.1     | Story drafted (context-engineered).                              | Scrum  |
| 2026-06-07 | 1.0     | Implemented Tasks 1–4; xhigh review (2 fixes); done.            | Dev    |
