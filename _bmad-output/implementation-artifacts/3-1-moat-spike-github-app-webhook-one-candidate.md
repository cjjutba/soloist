---
baseline_commit: dd8e082
---

# Story 3.1: Moat Spike — GitHub App → Webhook → One Candidate

Status: done

<!-- Note: Validation is optional. Run validate-create-story for a quality check before dev-story. -->

## Story

As the builder,
I want one GitHub event to flow end-to-end into a rendered candidate,
so that the riskiest pipeline (App install, webhooks, local-dev tunnelling, Inngest) is validated before any curation UI is built.

## Acceptance Criteria

1. **A verified, deduped webhook → an Inngest event (AR-8, NFR-3).**
   **Given** a registered GitHub App (least-privilege read-only `contents`/`metadata`/`pull_requests`)
   **When** a single qualifying delivery (`push`/`pull_request`/`release`) hits `POST /api/webhooks/github`
   **Then** the handler **verifies the `X-Hub-Signature-256` HMAC**, records a `webhook_events` row (**dedupe on `gh_delivery_id`**), emits an Inngest `github/event.received` event, and returns **202** fast — and an **unsigned/invalid delivery is rejected (401)** with no row + no enqueue.

2. **The Inngest function creates ONE candidate ShipUpdate (freelancer-only).**
   **Given** the Inngest `process-github-event` function
   **When** it processes that event
   **Then** it creates **one candidate `ship_updates` row** (table created here) with a **heuristic title + status_tag** (via the `SummarizationProvider` seam) and `raw_meta` stored **separately** (never client-exposed), scoped to the resolved Engagement, **visible to the Freelancer only** — and is **idempotent** (a duplicate delivery / a retry does not create a second row — dedupe on `source_event_key`).

3. **The local-dev pipeline is documented and working.**
   **Given** the spike
   **Then** the **local-dev webhook path (a smee/tunnel) + the Inngest dev server are documented** in a SETUP guide, and the code is deployed (inert until the App + Inngest are configured) — proving the riskiest pipeline before any curation UI.

## Tasks / Subtasks

> **Split:** Tasks 1–7 are fully buildable + offline-testable NOW (no live GitHub App needed — tests use simulated payloads + a known HMAC). Task 8 is the **live validation** (CJ registers the App + runs the tunnel/dev server; I guide). The deployed handler/Inngest endpoint are **inert** until the secrets are set, so shipping the code first is safe.

- [x] **Task 1 — Env contract for GitHub App + Inngest (DSN-optional)** (AC: 1, 3)
  - [x] In `src/env.ts`, add (all `preprocess("" → undefined).optional()` like `RESEND_API_KEY` — so dev/build work without them and the handler fails CLOSED in prod until set): `GITHUB_APP_ID`, `GITHUB_APP_WEBHOOK_SECRET`, `GITHUB_APP_PRIVATE_KEY` (PEM; needed to mint tokens in 3.3 — add now), `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_SLUG` (install-link, 3.2), `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`. Update the header comment (drop "later epics" for these).

