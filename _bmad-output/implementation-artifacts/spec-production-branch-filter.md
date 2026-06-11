---
title: 'Per-repo production-branch filter for the Ship Feed'
type: 'feature'
created: '2026-06-11'
status: 'done'
context: []
baseline_commit: '04eedb7'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The Ship Feed creates a candidate for a push to ANY branch and for every PR opened+merged, so feature/worktree-branch activity floods the curation queue (CJ saw 32 candidates). A client-facing "what shipped" feed should reflect production, not WIP.

**Approach:** Add a per-repo **production branch** (chosen in the Repos tab; defaults to the repo's GitHub default branch). Only "shipped-to-production" events become candidates: a push whose branch == the production branch, a PR **merged into** the production branch, and published releases. Drop pushes to other branches and PR-opened ("in review") events. Filter at candidate creation in BOTH ingestion paths via one pure shared function.

## Boundaries & Constraints

**Always:**
- Filter logic is ONE pure function `isProductionEvent(event, productionBranch)` shared by the webhook AND the cron (parity). Resolved branch = `productionBranch ?? event.defaultBranch`.
- Event policy ("Shipped-only"): release → always; push → `branch === resolvedProd`; pull_request → `merged && base === resolvedProd`. PR-opened is dropped.
- `source_event_key` is UNCHANGED (still SHA/number-based, no branch) → webhook+cron still dedupe to one candidate.
- Status-tag DEFAULTS unchanged (push→in_progress, PR-merged→shipped, release→shipped); the filter controls INGESTION, not the tag. Freelancer still curates.
- Multi-tenant: every new connection read/write goes through `withTenant` + the load-bearing `getConnection`/`getEngagement` guard (RLS WITH CHECK only gates tenant_id for a freelancer). Branch listing uses the caller Tenant's installation (`listInstallationIds`), never a global token.
- Migration is additive (`ADD COLUMN production_branch text` nullable) — inherits `repo_connection_scope` RLS; no new policy.
- Existing flooded candidates are NOT auto-deleted (freelancer bulk-dismisses).

**Ask First:** changing the event policy; changing status-tag semantics; deleting existing candidates; pointing branch-listing at a non-tenant installation.

**Never:** put the branch in `source_event_key`; break the webhook↔cron dedupe; let one repo's branch fetch throw a 500 (degrade like the existing GitHub-unreachable path).

## I/O & Edge-Case Matrix

`isProductionEvent(event, productionBranch)` — resolved = `productionBranch ?? event.defaultBranch`:

| Scenario | Input / State | Expected |
|----------|--------------|----------|
| Push to prod | kind=push, branch===resolved | true (candidate) |
| Push to feature branch | kind=push, branch!==resolved | false (no candidate) |
| PR merged into prod | kind=pull_request, merged, base===resolved | true |
| PR merged into non-prod | kind=pull_request, merged, base!==resolved | false |
| PR opened (any base) | kind=pull_request, !merged | false (drop "in review") |
| Release | kind=release | true (always) |
| Override set | productionBranch="release", push branch="release" | true (uses override, not default) |
| Resolved unknown | productionBranch=null AND defaultBranch=null, push/PR | false; release still true |

</frozen-after-approval>

## Code Map

- `src/server/db/schema.ts:264` — add `productionBranch: text("production_branch")` (nullable) to `repoConnections`.
- `drizzle/0016_*.sql` — **NEW** (via `npm run db:generate`): additive `ADD COLUMN`. Apply with `npm run db:migrate`.
- `src/server/ship-feed/github-event.ts` — add `defaultBranch` to all 3 kinds + `baseBranch` to `pull_request`; normalize reads `repository.default_branch` and `pull_request.base.ref`.
- `src/server/ship-feed/branch-filter.ts` — **NEW** pure `isProductionEvent` (the matrix above).
- `src/server/inngest/functions/process-github-event.ts` — after resolve, drop non-production events (`skipped: "off-branch"`).
- `src/server/ship-feed/resolve-engagement.ts` + `repo-connections.repository.ts` `findEngagementForRepo` — return `productionBranch`.
- `src/server/github/app.ts` — `pullRecentActivity(installationId, repoFullName, productionBranch?)` polls the resolved branch's head + captures each PR's `base` + returns `defaultBranch`; **NEW** `listBranches(installationId, repoFullName)` → `{ branches[], defaultBranch }`. `PulledActivity` gains `defaultBranch` + `pulls[].base`.
- `src/server/ship-feed/github-pull.ts` — propagate `defaultBranch` + PR `baseBranch` onto events.
- `src/server/inngest/functions/reconcile-repos.ts` — `pullAndRecordConnection` takes `productionBranch`, passes it to the pull, and filters events via `isProductionEvent`.
- `repo-connections.repository.ts` — `listConnectionsForReconcile` + `connectRepo` carry `productionBranch`; **NEW** `setProductionBranch(ctx, connectionId, branch)` (RLS-scoped, returns row|null).
- `repo-connections.actions.ts` — `connectRepoAction` accepts optional `productionBranch`; **NEW** `setProductionBranchAction` + `listRepoBranchesAction` (scoped to caller installations).
- `repo-connections.schema.ts` — optional `productionBranch` on connect; **NEW** `setProductionBranchSchema`, `listRepoBranchesSchema`.
- `repos/connect-repo-form.tsx` — on repo select, load branches (action) → branch picker defaulting to the repo default → pass to connect.
- `repos/production-branch-control.tsx` — **NEW** client island: shows the tracked branch + lets the freelancer change it (`setProductionBranchAction`).
- `repos/repo-connection-card.tsx` + `repos/page.tsx` — render the tracked branch + the control; thread `productionBranch` through `ConnRow`.

## Tasks & Acceptance

**Execution:**
- [x] `schema.ts` — add the nullable `production_branch` column; `npm run db:generate` → `0016`; `npm run db:migrate` (verify column exists).
- [x] `github-event.ts` — capture `defaultBranch` (all kinds) + `baseBranch` (PR); update `NormalizedGithubEvent`.
- [x] `branch-filter.ts` (+ test) — pure `isProductionEvent` covering every I/O matrix row.
- [x] `github/app.ts` — `pullRecentActivity` polls resolved branch + captures PR `base` + returns `defaultBranch`; new `listBranches`.
- [x] `github-pull.ts` (+ test) — thread `defaultBranch`/`baseBranch` onto events.
- [x] `repo-connections.repository.ts` (+ test) — `findEngagementForRepo`/`listConnectionsForReconcile`/`connectRepo` carry `productionBranch`; new RLS-scoped `setProductionBranch`.
- [x] `resolve-engagement.ts` — return `productionBranch`.
- [x] `process-github-event.ts` (+ test) — filter via `isProductionEvent`; off-branch → `skipped:"off-branch"`, no candidate.
- [x] `reconcile-repos.ts` (+ test) — pass `productionBranch` to the pull; filter events before `createCandidate`.
- [x] `repo-connections.schema.ts` + `repo-connections.actions.ts` (+ test) — connect-with-branch; `setProductionBranchAction` (getConnection guard) + `listRepoBranchesAction` (caller-installation scoped).
- [x] `connect-repo-form.tsx` + `production-branch-control.tsx` + `repo-connection-card.tsx` + `page.tsx` — branch picker on connect + edit-on-card; show the tracked branch.

**Acceptance Criteria:**
- Given a repo whose production branch is `main`, when a push lands on a feature branch, then NO candidate is created (webhook and cron).
- Given that repo, when a push lands on `main` OR a PR merges into `main` OR a release publishes, then exactly one candidate is created (webhook+cron deduped).
- Given a connection with no production branch set, when events arrive, then the repo's GitHub default branch is used as the filter.
- Given a freelancer on the Repos tab, when they connect a repo or edit a connected repo, then they can pick the production branch (defaulting to the repo's GitHub default), scoped to their own installation.
- Given the full suite, `npm test` + `npm run typecheck` + `npm run lint` are green.

## Spec Change Log

- **2026-06-11 — Review patches (step-04).** Adversarial review (3 layers) → Acceptance Auditor fully compliant. Applied 2 `patch` fixes: (1) `setProductionBranchAction` now revalidates the connection's OWN engagement path (from the returned row), not the client-supplied `engagementId` (stale-cache fix); (2) the connect form's branch-fetch now uses a request-sequence token so a slow `listRepoBranchesAction` can't overwrite a newer repo selection (wrong-branch race). Deferred 1 (see `deferred-work.md`): a production branch deleted/renamed on GitHub after selection is silently accepted and the cron's 404 is swallowed → feed quietly stops; fix has tradeoffs, left for CJ. KEEP: the pure shared `isProductionEvent`, webhook↔cron parity, unchanged `source_event_key` dedupe.

## Design Notes

- The webhook payload carries `repository.default_branch` and `pull_request.base.ref`, and the cron fetches `default_branch` already — so the filter needs NO extra GitHub round-trip; `defaultBranch`/`baseBranch` ride on the normalized event.
- `isProductionEvent` is the only new branching logic; both paths call it right before `createCandidate`, keeping parity provable by a shared test.
- Status-tag note: a push to prod still defaults to `in_progress` (unchanged). Making prod-push default to `shipped` is a one-line option in `summarization.ts` but is OUT of scope unless requested.

## Verification

**Commands:**
- `npm run typecheck` — no errors.
- `npm test` — all pass incl. new `branch-filter` + updated ingestion/cron/repo tests.
- `npm run lint` — clean.

**Manual checks:**
- Connect a repo → pick `main` → push to a feature branch (no candidate) → push to `main` (one candidate) → confirm in the queue.

## Suggested Review Order

**The filter (start here)**

- The whole feature in one pure function — the truth table for what becomes a candidate.
  [`branch-filter.ts:19`](../../src/server/ship-feed/branch-filter.ts#L19)

- Webhook path applies it after resolve; off-branch → skipped but still marked processed.
  [`process-github-event.ts:50`](../../src/server/inngest/functions/process-github-event.ts#L50)

- Cron path applies the SAME function (parity); off-branch events are skipped per-item.
  [`reconcile-repos.ts:41`](../../src/server/inngest/functions/reconcile-repos.ts#L41)

**Feeding the filter (no extra GitHub calls)**

- Normalize now captures the repo default branch + the PR base branch from the payload.
  [`github-event.ts:59`](../../src/server/ship-feed/github-event.ts#L59)

- The cron polls the production branch's head (not the GitHub default) + new branch listing.
  [`app.ts:150`](../../src/server/github/app.ts#L150)
  [`app.ts:217`](../../src/server/github/app.ts#L217)

**Persistence (additive, RLS-scoped)**

- Nullable column (NULL → falls back to the GitHub default branch at ingestion).
  [`schema.ts:282`](../../src/server/db/schema.ts#L282)

- RLS-scoped retarget; `findEngagementForRepo`/`listConnectionsForReconcile` thread it through.
  [`repo-connections.repository.ts:76`](../../src/server/db/repositories/repo-connections.repository.ts#L76)

**Actions + UI**

- Branch listing scoped to the caller's installation; retarget guarded by RLS.
  [`repo-connections.actions.ts:154`](../../src/server/repo-connections/repo-connections.actions.ts#L154)
  [`repo-connections.actions.ts:187`](../../src/server/repo-connections/repo-connections.actions.ts#L187)

- Inline edit-on-card for the tracked branch.
  [`production-branch-control.tsx:15`](../../src/app/app/engagements/[id]/(detail)/repos/production-branch-control.tsx#L15)

**Tests**

- The filter matrix (every truth-table row + override + null fallback).
  [`branch-filter.test.ts:1`](../../src/server/ship-feed/__tests__/branch-filter.test.ts#L1)
