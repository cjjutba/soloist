---
baseline_commit: 558587f
---

# Story 3.6: Publish (the Privacy Gate) + Minimal Email-on-Publish

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Freelancer,
I want publishing to be the single deliberate gate that reveals an update,
so that the client only ever sees what I chose to share — and they're pinged the moment I do (FR-12, FR-15, NFR-2/3/4/5).

## Acceptance Criteria

1. **Publish is the ONE gate (FR-12, NFR-2/3).**
   **Given** a curated candidate in the queue
   **When** I publish it (a row Publish button, the `p` shortcut, or bulk "Publish selected" on `lg+`)
   **Then** the **publish Server Action is the only path** that flips `state` `candidate→published`, stamps `published_at`, bumps the Engagement's `last_activity_at`, and emits the Inngest `ship/update.published` event — all atomically for the row. **No candidate is Client-visible until published**, and a Client query can read only the published projection `{status_tag, title, summary, published_at}` — **never `raw_meta`**, never a candidate, never another Engagement's data (the privacy boundary is a query + RLS guarantee, proven by test now, consumed by the 3.7 feed).

2. **Publish fans out a notification + a branded email (FR-15, NFR-4/5).**
   **Given** `ship/update.published`
   **When** the Inngest fan-out runs
   **Then** within ~30 s it (a) inserts an in-app `notifications` row for the Engagement's Client (idempotently) and (b) sends a **minimal branded email** (Tenant logo + accent, the ✅/🚧/📦 status as emoji **and** text, a "View in your portal" link) via the Epic-2 Resend setup. **If the Client hasn't accepted their invite yet, the fan-out no-ops gracefully** (the feed still shows the update). **A failed email never rolls back the publish** — publish is durable the instant the action returns; the email is retried by Inngest (NFR-4). (Full notification center / toast / prefs are Epic 4.)

## Tasks / Subtasks

