---
baseline_commit: 320da6e
---

# Story 3.8: Manual Ship Update (Fallback)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Freelancer,
I want to write a Ship Update by hand,
so that I can keep my client informed even with no repo connected or GitHub down (FR-13, NFR-4).

## Acceptance Criteria

1. **Author a manual update — same status vocab, same publish flow (FR-13).**
   **Given** any Engagement (a repo connected or not)
   **When** I author a manual Ship Update from the Ship Feed tab (title required, summary optional, one status ✅/🚧/📦)
   **Then** it becomes a **candidate** (`source='manual'`) in my curation queue, indistinguishable downstream from an auto-pulled one — it gets the SAME edit / re-tag / dismiss / **publish** affordances (Stories 3.5/3.6), and when published it reaches the Client feed (3.7) like any other.

2. **Always available — the GitHub-independent fallback (NFR-4).**
   **Given** no repo is connected, or GitHub is unavailable
   **When** I open the Ship Feed tab
   **Then** the "write an update" affordance is present and works (it never touches GitHub) — including from the empty "all caught up" state — so I can keep the promise alive when the auto-pipeline can't.

## Tasks / Subtasks

- [x] **Task 1 — Manual-update Server Action + schema** (AC: 1, 2)
  - [x] `src/server/ship-feed/curation.schema.ts`: add `manualUpdateSchema = { engagementId: uuid, title: string (trim, 1..200, required), summary: string|null (trim, ≤2000, optional), statusTag: enum(SHIP_STATUS_KEYS) }` (reuse the title/summary validators already in this file).
  - [x] `src/server/ship-feed/manual-update.actions.ts` (NEW, `"use server"`): `createManualUpdateAction({ engagementId, title, summary, statusTag })` — `requireFreelancer` → `safeParse` → **guard `getEngagement(ctx, engagementId)`** (null → `{ ok:false, error:"That engagement no longer exists." }` — don't trust the input engagementId; mirror `connectRepoAction`) → `createCandidate(ctx, { engagementId, statusTag, title, summary, source:"manual" })` (NO `sourceEventKey` → null; null keys never collide on the `(engagement_id, source_event_key)` unique, so a manual create always inserts) → `revalidatePath("/app")` + the engagement path → `{ ok:true }`. Typed result union + `console.error(.message)` only, mirroring `publish.actions.ts`.
  - [x] **Tests** (`src/server/ship-feed/__tests__/manual-update.actions.test.ts`, mock `requireFreelancer` + `getEngagement` + `createCandidate`): a valid submit calls `createCandidate` with `source:"manual"` + the parsed fields + returns `{ok:true}`; a missing/empty title or an unknown statusTag is rejected by Zod before any repo call; a null `getEngagement` (foreign/gone) → friendly error, no create.

- [x] **Task 2 — Manual-update repository coverage (the manual path)** (AC: 1)
  - [x] No new repository function — `createCandidate` already takes `source` + a null `sourceEventKey`. **Test** (`src/server/db/__tests__/ship-update.repository.test.ts`, PGlite): `createCandidate(ctx, { source:"manual", … })` (no sourceEventKey) inserts a `candidate` row with `source='manual'`; **two manual creates for the same engagement BOTH insert** (null source_event_keys don't collide on the unique — Postgres treats NULLs as distinct); the manual candidate shows up in `listCandidates` and is counted by `countCandidatesByEngagement` (so it flows through curation + the dashboard badge like any candidate).

- [x] **Task 3 — The "write an update" UI** (AC: 1, 2)
  - [x] `src/app/app/engagements/[id]/(detail)/manual-update.tsx` (NEW, `"use client"`): a collapsed **"+ Write an update"** button that expands to an inline form (a `Card`): `Input` title (required, autofocus on open), `Textarea` summary (optional), a status **segmented toggle** (the three `SHIP_STATUS` as `<button aria-pressed>`, default `in_progress`), and **Add to queue** / **Cancel**. Submit → `createManualUpdateAction` → on `ok`: `toast.success("Added to your queue.")`, reset + collapse, `router.refresh()` (the new candidate appears in the queue below); on `!ok`: `toast.error(res.error)`. Disable submit while busy + when the title is empty. Use the existing `useState`+`await action`+`toast`+`router.refresh()` idiom (no Dialog dependency — an inline panel, like the hand-rolled portal-nav). Reuse `SHIP_STATUS`/`SHIP_STATUS_KEYS`, `Button`/`Input`/`Textarea`/`Card`.
  - [x] `src/app/app/engagements/[id]/(detail)/page.tsx` (MODIFY): wrap the existing render so **`<ManualUpdate engagementId={id} />` is ALWAYS rendered at the top** (above both the queue and the empty state), so the fallback works with zero candidates / no repo. Keep the `listCandidates` read + the `candidates.length === 0` branch (the "All caught up" Card) and the `<CurationQueue>` branch; update the empty-state copy to mention the manual option (e.g. "New activity from GitHub will appear here — or write one by hand above.").

- [x] **Task 4 — Gates + deploy** (AC: 1, 2)
  - [x] `lint && typecheck && test && build` green (don't regress the 300 prior tests). **No schema change, no migration** (`createCandidate` + `source='manual'` already exist). Deploy (`vercel --prod`; verify `.env.local` checksum `ecedc7314b8e405f0a7bba826b19ef73` unchanged) + push. **No Inngest re-sync** (no function change).
  - [x] **Live validation (CJ):** on an Engagement (even with no repo connected) → "Write an update" → author one → it appears in the curation queue → edit/tag/publish it → it lands on the Client feed. Confirm the affordance is present from the empty state.

## Dev Notes

### What exists vs net-new (read this first)

[Source: code map — `ship-update.repository.ts` (`createCandidate`), `curation.actions.ts`/`publish.actions.ts` (action shape), `candidate-row.tsx` (the status toggle), `(detail)/page.tsx`]

- **Reused (don't rebuild):**
  - **`createCandidate(ctx, { …, source, sourceEventKey? })` already supports manual** — pass `source:"manual"` and omit `sourceEventKey` (→ null). The `onConflictDoNothing` targets `(engagement_id, source_event_key)`; with a null key, Postgres treats each row as distinct → a manual create **always inserts** (never the dedup null). `tenant_id` is stamped from `ctx`.
  - The whole **downstream pipeline is source-agnostic**: `listCandidates` (3.5) shows it, `updateCandidate`/`dismissCandidate` (3.5) curate it, `publishShipUpdate` (3.6) publishes it, `listPublishedUpdates` (3.6) → the 3.7 feed renders it. A manual candidate is just a candidate — nothing downstream branches on `source`.
  - The **Server-Action shape** (`requireFreelancer` → `safeParse` → guard `getEngagement` → repo → `revalidatePath` → typed `{ok}`) — copy `connectRepoAction`'s engagement guard + `publish.actions.ts`'s error/log shape.
  - The **status segmented toggle** pattern is in `candidate-row.tsx` (three `SHIP_STATUS` buttons, `aria-pressed`); inline the same in the form. `SHIP_STATUS`/`SHIP_STATUS_KEYS` (`@/components/ui/ship-status`), `Button`/`Input`/`Textarea`/`Card` are all present.
  - The Ship Feed tab page (`(detail)/page.tsx`) + the curation queue (`CurationQueue`) — the form mounts ABOVE them, always.

- **Net-new (this story):** `manualUpdateSchema` + `createManualUpdateAction`; the `manual-update.tsx` form; the page wrapper that always renders it. **No schema/migration, no new repository function.**

### Architecture compliance

[Source: architecture.md L175-177 (ShipUpdate `source(github|manual)`), L208 ("author manual update" is a named Server Action), L249 (candidates are Freelancer-only; publish is the single gate — manual updates publish the SAME way, no auto-publish); EXPERIENCE.md L103 (Manual Ship Update: "Author by hand … Same publish flow. Always available — the fallback that keeps the promise alive."), L101 (manual → author picks the status)]

- A manual update is a `candidate` (`state='candidate'`), NOT auto-published — it crosses the privacy boundary only via the Story 3.6 publish gate, exactly like an auto-pulled one. Don't add an auto-publish path.
- `source='manual'` is the only DB difference; it's never shown to the Client (the feed projection omits it) and isn't shown in the queue card either (the card renders title/status/summary/time regardless of source).
- The engagement guard (`getEngagement`) keeps a freelancer from stamping a manual row onto an engagement that isn't theirs (RLS would tag it to their tenant anyway, but the guard fails fast + avoids a malformed row) — defense-in-depth, same as `connectRepoAction`.

### Project Structure Notes

- **NEW:** `src/server/ship-feed/manual-update.actions.ts` (+ `__tests__/manual-update.actions.test.ts`); `src/app/app/engagements/[id]/(detail)/manual-update.tsx`.
- **MODIFIED:** `src/server/ship-feed/curation.schema.ts` (+`manualUpdateSchema`); `src/app/app/engagements/[id]/(detail)/page.tsx` (always-render the form); `src/server/db/__tests__/ship-update.repository.test.ts` (+ the manual-path test).
- **Naming:** action `createManualUpdateAction` in `manual-update.actions.ts`; component `manual-update.tsx` → `ManualUpdate`.
- **Watch:** (1) `source:"manual"` + no `sourceEventKey` — confirm the null-key insert isn't swallowed by `onConflictDoNothing` (it isn't — null keys are distinct). (2) `revalidatePath` both `/app` (the candidate-count badge) and the engagement page (the queue). (3) The form's status toggle defaults to `in_progress` (the author can change it). (4) The form must be reachable from the EMPTY state (mount it above the empty Card, not inside the populated-only branch).

### Testing requirements

- **Action (`manual-update.actions.test.ts`, mocks):** valid → `createCandidate(ctx, { source:"manual", engagementId, title, summary, statusTag })` + `{ok:true}`; Zod rejects empty title / unknown statusTag / non-uuid engagement (no repo call); a null `getEngagement` → friendly error, no create.
- **Repository (`ship-update.repository.test.ts`, PGlite):** a manual `createCandidate` inserts (`source='manual'`, null key); two manual creates for one engagement both insert (no null-key collision); the manual candidate appears in `listCandidates` + the `countCandidatesByEngagement` count.
- **Regression:** the 300 prior tests stay green; no schema/migration.
- The form UI (toggle/submit/refresh) is validated live (CJ's Task 4) — consistent with the prior queue/feed UI.

### References

- [Source: epics.md#Story 3.8 (author by hand: title/summary/status → same status tags + publish flow; works with no repo / GitHub down); #Story 3.5 (curation), #Story 3.6 (publish gate), #Story 3.7 (feed) — the pipeline a manual candidate flows through]
- [Source: architecture.md L175-177/L208/L249; EXPERIENCE.md L101/L103]
- [Source: src/server/db/repositories/ship-update.repository.ts (`createCandidate`); src/server/db/repositories/engagements.repository.ts (`getEngagement` guard); src/server/ship-feed/{curation.schema.ts, publish.actions.ts, curation.actions.ts}; src/app/app/engagements/[id]/(detail)/{page.tsx, candidate-row.tsx (status toggle)}; src/components/ui/ship-status.ts]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (1M context)

### Debug Log References

- Gates: `tsc --noEmit` clean · `eslint` clean · `vitest run` **307 passed (38 files)** (+7) · `next build` ✓ Compiled · `drizzle-kit generate` → no drift (no migration).

### Completion Notes List

- **AC-1/2:** a manual update is a `source='manual'` candidate created via the existing `createCandidate` (no new repo fn, no schema change). `createManualUpdateAction` (`manual-update.actions.ts`) = requireFreelancer → Zod (`manualUpdateSchema`: title required, summary optional, statusTag enum) → **load-bearing `getEngagement` guard** → `createCandidate({ source:"manual" })` → revalidate `/app` + the engagement. The `manual-update.tsx` inline form (a "+ Write an update" panel — no Dialog dep) always sits ABOVE the queue/empty on the Ship Feed tab, so the fallback works with no repo / GitHub down / an empty queue. Downstream is fully source-agnostic — the manual candidate gets the same edit/dismiss/**publish** (3.5/3.6) and reaches the Client feed (3.7) like any other; `source` is never shown to the Client.
- **Null-key insert:** `createCandidate` for manual passes no `sourceEventKey` → null; Postgres treats `(engagement_id, NULL)` as distinct on the unique, so a manual create ALWAYS inserts (two rapid submits both land — proven by the repo test). The action correctly ignores the (never-null-for-manual) return.
- **Review (xhigh, 1 finder):** came back clean — no defects. The finder surfaced that the `getEngagement` guard is genuinely **load-bearing** (the `ship_update_scope` WITH CHECK only gates `tenant_id`, not `engagement_id`, so RLS alone wouldn't block a foreign-engagement write) — corrected the code comment to state this accurately. Two non-issues (the double-refresh + the in_progress default) confirmed intentional.

### File List

- **NEW:** `src/server/ship-feed/manual-update.actions.ts` (+ `__tests__/manual-update.actions.test.ts`); `src/app/app/engagements/[id]/(detail)/manual-update.tsx`.
- **MODIFIED:** `src/server/ship-feed/curation.schema.ts` (+`manualUpdateSchema`); `src/app/app/engagements/[id]/(detail)/page.tsx` (always-render the form); `src/server/db/__tests__/ship-update.repository.test.ts` (+ the manual-path test).

## Senior Developer Review (AI)

**Reviewer:** CJ (via Claude xhigh code-review, 1 focused finder) · **Date:** 2026-06-07 · **Outcome:** ✅ Approve

**Verified clean (no defects):** the action runs requireFreelancer → Zod → guard → create in the right order; the `getEngagement` guard correctly blocks a foreign/gone engagement (and is the genuine security boundary for `engagement_id`, since RLS gates only `tenant_id`); the null-`source_event_key` insert never dedups (two manual creates both insert); the Zod schema rejects empty/over-long title, over-long summary, unknown statusTag, non-uuid engagement; the form disables submit while busy + when empty, trims to match the schema, submits on Enter, and keeps the panel open with data on failure (reset only on ok); `ManualUpdate` is always rendered (works from the empty state); nothing downstream branches on `source` and it never reaches the Client.

**Action Items:**
- [x] **[Doc]** Correct the action comment — the `getEngagement` guard is load-bearing (RLS WITH CHECK only gates `tenant_id`, not `engagement_id`) — applied.
- (No code defects; the double-refresh on success and the `in_progress` default are intentional UX.)

## Change Log

| Date       | Version | Description                                              | Author |
| ---------- | ------- | ------------------------------------------------------- | ------ |
| 2026-06-07 | 0.1     | Story drafted (context-engineered).                     | Scrum  |
| 2026-06-07 | 1.0     | Implemented Tasks 1–4; xhigh review (clean); done.      | Dev    |
