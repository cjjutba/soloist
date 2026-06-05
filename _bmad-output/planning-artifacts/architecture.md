---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
lastStep: 8
completedAt: '2026-06-06'
inputDocuments:
  - "_bmad-output/planning-artifacts/prds/prd-soloist-2026-06-05/prd.md"
  - "_bmad-output/planning-artifacts/prds/prd-soloist-2026-06-05/addendum.md"
  - "_bmad-output/planning-artifacts/prds/prd-soloist-2026-06-05/reconcile-brief.md"
  - "_bmad-output/planning-artifacts/briefs/brief-soloist-2026-06-05/brief.md"
  - "_bmad-output/planning-artifacts/ux-designs/ux-soloist-2026-06-05/DESIGN.md"
  - "_bmad-output/planning-artifacts/ux-designs/ux-soloist-2026-06-05/EXPERIENCE.md"
workflowType: 'architecture'
project_name: 'soloist'
user_name: 'CJ Jutba'
date: '2026-06-06'
status: 'complete'
---

# Architecture Decision Document — Soloist

_Run solo. Deliver like an agency._

> **How this was produced.** CJ delegated the architectural decisions ("choose what's best fit for the entire system"). This document makes the calls, with rationale, grounded in the PRD (FR-1–FR-18, NFR-1–NFR-7), the tech-stack addendum, and the finalized UX spines (DESIGN.md / EXPERIENCE.md). Technology versions were verified on the web (June 2026). Two-way-door decisions are flagged **[CONFIRM]** for CJ; load-bearing one-way doors are justified inline. It is the contract for downstream `bmad-create-epics-and-stories`, `bmad-sprint-planning`, and `bmad-dev-story`.

---

## Project Context Analysis

### Requirements Overview

**Functional Requirements (18 FRs in 6 feature groups).** Architecturally they cluster into five subsystems:

| Subsystem | FRs | Architectural weight |
|---|---|---|
| **Tenancy, Branding & Auth** | FR-1–FR-5 | Multi-tenant foundation: subdomain routing, two roles, invite flow, per-Tenant branding. The isolation boundary (NFR-2) lives here. |
| **Engagements** | FR-6, FR-7 | The core aggregate everything hangs off; Cockpit dashboard with the candidate-count signal. |
| **Premium Onboarding** | FR-8 | One-time branded first-run; mostly UX, thin backend (a `completed_onboarding` flag). |
| **Ship Feed — GitHub + Curation (the moat)** | FR-9–FR-14 | The hardest part: external integration, an event pipeline, the candidate→published privacy gate, near-real-time delivery. |
| **Notifications** | FR-15 | Tri-channel fan-out (email + in-app + toast) triggered by publish + key events. |
| **Doc Engine — Invoice** | FR-16–FR-18 | Templated documents reusing shared Engagement/Client data; manual status; no payments. |

**Non-Functional Requirements (the real architecture drivers).**

- **NFR-2 Multi-Tenant Isolation — LAUNCH BLOCKER.** "No user can ever read or affect data outside their authorized Tenant/Engagement; cross-tenant access returns not-found, not denied." This is the single most architecture-shaping requirement and drives the data model, the data-access layer, authz, and subdomain routing.
- **NFR-5 "Live" Performance.** Auto-pulled GitHub events → curation queue within ~5 min; publish → Client feed + notifications within ~30 s; Client Portal interactive within ~2 s on mid-range mobile/4G. Lenient enough that we do **not** need a websocket service.
- **NFR-3 Security.** GitHub credentials encrypted/least-privilege; passwords hashed; the Client surface never exposes source/raw repo data (the curation boundary is also a security boundary).
- **NFR-4 Reliability / Graceful Degradation.** GitHub failures degrade gracefully; manual Ship Updates always work; a failed auto-pull never blocks publishing or the Client's view.
- **NFR-6 Cost (solo-operator).** Serverless / free-or-cheap tiers; near-zero cost per Tenant at low volume; **no dedicated ops**. This vetoes always-on infrastructure (dedicated websocket servers, managed realtime at $49–99/mo) and favors managed, scale-to-zero services.
- **NFR-1 Responsive / mobile-first Client.** Drives the rendering strategy (RSC + light client islands) and the feed transport (cheap polling that a phone can sustain).
- **NFR-7 Accessibility** baseline (keyboard, contrast, semantic) — owned by the UX spines, inherited from shadcn primitives.

**From the UX spines (DESIGN.md / EXPERIENCE.md):** two role-keyed surfaces (Cockpit desktop-primary, Client Portal mobile-first) on **shadcn/ui + Tailwind**; per-Tenant branding via a runtime `--tenant-accent` CSS variable with a three-way contrast guard; the **curation = privacy boundary** behavioral rule; tri-channel notifications; designed empty/error/degraded states; fixed status vocabulary (✅/🚧/📦). These are honored, not re-decided.

### Scale & Complexity

- **Primary domain:** Full-stack responsive web application (Next.js).
- **Complexity level:** **Medium-high** — not from data volume (low-traffic, solo-operated at launch) but from **multi-tenancy + an external event integration + near-real-time delivery + a hard isolation guarantee**. The hard parts are correctness (isolation, the privacy gate, idempotent webhook processing), not throughput.
- **Estimated architectural components:** ~7 logical modules (auth/tenancy, engagements, github-integration, ship-feed/curation, notifications, doc-engine, branding) over one Next.js app + Neon Postgres + Inngest + Resend + GitHub App.

### Technical Constraints & Dependencies

- **Committed stack (addendum):** Next.js (App Router), Tailwind + shadcn/ui, Neon Postgres, Vercel, `*.cjjutba.com` wildcard. ORM (Drizzle vs Prisma), auth, email, jobs, and GitHub mechanism were left open "to decide in architecture" — decided below.
- **External dependency:** GitHub (App + webhooks). Must degrade gracefully (NFR-4).
- **Single-builder operability (§9):** favor managed services + opinionated defaults over configurable complexity. Every decision below is weighed against "can one person run this with no ops?"
- **Cadence:** 3-day-max sprints, launch ASAP, dogfood-first. Favors a monolithic Next.js app (no microservices), managed infra, and vertical slices.

