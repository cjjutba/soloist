---
baseline_commit: 1932324
---

# Story 3.2.1: Per-Tenant GitHub Installation Binding (multi-tenant repo isolation)

Status: done

<!-- Inserted after Story 3.2 (correct-course, 2026-06-07): Story 3.2 ships a single shared
GitHub App whose `listConnectableRepos` iterates ALL installations — so a 2nd Freelancer would
see/connect the 1st's repos. This story binds each installation to a Tenant and scopes the
picker/connect to the caller's own installations, before any 2nd Freelancer onboards. -->

## Story

As the platform (and a future second Freelancer),
I want each GitHub App installation bound to the Tenant that created it, and the repo picker/connect scoped to the caller's own installations,
so that one Freelancer can never see, connect, or pull another Freelancer's repositories — making the single shared GitHub App safe for multi-tenant use.

## Acceptance Criteria

1. **Install → the installation is bound to the installing Freelancer's Tenant.**
   **Given** a Freelancer signed into the Cockpit who installs the (now public) GitHub App
   **When** GitHub redirects back to the App's Setup URL (`/app/settings/github/setup?installation_id=…&setup_action=install`)
   **Then** a `github_installations` row is created binding `gh_installation_id → the caller's Tenant` (tenant-scoped, RLS), idempotently, and the Freelancer lands back in the Cockpit.

2. **The picker + connect are scoped to the Tenant's own installations.**
   **Given** the Repo Connections tab
   **When** it lists connectable repos (and when `connectRepoAction` re-verifies a chosen repo)
   **Then** only repos from **the caller Tenant's** installation(s) are listed/allowed — a repo from another Tenant's installation is **never shown and is rejected on connect** (NFR-2 across the GitHub boundary). A Tenant with **no** installation sees an **"Install the GitHub App"** call-to-action, not an empty/erroring picker.

3. **Uninstall → the binding (and its connections) are cleaned up.**
   **Given** a bound installation
   **When** the Freelancer uninstalls the App (GitHub sends `installation.deleted`)
   **Then** the `github_installations` binding is removed and that installation's `repo_connections` are disconnected (they stop feeding) — verified-signature, idempotent.

## Tasks / Subtasks

> **Split:** Tasks 1–7 are buildable + offline-testable NOW (the GitHub client is mocked). **Task 8 is the live validation** — CJ makes the App **public** ("Any account"), sets its **Setup URL** + subscribes to **Installation** events, sets `GITHUB_APP_SLUG`, and confirms a 2nd GitHub account sees only its own repos.

- [x] **Task 1 — `github_installations` table + tenant-scoped RLS + migration 0010 + isolation test** (AC: 1)
  - [x] In `src/server/db/schema.ts` add `githubInstallations` (`github_installations`): uuid v7 `id`; `tenantId uuid NOT NULL → tenants.id cascade`; `ghInstallationId text NOT NULL UNIQUE` (one installation belongs to exactly one Tenant — a global unique, like `webhook_events.gh_delivery_id`, since a GitHub installation is globally unique); `accountLogin text` (the GitHub account/org the App is installed on, for display); `createdAt timestamptz NOT NULL defaultNow()`. **Tenant-scoped RLS `github_installation_scope`** — NOTE: this table is tenant-scoped only (NO engagement dimension), so the policy is `tenant_id = ${currentTenant}` (like `branding`/`tenants`, NOT the dual-scope shape). Export type `GithubInstallation`.
  - [x] `npm run db:generate` → `drizzle/0010_*.sql`: append **`ALTER TABLE "github_installations" FORCE ROW LEVEL SECURITY;`**. `npm run db:migrate` on Neon; verify `relforcerowsecurity=true` + the policy + the `gh_installation_id` unique.
  - [x] Extend `isolation.test.ts`: seed an installation in Tenant A + Tenant B; prove A-sees-own, cross-tenant denied, fail-closed, WITH-CHECK-forge rejected (tenant-scoped variant — no engagement clause). Cases (ac)–(af).

