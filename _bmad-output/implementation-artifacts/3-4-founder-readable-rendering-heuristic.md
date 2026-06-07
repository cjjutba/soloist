---
baseline_commit: 8911762
---

# Story 3.4: Founder-Readable Rendering (Heuristic)

Status: done

<!-- ADAPTED 2026-06-07: the `SummarizationProvider` INTERFACE + a heuristic impl already exist
(Story 3.1) and are reused by the webhook path (3.1) AND the reconciliation cron (3.3) — so AC-2's
"swappable provider" is already satisfied. The NET-NEW work is AC-1's QUALITY bar: today the
heuristic passes commit/PR titles through RAW and leaks the branch in the push summary. 3.4 makes
the rendering plain-English (conventional-commit prefixes → dropped, squash `(#123)` + merge
boilerplate cleaned, capitalized) and removes the branch (NFR-3). Plus the kill-signal field that
makes rendering quality measurable once curation (3.5) lands. -->

## Story

As a Client (served by the Freelancer),
I want updates in plain English with no dev jargon,
so that I understand progress without reading commit/PR syntax (FR-11, NFR-3).

## Acceptance Criteria

1. **Plain-English rendering — no dev jargon, no SHAs/branches (FR-11, NFR-3).**
   **Given** the heuristic `SummarizationProvider`
   **When** a candidate is rendered from a commit/PR/release
   **Then** the title/summary are clean plain English: a **conventional-commit type prefix** (`feat:`/`fix(scope)!:`/`chore:`…) is dropped, a **squash PR-number suffix** (` (#123)`) is stripped, **merge-commit boilerplate** (`Merge pull request #… from …`) falls back to a count, the first letter is capitalized — and the rendered fields **never contain a SHA or branch name** (those stay in `raw_meta`). The same cleaning applies whether the candidate came from the webhook or the reconciliation cron (one summarizer).

2. **Rendering quality is measurable + the provider is swappable (AR-13).**
   **Given** the kill-signal instrumentation
   **Then** `ship_updates.edited_at` records when a candidate was edited before publish (Story 3.5 sets it), and a `renderingQualityStat` read reports the "% of published candidates edited before publish" — so heuristic quality is measurable; **and** the `SummarizationProvider` interface stays the single seam so an LLM impl can replace the heuristic with **zero** call-site/UI change.

## Tasks / Subtasks