### Cross-Cutting Concerns Identified

1. **Tenant/Engagement scoping** — every read and write must be scoped; this is the spine of NFR-2.
2. **The candidate→published privacy gate** — a single enforced transition that controls Client visibility and triggers notifications.
3. **Idempotency** — webhook deliveries and Inngest steps retry; all event processing must be idempotent.
4. **Branding propagation** — per-Tenant logo + accent must reach Client surfaces *and* emails; resolved from the subdomain.
5. **Error/degradation surfacing** — GitHub failures must reach the Cockpit (banner + repo card) without blocking anything.
6. **Secrets** — GitHub App private key, session secrets, DB URL; minimized by the GitHub App model (short-lived installation tokens minted on demand, not stored).

---

## Starter Template Evaluation

### Primary Technology Domain

**Full-stack web application** on **Next.js (App Router)** — committed in the addendum and the correct choice (one deployable, RSC for fast mobile reads, Server Actions for mutations, Route Handlers for webhooks). No separate backend; Vercel is the host.

### Starter Options Considered

| Option | Verdict |
|---|---|
| **`shadcn` CLI init on a fresh `create-next-app`** | **Selected.** Minimal, current, no opinionated cruft to fight. shadcn's CLI now initializes Tailwind v4 + App Router + `@/*` alias directly (verified June 2026). We layer our own choices (Drizzle, Better Auth, Inngest, Resend) deliberately. |
| `create-t3-app` (T3) | Rejected. Bundles NextAuth + Prisma/Drizzle + tRPC. We want Better Auth (not NextAuth) and Server Actions (not tRPC) — fighting its defaults costs more than it saves. |
| A paid SaaS boilerplate (Makerkit etc.) | Rejected. Faster on paper, but opaque multi-tenant assumptions conflict with our explicit NFR-2 model and the "single-builder must understand every guardrail" constraint. We want to own the isolation layer. |

### Selected Starter: `create-next-app` + `shadcn` init

**Rationale:** smallest correct base; every architectural decision is explicit and owned (critical for the NFR-2 isolation guarantee a solo builder must fully understand). The "magic" is in libraries we add intentionally, not a boilerplate we inherit.

**Initialization Command** _(verify exact flags at init; versions confirmed current June 2026):_

```bash
# 1. Next.js 16.2 (App Router, TypeScript, Tailwind v4, Turbopack default, src/ dir, @/* alias)
npx create-next-app@latest soloist --typescript --tailwind --app --src-dir --import-alias "@/*"

# 2. shadcn/ui (Tailwind v4 + React 19; CSS-variable theming)
cd soloist && npx shadcn@latest init

# 3. Core libraries (pin exact versions at install)
npm i drizzle-orm @neondatabase/serverless better-auth inngest resend react-email @react-email/components zod @octokit/app @octokit/webhooks @octokit/rest @octokit/plugin-throttling @octokit/plugin-retry @tanstack/react-query react-hook-form @hookform/resolvers sonner @vercel/blob
npm i -D drizzle-kit
```

**Architectural decisions provided by the starter:**
- **Language & runtime:** TypeScript (strict), React 19.2, Node runtime on Vercel (with selective Edge middleware).
- **Styling:** Tailwind **v4** (CSS-first config via `@theme` + CSS variables in `globals.css` — no `tailwind.config.js`). This is the native home for DESIGN.md's tokens and the runtime `--tenant-accent`.
- **Build tooling:** Turbopack (default in Next 16), React Compiler (stable in Next 16) — auto-memoization, less manual `useMemo`.
- **Code organization:** `src/` + `@/*` alias + App Router file conventions.

> **First implementation story** = run the init commands above and commit the baseline (the starter scaffold), per the sprint plan.

---

## Core Architectural Decisions

### Decision Priority Analysis

**Critical (block implementation):** multi-tenancy & isolation model · ORM · auth library & session model · subdomain routing · GitHub integration mechanism · the candidate→published data flow.
**Important (shape the architecture):** event/jobs layer · feed transport · notification fan-out · email provider · API style (Server Actions vs Route Handlers) · file storage · validation.
**Deferred (post-MVP, seams provided now):** AI summarization engine · Vercel/Linear integrations · proposals/contracts doc types · realtime upgrade (websockets) · public demo portal seeding.

### Decisions at a glance

| Concern | Decision | Version (June 2026) | One-line why |
|---|---|---|---|
| Framework | Next.js, App Router | **16.2** | Committed; RSC + Server Actions + Route Handlers in one deploy. |
| Language | TypeScript (strict) | 5.x | Type-safety across the isolation layer. |
| UI | shadcn/ui + Tailwind v4 | Tailwind 4.x | UX substrate; CSS-variable theming = native `--tenant-accent`. |
| DB | Neon Postgres (serverless) | — | Committed; scale-to-zero, branching. |
| ORM | **Drizzle ORM** + drizzle-kit | latest | Edge-native on Neon, tiny cold starts, **SQL-level control over tenant scoping** (the NFR-2 lever). |
| Auth | **Better Auth** (+ organization plugin) | latest | Email/password + **organizations/members/invitations/RBAC out of the box** — maps onto Tenant/Freelancer/Client/invite. |
| Tenancy | Shared DB + `tenant_id` discriminator + enforced scoped data layer + **Postgres RLS backstop (day-one)** | — | Solo-operable, near-zero cost; isolation enforced at a single choke point **and** at the DB. |
| Jobs/events | **Inngest** | latest | Durable steps + retries + fan-out + cron; runs the GitHub pipeline and publish→notify. |
| GitHub | **GitHub App + webhooks** (primary) + scheduled reconciliation poll (backstop) | Octokit latest | Event-driven, no rate-limit burn, least-privilege, satisfies NFR-4/5. |
| Feed transport | **Client polling** (TanStack Query, refetch on focus + ~20s interval) | — | Meets ~30s target at near-zero cost; SSE breaks on Vercel, managed realtime violates NFR-6. Abstracted behind a transport seam. |
| Email | **Resend + React Email** | latest | Branded transactional emails as React components; per-Tenant branding props. |
| Mutations | **Server Actions** (+ Zod) | — | Type-safe writes co-located with the Cockpit; progressive enhancement. |
| Integrations/IO | **Route Handlers** | — | GitHub webhook, Inngest endpoint, polled feed JSON, auth handler. |
| Reads | **React Server Components** + TanStack Query for live/polled data | — | Fast mobile first paint; client islands only where interactivity needs it. |
| File storage | **Vercel Blob** | — | Tenant logos + generated Invoice PDFs; integrated, scale-to-zero. |
| Validation | **Zod** at every boundary | latest | One schema source for forms, actions, webhooks, env. |
| Hosting | **Vercel** | — | Committed; wildcard `*.cjjutba.com`, cron, edge middleware. |
| Errors/obs | **Sentry** + Vercel logs + Inngest dashboard | latest | Lightweight, solo-friendly. |

