---
baseline_commit: 92b7599
---

# Story 3.3: Auto-Pull Commits/PRs/Releases → Candidates (+ Reconciliation Cron)

Status: done

<!-- ADAPTED 2026-06-07 to the post-3.2/3.2.1 codebase: the real-time webhook→candidate pipeline
already EXISTS (Story 3.1 built the handler + Inngest fn + mapping; 3.2 wired the resolve to
repo_connections; both proven live). So this story's NET-NEW work is the NFR-4 RECONCILIATION
BACKSTOP — a scheduled Inngest cron that polls connected repos for events a webhook missed, with
source_event_keys that MATCH the webhook so dedupe is automatic — plus driving the
repo_connections.last_pull_at/last_error/status the cron owns. -->

## Story

As a Freelancer,
I want repo activity to become candidate Ship Updates automatically AND a scheduled job to catch anything a dropped webhook missed,
so that my curation queue stays current within ~5 minutes even when a delivery fails (FR-10, NFR-4, NFR-5).

## Acceptance Criteria

1. **A reconciliation cron pulls each connected repo's recent activity → candidates (NFR-4).**
   **Given** connected repos (`repo_connections.status <> 'disconnected'`)
   **When** the scheduled Inngest function runs (~every 10 min)
   **Then** for each repo it mints a short-lived installation token, pulls recent **merged/open PRs**, **published releases**, and the **default-branch head commit**, and creates a candidate `ship_updates` row per qualifying item — **scoped to that connection's Engagement/Tenant** (the connection carries `tenant_id`/`engagement_id`, so NO resolve step) — with the same `status_tag`/title mapping as the webhook (merged PR/release → Shipped; open PR/push → In Progress).

2. **Dedup is automatic — the cron never doubles the webhook (NFR-4 idempotency).**
   **Given** an event already turned into a candidate by the real-time webhook (or a prior cron run)
   **When** the cron pulls it again
   **Then** the **identical `source_event_key`** (`pr:{repo}:{number}:{opened|merged}`, `release:{repo}:{tag}`, `push:{repo}:{headSha}`) makes `createCandidate` a no-op (`onConflictDoNothing`) — so a webhook-then-cron, or cron-then-webhook, or repeated cron runs produce exactly one candidate.