- [x] **Task 1 — `notifications` table + repository (RLS, idempotent)** (AC: 2)
  - [x] `src/server/db/schema.ts`: add the `notifications` table — `id` (uuid v7 PK), `tenantId`/`engagementId` (notNull FKs, cascade), `userId` (text notNull → `user.id`, the recipient), `type` (text notNull: `ship_published` v1; `invoice_sent`/`engagement_start` later), `shipUpdateId` (uuid nullable → `ship_updates`, cascade), `readAt` (timestamptz nullable), `createdAt` (timestamptz notNull default now()). **Dual-scope RLS** `notification_scope` (mirror `ship_update_scope`: `tenant_id = app.tenant_id AND (app.engagement_id IS NULL OR engagement_id = app.engagement_id)`, USING + WITH CHECK) + a **partial unique index** `notifications_ship_dedup` on `(user_id, ship_update_id) WHERE ship_update_id IS NOT NULL` (fan-out idempotency). `npm run db:generate` → `drizzle/0012_*.sql`; **append `ALTER TABLE "notifications" FORCE ROW LEVEL SECURITY;`** manually (drizzle doesn't emit FORCE); `npm run db:migrate` on Neon.
  - [x] `src/server/db/repositories/notifications.repository.ts` (NEW): `createNotification(ctx, { engagementId, userId, type, shipUpdateId })` — `withTenant`, insert stamping `tenant_id` from ctx, `.onConflictDoNothing()` (the partial unique → a fan-out retry returns null, no dup). `loadShipPublishedContext(shipUpdateId)` — a **raw `db`** system read (the fan-out has no session, like `findClientAccessByUserId`) joining `ship_updates → engagements → tenants` (LEFT JOIN `branding`) → `{ statusTag, title, summary, state, engagementId, tenantId, clientDisplayName, tenantName, logoUrl, accentHex }` (one query; returns null if missing).
  - [x] **Tests** (`src/server/db/__tests__/notifications.repository.test.ts`, PGlite): `createNotification` inserts under the system/tenant ctx + the dedup makes a replay a no-op (one row); **cross-tenant isolation** (Tenant B can't read/write A's). `loadShipPublishedContext` returns the joined email data (incl. branding when present, nulls when absent).

- [x] **Task 2 — The publish gate: repository + Client-safe read** (AC: 1)
  - [x] `src/server/db/repositories/ship-update.repository.ts`: `publishShipUpdate(ctx, id)` — **the single gate**, in ONE `withTenant` tx: `UPDATE ship_updates SET state='published', published_at=now() WHERE id=? AND state='candidate' RETURNING` (null if not a candidate / not the caller's) **and** in the same tx `UPDATE engagements SET last_activity_at=now() WHERE id=<row.engagementId>` (atomic; import `engagements`). `publishShipUpdates(ctx, ids)` (bulk) — same guard via `inArray`, bump each distinct engagement, return the published rows (the action needs their ids+engagementIds to emit per-row events). `listPublishedUpdates(ctx, engagementId)` — the **Client-safe projection** `{ id, statusTag, title, summary, publishedAt }` (NO `raw_meta`) `WHERE engagement_id=? AND state='published'` `ORDER BY published_at DESC`; works for a freelancer OR a client ctx (RLS scopes). This is the privacy backstop landing with the gate; the 3.7 feed renders it.
  - [x] **Tests** (`ship-update.repository.test.ts`): `publishShipUpdate` flips a candidate → published + stamps `published_at` + bumps the engagement's `last_activity_at`; returns null on a replay / a `dismissed`/`published` row / a foreign tenant (RLS + the `state='candidate'` guard). `publishShipUpdates` bulk-publishes only candidates, count correct. **`listPublishedUpdates` from a CLIENT ctx** (`{ tenantId, userId, role:"client", engagementId }`) returns only that engagement's `published` rows — **never candidates/dismissed**, never another engagement, and the returned shape has **no `rawMeta` key**. NFR-2 cross-tenant/cross-engagement isolation.

- [x] **Task 3 — Branded email (template + Resend wrapper)** (AC: 2)
  - [x] `src/emails/ship-published-email.tsx` (NEW): a React Email template mirroring `invite-email.tsx`. Props `{ statusEmoji, statusLabel, title, summary, clientDisplayName, tenantName, logoUrl, accentHex, portalUrl }`. Layout: Tenant **logo** (`alt={tenantName}`) or a text fallback; a heading; the **status as emoji + text label** (never color-only — survives images-off, EXPERIENCE.md L75) with an inline tinted background; the plain-English **title** (bold) + **summary**; a **"View in your portal"** accent (`accentHex`) Button → `portalUrl`; a footer. ≥14px body; inline colors (dark-mode clients invert — pin them). Pull the emoji/label from `SHIP_STATUS` (the 3.5 single source of truth) at the call site, not hard-coded.
  - [x] `src/server/ship-feed/ship-published-email.ts` (NEW): `sendShipPublishedEmail(data)` — mirror `invitations/email.ts` EXACTLY: a module-level `const resend = env.RESEND_API_KEY ? new Resend(...) : null`; **no key → dev logs, PROD THROWS** (a dropped client ping should fail loudly so Inngest retries); `render(createElement(ShipPublishedEmail, props))` → `resend.emails.send({ from: env.EMAIL_FROM, to, subject, html, text })`. Subject e.g. `New update from ${tenantName}: ${title}`. Include a plain-text fallback.
  - [x] **Test** (`src/server/ship-feed/__tests__/ship-published-email.test.ts`): `render()` the template (node-safe — React Email renders to an HTML string) and assert the output contains the title, the status **label text** (not just emoji), the `accentHex`, the `portalUrl`, and the logo `alt`/tenantName; a missing `logoUrl` falls back to the tenant-name text.

- [x] **Task 4 — Inngest fan-out function** (AC: 2)
  - [x] `src/server/inngest/client.ts`: add `export type ShipPublished = { shipUpdateId: string; engagementId: string; tenantId: string }` (the minimal event payload — the fan-out re-reads the rest, like `github/event.received`).
  - [x] `src/server/db/repositories/client-access.repository.ts`: `findClientRecipientForEngagement(engagementId)` — **raw `db`** system read (the fan-out has no session) `client_access ⋈ user` → `{ userId, email, name }` for the engagement's Client, or null if none has accepted yet.
  - [x] `src/server/inngest/functions/ship-published.ts` (NEW): `handleShipPublished(data: ShipPublished)` (extracted, unit-testable) — (1) `recipient = findClientRecipientForEngagement(data.engagementId)`; **null → return `{ status:"no-recipient" }`** (no client yet; feed still shows it); (2) `createNotification({ tenantId, userId:"system", role:"freelancer" }, { engagementId, userId: recipient.userId, type:"ship_published", shipUpdateId })` (idempotent); (3) `ctx = loadShipPublishedContext(shipUpdateId)`; guard `state==="published"` (a dismissed/edited race → skip); (4) `await sendShipPublishedEmail({ to: recipient.email, ...SHIP_STATUS-derived emoji/label, title, summary, clientDisplayName, tenantName, logoUrl, accentHex, portalUrl: env.BETTER_AUTH_URL + "/portal" })`; return `{ status:"sent" }`. Export `shipPublished = inngest.createFunction({ id:"ship-published", triggers:[{ event:"ship/update.published" }] }, async ({ event }) => handleShipPublished(event.data as ShipPublished))`. **Email throwing → the whole function retries (NFR-4)**; the notification insert is idempotent so the retry doesn't dup it.
  - [x] `src/app/api/inngest/route.ts`: add `shipPublished` to the `functions: [...]` array. **(New function → a prod re-sync `PUT /api/inngest` is needed after deploy — Task 6.)**
  - [x] **Tests** (`src/server/inngest/functions/__tests__/ship-published.test.ts`, mock the repos + the email sender like `process-github-event.test.ts`): recipient found → `createNotification` + `sendShipPublishedEmail` called with the right props → `{status:"sent"}`; no recipient → neither called → `{status:"no-recipient"}`; a non-published context (dismissed race) → no email; idempotency (the notification dedup) holds.

- [x] **Task 5 — Publish Server Actions + the gate wiring** (AC: 1, 2)
  - [x] `src/server/ship-feed/curation.schema.ts`: add `publishCandidateSchema = { id: uuid, engagementId: uuid }` and `bulkPublishSchema = { ids: uuid[] (1..100), engagementId: uuid }` (mirror the dismiss schemas).
  - [x] `src/server/ship-feed/publish.actions.ts` (NEW, `"use server"`): `publishCandidateAction({ id, engagementId })` — `requireFreelancer` → `safeParse` → `publishShipUpdate(ctx, id)`; null → `{ ok:false, error:"That candidate is no longer in your queue." }`; else **emit** `inngest.send({ name:"ship/update.published", data:{ shipUpdateId: row.id, engagementId: row.engagementId, tenantId: row.tenantId } })` in a try/catch — **on emit failure, log + `Sentry.captureException`, but STILL return `{ ok:true }`** (publish is the durable truth; the feed shows it; the ping is best-effort, no rollback — opposite of the webhook's record-before-enqueue because here the durable write already happened) → `revalidatePath("/app")` + the engagement path → `{ ok:true }`. `bulkPublishCandidatesAction({ ids, engagementId })` — `publishShipUpdates` → emit one event per published row → revalidate → `{ ok:true, count }`.
  - [x] **Tests** (`src/server/ship-feed/__tests__/publish.actions.test.ts`, mock `requireFreelancer` + the repo + `inngest.send`): happy path publishes + emits the event with `{shipUpdateId,engagementId,tenantId}` + returns ok; a null repo result → friendly error, **no event emitted**; an emit failure → **still `{ ok:true }`** (publish durable) and Sentry called; invalid input → zod error, no repo call; bulk returns the count + emits per row.

- [x] **Task 6 — Gate UI (extend the 3.5 curation queue) + deploy** (AC: 1, 2)
  - [x] `src/app/app/engagements/[id]/(detail)/candidate-row.tsx`: add an `onPublish: () => void` prop and a **Publish** button (`variant="default"` = Soloist Ink primary, the deliberate commit) in the row's action area, before Dismiss. Keep it keyboard-reachable.
  - [x] `src/app/app/engagements/[id]/(detail)/curation-queue.tsx`: add an `onPublish(id)` helper (calls `publishCandidateAction`, `toast.success("Published — your client will be notified.")`, clears the id from selection, `router.refresh()`); add **`case "p"`** to the keydown switch (publish the focused row, suppressed-in-field like the rest); add a **"Publish selected"** button (`variant="default"`) to the `lg+` bulk bar (→ `bulkPublishCandidatesAction`, toast `Published N…`); add `p` to the `?` help overlay. Pass `onPublish` into each `CandidateRow`.
  - [x] `lint && typecheck && test && build` green (don't regress the 269 prior tests). Commit `drizzle/0012_*`. Apply to Neon. Deploy (`vercel --prod`; **verify `.env.local` checksum `ecedc7314b8e405f0a7bba826b19ef73` unchanged**) + push. **Re-sync Inngest in prod**: `curl -X PUT https://soloist.cjjutba.com/api/inngest` → expect `{"…registered…"}` (the new `ship-published` function must register, like the 3.1/3.3 sync).
  - [x] **Live validation (CJ):** publish a curated candidate in prod → confirm it leaves the queue, the dashboard badge drops, and (if a Client has accepted the engagement's invite) a branded email arrives + a `notifications` row exists; verify a candidate is invisible to the Client until published.

## Dev Notes

### What exists vs net-new (read this first)

[Source: code map — `inngest/client.ts` + `functions/process-github-event.ts` + `api/inngest/route.ts`; `invitations/email.ts` + `emails/invite-email.tsx`; `client-access.repository.ts`; `ship-update.repository.ts`; `webhooks/github/route.ts`]

- **Reused (don't rebuild):**
  - **Inngest** is set up (`inngest = new Inngest({ id:"soloist" })`, `client.ts`). Pattern: a thin `inngest.createFunction({ id, triggers:[{ event }] }, async ({ event }) => handleX(event.data))` wrapping an extracted, unit-testable `handleX`; the handler uses a **system ctx** `{ tenantId, userId:"system", role:"freelancer" }` to satisfy RLS WITH CHECK without a session (`process-github-event.ts` L50-51). Register new functions in `api/inngest/route.ts` (`functions:[processGithubEvent, reconcileRepos]`). Emit with `inngest.send({ name, data })`.
  - **Email:** `invitations/email.ts` is the exact wrapper to mirror — module-level `resend = env.RESEND_API_KEY ? new Resend(...) : null`; dev-log/prod-throw; `render(createElement(Template, props))` → `resend.emails.send({ from: env.EMAIL_FROM, to, subject, html, text })`. `emails/invite-email.tsx` is the template to mirror (Tenant logo `alt`, accent Button, inline styles, text fallback).
  - **Recipient:** `client-access.repository.ts` has `findClientAccessByUserId` (raw-db system read, the pattern); the `client_access` table is **one Client per Engagement** (engagement_id UNIQUE). `user` is re-exported from `schema.ts` (id/email/name).
  - **Ship updates:** `ship_updates` already has `state`/`published_at`/`status_tag`/`title`/`summary`/`engagement_id`/`tenant_id`/`raw_meta`; the `ship_update_scope` dual-scope RLS + FORCE govern it. `updateEngagement` bumps `last_activity_at` via `sql\`now()\``. The 3.5 curation repo fns (publish slots next to `dismissCandidate`, same `state='candidate'` guard idiom).
  - **Status vocabulary:** `src/components/ui/ship-status.ts` (`SHIP_STATUS`/`SHIP_STATUS_KEYS`/`toShipStatus`) — the single source for emoji/label, reused by the email (pure import, server-safe).
  - **Branding:** `getBranding(ctx)` (RLS read) / `resolveBrandingVars`; the fan-out instead system-reads logo+accent via `loadShipPublishedContext` (no session).
  - **The 3.5 curation queue** (`candidate-row.tsx` + `curation-queue.tsx`): publish is a NEW action button + the `p` shortcut + a bulk button, slotting into the established `onSetStatus/onDismiss` helper + keydown + bulk-bar shape.

- **Net-new (this story):** the `notifications` table + repo (migration 0012); `publishShipUpdate`/`publishShipUpdates`/`listPublishedUpdates`; the `findClientRecipientForEngagement` + `loadShipPublishedContext` system reads; the `ship-published` Inngest function + the `ship/update.published` event type; the `ship-published-email.tsx` template + its Resend wrapper; the publish Server Actions; the gate UI.

### The privacy boundary (the load-bearing invariant — NFR-2/3)

[Source: architecture.md L185, L249-251; EXPERIENCE.md › Privacy & Visibility]

- **Publish is the ONLY transition to `state='published'`.** No other code path may set it (no auto-publish). The gate lives in `publishShipUpdate` (guarded `WHERE state='candidate'`) and the only callers are the two publish actions.
- **RLS alone does NOT hide candidates from a Client.** The `ship_update_scope` policy scopes a client (engagement ctx) to their *engagement's* rows — **including candidates**. The candidate/published boundary is enforced by the **query**: `listPublishedUpdates` filters `state='published'` and selects only `{status_tag,title,summary,published_at}` (never `raw_meta`). This is why 3.6 lands that read + a **client-ctx test** proving a Client sees only published projections — the security boundary ships *with* the gate, before the 3.7 feed UI renders it (the same "RLS/guard before the client UI" discipline as Stories 2.1/3.2).
- `raw_meta` (SHAs/diffs/branches) stays a separate column the Client projection never selects.

### Reliability & the async fan-out (NFR-4/5)

- **Publish is durable the instant the action returns** (the row tx commits). The notification + email are an **async Inngest fan-out** — a failed/slow email never blocks or rolls back publish (NFR-4). The Client also sees the update via the 3.7 feed poll regardless of the email, so "the feed is never silently dead" holds even if the ping fails.
- **Emit failure is best-effort, NOT rolled back** — the OPPOSITE of the webhook's record-before-enqueue compensation (there the DB write must not outlive a failed enqueue; here the durable publish *should* survive a failed enqueue). On `inngest.send` failure: log + Sentry, still return `{ok:true}`.
- **Idempotent fan-out:** a whole-function retry must not double-notify — the `notifications_ship_dedup` partial unique + `onConflictDoNothing` guarantees one notification per (client, ship_update); the email may resend on retry (acceptable; Resend has no exactly-once and a duplicate ping is benign).
- **OPEN DECISION (flagged for CJ):** the AC's "if the email fails, the Freelancer gets a **retry toast**" can't be delivered synchronously — the email is async, so a terminal failure can't reach the Freelancer's browser without a push channel, which **Epic 4** builds (notification center / toast / prefs). 3.6 delivers the durable publish + Inngest's automatic retries (the NFR-4 substance) + the synchronous **success** toast ("Published — your client will be notified."). Surfacing an async email failure to the Freelancer is scoped to Epic 4. (Confirm this split is acceptable.)

### Architecture compliance

[Source: architecture.md L139 (Inngest fan-out), L142 (Resend+React Email branded), L178 (Notification model: type ship_published|invoice_sent|engagement_start, ship_update_id?, read_at), L208 (publish Server Action), L249-251 (the gate + fan-out steps + the published-only feed), L277-279 (naming)]

- Event name `ship/update.published` follows the code's `domain/thing.verb` convention (`github/event.received`); the docs' shorthand "ship.published" = this event.
- The `notifications` columns match the architecture model (omit `invoice_id` until Epic 5 adds the `invoices` FK target; `read_at` present for Epic 4's center).
- Server Action shape unchanged (requireFreelancer → Zod → repo → revalidate → typed `{ok}`); the gate additionally emits one Inngest event per published row.

### Project Structure Notes

- **NEW:** `src/server/db/repositories/notifications.repository.ts` (+ test); `src/server/inngest/functions/ship-published.ts` (+ test); `src/emails/ship-published-email.tsx`; `src/server/ship-feed/ship-published-email.ts` (+ test); `src/server/ship-feed/publish.actions.ts` (+ test); `drizzle/0012_*`.
- **MODIFIED:** `schema.ts` (+`notifications`), `ship-update.repository.ts` (+publish/listPublished), `client-access.repository.ts` (+recipient), `inngest/client.ts` (+event type), `api/inngest/route.ts` (+function), `curation.schema.ts` (+publish schemas), `candidate-row.tsx` + `curation-queue.tsx` (+publish wiring), `isolation.test.ts` (+notifications rows).
- **Naming:** repo fns `verbNoun`; actions `verbNounAction` in `publish.actions.ts`; the Inngest fn id `ship-published`; email template `PascalCase.tsx`. DB values stay `snake_case`.
- **Watch:** (1) `publishShipUpdate` must bump `last_activity_at` in the SAME tx as the state flip (atomic). (2) The migration needs the **manually-appended `FORCE ROW LEVEL SECURITY`** (drizzle omits it) — verify before applying to Neon, then re-run `db:generate` to confirm no drift. (3) The new Inngest function **won't fire in prod until `PUT /api/inngest` re-syncs** it — easy to forget, it's in Task 6. (4) `revalidatePath` both `/app` (badge) and the engagement page. (5) The fan-out's reads are **raw `db`** (system, no ctx) — keep them keyed on the trusted event ids, never request input.

### Testing requirements

- **Gate (`ship-update.repository.test.ts`, PGlite):** publish flips candidate→published + `published_at` + engagement `last_activity_at`; null on replay/non-candidate/foreign (RLS + guard); bulk count; **`listPublishedUpdates` from a CLIENT ctx returns only published, no `rawMeta`, no candidates, RLS-isolated** (the privacy proof).
- **Notifications (`notifications.repository.test.ts`, PGlite):** insert + dedup idempotency + cross-tenant isolation; `loadShipPublishedContext` join shape.
- **Fan-out (`ship-published.test.ts`, mocks):** recipient → notification + email; no recipient → skip; non-published → no email; idempotent.
- **Email (`ship-published-email.test.ts`):** rendered HTML contains title, status **label**, accent, portal URL, logo alt / name fallback.
- **Actions (`publish.actions.test.ts`, mocks):** publish + emit; null → friendly error + no emit; emit-failure → still ok + Sentry; bulk count; zod rejects bad input.
- **Regression:** the 269 prior tests stay green; `isolation.test.ts` gains `notifications` policy rows.

### References

- [Source: epics.md#Story 3.6 (the gate AC + the fan-out AC); #Story 3.7 (the feed consumes `listPublishedUpdates` — out of scope here); #Story 3.5 (the curation queue this extends)]
- [Source: architecture.md L139/L142/L178/L185/L208/L249-251/L277-279; EXPERIENCE.md L75 (branded-email a11y), L100-103 (publish = the deliberate commit)]
- [Source: src/server/inngest/{client.ts,functions/process-github-event.ts}, src/app/api/inngest/route.ts, src/app/api/webhooks/github/route.ts (emit pattern); src/server/invitations/email.ts + src/emails/invite-email.tsx (email pattern); src/server/db/repositories/{client-access,ship-update,branding}.repository.ts; src/components/ui/ship-status.ts; src/app/app/engagements/[id]/(detail)/{candidate-row,curation-queue}.tsx]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (1M context)

### Debug Log References

- Gates: `npx tsc --noEmit` clean · `eslint` clean · `vitest run` **293 passed (35 files)** (+24 over the 269 baseline) · `next build` ✓ Compiled · `drizzle-kit generate` → "No schema changes" (no drift; 0012 applied to Neon).

### Completion Notes List

- **AC-1 (the gate):** `publishShipUpdate(ctx, id)` is the ONE path to `state='published'` — in one tx it flips `candidate→published`, stamps `published_at`, and bumps the Engagement's `last_activity_at` (guarded `WHERE id AND tenant_id` as defense-in-depth atop RLS); guarded `state='candidate'` → null on replay/non-candidate/foreign. `publishShipUpdates` is the bulk variant. **`listPublishedUpdates`** is the Client-safe read — projection `{id,statusTag,title,summary,publishedAt}` (never `raw_meta`), `state='published'` only; a PGlite test from a **client ctx** proves a Client sees only published, never candidates/dismissed/other-engagement/raw_meta (RLS scopes the engagement; the state filter is what hides candidates — RLS alone wouldn't). Grep-confirmed: `state:"published"` is written ONLY by these two functions.
- **AC-2 (fan-out):** new `notifications` table (dual-scope RLS + FORCE + a partial unique `(user_id, ship_update_id)` for fan-out idempotency; migration 0012). The `ship/update.published` Inngest function (`handleShipPublished`): find the Engagement's Client (`findClientRecipientForEngagement`, raw system read) → **no recipient → graceful no-op** (feed still shows it) → `createNotification` (idempotent) → re-read context (`loadShipPublishedContext`) + guard `state='published'` → `sendShipPublishedEmail` (branded React Email, Tenant logo+accent, status as **emoji+text label**, "View in your portal" CTA). Email throws → the function retries (NFR-4); the notification dedup makes the retry safe. The publish action emits the event **best-effort** (an enqueue failure is logged + Sentry'd but does NOT roll back the durable publish — the opposite of the webhook's record-before-enqueue).
- **UI:** extended the 3.5 curation queue — a **Publish** button (Soloist Ink primary) per row, the **`p`** shortcut (suppressed-in-field), and **"Publish selected"** in the `lg+` bulk bar; the `?` overlay now lists `p`. `SHIP_STATUS` gained `bg`/`fg` hex (the email needs inline colors, not Tailwind classes).
- **Scoping decision (flagged for CJ):** the AC's "Freelancer **retry toast** on email failure" can't be delivered synchronously — the email is async (Inngest), so a terminal failure can't reach the browser without a push channel, which **Epic 4** builds (the architecture explicitly scopes "full center/toast/prefs" to Epic 4). 3.6 ships the NFR-4 substance: durable publish + Inngest auto-retries + a synchronous **success** toast. Surfacing an async email failure to the Freelancer is Epic 4. (Veto-able.)
- **Review fixes (xhigh, 3 finder angles):** the data/privacy layer came back clean (3 hardening notes applied). The UI finder caught the one real bug — **per-row Publish/Dismiss had no in-flight guard** (a double-click / `p`-repeat fired a second action that hit the state guard → a confusing "no longer in your queue" error right after a success); fixed with a queue-level `inFlight` ref (covers buttons AND keyboard). Also: portal URL trailing-slash strip; concurrent bulk emit (`Promise.allSettled` vs a serial await loop); engagement-bump tenant_id defense-in-depth; a clarifying comment on the bare `onConflictDoNothing`.

### File List

- **NEW:** `src/server/db/repositories/notifications.repository.ts` (+ test); `src/server/inngest/functions/ship-published.ts` (+ test); `src/emails/ship-published-email.tsx`; `src/server/ship-feed/ship-published-email.ts` (+ test); `src/server/ship-feed/publish.actions.ts` (+ test); `drizzle/0012_awesome_skreet.sql`.
- **MODIFIED:** `src/server/db/schema.ts` (+`notifications`); `src/server/db/repositories/ship-update.repository.ts` (+publish/listPublished); `src/server/db/repositories/client-access.repository.ts` (+recipient); `src/server/inngest/client.ts` (+event type); `src/app/api/inngest/route.ts` (+function); `src/server/ship-feed/curation.schema.ts` (+publish schemas); `src/components/ui/ship-status.ts` (+bg/fg hex); `src/app/app/engagements/[id]/(detail)/{candidate-row,curation-queue}.tsx`; the `ship-update`/`client-access`/`isolation` tests.

## Senior Developer Review (AI)

**Reviewer:** CJ (via Claude xhigh code-review — 3 parallel finder angles + verify) · **Date:** 2026-06-07 · **Outcome:** ✅ Approve

**Finder A — the privacy gate + RLS + data layer: clean.** Verified: publish is the ONLY writer of `state='published'` (grep); the gate is atomic (state+published_at+last_activity in one tx, rolls back together); `listPublishedUpdates` double-gates (state filter + a projection that never selects `raw_meta`) — a client ctx provably can't reach a candidate or raw_meta; the raw (no-RLS) system reads are keyed on trusted event ids, never request input; `notification_scope` + FORCE + the dedup partial unique are correct; migration 0012 carries the manually-appended FORCE; the isolation cases (ag)-(aj) prove cross-tenant/cross-engagement isolation. 3 hardening notes — all applied.

**Finder B — the async fan-out + email: clean (1 low fix).** Verified: idempotent under retry (notification dedup → no double-notify; a duplicate email on a transient retry is benign + documented); the no-recipient + stale paths are correct (and the "stale after publish" race is unreachable — there's no unpublish path in v1); the email wrapper mirrors the invitations policy (dev-log/prod-throw → Inngest retries); the template is a11y-correct (emoji+text status, logo alt + fallback, inline colors); the event name matches across emit/type/trigger; the system ctx satisfies the WITH CHECK. **Fix:** portal URL trailing-slash strip (the sibling invitations action already guarded this).

**Finder C — the actions + UI: 1 real fix + 2 low.** Verified: action order is right (durable publish before best-effort emit; a failed emit still revalidates + returns ok); `count` is the real published-row count; the `p` key is suppressed-in-field with no stale closure; focus-by-id clears when the published row leaves the list; revalidate hits `/app` + the engagement. **Fixes:** the per-row in-flight guard (the real bug — double-fire error-after-success); the concurrent bulk emit; the stale row JSDoc.

**Action Items:**
- [x] **[Med]** Per-row Publish/Dismiss in-flight guard (queue-level `inFlight` ref) — applied.
- [x] **[Low]** Portal URL trailing-slash strip — applied.
- [x] **[Low]** Concurrent bulk emit (`Promise.allSettled`) — applied.
- [x] **[Low]** Engagement-bump tenant_id defense-in-depth + clarifying `onConflictDoNothing` comment + stale JSDoc — applied.
- [ ] **[Low — deferred]** Pin an explicit `onConflictDoNothing` target if a 2nd unique is ever added to `notifications` (commented; safe today).

## Change Log

| Date       | Version | Description                                                          | Author |
| ---------- | ------- | ------------------------------------------------------------------- | ------ |
| 2026-06-07 | 0.1     | Story drafted (context-engineered).                                 | Scrum  |
| 2026-06-07 | 1.0     | Implemented Tasks 1–6; xhigh review (3 angles, 6 fixes); done.      | Dev    |