### Data Architecture

**Decision: Neon Postgres + Drizzle ORM, single shared schema with a `tenant_id` discriminator and a mandatory tenant-scoped data-access layer.**

- **ORM = Drizzle (not Prisma).** Both are viable in 2026 (Prisma 7's TS/WASM engine closed much of the perf gap). Drizzle wins *here* for three Soloist-specific reasons: (1) **explicit SQL control** — tenant scoping is a `where tenant_id = $ctx` predicate we want to see and enforce, not hide behind an abstraction; (2) **edge-native + tiny cold starts** on Neon's serverless driver (helps NFR-5's ~2s and NFR-6's cost); (3) lighter bundle for a Vercel serverless deploy. drizzle-kit owns migrations (SQL files in `drizzle/`).
- **Tenancy model = shared database, shared schema, discriminator column.** Every tenant-owned row carries `tenant_id` (and `engagement_id` where applicable). **Not** schema-per-tenant or DB-per-tenant — those add ops a solo builder can't sustain (NFR-6/§9) and buy isolation we achieve more cheaply at the app layer.
- **Isolation enforcement (NFR-2, the launch blocker) — two layers:**
  1. **Primary: a single tenant-scoped data-access layer.** All DB access goes through `src/server/db/repositories/*` that *require* a `TenantContext` (`{ tenantId, userId, role, engagementId? }`) and inject the scope predicate. No feature code touches Drizzle directly. This is the one choke point to audit. Cross-scope reads return empty → surfaced as **not-found, never denied** (NFR-2 wording).
  2. **Backstop ✓ (confirmed day-one, CJ 2026-06-06): Postgres Row-Level Security** on every tenant-scoped table, keyed on a per-request `SET LOCAL app.tenant_id` (and `app.engagement_id` for Client sessions) inside the transaction (Neon supports RLS). Defense-in-depth so a forgotten predicate can't leak across Tenants. Wired from the first schema migration — the repository layer opens a transaction, sets the GUC from `TenantContext`, then runs the scoped query; RLS policies (`USING tenant_id = current_setting('app.tenant_id')::uuid`) are the seatbelt. Both layers ship together, so NFR-2 has app-layer enforcement **and** a DB-level guarantee from launch.
- **Engagement-level scoping for Clients.** A Client is bound to exactly one Engagement (v1, FR-5). Client requests are scoped to that `engagement_id`, not the whole Tenant — so within CJ's Tenant, Client A can never see Client B's Engagement. The data layer takes `engagementId` from the resolved `ClientAccess` row, never from the request.
- **Migrations:** drizzle-kit, forward-only SQL migrations committed to `drizzle/`. Neon branching for safe preview/migration testing.
- **Caching:** none beyond Next's request memoization + TanStack Query client cache in v1 (low traffic; premature). Seam left for Neon read replicas / Upstash Redis later.

**Core data model (entities; all tenant-scoped tables carry `tenant_id`):**

```
User                — id, email, hashed_password, name, email_verified_at      (Better Auth)
Session             — Better Auth managed
Tenant              — id, owner_user_id, slug (unique), name                    (= Better Auth Organization)
Branding            — tenant_id (1:1), logo_blob_url, accent_hex, accent_text_hex, updated_at
Engagement          — id, tenant_id, client_display_name, name, scope, status(active|paused|completed|archived), last_activity_at, created_at
ClientAccess        — id, tenant_id, engagement_id, user_id, role('client'), invited_at, accepted_at   (one per Engagement v1)
Invitation          — id, tenant_id, engagement_id, email, token_hash, expires_at, accepted_at
RepoConnection      — id, tenant_id, engagement_id, gh_installation_id, gh_repo_id, repo_full_name, status(connected|pulling|error|disconnected), last_pull_at, last_error
ShipUpdate          — id, tenant_id, engagement_id, status_tag(shipped|in_progress|next), title, summary,
                      state(candidate|published|dismissed), source(github|manual), source_event_key (unique per engagement, idempotency),
                      published_at, created_at, raw_meta(jsonb, never client-exposed)
Notification        — id, tenant_id, engagement_id, user_id(recipient), type(ship_published|invoice_sent|engagement_start),
                      ship_update_id?, invoice_id?, read_at, created_at
Invoice             — id, tenant_id, engagement_id, number(per-tenant seq), status(draft|sent|paid),
                      line_items(jsonb), amount_total, currency, issued_at, due_at, notes, pdf_blob_url?
WebhookEvent        — id, gh_delivery_id (unique), event_type, received_at, processed_at   (idempotency ledger)
```

> The Client-facing projection of `ShipUpdate` is `{status_tag, title, summary, published_at}` only — `raw_meta` (SHAs, diffs, branch names) is a separate column that the Client query layer **never selects**. The privacy boundary is enforced in the type system, not just the UI (EXPERIENCE.md › Privacy & Visibility).

### Authentication & Security

**Decision: Better Auth (email/password) + its organization plugin; subdomain+role authorization at the edge and in the data layer.**

- **Why Better Auth over Auth.js/NextAuth v5:** verified June 2026 — Better Auth's **organization plugin ships organizations, members, invitations, and RBAC**, exactly the Tenant/Freelancer/Client/invite primitives Soloist needs, plus built-in email/password, email verification, password policies, rate limiting, and session management. With Auth.js we'd hand-build all of that. No vendor lock-in (unlike Clerk), no per-MAU cost (helps NFR-6).
- **Mapping:** `Tenant = Organization` (owner = the Freelancer). The Freelancer is the org owner. **Client identities** are `User`s linked to a single Engagement via `ClientAccess` (app-level, because Client scope is Engagement-grained, finer than org membership). The Client invite (FR-5) uses a custom Engagement-scoped `Invitation` (unique, hashed, expiring token) → on accept, creates the `User` (or links existing) + `ClientAccess`, then routes to Onboarding.
- **Roles:** `freelancer` (org owner) and `client`. Authorization is **deny-by-default**:
  - **Edge middleware** resolves the surface from the host: `<slug>.cjjutba.com` → Client Portal for that Tenant; `soloist.cjjutba.com` → Cockpit. Unknown slug → neutral **not-found** (NFR-2; no existence disclosure).
  - **Request authz** (in the data layer): Cockpit requests must have a session whose org = the subdomain's Tenant and role = freelancer. Client requests must have a `ClientAccess` row for the Engagement being accessed. Anything else → not-found.
- **Security specifics (NFR-3):**
  - Passwords hashed by Better Auth (scrypt/argon2 default); plaintext never stored (FR-4).
  - **GitHub: no long-lived user tokens stored.** The **GitHub App** model means we store only `installation_id` + `repo_id`; short-lived installation tokens are minted on demand from the App private key (kept in a Vercel encrypted env var / outside the DB). This is strictly better than OAuth-token-at-rest. Least privilege: read-only `contents`, `metadata`, `pull_requests`, plus the `push`/`pull_request`/`release` webhook events.
  - Webhook authenticity: verify `X-Hub-Signature-256` (HMAC) on every delivery via `@octokit/webhooks`; reject unsigned/invalid.
  - Sessions: httpOnly, secure, SameSite cookies; CSRF protection on Server Actions (Next built-in origin checks + Better Auth).
  - Secrets: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `GITHUB_APP_*`, `RESEND_API_KEY`, `INNGEST_*`, `BLOB_READ_WRITE_TOKEN` in Vercel env (per-environment); validated at boot by a Zod `env.ts`.
  - **Branding contrast guard** (DESIGN.md): server-side validation on accent save (fill 4.5 / text 4.5 / non-text 3.0); the guard is an authz-independent invariant enforced in the branding Server Action, not just client UI.

### API & Communication Patterns

**Decision: Server Actions for mutations, Route Handlers for IO boundaries, RSC + TanStack Query for reads. Zod validates every boundary.**

- **Server Actions** (`"use server"`) for all Cockpit/Client mutations: create/edit Engagement, connect/disconnect repo, curate (edit title/summary, set status, dismiss), **publish**, author manual update, save branding, create/send Invoice, mark paid, accept invite, set notification on/off. Each action: resolve `TenantContext` → Zod-parse input → repository call → revalidate. Progressive-enhancement friendly (works before JS hydrates), no bespoke REST surface to secure.
- **Route Handlers** (`app/api/*`) only for true IO boundaries:
  - `POST /api/webhooks/github` — verify signature, dedupe via `WebhookEvent.gh_delivery_id`, enqueue an Inngest event, return 2xx fast.
  - `POST /api/inngest` — Inngest's function endpoint.
  - `GET /api/feed/[engagementId]` and `GET /api/notifications` — JSON for the client poll (authz-scoped).
  - `/api/auth/*` — Better Auth handler.
- **Reads:** Server Components fetch through the same repositories for first paint (fast mobile, NFR-1/5); **TanStack Query** drives the polled live data (Client feed, Cockpit queue, notification bell) with `refetchOnWindowFocus` + a ~20s interval while active, paused when hidden.
- **Error & response conventions:** Server Actions return a discriminated result `{ ok: true, data } | { ok: false, error: { code, message, fieldErrors? } }` (never throw across the boundary for expected errors). Route Handlers use proper HTTP status + `{ error: { code, message } }`. User-facing copy comes from EXPERIENCE.md's voice table; internal detail is logged, not shown.
- **No GraphQL, no tRPC, no separate API service** — overkill for a solo monolith; Server Actions + a few Route Handlers cover it.

### Frontend Architecture

- **Rendering:** Server Components by default; client components (`"use client"`) only for interactive islands (curation queue editing, feed polling, toasts, forms, branding picker). React Compiler handles memoization.
- **State:** server state via RSC + **TanStack Query** (server cache, polling, optimistic publish). Minimal global client state (a small Zustand store only if needed for transient UI; default to none). Forms: **React Hook Form + Zod** (`@hookform/resolvers`).
- **Theming / branding:** Tailwind v4 `@theme` defines the DESIGN.md tokens as CSS variables. The Client Portal root sets `--tenant-accent` / `--tenant-accent-text` from the resolved Tenant's `Branding` (inline style on the layout), and re-scopes shadcn `--primary` → `--tenant-accent`. The Cockpit never sets these (stays Soloist Ink). Server-resolved so there's no flash.
- **Toasts:** `sonner` (shadcn) — fired on publish-while-active and recoverable failures (EXPERIENCE.md State Patterns).
- **Performance (NFR-5 ~2s mobile):** RSC streaming, route-level code splitting, `next/image` for logos, single-column Client Portal with `max-w-2xl` (small DOM), skeletons on cold load.
- **Accessibility (NFR-7):** inherited from shadcn primitives + the EXPERIENCE.md Accessibility Floor (focus management, `aria-live="polite"` feed, ≥44px touch targets, reduced-motion, the contrast guard).

### Infrastructure & Deployment

- **Host:** Vercel. **Domains:** `soloist.cjjutba.com` (Cockpit) + wildcard `*.cjjutba.com` (Client Portals) on one project; middleware resolves the surface from `host`. ✓ **Cockpit host confirmed `soloist.cjjutba.com`** (CJ 2026-06-06, resolves PRD Open Q #8).
- **Runtime split:** middleware on Edge (fast host/role resolution); app on Node serverless (Drizzle + Neon driver, GitHub App crypto, Inngest). 
- **Jobs/events:** **Inngest** — durable, retrying, multi-step functions triggered by events (`github/event.received`, `ship.published`, `invoice.sent`) plus a **scheduled reconciliation** function (every ~10 min) that polls connected repos for events missed by webhooks (NFR-4 backstop) and updates `RepoConnection.last_pull_at`. Replaces Vercel Cron; survives deploys; gives a job dashboard for free (solo observability).
- **Environments:** `production` (Vercel prod + Neon main branch) and `preview` (Vercel previews + Neon branch per PR). Local dev: `.env.local`, Neon dev branch, Inngest dev server, a smee.io/Inngest tunnel for GitHub webhooks.
- **CI/CD:** GitHub Actions — typecheck, lint, `drizzle-kit` migration check, build; Vercel auto-deploys on merge. (Apt, since CJ's own repo dogfoods the product.)
- **Observability:** Sentry (errors, both server + client), Vercel logs/analytics, Inngest run history. Correlation IDs = GitHub delivery IDs through the pipeline (per Octokit guidance).
- **Cost (NFR-6):** every component scales to zero / has a free tier (Neon, Vercel Hobby/Pro, Inngest free, Resend 3k/mo, Vercel Blob, GitHub App free). Near-zero per-Tenant at low volume, no always-on servers.

### Key Subsystem Designs (the load-bearing flows)

**A. Multi-tenant subdomain resolution.**
`middleware.ts` (Edge) reads `host`: `soloist.cjjutba.com` → Cockpit context; `<slug>.cjjutba.com` → look up Tenant by slug (cached) → Client context, attach `tenantId`; unknown slug or no Tenant → rewrite to the neutral not-found page (NFR-2). Branding for the Client Portal is resolved server-side in the Tenant layout from `Branding`, applied as CSS variables before render. **Reserved slugs** (`soloist`, `www`, `api`, `app`, `admin`, `mail`, `assets`, `static`, plus the apex) are rejected by the FR-1 slug picker so a Tenant can never claim a system subdomain.

**B. GitHub event pipeline (FR-9–FR-11, the moat).**
1. GitHub App installed on the Freelancer's repo → webhook deliveries (`push`, `pull_request`, `release`) hit `POST /api/webhooks/github`.
2. Handler verifies HMAC signature, records `WebhookEvent` (dedupe on `gh_delivery_id`), emits Inngest `github/event.received`, returns 202 immediately (no heavy work in the request).
3. Inngest function (idempotent, retrying) maps the event → a **candidate** `ShipUpdate`: derives a default `status_tag` (merged PR / release → ✅ Shipped; open PR / active branch → 🚧 In Progress; planned → 📦 Next, per FR-10), renders founder-readable `title`/`summary` via the **`SummarizationProvider`** (v1 = heuristic/template: clean PR/commit titles; **fast-follow = LLM** — same interface, swap implementation, FR-11), stores `raw_meta` separately. Dedupe via `source_event_key` so retries/duplicate deliveries don't create dupes.
4. Reconciliation Inngest cron polls installations for anything missed (rate-limit-aware via `@octokit/plugin-throttling`), keeping NFR-5's ~5 min even if a webhook is dropped, and flips `RepoConnection.status` to `error` + records `last_error` on failure (→ Cockpit banner + repo card, NFR-4).

**C. Curation → Publish → Fan-out (FR-12, FR-14, FR-15 — the privacy gate).**
- Candidates are Freelancer-only (`state=candidate`). The **publish Server Action** is the single gate: it flips `state=published`, sets `published_at`, bumps `Engagement.last_activity_at`, and emits Inngest `ship.published`. **No other path makes an update Client-visible** (no auto-publish — FR-12 / EXPERIENCE.md).
- Inngest `ship.published` fans out (durable steps, each retried independently — NFR-4): (1) insert in-app `Notification`; (2) send branded email via Resend+React Email (Tenant logo/accent props); (3) the toast is delivered by the Client's active poll picking up the new published update / notification. Each step is idempotent.
- The Client feed (`GET /api/feed/[engagementId]`, scoped via `ClientAccess`) returns only published projections; the client polls it (~20s/on-focus) → meets ~30s (NFR-5) with zero realtime cost.

**D. Doc Engine — Invoice (FR-16–FR-18).**
Invoice generated from a template prefilled from `Engagement`/`ClientAccess` shared data (FR-17 — write once, reuse). Per-Tenant `number` from a sequence. In-portal premium HTML view (DESIGN.md) is primary; **PDF export via `@react-pdf/renderer`** rendered server-side and stored in Vercel Blob — ✓ **confirmed in v1** (CJ 2026-06-06): the Client gets both the in-portal view and a downloadable branded PDF. Status `draft→sent→paid`, **Paid marked manually** by the Freelancer (no payments — §11). Sending fires Inngest `invoice.sent` → notification. The Doc Engine is built around a `DocumentType` seam so proposals/contracts slot in later (FR-17) without re-typing.

### Decision Impact Analysis

**Implementation sequence (architectural dependency order; sprint planning sequences the slices):**
1. Starter scaffold + env/Zod + Drizzle schema + Neon + the **tenant-scoped data layer** (NFR-2 first — everything else depends on it).
2. Better Auth + organization=Tenant + sign-up/slug + subdomain middleware + not-found.
3. Engagements CRUD + Cockpit dashboard + Client invite/accept + Onboarding flag.
4. GitHub App + webhook handler + Inngest pipeline + candidate creation + curation + **publish gate**.
5. Client Ship Feed (poll) + Notifications fan-out (in-app + Resend email + toast).
6. Branding (logo/accent + contrast guard) propagation to Client surfaces + emails.
7. Doc Engine / Invoice.

**Cross-component dependencies:** the `TenantContext` + data layer underpin every feature; the Inngest event bus couples GitHub-integration → ship-feed → notifications; Branding is read by both the Client Portal layout and the email templates; the `SummarizationProvider` and `DocumentType` seams isolate the two known fast-follows (AI summaries, new doc types).

---

## Implementation Patterns & Consistency Rules

> Purpose: so multiple AI agents (and CJ) write compatible code. These are **mandatory**.

### Naming Patterns

- **Database (Postgres/Drizzle):** tables `snake_case` **plural** (`ship_updates`, `repo_connections`); columns `snake_case` (`tenant_id`, `published_at`); PK `id` (uuid v7, time-sortable); FKs `<entity>_id`; every tenant-owned table has `tenant_id` (and `engagement_id` where scoped); enums as Postgres enums (`ship_update_status`, `engagement_status`). Timestamps `*_at` (`timestamptz`).
- **TypeScript:** types/components `PascalCase` (`ShipUpdateCard`); functions/vars `camelCase` (`publishShipUpdate`); files `kebab-case.ts` (`ship-update.repository.ts`); React component files `PascalCase.tsx` (`ShipUpdateCard.tsx`). Drizzle table objects `camelCase` plural (`shipUpdates`), inferred types `PascalCase` singular (`ShipUpdate`).
- **Routes / API:** App Router segments `kebab-case`; route params `[engagementId]` (camelCase inside brackets). Route Handlers under `app/api/<area>/`. Server Actions live in `*.actions.ts` and are named `verbNoun` (`createEngagement`, `publishShipUpdate`).
- **Inngest:** event names `domain/thing.verb` (`github/event.received`, `ship.published`, `invoice.sent`); function ids `kebab-case` (`process-github-event`, `fanout-ship-published`).
- **CSS / design tokens:** Tailwind v4 `@theme` variables match DESIGN.md token names (`--color-status-shipped`, `--tenant-accent`); never hardcode hex in components — use the tokens.

### Structure Patterns

- **Feature-first server modules** under `src/server/<feature>/` (`engagements/`, `github/`, `ship-feed/`, `notifications/`, `doc-engine/`, `branding/`, `tenancy/`), each with `*.repository.ts` (data), `*.actions.ts` (Server Actions), `*.service.ts` (logic), `*.schema.ts` (Zod). **No feature imports another feature's repository directly** — cross-feature calls go through services.
- **The data layer is the only place Drizzle is imported.** Feature code calls repositories that take `TenantContext`. A lint rule / convention forbids `import ... drizzle` outside `src/server/db/`.
- **UI:** `src/components/ui/` (shadcn primitives, unchanged), `src/components/<feature>/` (feature components). Co-locate route UI under `app/(cockpit)/` and `app/(portal)/` route groups.
- **Tests co-located** `*.test.ts` next to source; e2e in `e2e/`. Isolation tests (NFR-2) are a required suite (`src/server/**/__tests__/isolation.test.ts`).

### Format Patterns

- **Server Action result:** `{ ok: true, data } | { ok: false, error: { code: string, message: string, fieldErrors?: Record<string,string> } }`. Never throw expected errors across the boundary.
- **Route Handler:** correct HTTP status + JSON `{ data }` or `{ error: { code, message } }`.
- **Dates:** `timestamptz` in DB; ISO-8601 UTC strings over the wire; format to relative/local in the UI only (DESIGN.md `numeric` token). 
- **JSON field naming over the wire:** `camelCase` (DB `snake_case` is mapped by Drizzle inferred types).
- **IDs:** uuid v7 everywhere (sortable, non-enumerable — supports the not-found-not-denied posture).
- **Money:** integer minor units + `currency` code; format with `Intl.NumberFormat` (never float math).

### Communication Patterns

- **Events (Inngest):** payloads carry only IDs + `tenantId` + a correlation id (GitHub delivery id where applicable); functions re-fetch via repositories (don't trust fat payloads). Every function **idempotent** (dedupe keys: `gh_delivery_id`, `source_event_key`, `ship_update_id`). Steps are individually retried; side-effects (email) are last and guarded.
- **Revalidation:** mutations call `revalidatePath`/`revalidateTag` for affected RSC routes; live surfaces additionally poll via TanStack Query (`['feed', engagementId]`, `['queue', engagementId]`, `['notifications']`).
- **The publish gate is the only state transition that crosses the privacy boundary** — it is a single function; no other code sets `state='published'`.

### Process Patterns

- **Validation:** Zod at every boundary (Server Action input, Route Handler body, webhook payload, env). One schema per shape in `*.schema.ts`, shared by form + action.
- **Error handling:** expected → typed result + user copy from EXPERIENCE.md voice table; unexpected → throw → Sentry + a generic toast. GitHub failures → `RepoConnection.status='error'` + Cockpit banner (never block publish/feed — NFR-4).
- **Loading/empty/error states:** every async surface implements the EXPERIENCE.md State Patterns (skeleton cold-load, designed empties, degraded banner). No raw spinners-without-skeletons on primary surfaces.
- **Idempotency & retries:** assume duplicate webhook deliveries and Inngest retries; guard with dedupe keys and `WebhookEvent` ledger.

### Enforcement Guidelines — All agents MUST:
- Access the DB **only** through tenant-scoped repositories with a `TenantContext`; never import Drizzle in feature/UI code.
- Treat the **publish Server Action** as the sole candidate→published transition; never expose `raw_meta` to a Client query.
- Resolve the surface (Cockpit vs Portal) and Tenant from middleware/session, **never from client-supplied tenant/engagement ids** without an authz check.
- Use design tokens, not hex; honor the contrast guard server-side.
- Make every event handler idempotent.

**Anti-patterns (forbidden):** raw Drizzle in a React component or action; a second code path that publishes; selecting `raw_meta` in a Client query; trusting a client-passed `tenantId`; a websocket/SSE server (use polling in v1); storing long-lived GitHub tokens; floating-point money.

---

## Project Structure & Boundaries

### Complete Project Directory Structure

```
soloist/
├── README.md
├── package.json
├── next.config.ts
├── tsconfig.json
├── drizzle.config.ts
├── .env.local                      # local secrets (gitignored)
├── .env.example                    # documented env contract
├── .github/workflows/ci.yml        # typecheck · lint · migrate-check · build
├── drizzle/                        # generated SQL migrations (forward-only)
│   └── 0000_init.sql
├── e2e/                            # Playwright: invite→onboarding→feed, curate→publish→notify
├── public/                         # static assets (Soloist marks; Tenant logos live in Blob)
└── src/
    ├── middleware.ts               # Edge: host→surface/Tenant resolution; not-found rewrite
    ├── env.ts                      # Zod-validated environment contract
    ├── app/
    │   ├── globals.css             # Tailwind v4 @theme — DESIGN.md tokens + --tenant-accent
    │   ├── layout.tsx              # root
    │   ├── (cockpit)/              # soloist.cjjutba.com — Soloist-branded
    │   │   ├── layout.tsx
    │   │   ├── engagements/
    │   │   │   ├── page.tsx                     # FR-7 dashboard (candidate-count badge)
    │   │   │   └── [engagementId]/
    │   │   │       ├── page.tsx                 # detail: curation queue (FR-12)
    │   │   │       ├── repos/page.tsx           # FR-9 connections
    │   │   │       ├── client/page.tsx          # FR-5 invite/status
    │   │   │       └── documents/page.tsx       # FR-16–18 invoices
    │   │   ├── settings/branding/page.tsx       # FR-2 + contrast guard
    │   │   └── account/page.tsx
    │   ├── (portal)/               # <slug>.cjjutba.com — Tenant-branded, mobile-first
    │   │   ├── layout.tsx                       # sets --tenant-accent from Branding
    │   │   ├── onboarding/page.tsx              # FR-8 (one-time)
    │   │   ├── page.tsx                         # FR-14 Ship Feed (home)
    │   │   ├── documents/page.tsx               # FR-18 invoice view
    │   │   └── invite/[token]/page.tsx          # FR-5 accept + set password
    │   ├── not-found.tsx           # neutral; unknown subdomain / unauthorized (NFR-2)
    │   └── api/
    │       ├── auth/[...all]/route.ts           # Better Auth
    │       ├── webhooks/github/route.ts         # verify + dedupe + enqueue
    │       ├── inngest/route.ts                 # Inngest functions endpoint
    │       ├── feed/[engagementId]/route.ts     # polled published feed (scoped)
    │       └── notifications/route.ts           # polled in-app notifications
    ├── server/
    │   ├── db/
    │   │   ├── index.ts            # Neon+Drizzle client (the ONLY drizzle import site)
    │   │   ├── schema.ts           # all tables + enums + relations
    │   │   ├── context.ts          # TenantContext + RLS SET LOCAL helper
    │   │   └── repositories/       # tenant-scoped data access (engagements, ship-updates, …)
    │   ├── auth/                   # Better Auth config + org=Tenant + invite logic
    │   ├── tenancy/                # slug resolution, branding resolution, not-found
    │   ├── engagements/           # *.actions.ts · *.service.ts · *.schema.ts
    │   ├── github/                # App client, webhook verify, octokit (throttle+retry)
    │   ├── ship-feed/             # candidate mapping, curation, PUBLISH gate, SummarizationProvider
    │   ├── notifications/         # fan-out service, channel adapters
    │   ├── doc-engine/            # Invoice (DocumentType seam), numbering, PDF
    │   ├── branding/             # accent contrast guard, logo upload (Blob)
    │   └── inngest/               # client + functions (process-github-event, fanout-ship-published, reconcile-repos)
    ├── components/
    │   ├── ui/                    # shadcn primitives (unchanged)
    │   ├── cockpit/              # queue row, engagement row, repo card, invoice builder
    │   └── portal/               # ship-update card, onboarding hero, feed, notification center
    ├── emails/                    # React Email templates (branded: invite, ship-published, invoice-sent)
    └── lib/                       # shared utils, TanStack Query client, formatters, zod helpers
```

### Architectural Boundaries

- **API boundary:** Server Actions (mutations) + Route Handlers (webhook, Inngest, polled JSON, auth). No other public surface.
- **Data boundary:** `src/server/db/` is the sole Drizzle import site; all access via `repositories/` requiring `TenantContext`. RLS as DB-level backstop.
- **Integration boundary:** `src/server/github/` wraps Octokit; `src/server/notifications/` wraps Resend; `src/server/inngest/` owns the event bus. Swappable behind interfaces (`SummarizationProvider`, channel adapters, feed transport).
- **Component boundary:** `components/ui` (shadcn, never edited beyond brand tokens) vs feature components; portal vs cockpit never share a Tenant-accent context.

### Requirements → Structure Mapping

| Feature group (FRs) | Primary locations |
|---|---|
| Tenancy/Branding/Auth (FR-1–5) | `server/auth`, `server/tenancy`, `server/branding`, `middleware.ts`, `app/(portal)/invite`, `app/(cockpit)/settings/branding` |
| Engagements (FR-6–7) | `server/engagements`, `app/(cockpit)/engagements` |
| Onboarding (FR-8) | `app/(portal)/onboarding`, `components/portal` |
| Ship Feed + GitHub (FR-9–14) | `server/github`, `server/ship-feed`, `server/inngest`, `app/api/webhooks/github`, `app/(cockpit)/engagements/[id]`, `app/(portal)/page.tsx`, `app/api/feed` |
| Notifications (FR-15) | `server/notifications`, `server/inngest`, `emails/`, `app/api/notifications` |
| Doc Engine / Invoice (FR-16–18) | `server/doc-engine`, `app/(cockpit)/.../documents`, `app/(portal)/documents` |

### Integration Points & Data Flow

- **External:** GitHub (App + webhooks + Octokit reconciliation), Resend (email), Neon (DB), Vercel Blob (logos/PDFs), Inngest (events/cron), Sentry (errors).
- **Internal data flow (the moat):** GitHub webhook → `/api/webhooks/github` (verify+dedupe) → Inngest `github/event.received` → candidate `ShipUpdate` (SummarizationProvider) → Cockpit curation → **publish action** → Inngest `ship.published` → {in-app notification, Resend email} + Client poll surfaces it (≤~30s) → toast.

---

## Architecture Validation Results

### Coherence Validation ✅
- **Decision compatibility:** Next.js 16.2 + React 19.2 + Tailwind v4 + shadcn + Drizzle + Better Auth + Inngest + Resend + Neon + Vercel are a mutually compatible, current (June 2026), production stack — each verified. All are serverless/scale-to-zero, satisfying NFR-6 together.
- **Pattern consistency:** the tenant-scoped data layer, the single publish gate, Zod-at-boundaries, and Inngest idempotency reinforce each other; naming conventions are uniform DB↔TS↔routes↔events.
- **Structure alignment:** the directory tree enforces the boundaries (single Drizzle site, feature modules, portal/cockpit split) the decisions require.

### Requirements Coverage Validation ✅
- **Functional:** every FR-1–FR-18 maps to a named location and flow (see mapping table + subsystem designs). The candidate→published gate realizes FR-12/14; the GitHub pipeline realizes FR-9–11; the fan-out realizes FR-15; the Doc Engine realizes FR-16–18.
- **Non-functional:** **NFR-2** (data layer + RLS backstop + not-found-not-denied) · **NFR-3** (GitHub App no-stored-tokens, hashing, signature verify, encrypted secrets) · **NFR-4** (Inngest retries + manual fallback + reconciliation poll + degraded banner) · **NFR-5** (webhooks ≪5min, publish fan-out + ~20s poll ≤30s, RSC for ~2s mobile) · **NFR-6** (all-serverless free tiers) · **NFR-1/7** (RSC mobile-first + shadcn a11y + EXPERIENCE.md floor).

### Implementation Readiness Validation ✅
- Decisions documented with versions; patterns and the project tree are concrete; the data model and the five subsystem flows are specified; seams for the two known fast-follows (AI summaries, doc types) and the realtime upgrade are in place.

### Gap Analysis Results

**Critical gaps:** none open.

**CJ confirmations (2026-06-06):**
- ✓ **Postgres RLS from day one** — both the app-layer scoped data access **and** DB-level RLS ship from the first migration (NFR-2 has two enforced layers at launch).
- ✓ **Invoice PDF in v1** — Client gets the in-portal premium view **and** a downloadable branded PDF (`@react-pdf/renderer` + Vercel Blob).
- ✓ **Cockpit host = `soloist.cjjutba.com`** — confirmed (resolves PRD Open Q #8); `soloist` and other system subdomains added to the reserved-slug list.
- **Deferred by PRD (seams provided):** AI summarization engine (FR-11 fast-follow), real-time upgrade beyond polling, Vercel/Linear integrations, proposals/contracts, public demo-portal seeding (Open Q #4).

**Minor / future:** Redis/read-replica caching (not needed at launch); granular notification preferences (PRD says simple on/off v1); formal data-retention policy (PRD Open Q #7).

### Architecture Completeness Checklist

**Requirements Analysis**
- [x] Project context thoroughly analyzed
- [x] Scale and complexity assessed
- [x] Technical constraints identified
- [x] Cross-cutting concerns mapped

**Architectural Decisions**
- [x] Critical decisions documented with versions
- [x] Technology stack fully specified
- [x] Integration patterns defined
- [x] Performance considerations addressed

**Implementation Patterns**
- [x] Naming conventions established
- [x] Structure patterns defined
- [x] Communication patterns specified
- [x] Process patterns documented

**Project Structure**
- [x] Complete directory structure defined
- [x] Component boundaries established
- [x] Integration points mapped
- [x] Requirements to structure mapping complete

### Architecture Readiness Assessment

**Overall Status:** **READY FOR IMPLEMENTATION** — all 16 checklist items confirmed; no Critical Gaps open. All three earlier `[CONFIRM]` items are now resolved (CJ 2026-06-06): RLS day-one, Invoice PDF in v1, Cockpit host `soloist.cjjutba.com`.

**Confidence Level:** **High** — the stack is current and verified, the load-bearing requirement (NFR-2) has a concrete two-layer enforcement model, and the moat (GitHub→curation→publish→notify) has an end-to-end, idempotent, gracefully-degrading design.

**Key Strengths:**
- NFR-2 isolation has a single auditable choke point + a DB-level backstop.
- The privacy boundary is enforced in the type system (separate `raw_meta`), not just UI.
- The GitHub App + webhooks + reconciliation design is low-latency, rate-limit-safe, and self-healing (NFR-4/5).
- Every component is solo-operable and near-zero-cost (NFR-6); no always-on infra.
- Clean seams for the two known fast-follows and the realtime upgrade.

**Areas for Future Enhancement:** realtime transport (swap polling → Ably/Upstash behind the seam if scale demands); AI summaries; caching layer; granular notification preferences; multi-Engagement Clients.

### Implementation Handoff

**AI Agent Guidelines:**
- Follow these decisions and patterns exactly; the **tenant-scoped data layer** and the **single publish gate** are non-negotiable invariants.
- Use design tokens (DESIGN.md) and voice (EXPERIENCE.md); both spines win on conflict with any mock.
- Make every event handler idempotent; never expose `raw_meta`; never trust a client-supplied tenant/engagement id.

**First Implementation Priority:** run the starter init (Project Structure → init commands), commit the baseline, then build the **tenant-scoped data layer + schema** (sequence step 1) before any feature — everything depends on NFR-2 being correct first.

**Recommended next workflow:** `bmad-create-epics-and-stories` (break these subsystems into vertical, dogfood-first slices), then `bmad-sprint-planning` (sequence the 3-day sprints).