- [x] **Task 2 — `ship_updates` + `webhook_events` tables + RLS + migration + isolation test** (AC: 1, 2)
  - [x] In `src/server/db/schema.ts`:
    - `shipUpdates` (`ship_updates`): uuid v7 `id`; `tenantId uuid NOT NULL → tenants.id cascade`; `engagementId uuid NOT NULL → engagements.id cascade`; `statusTag text NOT NULL` (shipped|in_progress|next); `title text NOT NULL`; `summary text`; `state text NOT NULL default 'candidate'` (candidate|published|dismissed); `source text NOT NULL` (github|manual); `sourceEventKey text` (idempotency, **UNIQUE per engagement** → a composite unique on `(engagement_id, source_event_key)`); `publishedAt timestamptz`; `rawMeta jsonb` (**never client-exposed** — SHAs/branches/diffs); `createdAt timestamptz NOT NULL defaultNow()`. Dual-scope RLS `ship_update_scope` (reuse `currentTenant`/`currentEngagement`, engagement clause on `engagement_id` — same shape as `engagements`). **Use `text` for the enum-ish columns** (consistent with `engagements.status`; the architecture's "PG enum" note was not adopted in the codebase — note the deviation). Export `ShipUpdate`.
    - `webhookEvents` (`webhook_events`): uuid v7 `id`; `ghDeliveryId text NOT NULL UNIQUE` (the dedupe key); `eventType text NOT NULL`; `receivedAt timestamptz NOT NULL defaultNow()`; `processedAt timestamptz`. **NO RLS** — it's a system idempotency ledger written by the pre-tenant webhook handler (like the Better Auth tables; document this explicitly in the schema comment).
  - [x] `npm run db:generate` → `drizzle/0008_*.sql`: append **`ALTER TABLE "ship_updates" FORCE ROW LEVEL SECURITY;`** (NOT for `webhook_events` — it has no policy). `npm run db:migrate` on Neon; verify `ship_updates` `relforcerowsecurity=true` + the policy + the composite unique; `webhook_events` has the `gh_delivery_id` unique + **no** policy.
  - [x] Extend `isolation.test.ts`: seed a candidate `ship_update` in Tenant A (E1) + Tenant B (E3); prove freelancer-A-sees-own, cross-tenant, fail-closed, WITH-CHECK-forged-tenant (the 2.x (o)-style clean-forge). `webhook_events` needs no isolation test (no RLS) — instead a quick `unique(gh_delivery_id)` test in the repo test.

- [x] **Task 3 — The candidate mapping (the `SummarizationProvider` seam)** (AC: 2)
  - [x] `src/server/ship-feed/summarization.ts`: a `SummarizationProvider` interface + a v1 **heuristic** impl (pure, no LLM): `mapEvent(event: NormalizedGithubEvent): { statusTag, title, summary }`. **status_tag** per FR-10: a **merged PR or a release → `shipped`**; an **open PR or commits/push → `in_progress`**; (manual/planned → `next`, used later). **title**: founder-readable, never raw dev artifacts — e.g. merged PR → `"Shipped: {pr.title}"`; push → `"{n} update{s} to {branch}"`; release → `"Released {tag}"`. Keep it template/heuristic; the LLM is a fast-follow behind the SAME interface (FR-11).
  - [x] `src/server/ship-feed/github-event.ts`: `normalizeGithubEvent(eventType, payload)` → a `NormalizedGithubEvent` ({ kind: "push"|"pull_request"|"release", repoFullName, sourceEventKey, summary fields, rawMeta }) + a `sourceEventKey` (stable idempotency key: e.g. `pr:{repo}:{number}:{merged}`, `push:{repo}:{after_sha}`, `release:{repo}:{tag}`). Qualifying filter: ignore non-qualifying sub-events (e.g. PR `synchronize` noise — keep `opened`/`closed`(merged); pushes to any branch; published releases).
  - [x] Unit-test (pure, exhaustive): merged PR → `shipped` + "Shipped: …"; opened PR → `in_progress`; push (1 vs N commits) → `in_progress` + correct count/branch; release → `shipped` + "Released …"; the `sourceEventKey` is stable for the same logical event (idempotency) and distinct across events; `rawMeta` carries SHAs/branch but the title/summary never leak them.

- [x] **Task 4 — Repositories: ship-update (scoped) + webhook-event (system ledger)** (AC: 1, 2)
  - [x] `src/server/db/repositories/ship-update.repository.ts`: `createCandidate(ctx, { engagementId, statusTag, title, summary, source, sourceEventKey, rawMeta })` via `withTenant` — insert with `state:'candidate'`, `onConflictDoNothing` on the `(engagement_id, source_event_key)` unique (**idempotent**), return the row or null (null = duplicate, already created). `findCandidateBySourceEventKey(ctx, engagementId, key)` (for the test/assert).
  - [x] `src/server/db/repositories/webhook-event.repository.ts`: `recordDelivery({ ghDeliveryId, eventType })` — a **raw `db`** insert (the handler is pre-tenant; no RLS on this table) with `onConflictDoNothing` on `gh_delivery_id`; returns `true` if newly recorded, `false` if a duplicate (so the handler skips re-enqueue). `markProcessed(ghDeliveryId)` (stamp `processed_at`, optional).
  - [x] Unit-test (PGlite): `recordDelivery` returns true first time / false on the duplicate (the ledger); `createCandidate` inserts a candidate scoped + is a no-op on the same `source_event_key` (idempotent); cross-tenant `createCandidate`/read denied (RLS).

- [x] **Task 5 — Inngest: client + `process-github-event` + the endpoint** (AC: 2)
  - [x] `src/server/inngest/client.ts`: `export const inngest = new Inngest({ id: "soloist" })` (uses `INNGEST_EVENT_KEY` in prod; the dev server locally). Define the event types (`github/event.received` → `{ ghDeliveryId, eventType, payload }` — but follow the architecture rule: payloads carry IDs + a correlation id; here we pass the minimal normalized fields, NOT a fat raw payload beyond what's needed — store `rawMeta` from the normalized event).
  - [x] `src/server/inngest/functions/process-github-event.ts`: the function (id `process-github-event`, on `github/event.received`) — **idempotent, retrying, multi-step**: (1) `normalizeGithubEvent` → if non-qualifying, no-op; (2) **resolve the target Engagement** — **SPIKE shortcut:** `resolveEngagementForRepo(repoFullName)` returns the **single active Engagement** (the spike has one); leave a loud comment that **Story 3.2 replaces this with the `repo_connections` (repo→engagement) lookup**; if none → no-op + log; (3) `mapEvent` → statusTag/title/summary; (4) construct a system ctx `{ tenantId, userId: "system", role: "freelancer" }` from the resolved engagement's tenant → `createCandidate` (idempotent on `source_event_key`); (5) `markProcessed(ghDeliveryId)`. Each step idempotent.
  - [x] `src/app/api/inngest/route.ts`: `serve({ client: inngest, functions: [processGithubEvent] })` (the `inngest/next` adapter; exports GET/POST/PUT).
  - [x] Unit-test the function's core (mock the repos + `resolveEngagementForRepo`): a qualifying event → `createCandidate` called with the mapped fields + the resolved engagement; a non-qualifying event → no candidate; no engagement → no candidate; a duplicate `source_event_key` → `createCandidate` returns null → no error.

- [x] **Task 6 — The webhook handler (`POST /api/webhooks/github`)** (AC: 1)
  - [x] `src/app/api/webhooks/github/route.ts` (Node runtime): read the **raw body** (`await req.text()` — needed for HMAC); get `x-hub-signature-256` + `x-github-event` + `x-github-delivery` headers. **Verify** via `@octokit/webhooks` (`new Webhooks({ secret: env.GITHUB_APP_WEBHOOK_SECRET })` → `await webhooks.verify(rawBody, signature)`). **No secret set → reject (the prod fail-closed) ; invalid signature → 401** (no row, no enqueue). On valid: `recordDelivery({ ghDeliveryId, eventType })` → if duplicate (`false`) return 202 (already handled, no re-enqueue); else `inngest.send({ name: "github/event.received", data: { ghDeliveryId, eventType, payload: parsedBody } })` → return **202** fast (NO heavy work in the request — the architecture rule). Catch + log (Sentry) unexpected; never 500-leak.
  - [x] Unit-test (compute a real HMAC over a sample payload with a test secret): valid signature + new delivery → `recordDelivery` + `inngest.send` called + 202; **invalid signature → 401**, no record, no send; **duplicate delivery → 202, no second send**; missing signature → 401.

- [x] **Task 7 — SETUP guide + gates + deploy (inert)** (AC: 3)
  - [x] `docs/github-app-setup.md` (NEW): the **exact** steps for CJ — (a) register a GitHub App (homepage/callback/webhook URL, the smee proxy URL for local; permissions read-only `contents`/`metadata`/`pull_requests`; subscribe to `push`/`pull_request`/`release`; generate a private key + webhook secret); (b) which secret → which env var (`GITHUB_APP_*`) in `.env.local` + Vercel; (c) the **local dev loop**: `npx inngest-cli dev` (Inngest dev server) + a **smee.io** channel (`npx smee -u <smee-url> -t http://localhost:3000/api/webhooks/github`) → set the App's webhook URL to the smee channel; (d) how to trigger a test event + where to see the candidate (DB) and the Inngest run.
  - [x] `npm run lint && npm run typecheck && npm test && npm run build` clean; commit `drizzle/0008_*`. Don't regress the 173 prior tests.
  - [x] Apply 0008 to Neon, deploy. The handler + Inngest endpoint ship **inert** (no webhook secret / Inngest key in prod yet → the handler fails closed, no events arrive). **Live end-to-end validation = Task 8 (CJ).**

- [ ] **Task 8 — LIVE validation (CJ + dev, after the App is registered)** (AC: 1, 2, 3)
  - [ ] CJ registers the GitHub App per `docs/github-app-setup.md` + sets the `GITHUB_APP_*` + `INNGEST_*` secrets (`.env.local` + Vercel). Run the Inngest dev server + smee tunnel locally; install the App on a test repo; push a commit / merge a PR; confirm: the webhook is verified + recorded, the Inngest run fires, **one candidate `ship_updates` row** appears (freelancer-only), a duplicate delivery creates **no** second row. (This is the spike's "it actually works" proof.)

## Dev Notes

### Architecture compliance (the moat pipeline — non-negotiable)

[Source: architecture.md L174–L185, L198–L201, L210–L211, L243–L245, L277–L280, L300–L314, L367–L398]
- **Data model (exact):** `ShipUpdate — id, tenant_id, engagement_id, status_tag(shipped|in_progress|next), title, summary, state(candidate|published|dismissed), source(github|manual), source_event_key (unique per engagement, idempotency), published_at, created_at, raw_meta(jsonb, never client-exposed)`. `WebhookEvent — id, gh_delivery_id (unique), event_type, received_at, processed_at (idempotency ledger)`. `RepoConnection` is **Story 3.2** — do NOT build it; 3.1 uses the single-engagement shortcut.
- **Privacy boundary (load-bearing):** "The Client-facing projection of `ShipUpdate` is `{status_tag, title, summary, published_at}` only — `raw_meta` is a separate column the Client query layer **never selects**." [L185] Store `raw_meta`; never put SHAs/branches/diffs in `title`/`summary`. (The client feed is Story 3.7 — but the COLUMN split + the rule start here.)
- **Webhook security (NFR-3, AR-8):** verify `X-Hub-Signature-256` HMAC on **every** delivery via `@octokit/webhooks`; **reject unsigned/invalid**. [L199] Return **2xx fast**, do **no heavy work in the request** — record + enqueue + return 202; the Inngest function does the work. [L210, L244]
- **Idempotency everywhere** [L71, L301, L310]: duplicate webhook deliveries + Inngest retries are assumed. Guard with the `webhook_events.gh_delivery_id` ledger AND the `ship_updates(engagement_id, source_event_key)` unique. Inngest payloads carry IDs + a correlation id (the GitHub delivery id); functions re-fetch via repositories.
- **GitHub App model (NFR-3):** store only `installation_id` + `repo_id` (3.2); mint short-lived tokens on demand from the private key (3.3). 3.1 needs only the **webhook secret** (verify) — no API calls yet. Least privilege read-only.
- **Inngest naming** [L280]: events `domain/thing.verb` (`github/event.received`); function ids kebab (`process-github-event`). The event bus lives in `src/server/inngest/`; GitHub wrapping in `src/server/github/` (3.3); candidate mapping + the publish gate + `SummarizationProvider` in `src/server/ship-feed/`. [L381–L398]
- **The `SummarizationProvider` seam** [L245, L267]: v1 = heuristic/template (clean PR/commit titles); the LLM is a fast-follow behind the SAME interface (FR-11) — isolate it now.
- **The publish gate is NOT this story** [L249]: candidates are `state='candidate'` (freelancer-only). The single candidate→published Server Action (publish) is Story 3.6. Do NOT auto-publish; do NOT build a client feed query here.

### Spike scoping (what's a shortcut + why)

- **Engagement resolution:** the real repo→engagement map is `repo_connections` (Story 3.2). 3.1's `resolveEngagementForRepo` returns the **single active Engagement** (the spike environment has one) — a loud-commented shortcut, replaced in 3.2. If there are 0 or >1 active engagements, log + no-op (the spike assumes one).
- **`webhook_events` has no RLS** — it's a pre-tenant system ledger (the handler dedupes before any tenant context exists), exactly like the Better Auth tables. Keyed on `gh_delivery_id` (no tenant data). The handler queries it as the connection role (raw `db`, sanctioned in a repository).
- **The Inngest candidate insert runs as a SYSTEM process** (no session). It constructs a tenant-scoped ctx `{ tenantId, userId:"system", role:"freelancer" }` from the resolved engagement's tenant and does a `withTenant` insert (the WITH CHECK passes — same invitation-derived-scope idea as Story 2.4's `acceptInvitationTx`). No request-supplied tenant.
- **Enum columns are `text`** (consistent with `engagements.status`), not PG enums — the architecture's PG-enum note wasn't adopted in the codebase.

### Previous-story intelligence (Stories 2.x, 1.x — read first)

- **The table + dual-scope RLS + FORCE + migration pattern** (2.1/2.3/2.4): `pgPolicy` in `schema.ts`, append `FORCE` to the generated SQL, verify on Neon, extend `isolation.test.ts`. `currentTenant`/`currentEngagement` helpers exist. The 2.x (o)-style "forge into a clean engagement" proves the WITH CHECK unambiguously.
- **DSN-optional env** (`src/server/auth/email.ts` + `env.ts` for `RESEND_API_KEY`): `z.preprocess(v => v === "" ? undefined : v, z.string().optional())` — dev/build work without the secret; the consumer fails closed in prod. Mirror for `GITHUB_APP_*`/`INNGEST_*`. **Add the new vars to Vercel later (Task 8) — they're optional so the build is green now.**
- **Raw `db` in repositories is sanctioned** (the 2.4 `findInvitationByTokenHash`/`findClientAccessByUserId` pre-auth/system reads) — `webhook-event.repository.ts` is the same kind of system-level access (no `withTenant`, keyed on a non-tenant id). The ESLint guard exempts `src/server/db/**` + `src/server/auth/**`.
- **The choke point + idempotency:** candidate writes go through `withTenant` (`ship-update.repository`); the system ctx is derived, never request-supplied. `onConflictDoNothing` for idempotent inserts (the 2.3 `upsertInvitation` shape).
- **Tests are logic/PGlite** (vitest `node`, no `@testing-library`). The webhook-handler test computes a real HMAC with a test secret (`crypto.createHmac("sha256", secret)`); the Inngest function + mapping are pure/mocked. `inngest.send` is mocked in the handler test. Don't regress the 173 prior tests. The CI migration-drift step → commit `drizzle/0008_*`.

### Project Structure Notes

- **New:** `src/app/api/webhooks/github/route.ts`, `src/app/api/inngest/route.ts`; `src/server/inngest/{client,functions/process-github-event}.ts`; `src/server/ship-feed/{summarization,github-event}.ts`; `src/server/db/repositories/{ship-update,webhook-event}.repository.ts`; `drizzle/0008_*`; `docs/github-app-setup.md`; tests for each.
- **Modified:** `src/server/db/schema.ts` (+ `shipUpdates`, `webhookEvents` + types); `src/env.ts` (+ `GITHUB_APP_*`/`INNGEST_*`); `src/server/db/__tests__/isolation.test.ts` (ship_updates fixtures).
- **Do NOT:** build `repo_connections`/the connect UI (3.2), the auto-pull/Octokit token minting (3.3), the curation UI (3.5), the publish gate / client feed / `raw_meta`-safe client query (3.6/3.7); auto-publish a candidate; store long-lived GitHub tokens; put `raw_meta` in `title`/`summary`; add a PG enum (use `text`).
- **Watch:** the webhook handler MUST read the RAW body for HMAC (parse AFTER verifying). Return 202 fast (offload to Inngest). `webhook_events` is intentionally RLS-free — do NOT add a policy. The deployed endpoints are inert until CJ sets the secrets (Task 8).

### Testing requirements

- **Mapping/normalize** (pure) — status_tag + founder-readable title per event kind; stable + distinct `source_event_key`; `raw_meta` carries SHAs/branch but title/summary don't.
- **Repositories** (PGlite) — `recordDelivery` true-then-false (dedupe ledger); `createCandidate` scoped + idempotent on `source_event_key`; cross-tenant denied; ship_updates fail-closed.
- **Isolation** — ship_updates tenant-scope: freelancer-own / cross-tenant / fail-closed / WITH-CHECK-forge.
- **Webhook handler** — real-HMAC valid → record + send + 202; invalid → 401 (no record/send); duplicate → 202 no second send; missing sig → 401. (`@octokit/webhooks` verify + a mocked `inngest.send` + a PGlite/mocked ledger.)
- **Inngest function core** — qualifying → createCandidate with mapped fields; non-qualifying/no-engagement → no candidate; duplicate key → null, no throw.
- **Live (Task 8)** — real GitHub event → one candidate; duplicate delivery → no dupe.

### References

- [Source: epics.md#Story 3.1 + Epic 3 intro + #Story 3.2/3.3 (what 3.1 deliberately defers)]
- [Source: architecture.md L174–L185 (ShipUpdate/WebhookEvent/RepoConnection model + the raw_meta privacy split), L198–L201 (GitHub App, HMAC verify, secrets), L210–L211 (webhook + Inngest endpoints), L230–L235 (runtime/jobs/envs — Inngest dev server + smee tunnel), L243–L246 (the pipeline + SummarizationProvider), L277–L280 (naming), L300–L314 (idempotency/privacy/anti-patterns), L367–L398 (file structure + boundaries)]
- [Source: PRD FR-9–FR-14, NFR-3 (security), NFR-4 (idempotency/retries), AR-8 (webhook authenticity)]
- [Source: src/server/db/{schema,scope,context}.ts + repositories/* (the withTenant + onConflict patterns); src/server/auth/{email,users}.ts + env.ts (DSN-optional + raw-db); src/server/db/__tests__/isolation.test.ts; package.json (@octokit/app, @octokit/webhooks, inngest already installed)]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (1M context) — dev-story + xhigh code-review.

### Debug Log References

- Inngest `createFunction` is the v4.5 2-arg form: `createFunction({ id, triggers: [{ event }] }, handler)` (the 3-arg form errored "Expected 2 arguments, but got 3").
- `github-mapping` summary wording: title uses `"N updates to {branch}"`, summary uses `"N commit(s) on {branch}"` (separate pluralization).
- ESLint `no-unused-vars` needed `argsIgnorePattern: "^_"` for the `resolveEngagementForRepo(_repoFullName)` spike seam.
- Stale `.next/types` after route-group churn cleared by a full `build`.

### Completion Notes List

Tasks 1–7 complete (offline-buildable + tested). Task 8 (live GitHub-App registration) is CJ's, guided by `docs/github-app-setup.md` — the deployed endpoints ship **inert** (`/api/webhooks/github` → 503 until `GITHUB_APP_WEBHOOK_SECRET` is set).

Gates: typecheck ✓, lint ✓, **201 tests ✓** (26 new for 3.1, no regression of the prior 173/199), build ✓. Migration `0008` applied to Neon + verified: `ship_updates` `relforcerowsecurity=true` + `ship_update_scope` policy + the `(engagement_id, source_event_key)` composite unique; `webhook_events` has the `gh_delivery_id` unique and **no** policy (system ledger, by design).

Post-review hardening (xhigh, security-weighted — see Senior Developer Review): closed the record-before-enqueue **permanent-drop** (compensating `deleteDelivery` rollback on `inngest.send` failure + Sentry on the 500 path), pinned `runtime = "nodejs"` on both API routes, added a `mapEvent` exhaustiveness guard, parse-before-ledger (malformed signed body → 400, no ledger write), and corrected two over-broad privacy comments (a candidate's title/summary may name a branch; client exposure is gated at publish — `raw_meta` holds the SHA/diff/full-ref detail). Spike-scoped findings (cross-tenant single-engagement resolution; `source_event_key` repo-identity) accepted + documented as Story 3.2 work.

### File List

**New**

- `src/app/api/webhooks/github/route.ts` (+ `__tests__/route.test.ts`)
- `src/app/api/inngest/route.ts`
- `src/server/inngest/client.ts`, `src/server/inngest/functions/process-github-event.ts` (+ `__tests__/process-github-event.test.ts`)
- `src/server/ship-feed/summarization.ts`, `github-event.ts`, `resolve-engagement.ts` (+ `__tests__/github-mapping.test.ts`)
- `src/server/db/repositories/ship-update.repository.ts`, `webhook-event.repository.ts` (+ `src/server/db/__tests__/ship-update.repository.test.ts`)
- `drizzle/0008_clean_albert_cleary.sql`, `drizzle/meta/0008_snapshot.json`
- `docs/github-app-setup.md`

**Modified**

- `src/server/db/schema.ts` (+ `shipUpdates`, `webhookEvents` + types + the `raw_meta` privacy comment)
- `src/env.ts` (+ `GITHUB_APP_*` / `INNGEST_*`, corrected the Inngest cloud-mode comment)
- `src/server/db/repositories/engagements.repository.ts` (+ `findSpikeTargetEngagement`)
- `src/server/db/__tests__/isolation.test.ts` (ship_updates fixtures)
- `eslint.config.mjs` (`^_` unused-vars ignore for the seam param)
- `drizzle/meta/_journal.json`

## Senior Developer Review (AI)

**Reviewer:** CJ (via Claude xhigh code-review — 3 finder angles, security-weighted)
**Date:** 2026-06-06
**Outcome:** ✅ **Approve** (all High/Med findings resolved; spike-scoped items accepted + tracked to 3.2)

### Summary

The HMAC primitive is sound — timing-safe verify on the raw body read once, before any parse; no-secret → 503, forged/missing/empty → 401 with no DB write and no enqueue. The real findings were downstream of verification. Highest-stakes was a **permanent event drop**: the idempotency ledger row was written *before* `inngest.send`, so a send failure (cloud mode without `INNGEST_EVENT_KEY`, or a transient Inngest blip) returned 500, and GitHub's redelivery hit the ledger as a "duplicate" (202) and was never enqueued. Fixed by rolling the ledger row back on send failure so the redelivery re-enqueues (the `markProcessed` UPDATE still needs the row to exist on the success path, so reorder-then-record was not an option — compensating delete is the correct shape).

### Key Findings & Resolutions

| # | Sev | Finding | Resolution |
|---|-----|---------|-----------|
| 1 | **High** | Record-before-enqueue → permanent drop on `inngest.send` failure (GitHub retry sees a "duplicate"). | **Fixed** — `deleteDelivery` compensating rollback in the `send` catch; row re-inserts on redelivery. Test added. |
| 2 | **Med** | `inngest.send` *throws* (not no-ops) in prod cloud mode without `INNGEST_EVENT_KEY`; `env.ts` comment claimed otherwise. | **Fixed** — corrected the comment; finding #1's rollback makes the throw non-fatal (500 + Sentry + redelivery). |
| 3 | **Med** | No `export const runtime = "nodejs"` on the webhook / Inngest routes (both use node:crypto + the Neon pool); relied on Next's implicit default. | **Fixed** — pinned on both routes (matches the auth route convention). |
| 4 | **Med** | 500 path logged to `console.error` only — never reached Sentry (architecture: unexpected → alert). | **Fixed** — `Sentry.captureException` on the 500 path. |
| 5 | **Med** | "branch names NEVER exposed" comment contradicted the (deliberately tested) summarizer that surfaces the branch in a founder candidate's title/summary. | **Fixed (comment)** — branch in a *candidate* is intended (founder-only); client exposure is gated at publish (3.7). `raw_meta` (SHAs/diffs/full refs) stays off the founder fields. Corrected schema + normalizer comments. |
| 6 | Low | `mapEvent` switch had no exhaustiveness guard (a future 4th kind would silently return undefined). | **Fixed** — `assertNever` default branch. |
| 7 | Low | Malformed-but-signed body parsed inside the ledger try (would record then 500). | **Fixed** — parse before the ledger; malformed → 400, no write. |

### Accepted Risks (spike-scoped — tracked to Story 3.2)

- **Cross-tenant attribution via `findSpikeTargetEngagement`.** The spike resolves "the single active Engagement platform-wide" (unscoped raw `db`); a signed webhook for any repo attaches to that one tenant. **Fail-safe:** 0 or >1 active engagements → `null` → no candidate. This is the documented single-engagement shortcut; **Story 3.2 replaces it with the `repo_connections` repo→engagement lookup**, which also binds `source_event_key` to the verified installation/repo identity (closes the theoretical PR-key collision). Acceptable for the inert, single-tenant dogfood spike.
- **No request body-size cap on `JSON.parse`** (post-verification; an authenticated/secret-holding sender only). Platform-bounded by Vercel's serverless body limit; revisit if the App is opened beyond CJ's account.

### Review Follow-ups (AI)

- [x] [AI-Review][High] Close the record-before-enqueue permanent drop (compensating rollback + test).
- [x] [AI-Review][Med] Pin `runtime = "nodejs"` on the webhook + Inngest routes.
- [x] [AI-Review][Med] Sentry-capture on the webhook 500 path.
- [x] [AI-Review][Med] Correct the misleading Inngest cloud-mode comment in `env.ts`.
- [x] [AI-Review][Med] Reconcile the `raw_meta` privacy comment with the tested summarizer behavior.
- [x] [AI-Review][Low] `mapEvent` exhaustiveness guard; parse-before-ledger (malformed → 400).

## Change Log

| Date       | Version | Description                                                        | Author |
| ---------- | ------- | ------------------------------------------------------------------ | ------ |
| 2026-06-06 | 0.1     | Story drafted (ultimate context engine).                           | Scrum  |
| 2026-06-06 | 1.0     | Tasks 1–7 implemented; 201 tests green; migration 0008 on Neon.    | Dev    |
| 2026-06-06 | 1.1     | xhigh code-review: drop-rollback, runtime pins, Sentry, comments.  | Dev    |