3. **The cron drives the repo card's state (NFR-4 degraded UX).**
   **Given** a pull
   **When** it succeeds → set `status='connected'`, `last_pull_at=now`, clear `last_error`; **when** it fails (token/API/rate-limit) → set `status='error'` + `last_error` (the Repo Connections card's error state + the Cockpit degraded banner from Story 3.2). One repo's failure never blocks the others (per-repo isolation), and the pull is rate-limit-aware (the existing `@octokit/plugin-throttling`/`retry`).

## Tasks / Subtasks

> **Split:** Tasks 1–6 are buildable + offline-testable NOW (Octokit mocked). **Task 7 is the live validation** — observe the cron in Inngest Cloud creating a candidate from real repo activity without a webhook (it auto-runs every ~10 min once deployed; needs no new secret — the App key + Inngest keys are already set).

- [x] **Task 1 — The pull boundary in `src/server/github/app.ts`** (AC: 1, 3)
  - [x] Add `pullRecentActivity(installationId: string, repoFullName: string, since?: Date): Promise<PulledActivity>` — mint `getInstallationOctokit(Number(installationId))` and fetch, each in its own try (a 404/empty is fine): the repo's `default_branch` + its head commit (`GET /repos/{owner}/{repo}` then `GET /repos/{owner}/{repo}/commits` `{ sha: default_branch, per_page: 1 }`); merged+open PRs (`GET /repos/{owner}/{repo}/pulls` `{ state: "all", sort: "updated", direction: "desc", per_page: 30 }`); releases (`GET /repos/{owner}/{repo}/releases` `{ per_page: 10 }`). Return a typed `PulledActivity` `{ headCommit?: {sha,message,branch}, pulls: [...], releases: [...] }` (raw-ish fields the mapper needs). **Let the caller decide error handling** — but isolate per-endpoint so one missing scope doesn't lose the rest. Guard `installationId` with `/^\d+$/` (Story 3.2.1 footgun). Reuse the existing `getApp()`/throttle config; store no token.
  - [x] Unit-test (`github/__tests__/app.test.ts`, mock `getInstallationOctokit`): maps a mocked default-branch+commit / pulls / releases response into `PulledActivity`; an empty repo → empty arrays, no throw.

- [x] **Task 2 — The pull → NormalizedGithubEvent mapper** (AC: 1, 2)
  - [x] `src/server/ship-feed/github-pull.ts`: `pulledActivityToEvents(repoFullName, pulled: PulledActivity): NormalizedGithubEvent[]` — reuse the **exact** `NormalizedGithubEvent` shapes + `sourceEventKey` formats from `github-event.ts` so the cron's keys MATCH the webhook's: a merged PR → `{ kind:"pull_request", merged:true, sourceEventKey: pr:{repo}:{number}:merged }`; an open PR → `{...opened}`; a published release → `{ kind:"release", sourceEventKey: release:{repo}:{tag} }`; the head commit → `{ kind:"push", sourceEventKey: push:{repo}:{sha}, commitCount:1, headCommitMessage }`. Same qualifying filter (skip drafts, closed-unmerged PRs, etc.). `rawMeta` carries SHAs/branches (kept off title/summary, the privacy split).
  - [x] Unit-test: a mixed `PulledActivity` → the right events with **keys identical to** what `normalizeGithubEvent` produces for the equivalent webhook (assert the exact strings); non-qualifying items dropped.

- [x] **Task 3 — repo-connections repository: the reconcile reads/writes** (AC: 1, 3)
  - [x] `listConnectionsForReconcile()` — **RAW `db`** (the cron is a SYSTEM process): all `status <> 'disconnected'` rows → `{ id, tenantId, engagementId, ghInstallationId, repoFullName, lastPullAt }`.
  - [x] `markConnectionPulled(connectionId)` — raw `db`: `set status='connected', last_pull_at=now(), last_error=null`. `markConnectionError(connectionId, message)` — raw `db`: `set status='error', last_error=$` (do NOT touch `last_pull_at`). (A disconnected row is never matched.)
  - [x] Unit-test (PGlite): `listConnectionsForReconcile` returns connected+error rows but not disconnected; `markConnectionPulled`/`markConnectionError` flip the fields.

- [x] **Task 4 — The reconciliation Inngest cron** (AC: 1, 2, 3)
  - [x] `src/server/inngest/functions/reconcile-repos.ts`: export `reconcileConnectedRepos(): Promise<{ pulled: number; candidates: number; errored: number }>` (the testable core) — `listConnectionsForReconcile()` → for each connection, in its OWN try/catch: `pullRecentActivity(ghInstallationId, repoFullName, lastPullAt ?? undefined)` → `pulledActivityToEvents` → for each event `createCandidate({ tenantId, userId:"system", role:"freelancer" }, { engagementId, statusTag/title/summary via heuristicSummarizer.mapEvent, source:"github", sourceEventKey, rawMeta })` (same system-ctx insert as `process-github-event`) → `markConnectionPulled(id)`; on a thrown error → `markConnectionError(id, message)` + continue (per-repo isolation). Return the tallies.
  - [x] `reconcileRepos = inngest.createFunction({ id:"reconcile-repos", triggers:[{ cron:"*/10 * * * *" }] }, async () => reconcileConnectedRepos())` (v4.5 2-arg form; a **cron** trigger, no event payload).
  - [x] Unit-test (mock the repos + `pullRecentActivity` + `createCandidate`): a connected repo with activity → `createCandidate` per event + `markConnectionPulled`; a repo whose pull throws → `markConnectionError`, others still processed; a duplicate (`createCandidate` → null) → no throw, still marks pulled.

- [x] **Task 5 — Register the cron** (AC: 1)
  - [x] `src/app/api/inngest/route.ts`: add `reconcileRepos` to the `serve({ functions: [...] })` array (alongside `processGithubEvent`). (Inngest Cloud registers the cron on the next deploy + sync.)

- [x] **Task 6 — Gates + deploy** (AC: 1, 2, 3)
  - [x] `lint && typecheck && test && build` green; don't regress the 233 prior tests. Deploy (`vercel --prod`; verify `.env.local` checksum). After deploy, re-sync Inngest Cloud (`curl -X PUT https://soloist.cjjutba.com/api/inngest` → `Successfully registered`) so the cron schedule registers. (No schema change → no migration.)

- [ ] **Task 7 — LIVE validation (CJ + dev)** (AC: 1, 2, 3)
  - [ ] After deploy + the Inngest sync, the `reconcile-repos` cron shows in the Inngest dashboard and runs ~every 10 min. Validate: cause repo activity on a connected repo **without** a webhook reaching prod (e.g. create a release, or just rely on the cron re-pulling) → a candidate appears via the cron run (visible in the Inngest run history + a `ship_updates` row); a 2nd cron run creates **no** duplicate (same `source_event_key`); `repo_connections.last_pull_at` advances. (Optional: trigger the cron immediately from the Inngest dashboard "Run" button instead of waiting.)

## Dev Notes

### What ALREADY exists (do NOT rebuild)

- **The real-time path is DONE + live:** `POST /api/webhooks/github` (HMAC, dedupe, 202) → Inngest `process-github-event` → `normalizeGithubEvent` → `heuristicSummarizer.mapEvent` → `createCandidate` (idempotent on `(engagement_id, source_event_key)`), with the repo→engagement resolve via `findEngagementForRepo` (Story 3.2). Proven live (real pushes created candidates). **This story does NOT touch that path** — it adds a parallel BACKSTOP that reuses the same mapping + dedupe.
- **`repo_connections`** (3.2) already has `status`/`last_pull_at`/`last_error`/`gh_installation_id`/`engagement_id`/`tenant_id` — this story is the first to DRIVE `last_pull_at`/`last_error` and reach the `error`/(reserved `pulling`) states.
- **`src/server/github/app.ts`** (3.2/3.2.1) is the Octokit boundary with `getInstallationOctokit` + throttle/retry — extend it with `pullRecentActivity`, don't add a new client.
- **`NormalizedGithubEvent` + `heuristicSummarizer` + `createCandidate`** — reuse verbatim. The ONLY thing that makes the backstop safe is producing the **same `source_event_key`** as `normalizeGithubEvent` (`github-event.ts` L64/L89/L106): `push:{repo}:{after}`, `pr:{repo}:{number}:{opened|merged}`, `release:{repo}:{tag}`.

### Architecture compliance

[Source: architecture.md L231, L246, L308]
- **Reconciliation = a scheduled Inngest function** (~10 min), polls connected repos, **rate-limit-aware** (the `@octokit/plugin-throttling`/`retry` already on the App's Octokit), updates `last_pull_at`, and **flips `status='error'` + `last_error` on failure** → the Repo Connections card error state + Cockpit degraded banner (NFR-4). [L246] "Inngest replaces Vercel Cron; survives deploys; job dashboard for free." [L231]
- **NFR-5 ~5 min:** the webhook is real-time (primary); the ~10-min cron is the backstop that bounds staleness if a delivery drops. (10 min is the architecture's stated interval; the AC's "~5 min" is met by the real-time path, backstopped by the cron.)
- **Idempotency everywhere** [L245]: `source_event_key` dedupe means webhook+cron+retries converge to one candidate.
- **The cron runs as a SYSTEM process** (no session): raw-`db` reads for the connection list + the system-derived `{ tenantId, userId:"system", role:"freelancer" }` ctx for the scoped `createCandidate` (identical to `process-github-event`).
- **`source` stays `github`**; candidates are `state='candidate'` (Freelancer-only) — NO auto-publish (publish is Story 3.6).

### Source-event-key consistency (the load-bearing correctness point)

The webhook keys a PUSH by the push's head SHA (`after`). The cron can't see "pushes," only commits — so it keys the **default-branch head commit's SHA** as `push:{repo}:{sha}`. If the latest push's webhook was dropped, that head SHA == the dropped push's `after` → the cron's candidate fills the gap; if the webhook later arrives (or already did), the same key dedupes. (Intermediate dropped pushes between cron runs are an accepted backstop limitation — the feed converges to current, NFR-4.) PRs/releases key identically to the webhook by construction (number+phase / tag).

### Previous-story intelligence

- **System raw-`db` + derived ctx** (3.1 `findSpikeTargetEngagement`/`recordDelivery`, 3.2 `findEngagementForRepo`, 3.2.1 `removeInstallation`): the cron's connection list + status writes are the same kind of pre-tenant system access.
- **The candidate insert** mirrors `process-github-event.ts` exactly (system ctx, `heuristicSummarizer.mapEvent`, `createCandidate` returns null on dupe → fine).
- **Octokit pull** mirrors `listReposForInstallations` (`getInstallationOctokit(Number(id))` + `octokit.request(...)`, manual handling, errors thrown then caught per-repo).
- **Inngest cron** = `createFunction({ id, triggers:[{ cron:"*/10 * * * *" }] }, handler)` — same 2-arg v4.5 form as `process-github-event` but a `cron` trigger; register in the `serve` array; re-sync via `PUT /api/inngest` after deploy.
- **Tests** are vitest `node` + PGlite; mock Octokit/repos with hoisted `vi.mock`. Don't regress the 233 prior tests.

### Project Structure Notes

- **New:** `src/server/ship-feed/github-pull.ts` (+ test); `src/server/inngest/functions/reconcile-repos.ts` (+ test).
- **Modified:** `src/server/github/app.ts` (+ `pullRecentActivity`, +`PulledActivity` type) (+ its test); `src/server/db/repositories/repo-connections.repository.ts` (+ `listConnectionsForReconcile`/`markConnectionPulled`/`markConnectionError`) (+ its test); `src/app/api/inngest/route.ts` (register the cron).
- **Do NOT:** auto-publish; build the curation UI (3.5) or publish gate (3.6); change the webhook path; add an LLM summarizer (the `SummarizationProvider` swap is a fast-follow, FR-11); add a migration (no schema change). Don't let one repo's pull failure abort the whole cron.
- **Watch:** the `source_event_key`s MUST match `github-event.ts` exactly (the dedupe depends on it — assert in tests); per-repo try/catch so the cron is resilient; `markConnectionError` must NOT advance `last_pull_at` (so a stuck repo is visibly stale).

### Testing requirements

- **Pull mapper (pure):** `PulledActivity` → events with keys IDENTICAL to `normalizeGithubEvent`'s; non-qualifying dropped; `raw_meta` carries SHAs, title/summary don't.
- **GitHub boundary (mocked Octokit):** `pullRecentActivity` assembles default-branch+commit / pulls / releases; empty repo → empty.
- **Repository (PGlite):** `listConnectionsfor Reconcile` excludes disconnected; pulled/error writes.
- **Cron core (mocked):** per-repo candidate creation; per-repo error isolation; dedupe (null) tolerated; tallies.
- **Regression:** 233 prior tests green; the webhook path + its tests untouched.
- **Live (Task 7):** cron run → candidate without a webhook; 2nd run → no dup; `last_pull_at` advances; a forced failure → `status='error'`.

### References

- [Source: epics.md#Story 3.3; architecture.md L231 (Inngest scheduled reconciliation), L242–L246 (the GitHub pipeline + reconciliation), L308 (GitHub failure → status='error' + banner)]
- [Source: src/server/github/app.ts (the Octokit boundary to extend); src/server/ship-feed/github-event.ts (NormalizedGithubEvent + the source_event_key formats to MATCH) + summarization.ts (heuristicSummarizer); src/server/db/repositories/repo-connections.repository.ts (+ ship-update.repository.ts createCandidate); src/server/inngest/functions/process-github-event.ts (the system-ctx insert pattern) + client.ts + src/app/api/inngest/route.ts (register)]
- [Source: PRD FR-10 (status tags), NFR-4 (reconciliation/idempotency), NFR-5 (~5 min latency)]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (1M context) — dev-story + xhigh code-review.

### Debug Log References

- `inngest.createFunction({ id, triggers:[{ cron:"*/10 * * * *" }] }, handler)` — the v4.5 2-arg form, a `cron` trigger (no event payload), same shape as `process-github-event`'s `{ event }` trigger.
- The cron candidate insert reuses the `process-github-event` system-ctx pattern verbatim (`{ tenantId, userId:"system", role:"freelancer" }` → `createCandidate` `withTenant`).
- `import type { PulledActivity }` keeps `@octokit/app` out of the `ship-feed` runtime module (type-only, erased).

### Completion Notes List

Tasks 1–6 done. **Task 7 = CJ's live observation** (the `reconcile-repos` cron runs ~every 10 min in Inngest Cloud; watch it create a candidate from real repo activity + advance `last_pull_at`). No new secret — the App key + Inngest keys are already set; the cron registers on the deploy + `PUT /api/inngest` sync.

**Adaptation:** the real-time webhook→candidate path already existed (3.1/3.2) and is untouched. This story added ONLY the **reconciliation backstop**: a scheduled cron that polls each connected repo (`repo_connections`, 3.2) via its installation token (`github_installations`, 3.2.1), reusing the existing `NormalizedGithubEvent` + `heuristicSummarizer` + `createCandidate` with **source_event_keys identical to the webhook** so dedupe is automatic. It drives the `repo_connections.last_pull_at`/`last_error`/`status` (the columns 3.2 reserved). The cron needs NO resolve — each connection row carries its tenant/engagement.

Gates: typecheck ✓, lint ✓, **242 tests ✓** (+9 for 3.3; no regression of the prior 233), build ✓, `db:generate` clean (no schema change).

Post-review hardening (xhigh): `pullRecentActivity` now PROBES the repo (`GET /repos`) outside the try — a gone/no-access repo throws → the cron marks it `error` (no more false-success on a dead repo); `markConnectionPulled`/`markConnectionError` guard `status <> 'disconnected'` (a mid-run disconnect can't be resurrected); the cron stores a CONTROLLED `last_error` (`"GitHub returned <status>"` / `"Couldn't reach GitHub"`, never the raw Octokit error → no token leak); tightened the cron-test fixture type.

### File List

**New**

- `src/server/ship-feed/github-pull.ts` (+ `__tests__/github-pull.test.ts`)
- `src/server/inngest/functions/reconcile-repos.ts` (+ `__tests__/reconcile-repos.test.ts`)

**Modified**

- `src/server/github/app.ts` (+ `pullRecentActivity` + `PulledActivity`) (+ its test)
- `src/server/db/repositories/repo-connections.repository.ts` (+ `listConnectionsForReconcile`/`markConnectionPulled`/`markConnectionError`) (+ its test)
- `src/app/api/inngest/route.ts` (register `reconcileRepos`)

## Senior Developer Review (AI)

**Reviewer:** CJ (via Claude xhigh code-review — 2 finder angles)
**Date:** 2026-06-07
**Outcome:** ✅ **Approve** (the dedup-consistency core is correct; lifecycle-edge fixes applied; the backstop-coverage limits are inherent best-effort, documented)

### Summary

Both finders independently confirmed the load-bearing property: `pulledActivityToEvents` produces `source_event_key`s **identical** to `normalizeGithubEvent` for the equivalent event (asserted in `github-pull.test.ts` against the real normalizer) — so a webhook + a cron pull of the same event converge to exactly one candidate, with no duplicate and no wrong-dedupe. The findings were around the connection lifecycle and the inherent limits of reconstructing events from a poll.

### Key Findings & Resolutions

| # | Sev | Finding | Resolution |
|---|-----|---------|-----------|
| 1 | **Med** | `pullRecentActivity`'s per-endpoint try/catch swallowed a 404 on the repo itself → returned empty → the cron marked a **dead/renamed repo `connected`** with a fresh `last_pull_at` (false success; the `error` state never fired). | **Fixed** — the `GET /repos` probe is now OUTSIDE the try; a gone/no-access repo throws → the cron marks it `error`. |
| 2 | **Med** | `markConnectionPulled`/`markConnectionError` had no `status <> 'disconnected'` guard → a repo disconnected mid-run could be **resurrected** to `connected`. | **Fixed** — both now guard `status <> 'disconnected'`. |
| 3 | **Med** | The cron stored the raw Octokit `err.message` into `last_error` (shown on the repo card) — could embed request internals. | **Fixed** — stores a controlled `"GitHub returned <status>"` / `"Couldn't reach GitHub"`. |
| 4 | Low | The cron-test `conn()` fixture was typed `Partial<Record<string,unknown>>` — a renamed field wouldn't break the test. | **Fixed** — typed to the real connection shape. |

### Accepted limits (inherent to a poll-based backstop — documented)

- **Non-default-branch pushes aren't backstopped** — the cron only reads the default branch's head commit; a dropped push webhook to a feature branch is caught only in real-time, not by the cron. (The merged-PR / release "Shipped" signals — the ones that matter for the client feed — ARE fully backstopped.)
- **An "opened-PR" candidate isn't recoverable once the PR is merged** (the cron then sees only the merged phase). The transient "In review" signal is the loss; the "Shipped" one is kept.
- **`commitCount` is hardcoded to 1** for the cron's push, so a multi-commit push the cron wins (webhook dropped) renders "1 commit" instead of "N". Content-fidelity only; the webhook (real count) wins whenever it arrives first.
- **Pagination** (recent 30 PRs / 10 releases) covers the realistic 10-min reconciliation window; a very long outage on a high-traffic repo could age an item past page 1. Fine for v1 volume.
- **No Inngest `step.run` per repo** — a function-level retry re-pulls all repos. Idempotent (createCandidate dedup + idempotent status writes), so correct; `step`-per-repo is a scale optimization for many connections.
- **A permanently-gone repo errors every ~10 min** (no backoff) — visible + actionable on the card (the Freelancer disconnects it); backoff is a future nicety.

### Review Follow-ups (AI)

- [x] [AI-Review][Med] Probe the repo outside the try (dead repo → `error`, not false-success).
- [x] [AI-Review][Med] `status <> 'disconnected'` guard on the cron's status writes.
- [x] [AI-Review][Med] Controlled `last_error` (no raw Octokit error stored/shown).
- [x] [AI-Review][Low] Typed cron-test fixture.

## Change Log

| Date       | Version | Description                                       | Author |
| ---------- | ------- | ------------------------------------------------- | ------ |
| 2026-06-07 | 0.1     | Story drafted (adapted to the post-3.2.1 codebase). | Scrum  |
| 2026-06-07 | 1.0     | Tasks 1–6 implemented; 242 tests green; cron registered. | Dev |
| 2026-06-07 | 1.1     | xhigh review: dead-repo error, disconnect-guard, controlled last_error. | Dev |
