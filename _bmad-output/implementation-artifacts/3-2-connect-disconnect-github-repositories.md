---
baseline_commit: a368616
---

# Story 3.2: Connect & Disconnect GitHub Repositories

Status: done

<!-- Note: Validation is optional. Run validate-create-story for a quality check before dev-story. -->

## Story

As a Freelancer,
I want to connect one or more repos to an Engagement and see their status,
so that the right repositories feed this client's progress — retiring the Story 3.1 single-active-Engagement spike shortcut (and the "every push to any repo creates a candidate" side effect it caused).

## Acceptance Criteria

1. **Connect a repo → an Engagement-scoped `repo_connections` row + a 4-state card (FR-9, UX-DR9).**
   **Given** an Engagement's **Repo Connections** tab and a registered+installed GitHub App
   **When** the Freelancer connects one of the repos the App is installed on
   **Then** a `repo_connections` row is created **scoped to that Engagement** (tenant + engagement), and the connection **card shows one of four states — `connected` / `pulling` / `error` / `disconnected`** (3.2 reaches `connected`/`disconnected`; `pulling`/`error` are wired by Story 3.3's pull/reconciliation — the card must render all four).

2. **Disconnect → stops feeding; many repos per Engagement.**
   **Given** a connected repo
   **When** the Freelancer disconnects it
   **Then** it **stops feeding** the Engagement (a later webhook for it no longer resolves to the Engagement) and the card reflects **`disconnected`**; **multiple repos can feed one Engagement**, and one repo can be **actively** connected to **at most one** Engagement.

3. **The repo→engagement map replaces the spike resolver (retires the 3.1 shortcut + the all-repos noise).**
   **Given** the GitHub pipeline (`process-github-event`)
   **When** a qualifying webhook arrives
   **Then** `resolveEngagementForRepo(repoFullName)` resolves via **`repo_connections`** (the connected, non-disconnected row for that repo) — so a push to a **connected** repo creates a candidate on **its** Engagement, and a push to an **unconnected** repo creates **no candidate** (no-op). `findSpikeTargetEngagement` is removed.

## Tasks / Subtasks

> **Split (mirrors Story 3.1):** Tasks 1–7 are fully buildable + offline-testable NOW (the GitHub App client is unit-tested with a mocked Octokit). **Task 8 is the live validation** — CJ sets `GITHUB_APP_ID` + `GITHUB_APP_PRIVATE_KEY` (the `.pem` already in CJ's Documents; App ID `3980977`), then connects a real repo and confirms routing. The tab ships **inert-but-graceful** until those are set (a "GitHub isn't configured yet" panel, never a crash — the env vars are DSN-optional).

- [x] **Task 1 — `repo_connections` table + dual-scope RLS + migration 0009 + isolation test** (AC: 1, 2)
  - [x] In `src/server/db/schema.ts` add `repoConnections` (`repo_connections`) right after `shipUpdates`: uuid v7 `id`; `tenantId uuid NOT NULL → tenants.id cascade`; `engagementId uuid NOT NULL → engagements.id cascade`; `ghInstallationId text NOT NULL` (gh_installation_id); `ghRepoId text NOT NULL` (gh_repo_id — store GitHub's numeric ids as `text`, like `gh_delivery_id`, to dodge bigint/precision quirks); `repoFullName text NOT NULL` (repo_full_name); `status text NOT NULL default 'connected'` (connected|pulling|error|disconnected); `lastPullAt timestamptz` (gh_pull driver = Story 3.3); `lastError text`; `createdAt timestamptz NOT NULL defaultNow()`. **Dual-scope RLS `repo_connection_scope`** (reuse `currentTenant`/`currentEngagement`, engagement clause on `engagement_id` — copy `engagement_scope`/`ship_update_scope` verbatim, swapping the column). **Partial UNIQUE** `repo_connections_active_repo` on `(repo_full_name)` **WHERE `status <> 'disconnected'`** (a repo has **at most one active** connection → the webhook resolve-by-full-name is unambiguous; a disconnected row stays as history + lets the repo be reconnected). Use `text` for `status` (codebase convention; the architecture's "PG enum" note was not adopted). Export type `RepoConnection`. Add the `uniqueIndex` import from `drizzle-orm/pg-core` if not already imported.
  - [x] `npm run db:generate` → `drizzle/0009_*.sql`: append **`ALTER TABLE "repo_connections" FORCE ROW LEVEL SECURITY;`** (drizzle-kit doesn't emit FORCE — same manual step as 0004–0008). Confirm the partial unique index emits with its `WHERE "status" <> 'disconnected'` predicate. `npm run db:migrate` on Neon; verify `repo_connections` `relforcerowsecurity=true` + the `repo_connection_scope` policy + the partial unique index.
  - [x] Extend `isolation.test.ts`: seed a `connected` repo_connection in Tenant A (E1) + Tenant B (E3); prove freelancer-A-sees-own, cross-tenant denied, fail-closed (unset GUC → 0 rows), WITH-CHECK-forged-tenant rejected (the 2.x (o)-style clean-forge). Reuse the existing fixture helpers.

- [x] **Task 2 — `repo-connections.repository.ts` (scoped CRUD + the system resolve)** (AC: 1, 2, 3)
  - [x] `src/server/db/repositories/repo-connections.repository.ts`:
    - `listConnections(ctx, engagementId)` — `withTenant`, select where `engagement_id = $` (RLS scopes the Tenant; the engagement filter is defense-in-depth), order by `created_at`.
    - `connectRepo(ctx, { engagementId, ghInstallationId, ghRepoId, repoFullName })` — `withTenant` insert `status:'connected'`, `.returning()`. A plain insert: the partial unique throws on a 2nd **active** connection for the same repo (caught by the action → "already connected"); a previously-**disconnected** repo has no active row, so reconnect inserts a fresh row (old disconnected row remains as history).
    - `disconnectRepo(ctx, connectionId)` — `withTenant` update `set status:'disconnected'` where `id = $`, `.returning()`, return `row ?? null` (RLS → null if not the caller's).
    - `findEngagementForRepo(repoFullName)` — **RAW `db`** (the Inngest pipeline is a SYSTEM process, pre-tenant, like `findSpikeTargetEngagement`/`findInvitationByTokenHash`): select `tenant_id`, `engagement_id` where `repo_full_name = $ AND status <> 'disconnected'` limit 1; return `{ tenantId, engagementId } | null`. (The partial unique guarantees ≤1 match.) Import `db` from `../index` (the repository layer is ESLint-exempt).
  - [x] Unit-test (PGlite, mirror `ship-update.repository.test.ts`): `connectRepo` inserts scoped + `connected`; a 2nd active connect for the same `repo_full_name` throws (partial unique); `disconnectRepo` flips to `disconnected` + then the repo can be connected again; cross-tenant connect/read denied (RLS); `findEngagementForRepo` returns the connected engagement, `null` for a disconnected repo and for an unknown repo.

- [x] **Task 3 — GitHub App client (`src/server/github/app.ts`) — list connectable repos** (AC: 1)
  - [x] `src/server/github/app.ts` (NEW — the `src/server/github/` integration boundary the architecture reserves [L380, L398]; wraps `@octokit/app` v16 + `@octokit/rest` v22 with `@octokit/plugin-throttling` + `@octokit/plugin-retry`, all already in `package.json`):
    - `isGithubConfigured(): boolean` — `!!env.GITHUB_APP_ID && !!env.GITHUB_APP_PRIVATE_KEY`.
    - `getApp()` — returns a cached `new App({ appId, privateKey, Octokit })` or `null` if unconfigured. **Normalize the PEM**: `env.GITHUB_APP_PRIVATE_KEY` is pasted with literal `\n` (per `docs/github-app-setup.md`) → `privateKey.includes("\\n") ? privateKey.replace(/\\n/g, "\n") : privateKey`. `Octokit = Octokit.plugin(throttling, retry)` with a minimal `throttle.onRateLimit`/`onSecondaryRateLimit` returning `true` (retry, NFR-5 rate-limit-aware [arch L246]).
    - `listConnectableRepos(): Promise<{ installationId: string; repoId: string; fullName: string; private: boolean }[]>` — for each installation (`app.eachInstallation.iterator()`), for each repo (`app.eachRepository.iterator({ installationId })`), collect `{ installationId: String(installation.id), repoId: String(repository.id), fullName: repository.full_name, private: repository.private }`. Returns `[]` if unconfigured. **Let API errors throw** (the tab catches → degraded banner).
  - [x] Unit-test (`src/server/github/__tests__/app.test.ts`, mock `@octokit/app` via `vi.mock`): `isGithubConfigured` is false when env unset (mock `@/env`); `listConnectableRepos` returns `[]` when unconfigured and maps a mocked installation+repos into the flat shape (assert `installationId`/`repoId` are stringified). Do NOT hit the network.

- [x] **Task 4 — Replace the spike resolver with the real repo→engagement lookup** (AC: 3)
  - [x] `src/server/ship-feed/resolve-engagement.ts`: replace the body with `return findEngagementForRepo(repoFullName)` (import from the new repo repository); rename the param `_repoFullName` → `repoFullName` (it's used now) and rewrite the docstring (no longer a spike). The signature/return shape is unchanged, so `process-github-event.ts` and its tests are untouched.
  - [x] Remove `findSpikeTargetEngagement` from `engagements.repository.ts` (now unused — the spike is retired) and drop the now-unused `eq`/`db` imports there only if nothing else needs them (check: `eq` is used by `getEngagement`/`updateEngagement`; `db` becomes unused → remove the `db` import). Verify no other importer of `findSpikeTargetEngagement` remains (`grep`).

- [x] **Task 5 — Connect/disconnect Server Actions + Zod schema** (AC: 1, 2)
  - [x] `src/server/repo-connections/repo-connections.schema.ts`: `connectRepoSchema` (`engagementId: uuid`, `repoFullName: non-empty string matching `^[^/\s]+/[^/\s]+$`), `disconnectRepoSchema` (`connectionId: uuid`).
  - [x] `src/server/repo-connections/repo-connections.actions.ts` (`"use server"`, mirror `engagements.actions.ts`): typed results `{ ok: true } | { ok: false; error }`.
    - `connectRepoAction({ engagementId, repoFullName })` — `requireFreelancer()` → Zod parse → `getEngagement(ctx, engagementId)` (null → "That engagement no longer exists.") → `listConnectableRepos()` and find the repo by `fullName` (not found → "That repo isn't available to the app — is it installed?") → `connectRepo(ctx, { engagementId, ghInstallationId, ghRepoId, repoFullName })` → `revalidatePath(\`/app/engagements/${engagementId}/repos\`)`. Catch the partial-unique violation (Postgres code `23505`) → `{ ok:false, error:"That repo is already connected to an engagement." }`; catch the rest → log + generic error.
    - `disconnectRepoAction({ engagementId, connectionId })` — `requireFreelancer()` → Zod parse → `disconnectRepo(ctx, connectionId)` (null → "That connection no longer exists.") → revalidate the repos path → `{ ok:true }`.
  - [x] Unit-test (`__tests__/repo-connections.actions.test.ts`, hoisted `vi.mock` of the repo + the github client + `requireFreelancer`, like the route tests): connect happy path calls `connectRepo` with the resolved `ghRepoId`/`ghInstallationId`; a `repoFullName` not in `listConnectableRepos` → error, no insert; a 23505 → "already connected"; disconnect happy path; bad input (non-uuid) → validation error.

- [x] **Task 6 — The Repo Connections tab UI (replace the placeholder)** (AC: 1, 2)
  - [x] `src/app/app/engagements/[id]/(detail)/repos/page.tsx` (replace `TabPlaceholder`): RSC — `requireFreelancer()` → `getEngagement(ctx, id)` (`notFound()` if null, matching the layout) → `listConnections(ctx, id)`; then `isGithubConfigured()` and, if so, `await listConnectableRepos()` inside a `try/catch` (error → render the degraded banner, don't throw). Render:
    - **Not configured** (`!isGithubConfigured()`): a calm panel — "Connect GitHub isn't set up yet." (points to finishing the GitHub App setup; no crash). 
    - **Connected list**: a `RepoConnectionCard` per active connection — `repo_full_name`, a status indicator for all **four** states (connected ● / pulling ◐ / error ▲ / disconnected ○), `last_pull_at` relative time (reuse `src/lib/relative-time.ts`) when present, `last_error` text in the error state, and a **Disconnect** button (only for non-disconnected). Disconnected rows render greyed with a "reconnect via the picker" affordance.
    - **Connect control** (client component): a combobox/select of `listConnectableRepos()` **minus already-actively-connected** `repo_full_name`s → on submit, `connectRepoAction`. Use the existing `Button` `loading` prop (Story dd8e082 spinner pattern) + `sonner` toast on error.
    - **Empty** (no connections): the UX-mandated copy "No repo connected yet. Connect GitHub to auto-pull updates — or write one by hand." [EXPERIENCE.md L122] (the "by hand" path is Story 3.8 — copy only for now).
    - **GitHub degraded** (the API threw): the non-blocking banner "Couldn't reach GitHub. Auto-updates are paused — your published feed is unaffected. Retry." [EXPERIENCE.md L125].
  - [x] Client components under the route group: `connect-repo-form.tsx` (the picker + action call + pending state) and `disconnect-button.tsx` (confirm + `loading`), mirroring the existing `archive-button.tsx` interaction pattern. Keep the Tenant accent OFF the Cockpit chrome (Cockpit never wears `--tenant-accent`).

- [x] **Task 7 — Gates + migration on Neon + deploy** (AC: 1, 2, 3)
  - [x] `npm run lint && npm run typecheck && npm test && npm run build` all green; don't regress the 201 prior tests. Commit `drizzle/0009_*` + the snapshot.
  - [x] Apply 0009 to Neon (verified in Task 1). Deploy (`vercel --prod`) — verify `.env.local` checksum unchanged. The tab ships **graceful** (no App ID/key in prod yet → "not configured" panel; the resolver returns `null` for every repo → **no candidates created** until repos are connected, which already neutralizes the all-repos noise the moment this deploys, even before Task 8).

- [ ] **Task 8 — LIVE validation (CJ + dev)** (AC: 1, 2, 3)
  - [ ] CJ sets `GITHUB_APP_ID=3980977` + `GITHUB_APP_PRIVATE_KEY` (the `.pem` from Documents, single line with literal `\n`) in `.env.local` **and** Vercel; redeploy. In the Cockpit, open an Engagement → **Repo Connections** → the picker lists CJ's repos → **connect `cjjutba/soloist`** to that Engagement → card shows `connected`. Push a commit to `cjjutba/soloist` → **one candidate on THAT Engagement**. Push to a **different, unconnected** repo → **no candidate** (the all-repos noise is gone). Disconnect `cjjutba/soloist` → card `disconnected` → a further push creates no candidate. (Proves the repo→engagement map end-to-end; clean up the test candidate(s) after.)

## Dev Notes

### Architecture compliance (non-negotiable)

[Source: architecture.md L140, L174, L198–L199, L208, L231, L246, L277, L308, L380, L398]
- **Data model (exact):** `RepoConnection — id, tenant_id, engagement_id, gh_installation_id, gh_repo_id, repo_full_name, status(connected|pulling|error|disconnected), last_pull_at, last_error` [L174]. Add `created_at` (codebase convention). Tables are `snake_case` plural; columns `snake_case`; PK uuid v7; FKs `<entity>_id` [L277].
- **GitHub App model (NFR-3) [L198]:** store ONLY `installation_id` + `repo_id` (+ `repo_full_name` for resolve) — **never** long-lived tokens. Short-lived installation tokens are minted **on demand** from the App private key (kept in a Vercel env var, never the DB). Story 3.2 mints a token only to **list** connectable repos; the auto-pull tokens are Story 3.3. Least-privilege read-only `contents`/`metadata`/`pull_requests` (already configured on the App).
- **Server Actions for mutations [L208]:** connect/disconnect are Server Actions (`requireFreelancer` → Zod → repository → `revalidatePath`), progressive-enhancement friendly, no bespoke REST. The GitHub **read** (list repos) happens in the RSC + the action, via `src/server/github/`.
- **Integration boundary [L380, L398]:** `src/server/github/` wraps Octokit (with throttle+retry) behind a small surface — the ONLY place that touches the GitHub API. Reconciliation/pull (which drives `pulling`/`error`/`last_pull_at`/`last_error`) is **Story 3.3**, not here.
- **Error handling [L308]:** expected GitHub failures → the Engagement banner + the repo card `error` state (never block the feed); unexpected → throw → Sentry. The connect/disconnect actions return typed results with user copy (no 500-leak).
- **The privacy boundary is unaffected** — `repo_connections` holds no Client-facing data; it never reaches a Client query (the Client feed is Story 3.7).

### Design decisions (bake these in — they resolve the ambiguous forks)

- **Soft disconnect.** Disconnect sets `status='disconnected'` (not a delete) so the card can show the 4th state and history is kept. The **partial unique** (`WHERE status <> 'disconnected'`) lets the same repo be reconnected later (a fresh row) while guaranteeing **at most one active connection per repo** — which is exactly what makes the webhook's resolve-by-`repo_full_name` unambiguous.
- **Resolve key = `repo_full_name`** (matches the 3.1 normalizer + `source_event_key`, which already key on `repoFullName`). `gh_repo_id` is stored for stability/3.3 but 3.2 resolves by full name. (A repo rename mid-engagement is an accepted v1 edge — note it; 3.x can switch the resolve to `gh_repo_id`.)
- **System resolve is raw-`db`.** `findEngagementForRepo` runs in the Inngest function (no session) → raw `db` (owner, BYPASSRLS), exactly like `findSpikeTargetEngagement`/`findInvitationByTokenHash`. The candidate insert still goes through `withTenant` with the **derived** system ctx `{ tenantId, userId:"system", role:"freelancer" }` (no change to `process-github-event.ts`).
- **Four states, two reachable in 3.2.** Connect→`connected`, disconnect→`disconnected`. `pulling`/`error` are set by Story 3.3's pull + reconciliation cron — but the card component renders all four now (AC-1 says the card shows "one of four states").
- **Graceful-inert without the App key.** `GITHUB_APP_ID`/`PRIVATE_KEY` are DSN-optional in `env.ts` → the tab renders a "not configured" panel and the resolver returns `null` (no candidates) rather than crashing. Build stays green with the env unset.

### Previous-story intelligence (Stories 3.1, 2.x — read first)

- **Table + dual-scope RLS + FORCE + migration pattern** (3.1 `ship_updates`, 2.1 `engagements`): `pgPolicy` in `schema.ts` with `using`/`withCheck = tenant_id = currentTenant AND (currentEngagement IS NULL OR engagement_id = currentEngagement)`; append `FORCE ROW LEVEL SECURITY` to the generated SQL by hand; verify on Neon; extend `isolation.test.ts` with the (o)-style clean-forge. `currentTenant`/`currentEngagement` helpers already exist in `schema.ts`.
- **The seam 3.1 left:** `src/server/ship-feed/resolve-engagement.ts` → `resolveEngagementForRepo(_repoFullName)` currently delegates to `findSpikeTargetEngagement()` (the single active Engagement). This story makes it a `repo_connections` lookup and deletes the spike fn. `process-github-event.ts` calls `resolveEngagementForRepo` + builds the system ctx from its result — unchanged.
- **Repository + withTenant + raw-db** (2.4 `findInvitationByTokenHash`, 3.1 `findSpikeTargetEngagement`/`recordDelivery`): scoped CRUD via `withTenant`; system/pre-tenant reads via raw `db` (sanctioned — ESLint exempts `src/server/db/**`). `onConflict`/unique-violation handling mirrors `upsertInvitation`/`createCandidate`.
- **Server Action shape** (`engagements.actions.ts`): `"use server"` → `requireFreelancer()` → `safeParse` → repository → `revalidatePath` → `{ ok }`; `console.error` + generic copy on throw. Loading spinners via the `Button` `loading` prop (commit dd8e082).
- **Detail shell** (2.2): the `(detail)/layout.tsx` already guards (`requireFreelancer` + `getEngagement` → `notFound`) and renders the header + `EngagementTabs`; the **Repos tab route already exists** as a `TabPlaceholder` at `(detail)/repos/page.tsx` — replace its body. The page re-derives `ctx`+`engagement` itself (layouts don't pass props to pages). `isUuid` guard already in the layout.
- **Tests** are vitest `node` + PGlite (no `@testing-library`); hoisted `vi.mock` for the GitHub client + repos; the isolation suite uses the `soloist_app` role switch. Don't regress the 201 prior tests.

### GitHub App client — `@octokit/app` v16 (the new integration, verify during dev)

- `new App({ appId, privateKey, Octokit })` where `Octokit = (await import("@octokit/rest")).Octokit.plugin(throttling, retry)`. Iterate: `for await (const { installation } of app.eachInstallation.iterator())` then `for await (const { repository } of app.eachRepository.iterator({ installationId: installation.id }))`. `repository.id` / `.full_name` / `.private` are the fields. (For a personal-account App installed on "all repos," expect ONE installation returning all of the owner's repos — paginate.)
- **PEM normalization** is the classic footgun: the env value has literal `\n`; convert to real newlines before passing to `App`. 
- Throttling: provide `throttle.onRateLimit`/`onSecondaryRateLimit` that `return true` (retry) — minimal but satisfies the rate-limit-aware mandate [L246]. Confirm the exact v16 option shape during implementation (context7 `@octokit/app` if unsure).

### Project Structure Notes

- **New:** `src/server/db/repositories/repo-connections.repository.ts`; `src/server/github/app.ts`; `src/server/repo-connections/{repo-connections.actions.ts,repo-connections.schema.ts}`; the Repos-tab client components (`connect-repo-form.tsx`, `disconnect-button.tsx`) + a `RepoConnectionCard`; `drizzle/0009_*`; tests for each (`repo-connections.repository.test.ts`, `github/__tests__/app.test.ts`, `repo-connections/__tests__/repo-connections.actions.test.ts`).
- **Modified:** `src/server/db/schema.ts` (+`repoConnections`+type); `src/server/ship-feed/resolve-engagement.ts` (real lookup); `src/server/db/repositories/engagements.repository.ts` (remove `findSpikeTargetEngagement` + the now-unused `db` import); `src/app/app/engagements/[id]/(detail)/repos/page.tsx` (real tab); `src/server/db/__tests__/isolation.test.ts` (repo_connections fixtures).
- **Do NOT:** build the auto-pull / installation-token-for-content (Story 3.3), the reconciliation cron (3.3), the curation UI (3.5), publish/client feed (3.6/3.7), or a manual-update path (3.8); store long-lived tokens; drive `pulling`/`error`/`last_pull_at`/`last_error` (3.3 owns those); add a PG enum (use `text`); let the Tenant accent touch the Cockpit chrome.
- **Watch:** the partial unique predicate MUST be in the migration (verify the generated SQL); `findEngagementForRepo` MUST filter `status <> 'disconnected'`; the tab must not crash when `GITHUB_APP_*` is unset (graceful panel) or when the GitHub API throws (degraded banner).

### Testing requirements

- **Repository (PGlite):** connect scoped+`connected`; 2nd active connect for the same repo throws (partial unique); disconnect→`disconnected`→reconnect works; cross-tenant denied; `findEngagementForRepo` resolves connected / null for disconnected+unknown.
- **Isolation:** `repo_connections` dual-scope — own / cross-tenant / fail-closed / WITH-CHECK-forge.
- **GitHub client (mocked Octokit):** unconfigured → `[]` + `isGithubConfigured` false; mocked installations+repos → flat stringified shape. No network.
- **Actions (mocked repo+client+session):** connect happy path passes the resolved ids; unknown repo → error, no insert; 23505 → "already connected"; disconnect; bad input → validation error.
- **Regression:** the 201 prior tests stay green; `process-github-event` tests unchanged (they mock `resolveEngagementForRepo`).
- **Live (Task 8):** connected repo push → candidate on its Engagement; unconnected repo push → none; disconnect → none.

### References

- [Source: epics.md#Story 3.2 (L415–429) + Epic 3 intro (L394–396) + #Story 3.1/3.3 boundaries]
- [Source: architecture.md L140 (GitHub App primary), L174 (RepoConnection model), L198–L199 (App model + HMAC), L208 (Server Actions incl. connect/disconnect), L231/L246 (Inngest reconciliation + rate-limit-aware = 3.3), L277 (naming), L308 (GitHub error → repo card error/banner), L380/L398 (`src/server/github/` boundary)]
- [Source: EXPERIENCE.md L34/L105 (Repo Connections tab + the connection card spec), L122 (empty-state copy), L125–L126 (degraded/revoked copy), L190/L194 (Flow: connect → connected→pulling, failure path)]
- [Source: PRD FR-9 (connect/disconnect + status), NFR-3 (App security), NFR-4/5 (reconciliation/latency = 3.3)]
- [Source: src/server/db/{schema.ts (engagement_scope/ship_update_scope dual-scope + currentTenant/currentEngagement), repositories/engagements.repository.ts (withTenant + findSpikeTargetEngagement), context.ts}; src/server/engagements/engagements.actions.ts (Server Action shape); src/server/ship-feed/resolve-engagement.ts + process-github-event.ts (the seam); src/app/app/engagements/[id]/(detail)/{layout.tsx,repos/page.tsx,engagement-tabs.tsx}; docs/github-app-setup.md (the App ID/private-key + PEM `\n` note); package.json (@octokit/app ^16, @octokit/rest ^22, plugin-throttling/retry already installed)]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (1M context) — dev-story + xhigh code-review.

### Debug Log References

- `octokit.paginate` isn't on the `@octokit/app` iterator's Octokit type (the custom `Octokit` injection doesn't propagate to the type) → switched `listConnectableRepos` to `octokit.request("GET /installation/repositories", { per_page, page })` with a manual pagination loop.
- The connect-action test asserted `connectRepo(input)` but the call is `connectRepo(ctx, input)` — fixed the assertion (two args).
- zod v4 → `z.uuid()` (not `z.string().uuid()`).

### Completion Notes List

Tasks 1–7 complete (offline-buildable + tested). **Task 8 = CJ's live validation** (set `GITHUB_APP_ID=3980977` + the `.pem` → connect a repo → push → candidate on that engagement). The tab ships **graceful-inert** until those are set ("not configured" panel; no crash).

Gates: typecheck ✓, lint ✓, **221 tests ✓** (19 new for 3.2 + 1 review-fix test; no regression of the prior 201), build ✓, `db:generate` clean (no drift). Migration `0009` applied to Neon + verified: `repo_connections` `relforcerowsecurity=true` + the `repo_connection_scope` policy + the **partial unique** `repo_connections_active_repo ... WHERE (status <> 'disconnected')`.

**The spike is retired:** `resolveEngagementForRepo` → `findEngagementForRepo` (repo_connections lookup), `findSpikeTargetEngagement` deleted. This **immediately neutralizes the all-repos noise on deploy** (independent of the App being configured): with zero connections the resolve returns null → no candidates; only pushes to *connected* repos create candidates.

Post-review hardening (xhigh, security-weighted — see Senior Developer Review): non-uuid id guard on the tab; `findEngagementForRepo` fail-closed backstop (`.limit(2)` + exactly-one); JWT-in-logs fix (log the message, not the Octokit error object); picker excludes all of the Tenant's actively-connected repos (no guaranteed-fail clicks); deduped/active-excluded "Previously connected" list; merged the empty state into the connect form (no double-render); robust `isUniqueViolation` (cause-chain walk).

### File List

**New**

- `src/server/db/repositories/repo-connections.repository.ts` (+ `src/server/db/__tests__/repo-connections.repository.test.ts`)
- `src/server/github/app.ts` (+ `__tests__/app.test.ts`)
- `src/server/repo-connections/repo-connections.schema.ts`, `repo-connections.actions.ts` (+ `__tests__/repo-connections.actions.test.ts`)
- `src/app/app/engagements/[id]/(detail)/repos/{repo-connection-card,connect-repo-form,disconnect-button}.tsx`
- `drizzle/0009_ancient_maggott.sql`, `drizzle/meta/0009_snapshot.json`

**Modified**

- `src/server/db/schema.ts` (+ `repoConnections` + type + the `uniqueIndex` import)
- `src/server/ship-feed/resolve-engagement.ts` (real repo_connections lookup)
- `src/server/db/repositories/engagements.repository.ts` (removed `findSpikeTargetEngagement` + the now-unused `db` import)
- `src/app/app/engagements/[id]/(detail)/repos/page.tsx` (real tab — was a placeholder)
- `src/server/db/__tests__/isolation.test.ts` (repo_connections fixtures (y)–(ab))
- `drizzle/meta/_journal.json`

## Senior Developer Review (AI)

**Reviewer:** CJ (via Claude xhigh code-review — 3 finder angles, security-weighted)
**Date:** 2026-06-07
**Outcome:** ✅ **Approve** (all correctness/UX fixes applied; multi-tenant concerns are accepted-risk for the single-tenant v1, tracked below)

### Summary

The data layer (dual-scope RLS + FORCE + the partial unique) and the spike retirement are sound, and the all-repos-noise fix is confirmed App-config-independent (zero connections → resolve null → no candidates). The review surfaced one real correctness bug (a non-uuid id could reach a uuid column via the layout/page concurrent render → 500 instead of 404), a secret-hygiene issue (an Octokit error logged whole could carry the App JWT), two UX warts (the picker offered repos that would 23505; the empty-state card double-rendered with the connect form), and a defensive regression (the new resolver dropped the spike fn's fail-closed exactly-one check). All fixed. The deeper findings are **multi-tenant** design limits that don't bite the current single-freelancer/single-App deployment.

### Key Findings & Resolutions

| # | Sev | Finding | Resolution |
|---|-----|---------|-----------|
| 1 | **Med** | The tab's `listConnections(ctx, id)` ran with the raw `id` and relied on the `(detail)` layout's `isUuid`/`notFound` — but layout + page render concurrently, so a non-uuid id → uuid-cast 500. | **Fixed** — `isUuid(id)` guard on the page. |
| 2 | **Med** | `findEngagementForRepo` (BYPASSRLS, webhook→tenant resolver) dropped the spike fn's `.limit(2)`+exactly-one fail-closed check; a broken unique invariant could mis-attribute a webhook. | **Fixed** — restored `.limit(2)` + `rows.length === 1 ? row : null`. |
| 3 | **Med** | An Octokit error in `connectRepoAction`'s catch was `console.error(err)`'d whole — the error's request config can carry the App JWT (minted from the private key). | **Fixed** — log `err.message` only. |
| 4 | Low | The connect picker only excluded *this* Engagement's active repos → a repo connected elsewhere was offered → 23505 → confusing toast. | **Fixed** — new `listActiveRepoFullNames(ctx)` excludes all of the Tenant's active repos. |
| 5 | Low | The "No repo connected yet" empty card AND the connect form both rendered at zero connections (redundant CTAs); disconnected rows showed duplicates + repos that were re-connected. | **Fixed** — empty copy merged into the form; "Previously connected" deduped by repo + excludes now-active repos. |
| 6 | Low | `isUniqueViolation` checked only one `cause` level; the Neon driver can nest deeper. | **Fixed** — walks the cause chain for `23505`, tighter message fallback. |

### Accepted Risks (single-tenant v1 — tracked for multi-tenant launch)

- **Global partial unique on `repo_full_name`.** Two *different* Tenants can't both connect the same repo (the 2nd 23505s, and the message leaks that *someone* connected it). This is **intentional** — it's what makes the webhook's tenant-less resolve-by-full-name unambiguous. Fine for the single-freelancer v1; a true multi-tenant SaaS needs an **installation-scoped resolve** (resolve by `gh_installation_id` + repo, tenant-scoped unique). Tracked.
- **Shared-App cross-freelancer repo access.** `listConnectableRepos` iterates *all* installations of the one shared App, so with ≥2 freelancers a freelancer could connect another's installed repo. v1 is one freelancer + their own App → no exposure. **Before onboarding a 2nd freelancer**, bind each GitHub installation to a Tenant (an `installation → tenant` map) and scope the connect/list to the caller's installations.
- **Engagement-ownership is enforced at the action, not the RLS policy** (the dual-scope engagement clause is a no-op for a Freelancer). `connectRepoAction`'s `getEngagement` is the gate; documented in `connectRepo`'s contract. Safe while the action is the sole caller.
- **Disconnected rows accumulate** (soft-disconnect never purges); the *display* is now deduped/bounded, but a retention/cleanup pass is future work (a reconciliation-cron chore, 3.3+).
- **Case-sensitivity / rename edges:** resolve matches `repo_full_name` case-sensitively; a repo renamed to different case (or renamed at all) would miss until reconnected. `gh_repo_id` is already stored for a future rename-proof resolve. Documented edge.

### Review Follow-ups (AI)

- [x] [AI-Review][Med] Non-uuid id guard on the Repos tab.
- [x] [AI-Review][Med] `findEngagementForRepo` fail-closed exactly-one backstop.
- [x] [AI-Review][Med] Don't log the raw Octokit error (App JWT leak).
- [x] [AI-Review][Low] Picker excludes all of the Tenant's active repos.
- [x] [AI-Review][Low] Empty-state merged into the form; "Previously connected" deduped/active-excluded.
- [x] [AI-Review][Low] `isUniqueViolation` walks the cause chain.

## Change Log

| Date       | Version | Description                                                       | Author |
| ---------- | ------- | --------------------------------------------------------------- | ------ |
| 2026-06-06 | 0.1     | Story drafted (ultimate context engine).                        | Scrum  |
| 2026-06-07 | 1.0     | Tasks 1–7 implemented; 221 tests green; migration 0009 on Neon. | Dev    |
| 2026-06-07 | 1.1     | xhigh code-review: uuid guard, resolve backstop, JWT-log, picker/empty-state/dedup fixes. | Dev |