- [x] **Task 1 — Plain-English heuristic rendering** (AC: 1)
  - [x] `src/server/ship-feed/summarization.ts`: add `cleanSubject(raw): string | null` — first line only; return `null` for merge-commit boilerplate (`/^merge\s+(pull request|branch|remote-tracking)/i`); strip a KNOWN conventional-commit prefix (`feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert|wip`, optional `(scope)`/`!`, then `:`); strip a trailing `\s*\(#\d+\)`; trim + capitalize the first char. (Restrict to known types so a plain `TODO: …` / `Note: …` isn't mangled.)
  - [x] Apply it in `heuristicSummarizer.mapEvent`: **push** → `title = cleanSubject(headCommitMessage) ?? \`${n} new ${n===1?"commit":"commits"}\``, `summary = \`${n} ${n===1?"commit":"commits"}\`` (**drop the branch** — NFR-3); **pull_request** → `Shipped: ${cleanSubject(title) ?? title}` / `In review: …`; **release** → `cleanSubject(name) ?? \`Released ${tag}\``, `summary = \`Release ${tag}\``. Keep `status_tag` mapping (merged PR/release → shipped; push/open PR → in_progress).
  - [x] Update `github-mapping.test.ts` (branch removed from push title/summary) + add `cleanSubject` cases: `feat(auth): add login (#42)` → `Add login`; `fix: resolve crash` → `Resolve crash`; `Merge pull request #5 from x` → null (→ count fallback); a plain subject is untouched + capitalized; SHAs/branches never appear in title/summary.

- [x] **Task 2 — Kill-signal field + the swappable-provider invariant** (AC: 2)
  - [x] `schema.ts`: add `editedAt timestamptz` (nullable) to `shipUpdates` (no RLS change). `npm run db:generate` → `drizzle/0011_*.sql`; `npm run db:migrate` on Neon. (Story 3.5's edit action stamps it; 3.6's publish sets `published_at`.)
  - [x] `ship-update.repository.ts`: `renderingQualityStat(ctx)` (withTenant, RLS-scoped) → `{ published, edited, editedRate }` over `state='published'` rows (`edited = edited_at IS NOT NULL`). Export the type `ShipUpdate` already carries `editedAt`.
  - [x] Unit-test (PGlite): seed published rows (some with `edited_at`) → `renderingQualityStat` returns the right counts/rate; an empty set → rate 0.

- [x] **Task 3 — Gates + deploy** (AC: 1, 2)
  - [x] `lint && typecheck && test && build` green (don't regress the 242 prior tests; the webhook/cron paths reuse the same summarizer, so their tests stay green via `objectContaining`/key asserts). Commit `drizzle/0011_*`. Apply to Neon. Deploy (`vercel --prod`; verify `.env.local` checksum). No Inngest re-sync needed (no function change).

## Dev Notes

### What exists vs net-new

- **Reused (no change):** the `SummarizationProvider` interface + `heuristicSummarizer` are called by `process-github-event` (webhook) AND `reconcile-repos` (cron) — improving the ONE summarizer improves both paths. The interface IS the swappable seam (AC-2 / AR-13 already satisfied structurally; the LLM impl is the documented fast-follow, FR-11).
- **Net-new:** `cleanSubject` (the rendering quality) + dropping the branch from push title/summary (NFR-3 tightening — this **supersedes** the Story 3.1 decision that a candidate title MAY name a branch) + the `edited_at` kill-signal field/stat.

### Architecture compliance

[Source: architecture.md L245 (SummarizationProvider heuristic v1 → LLM fast-follow), L185 (raw_meta privacy: SHAs/diffs/branches never in the Client projection); PRD FR-11, NFR-3, AR-13]
- The rendered `title`/`summary` are the Client-visible fields (after publish, 3.6/3.7) — so AC-1's "never a SHA/branch" is the privacy boundary made real at the rendering layer (raw_meta still carries them).
- `edited_at` is forward-looking infra for the kill-signal metric (the AC's "measurable"); the curation edit that sets it is Story 3.5, the publish that sets `published_at` is 3.6.

### Project Structure Notes

- **Modified:** `src/server/ship-feed/summarization.ts` (+ `cleanSubject`, branch-free) (+ `__tests__/github-mapping.test.ts`); `src/server/db/schema.ts` (+ `edited_at` on `shipUpdates`); `src/server/db/repositories/ship-update.repository.ts` (+ `renderingQualityStat`) (+ its test); `drizzle/0011_*`. Light comment fix where 3.1 said a candidate title may name a branch.
- **Do NOT:** build the curation UI/edit action (3.5 sets `edited_at`), the publish gate (3.6), the client feed (3.7), or an LLM summarizer (fast-follow). Don't change the webhook/cron pipelines (they reuse the summarizer untouched).
- **Watch:** `cleanSubject` must only strip KNOWN conventional-commit types (don't mangle `TODO:`); the push summary must NOT contain the branch; the webhook/cron tests use `objectContaining`/key asserts so they stay green, but `github-mapping.test.ts` asserts exact title/summary strings → update them.

### Testing requirements

- **cleanSubject (pure):** conventional prefixes dropped (feat/fix/scope/`!`); `(#N)` stripped; merge boilerplate → null; plain subject capitalized + untouched; never a SHA/branch.
- **heuristicSummarizer:** push/PR/release → clean titles, no branch in summary; the status_tag mapping unchanged.
- **renderingQualityStat (PGlite):** counts + rate over published rows; empty → 0; RLS-scoped.
- **Regression:** 242 prior tests green; the webhook + cron candidate tests unaffected (they don't assert the exact rendered strings).

### References

- [Source: epics.md#Story 3.4; architecture.md L185/L245; PRD FR-11, NFR-3, AR-13]
- [Source: src/server/ship-feed/summarization.ts (the summarizer to enhance) + github-event.ts (NormalizedGithubEvent); src/server/db/schema.ts (shipUpdates) + repositories/ship-update.repository.ts (createCandidate, + the stat); the webhook (process-github-event) + cron (reconcile-repos) both consume heuristicSummarizer]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (1M context)

### Debug Log References

- Gates: `npx tsc --noEmit` clean · `eslint` clean · `vitest run` **246 passed (28 files)** (+4 over the 242 baseline) · `next build` ✓ compiled · `drizzle-kit generate` → "No schema changes" (no drift, 0011 already applied to Neon).

### Completion Notes List

- **AC-1 (plain-English, no SHA/branch):** added `cleanSubject(raw)` to `summarization.ts` — first-line-only; merge-commit boilerplate (`/^merge\s+(pull request|branch|remote-tracking)/i`) → `null`; strips a KNOWN conventional-commit prefix (`feat|fix|…|wip`, optional `(scope)`/`!`, optional space, then `:`) so a plain `TODO:`/`Note:` is left alone; strips a trailing squash `(#N)`; capitalizes. Applied in `heuristicSummarizer.mapEvent`: push title = cleaned head-commit subject (else a count), push **summary = `${n} commit(s)` with the branch removed** (NFR-3 — this supersedes the Story 3.1 "title may name a branch" note); PR → `Shipped: …`/`In review: …` over the cleaned title; release → cleaned name (else `Released <tag>`). SHAs/branches stay in `raw_meta`. The SAME summarizer feeds both the webhook (`process-github-event`) and the cron (`reconcile-repos`), so both paths clean identically; dedupe is on `source_event_key` (never the rendered strings), so rendering changes can't break idempotency.
- **AC-2 (measurable + swappable):** added nullable `ship_updates.edited_at` (migration `0011_previous_victor_mancha.sql`, ADD COLUMN only — inherits the existing `ship_update_scope` RLS + FORCE from 0008, no policy change) and `renderingQualityStat(ctx)` (withTenant, RLS-scoped) → `{ published, edited, editedRate }` over `state='published'` rows, divide-by-zero guarded (`published===0 → 0`). Forward-looking/inert by design: nothing sets `edited_at` until the Story 3.5 curation edit, so `editedRate` reads 0 until then — correct. The `SummarizationProvider` interface stays the single seam (an LLM impl swaps in with zero call-site change).
- **Review (xhigh-proportionate, 1 finder + targeted verify):** implementation came back clean. Applied the one low-risk improvement — `cleanSubject` now tolerates a space before the colon (`feat : x` → `Add billing`) via `…!?\s*:\s*` — and added a regression case. The remaining finding (capitalization is a no-op when a subject starts with a non-letter, e.g. `revert: "…"`, emoji, `[WIP]`) is accepted for v1 (non-crashing, no privacy leak; first-word vs first-char polish deferred to LLM summarizer).

### File List

- `src/server/ship-feed/summarization.ts` (M — `cleanSubject` + branch-free `mapEvent`)
- `src/server/ship-feed/__tests__/github-mapping.test.ts` (M — branch-removed asserts + `cleanSubject` cases incl. `feat :`)
- `src/server/db/schema.ts` (M — `editedAt` on `shipUpdates`)
- `src/server/db/repositories/ship-update.repository.ts` (M — `renderingQualityStat`)
- `src/server/db/__tests__/ship-update.repository.test.ts` (M — `renderingQualityStat` PGlite test)
- `drizzle/0011_previous_victor_mancha.sql` (A — `ADD COLUMN edited_at`)

## Senior Developer Review (AI)

**Reviewer:** CJ (via Claude xhigh code-review, proportionate-effort) · **Date:** 2026-06-07 · **Outcome:** ✅ Approve

**Scope:** the Story 3.4 working-tree bundle — `cleanSubject` + branch-free `mapEvent`, the `edited_at` column + migration 0011, `renderingQualityStat`, and the two test files.

**Verified (no defects):**
- **`cleanSubject` over/under-strip:** the anchored KNOWN-type list (not a generic `\w+:`) protects `fixup:`/`featured:`/`Test the thing` from over-stripping; `/i` handles `Fix:`; the trailing `(#N)` strip is anchored `$` so a mid-string `(#1)` survives; the merge regex catches the three real GitHub merge forms and spares a normal "Merge the configs"; empty-after-strip → `null` → caller falls back to a count.
- **NFR-3 privacy (load-bearing AC):** push summary is `${n} commit(s)` (no branch); titles carry no SHA/branch (those remain in `raw_meta`). `github-mapping.test.ts` asserts `summary).not.toContain("main")` and `title).not.toContain("abc123")`.
- **Two-consumer consistency:** webhook + cron share the one summarizer; dedupe is on `source_event_key`, never the rendered strings, so the cleaning can't affect idempotency. The webhook/cron tests use `objectContaining`/key asserts and stay green; `Shipped: Auth` still renders identically (`cleanSubject("Auth") → "Auth"`).
- **`renderingQualityStat`:** RLS-scoped via `withTenant`; over `state='published'` only; `editedRate` divide-by-zero guarded; cross-tenant isolation asserted (B sees 0).
- **Migration 0011:** minimal `ADD COLUMN`; `ship_updates` already has ENABLE+FORCE RLS + `ship_update_scope` from 0008, so the column inherits it — no policy/FORCE change needed.

**Action Items:**
- [x] **[Low]** `cleanSubject` should tolerate a space before the colon (`feat : x`) — applied (`…!?\s*:\s*`) + regression test.
- [ ] **[Low — deferred]** Capitalization is a no-op when a subject begins with a non-letter (`revert: "…"`, emoji, `[WIP]`). Accepted for v1 (no crash, no privacy leak); revisit with the LLM summarizer fast-follow if first-word capitalization is wanted.

## Change Log

| Date       | Version | Description                                                  | Author |
| ---------- | ------- | ------------------------------------------------------------ | ------ |
| 2026-06-07 | 0.1     | Story drafted (adapted; rendering-quality).                  | Scrum  |
| 2026-06-07 | 1.0     | Implemented Tasks 1–3; xhigh review (1 fix applied); done.   | Dev    |