- [x] **Task 2 — `github-installations.repository.ts`** (AC: 1, 2, 3)
  - [x] `recordInstallation(ctx, { ghInstallationId, accountLogin })` — `withTenant` insert with `onConflictDoUpdate` on `gh_installation_id` (set `tenant_id = ctx.tenantId`, `account_login`) so a re-install / re-bind is idempotent **and re-asserts ownership to the current caller** (an installation can be transferred). Returns the row.
  - [x] `listInstallations(ctx)` → the Tenant's installations (RLS-scoped). `listInstallationIds(ctx)` → `string[]` of `gh_installation_id`.
  - [x] `removeInstallation(ghInstallationId)` — **RAW `db`** (the uninstall webhook is pre-tenant/system, like `recordDelivery`): delete the binding by `gh_installation_id`. Returns the deleted count.
  - [x] Unit-test (PGlite): record is idempotent + re-binds; `listInstallationIds` returns only the Tenant's; cross-tenant read denied; `removeInstallation` deletes.

- [x] **Task 3 — Scope the GitHub client to specific installations** (AC: 2)
  - [x] `src/server/github/app.ts`: replace `listConnectableRepos()` with **`listReposForInstallations(installationIds: string[])`** — iterate only the given installation ids (`app.getInstallationOctokit(Number(id))` → paginate `GET /installation/repositories`), returning the same `ConnectableRepo[]` shape. `[]` for an empty list or unconfigured. Add **`getInstallationAccount(installationId): Promise<string | null>`** — `app.octokit.request("GET /app/installations/{installation_id}")` → `installation.account?.login` (for the setup binding's display). Errors throw (callers catch → degraded banner). Update the github/app test (mock `getInstallationOctokit`).

- [x] **Task 4 — The Setup URL flow + install link** (AC: 1)
  - [x] `src/server/github/install-url.ts`: `githubInstallUrl(): string | null` → `env.GITHUB_APP_SLUG ? \`https://github.com/apps/${slug}/installations/new\` : null` (the public install page).
  - [x] `src/app/app/settings/github/setup/page.tsx` (RSC, authenticated): `requireFreelancer()` → read `searchParams` `installation_id` + `setup_action`. If `setup_action` is `install`/`update` and `installation_id` present → `getInstallationAccount(id)` then `recordInstallation(ctx, { ghInstallationId: id, accountLogin })` → `redirect("/app")` (or back to a stored engagement). Guard: missing/non-numeric `installation_id` → a calm "couldn't link that installation" panel (no crash). This page is the **Setup URL** CJ configures on the App.
  - [x] A `repo-connections.actions.ts`-style action is NOT needed (the binding is a GET-redirect side effect in the authenticated page).

- [x] **Task 5 — Scope the Repo Connections tab + connect action to the Tenant's installations** (AC: 2)
  - [x] `repos/page.tsx`: compute `installationIds = await listInstallationIds(ctx)`; if `configured && installationIds.length === 0` → render an **"Install the GitHub App"** card (a link to `githubInstallUrl()`), not the picker. Else `available = await listReposForInstallations(installationIds)` (the scoped call). The rest (active/disconnected/picker) unchanged.
  - [x] `connectRepoAction`: re-verify the chosen repo against **`listReposForInstallations(await listInstallationIds(ctx))`** (the Tenant's installations) — a repo not in the Tenant's own installations → the existing "isn't available to the app" rejection. (This is the multi-tenant authz: B can't connect A's repo because it isn't in B's installations.)
  - [x] An `InstallGithubButton`/link client affordance + the empty-state copy.

- [x] **Task 6 — Uninstall cleanup (`installation.deleted`)** (AC: 3)
  - [x] In the Inngest pipeline (`process-github-event.ts` / `github-event.ts`): recognize `eventType === "installation"` with `action === "deleted"` → extract `installation.id` → `removeInstallation(String(id))` + disconnect that installation's `repo_connections` (a new repo `disconnectByInstallation(ghInstallationId)` raw-db update `status='disconnected'` for matching active rows). Idempotent. (Other installation actions → no-op.) The webhook route already verifies the signature + dedupes, so this rides the existing path.
  - [x] Unit-test the handler branch (mock the repos): `installation.deleted` → `removeInstallation` + `disconnectByInstallation` called; other actions → no-op.

- [x] **Task 7 — Gates + migration on Neon + deploy** (AC: 1, 2, 3)
  - [x] `lint && typecheck && test && build` green; don't regress the 221 prior tests. Commit `drizzle/0010_*`. Apply to Neon. Deploy (`vercel --prod`; verify `.env.local` checksum). **Until the App is public + the Setup URL is set (Task 8), the existing single-installation (CJ's) keeps working** — Task 5 reads CJ's bound installation; **but CJ's installation isn't bound yet**, so this story must also **backfill CJ's current installation** into `github_installations` on deploy (a one-off: insert `{ tenant_id: CJ's tenant, gh_installation_id: <CJ's install id> }`) OR the setup flow re-binds it when CJ re-visits the install page. Document the backfill step.

- [ ] **Task 8 — LIVE validation (CJ + dev)** (AC: 1, 2, 3)
  - [ ] CJ: on the GitHub App → **"Where can this GitHub App be installed?" → Any account**; set **Setup URL** = `https://soloist.cjjutba.com/app/settings/github/setup` (+ "Redirect on update"); **Subscribe to events → Installation**; copy the **app slug** → set `GITHUB_APP_SLUG` in `.env.local` + Vercel; redeploy. Backfill/re-bind CJ's own installation (visit the install page once). Then: CJ's picker still lists CJ's repos; (ideally) a **second GitHub account** installs the App → that Tenant's picker shows ONLY that account's repos, never CJ's; uninstall → the binding + connections clear.

## Dev Notes

### Architecture compliance & the security boundary

- **NFR-2 across the GitHub boundary:** the data-layer RLS already isolates `repo_connections`; this story extends the same principle to the GitHub *API* surface — `listReposForInstallations` only ever queries installations the caller's Tenant owns (proven by `listInstallationIds(ctx)` being RLS-scoped). The shared GitHub App is the one cross-tenant resource; binding installation→tenant is what makes it safe (architecture L198 — "store only installation_id + repo_id"; this adds the tenant binding the multi-tenant model needs).
- **The binding must come from the authenticated Setup redirect, not the webhook.** The `installation.created` webhook arrives with no Soloist session — it can't know which Tenant installed. The Setup URL redirect lands the **logged-in Freelancer** back in the Cockpit with `installation_id`, so `requireFreelancer()` gives the Tenant. (The webhook is only used for `installation.deleted` cleanup.)
- **`recordInstallation` re-asserts ownership** (`onConflictDoUpdate` sets `tenant_id = caller`) so a transferred/re-installed installation rebinds to whoever currently controls it (you can't permanently squat another Tenant's installation id — they re-bind on their next install/visit).

### Scope boundary (what this story does NOT change)

- **The webhook resolve stays `findEngagementForRepo(repoFullName)` + the GLOBAL `repo_connections_active_repo` unique.** Routing is already correct (a connection carries its `tenant_id`); the only residual is the rare "two Tenants connect the SAME `repo_full_name`" → a 23505 for the 2nd. Making the unique + resolve **installation-scoped** (so two Tenants can connect the same repo via different installations) is a documented follow-up — NOT needed for the "each Freelancer sees only their repos" guarantee this story delivers.
- No change to candidate creation / the Ship Feed.

### Previous-story intelligence (3.1, 3.2 — read first)

- **Tenant-scoped (NOT dual-scope) RLS:** copy the `branding`/`tenants` single-clause policy shape (`tenant_id = currentTenant`), not the engagement dual-scope. `currentTenant` helper exists in `schema.ts`. Append FORCE manually; verify on Neon; extend `isolation.test.ts`.
- **System raw-`db` reads** (`recordDelivery`, `findEngagementForRepo`): `removeInstallation`/`disconnectByInstallation` are the same — the uninstall webhook is pre-tenant.
- **The GitHub client boundary** (`src/server/github/app.ts`, Story 3.2): `getApp()` cached App, `getInstallationOctokit(Number(id))`, the manual pagination loop (`octokit.request("GET /installation/repositories", { per_page, page })`). Mirror it for `listReposForInstallations`.
- **The Repo Connections tab** (`(detail)/repos/page.tsx`): already has the not-configured / degraded / picker states; Task 5 inserts the "no installation → install CTA" state and swaps `listConnectableRepos()` → `listReposForInstallations(ids)`.
- **Setup URL = a GitHub App "Post installation" redirect** — `?installation_id=<n>&setup_action=install|update`. The page is authenticated (the Freelancer is mid-session). zod/Number-guard the `installation_id`.

### Project Structure Notes

- **New:** `src/server/db/repositories/github-installations.repository.ts` (+ test); `src/server/github/install-url.ts`; `src/app/app/settings/github/setup/page.tsx`; the install-CTA client affordance; `drizzle/0010_*`.
- **Modified:** `src/server/db/schema.ts` (+ `githubInstallations` + type); `src/server/github/app.ts` (`listReposForInstallations` + `getInstallationAccount`, replacing `listConnectableRepos`); `src/app/app/engagements/[id]/(detail)/repos/page.tsx` + `connect-repo-form` (install CTA) + `repo-connections.actions.ts` (scoped re-verify); `src/server/ship-feed/github-event.ts` + `process-github-event.ts` (installation.deleted); `src/server/db/__tests__/isolation.test.ts`.
- **Do NOT:** make the unique/resolve installation-scoped (documented follow-up); build per-installation repo-sharing; change candidate creation.
- **Watch:** the Setup page MUST be authenticated (Tenant from session, never from the GitHub payload); `listReposForInstallations([])` must early-return `[]` (no all-installations fallback — that's the bug being fixed); the Task-7 backfill of CJ's existing installation so the tab keeps working post-deploy.

### Testing requirements

- **Isolation:** `github_installations` tenant-scope — own / cross-tenant / fail-closed / WITH-CHECK-forge (tenant-scoped, no engagement clause).
- **Repository:** record idempotent + re-binds; `listInstallationIds` Tenant-only; cross-tenant denied; `removeInstallation` deletes; `disconnectByInstallation` flips matching rows.
- **GitHub client (mocked):** `listReposForInstallations([])` → `[]`; given ids → only those installations' repos; `getInstallationAccount` parses the login.
- **Connect action:** a repo outside the Tenant's installations → rejected (the multi-tenant authz).
- **Uninstall handler:** `installation.deleted` → remove + disconnect; other actions → no-op.

### References

- [Source: Story 3.2 Senior Review "Accepted Risks" (the shared-App cross-freelancer finding this story closes); architecture.md L198 (GitHub App model — installation_id), L380/L398 (`src/server/github/` boundary)]
- [Source: src/server/github/app.ts + src/server/db/repositories/repo-connections.repository.ts + (detail)/repos/* (Story 3.2 patterns); src/server/db/schema.ts (branding/tenants single-clause RLS to copy); docs/github-app-setup.md (the App settings CJ edits in Task 8)]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (1M context) — dev-story + xhigh code-review.

### Debug Log References

- `@octokit/app` v16: `app.oauth.getUserOctokit({ code })` returns `Promise<Octokit>` directly (`const octokit = await …`, then `octokit.request`). `app.oauth` is a getter that **throws** if the App was built without `oauth` options → `getApp()` rebuilds when the OAuth-config state changes.
- `recordInstallation` had to move to RAW `db`: a `withTenant` `onConflictDoUpdate` can't update a row owned by another Tenant (RLS hides it → 23505), which would break a legitimate installation transfer; the OAuth ownership proof is the authz.
- `i.account && "login" in i.account` narrows the simple-user|enterprise|null union for `GET /user/installations`.

### Completion Notes List

Tasks 1–7 done. **Task 8 = CJ's live validation** (make the App public + Setup URL + Installation events + `GITHUB_APP_SLUG`/`GITHUB_APP_CLIENT_ID`/`GITHUB_APP_CLIENT_SECRET`). **Task 7 backfill:** CJ's existing installation was inserted into `github_installations` post-deploy so the Repo Connections tab keeps listing CJ's repos (instead of the "Install" CTA) without a re-install.

**The security crux — install binding is OAuth-verified:** the Setup-URL page exchanges GitHub's install `code` for a user token, calls `GET /user/installations`, and binds the `installation_id` **only if it's in the list the authenticated GitHub user controls** — so a spoofed/guessed `installation_id` (the original hijack vector) is rejected. `isOauthConfigured()` fails closed; an empty/`[]` ownership list → no match → deny.

**The multi-tenant fix:** `listConnectableRepos()` (all installations) → `listReposForInstallations(listInstallationIds(ctx))` — the picker + connect now only ever touch the caller Tenant's own installations. A Tenant with none sees an "Install the GitHub App" CTA. Uninstall (`installation.deleted`, signature-verified) → disconnect that installation's repos, then remove the binding.

Gates: typecheck ✓, lint ✓, **233 tests ✓** (+12 for 3.2.1; no regression of the prior 221), build ✓, `db:generate` clean. Migration `0010` (tenant-scoped RLS + FORCE) applied to Neon + verified.

Post-review hardening (xhigh, security-weighted — see Senior Developer Review): `recordInstallation` raw-db re-asserts `tenant_id` (legit transfer no longer a 23505/oracle) + the Setup page catches its errors; `getApp()` rebuilds on OAuth-config change (v16 throwing-getter staleness); numeric guard before `getInstallationOctokit(Number(id))`; uninstall disconnects before removing; dropped a wasted `listActiveRepoFullNames` query in non-picker states.

### File List

**New**

- `src/server/db/repositories/github-installations.repository.ts` (+ `src/server/db/__tests__/github-installations.repository.test.ts`)
- `src/server/github/install-url.ts`
- `src/app/app/settings/github/setup/page.tsx`
- `drizzle/0010_modern_chimera.sql`, `drizzle/meta/0010_snapshot.json`

**Modified**

- `src/server/db/schema.ts` (+ `githubInstallations` + type)
- `src/env.ts` (+ `GITHUB_APP_CLIENT_SECRET`)
- `src/server/github/app.ts` (`listReposForInstallations` + `getUserInstallations` + `isOauthConfigured`; **removed `listConnectableRepos`**)
- `src/server/repo-connections/repo-connections.actions.ts` (scoped re-verify) (+ test)
- `src/app/app/engagements/[id]/(detail)/repos/page.tsx` (install CTA + scoped listing)
- `src/server/ship-feed/github-event.ts` (+ `parseInstallationDeleted`)
- `src/server/inngest/functions/process-github-event.ts` (uninstall cleanup) (+ test)
- `src/server/db/__tests__/isolation.test.ts` (cases (ac)–(af)), `src/server/github/__tests__/app.test.ts`

## Senior Developer Review (AI)

**Reviewer:** CJ (via Claude xhigh code-review — 2 finder angles, security-weighted)
**Date:** 2026-06-07
**Outcome:** ✅ **Approve** (the OAuth anti-spoofing core holds; correctness/robustness fixes applied; the access-vs-admin granularity is a documented v1 limit)

### Summary

Both finders confirmed the central defense: the install binding is gated on the OAuth-verified `GET /user/installations` containing the redirect's `installation_id`, fails closed without OAuth, and can't be CSRF'd (an attacker can't mint a valid `code` for a victim). The review found real correctness issues around the conflict path and the cached App, plus a genuine authz-granularity nuance.

### Key Findings & Resolutions

| # | Sev | Finding | Resolution |
|---|-----|---------|-----------|
| 1 | **Med** | `recordInstallation`'s `onConflictDoUpdate` didn't re-assert `tenant_id` (vs spec/comment), and under `withTenant` a cross-Tenant conflict → a 23505 the Setup page didn't catch → an **unhandled 500 + an "is this installation already claimed?" oracle**. | **Fixed** — `recordInstallation` is now RAW `db` and sets `tenant_id` on conflict (OAuth is the authz; reads stay RLS-scoped); the Setup page wraps it in try/catch → calm `fail()`. |
| 2 | **Med** | `@octokit/app` v16's `app.oauth` is a throwing getter; the module-cached App built before the client secret loaded would break `getUserInstallations` permanently. | **Fixed** — `getApp()` rebuilds when `isOauthConfigured()` changes. |
| 3 | Low | `getInstallationOctokit(Number(id))` → `NaN` for a non-numeric `gh_installation_id` (e.g. a bad backfill). | **Fixed** — `/^\d+$/` guard skips non-numeric ids. |
| 4 | Low | Uninstall removed the binding before disconnecting; a mid-failure retry could leave repos still routing. | **Fixed** — disconnect first, then remove. |
| 5 | Low | `recordInstallation` returned a possibly-`undefined` `row` typed non-null. | **Fixed** by the raw-db upsert (always returns a row). |
| 6 | Low | `listActiveRepoFullNames(ctx)` ran in non-picker states (no-installation / degraded) — a wasted query. | **Fixed** — gated on `showPicker`. |

### Accepted Risks / v1 limits

- **`GET /user/installations` proves ACCESS, not administrative ownership.** A non-admin member of an org that has the App installed could, in principle, bind that org's installation to their own Tenant. This is a *much* narrower window than the original `installation_id` spoof (it requires real org membership + the App installed on that org), and the realistic Soloist flow is install-on-your-own-account/org-you-admin. A stricter admin-role check is a documented follow-up before broad multi-tenant signup.
- **`getUserInstallations` fetches one page (`per_page: 100`).** A user with >100 App installations could fail to bind a target past the first 100 (fails *closed* — deny). Practically impossible (you install an App once per account/org); not paginated.
- **Shared-repo across Tenants** still uses the global `repo_connections_active_repo` unique (from 3.2's accepted risks) — an installation-scoped unique/resolve remains the documented follow-up.

### Review Follow-ups (AI)

- [x] [AI-Review][Med] `recordInstallation` raw-db re-asserts `tenant_id`; Setup page catches errors.
- [x] [AI-Review][Med] `getApp()` rebuilds on OAuth-config change (v16 throwing getter).
- [x] [AI-Review][Low] numeric guard before `getInstallationOctokit`.
- [x] [AI-Review][Low] uninstall disconnects before removing.
- [x] [AI-Review][Low] drop the wasted `listActiveRepoFullNames` query in non-picker states.

## Change Log

| Date       | Version | Description                                            | Author |
| ---------- | ------- | ------------------------------------------------------ | ------ |
| 2026-06-07 | 0.1     | Story drafted (correct-course insert after 3.2).       | Scrum  |
| 2026-06-07 | 1.0     | Tasks 1–7 implemented; 233 tests green; migration 0010 on Neon. | Dev |
| 2026-06-07 | 1.1     | xhigh review: raw-db re-assert, oauth-getter rebuild, numeric guard, uninstall order. | Dev |
