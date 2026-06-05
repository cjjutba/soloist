---
stepsCompleted: [1, 2, 3, 4]
status: complete
completedAt: '2026-06-06'
inputDocuments:
  - "_bmad-output/planning-artifacts/prds/prd-soloist-2026-06-05/prd.md"
  - "_bmad-output/planning-artifacts/prds/prd-soloist-2026-06-05/addendum.md"
  - "_bmad-output/planning-artifacts/architecture.md"
  - "_bmad-output/planning-artifacts/ux-designs/ux-soloist-2026-06-05/DESIGN.md"
  - "_bmad-output/planning-artifacts/ux-designs/ux-soloist-2026-06-05/EXPERIENCE.md"
---

# Soloist - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for Soloist, decomposing the requirements from the PRD, the UX Design spines (DESIGN.md / EXPERIENCE.md), and the Architecture into implementable stories.

## Requirements Inventory

### Functional Requirements

**Tenancy, Branding & Authentication (FR-1–FR-5)**
- **FR-1:** Freelancer Sign-Up & Tenant Provisioning — sign up (email + password) provisions one Tenant; choose a Tenant slug (internal identifier, not URL-facing in v1); reject duplicate/invalid slugs; email verification before the Tenant is publicly reachable.
- **FR-2:** Per-Tenant Branding — set logo + accent color, rendered on Onboarding, Client Portal, and notification emails; neutral default until customized.
- **FR-3:** Surface Routing (path-based) — `/app` resolves the Cockpit and `/portal` the Client's Engagement (from session); unknown/unauthorized path → clear not-found (no leakage).
- **FR-4:** Authentication (both roles) — email + password for Freelancer and Client; passwords hashed; logout/expiry; requests resolve only within authorized Tenant/Engagement scope.
- **FR-5:** Client Invitation & Access — invite a Client by email (unique, expiring link); Client sets a password and enters the Engagement; one Client identity per Engagement (v1).

**Engagements (FR-6–FR-7)**
- **FR-6:** Create & Manage Engagement — create within a Tenant (name, client basics, scope); edit/archive; exactly one Ship Feed on creation; archive hides without deleting.
- **FR-7:** Engagement Dashboard (Cockpit) — list Engagements with status + last-activity + a count of unpublished candidate Ship Updates (the "needs attention" signal); open → detail view.

**Premium Client Onboarding (FR-8)**
- **FR-8:** Branded Onboarding Flow — first authenticated Client session routes through a branded Onboarding (Tenant logo + accent) before the Ship Feed; one-time (does not repeat).

**Ship Feed — GitHub Integration & Curation (FR-9–FR-14) — the moat**
- **FR-9:** Connect GitHub Repository — connect one or more repos to an Engagement; read-only least-privilege scope; connection status visible; disconnect.
- **FR-10:** Auto-Pull Repo Activity → Candidate Ship Updates — commits/PRs/releases become candidate Ship Updates in the curation queue within a few minutes; default status mapping (merged PR/release → ✅ Shipped; open PR/branch → 🚧 In Progress; planned → 📦 Next); candidates Freelancer-only.
- **FR-11:** Founder-Readable Rendering — plain-English title/summary + status tag; never raw SHAs/diffs to the Client; v1 heuristic/template, AI summaries fast-follow.
- **FR-12:** Curation & Publishing — review/edit candidate text + status, dismiss noise, publish; candidate not Client-visible until published; publishing surfaces it in the feed (FR-14) and fires Notifications (FR-15); no silent auto-publish.
- **FR-13:** Manual Ship Update (fallback) — author a Ship Update by hand (same tags + publish flow); works with no repo connected or GitHub down.
- **FR-14:** Client Ship Feed — live, chronological, status-tagged feed of published updates, newest first; filterable by status; never shows source/raw repo/unpublished candidates; new updates reflected near-real-time.

**Notifications (FR-15)**
- **FR-15:** Multi-Channel Notifications — on publish (and other key events: new Invoice, engagement start) send branded email + in-app notification + toast (if Client active); each links to its update/document; at most a simple per-Client on/off in v1.

**Doc Engine — Invoice (FR-16–FR-18)**
- **FR-16:** Create Invoice from Template — fill-in-the-blank Invoice prefilled with Engagement/Client data; captures line items, amounts, dates, notes; per-Tenant auto-numbering.
- **FR-17:** Shared Engagement/Client Data — data entered once is reused across documents; model extends to proposals/contracts (constraint, not a v1 feature).
- **FR-18:** Invoice Delivery & Manual Status — send/share; Client views in-portal; status Draft → Sent → Paid (Paid marked manually); shareable as in-portal view + PDF/export; no real-money processing.

### NonFunctional Requirements

- **NFR-1:** Responsive / Mobile — all surfaces usable on mobile + desktop; Client experience mobile-first.
- **NFR-2:** Multi-Tenant Isolation (LAUNCH BLOCKER) — no user reads/affects data outside their authorized Tenant/Engagement; every access tenant-scoped; cross-tenant → not-found, not denied-with-disclosure.
- **NFR-3:** Security — GitHub credentials encrypted/least-privilege; passwords hashed; session hardening; Client surface never exposes source/raw repo data.
- **NFR-4:** Reliability & Graceful Degradation — GitHub failures degrade gracefully (Freelancer informed; manual path always works); failed auto-pull never blocks publishing or already-published views.
- **NFR-5:** "Live" Performance — GitHub events → queue ~5 min; publish → Client feed + notifications ~30 s; Client Portal interactive ~2 s on mid-range mobile/4G.
- **NFR-6:** Cost (solo-operator) — serverless / free-or-cheap tiers; near-zero cost per Tenant at low volume; no dedicated ops.
- **NFR-7:** Accessibility — baseline (keyboard, contrast, semantic markup); not a formal WCAG 2.1 AA audit in v1.

### Additional Requirements

*From the Architecture (technical requirements that shape epics/stories):*

- **AR-1 — Starter scaffold (Epic 1, Story 1):** `create-next-app@latest` (Next.js 16.2, TS, Tailwind v4, App Router, `src/`, `@/*`) + `shadcn init` + core libs (Drizzle, Better Auth, Inngest, Resend/React Email, Zod, Octokit, TanStack Query, RHF, sonner, Vercel Blob). Commit baseline.
- **AR-2 — Env contract + Zod `env.ts`:** validated environment (`DATABASE_URL`, `BETTER_AUTH_SECRET`, `GITHUB_APP_*`, `RESEND_API_KEY`, `INNGEST_*`, `BLOB_READ_WRITE_TOKEN`).
- **AR-3 — Neon Postgres + Drizzle schema + drizzle-kit migrations** (entities per architecture data model; uuid v7 PKs; Postgres enums).
- **AR-4 — Tenant-scoped data-access layer (NFR-2 choke point):** all DB access via repositories requiring a `TenantContext`; no Drizzle import outside `src/server/db/`; cross-scope → empty/not-found.
- **AR-5 — Postgres RLS backstop (✓ day-one)** on every tenant-scoped table (per-request `SET LOCAL app.tenant_id` / `app.engagement_id` + `USING` policies) — defense-in-depth for NFR-2, shipped from the first migration alongside the app-layer scoping.
- **AR-6 — Better Auth (organization plugin):** Tenant = Organization, Freelancer = owner; email/password + verification; app-level `ClientAccess` for Engagement-scoped Client identities.
- **AR-7 — Path + session role guard:** `/app` → Cockpit (freelancer), `/portal` → Client Portal (Engagement+Tenant from session), `/invite/[token]` pre-auth; unknown/unauthorized → neutral not-found. Native Next path segments — no host routing.
- **AR-8 — GitHub App + webhooks (primary) + reconciliation cron (backstop):** signature-verified webhook handler; `WebhookEvent` idempotency ledger; Octokit with throttling/retry; least-privilege read-only.
- **AR-9 — Inngest event/jobs layer:** durable functions for `github/event.received`, `ship.published`, `invoice.sent` + scheduled `reconcile-repos`; idempotent steps; retries.
- **AR-10 — Feed transport = client polling** (TanStack Query, ~20s + refetch-on-focus) behind a swappable transport seam; meets ~30s at zero realtime cost.
- **AR-11 — Resend + React Email** branded templates (invite, ship-published, invoice-sent) with Tenant logo/accent props + email-accessibility rules.
- **AR-12 — Vercel Blob** for Tenant logos + generated Invoice PDFs.
- **AR-13 — `SummarizationProvider` seam** (heuristic v1, AI fast-follow) and **`DocumentType` seam** (Invoice v1, proposals/contracts later).
- **AR-14 — Server Actions for mutations, Route Handlers for IO boundaries** (webhook, Inngest, polled feed/notifications JSON, auth); Zod at every boundary; typed result contract.
- **AR-15 — Observability:** Sentry + Vercel logs + Inngest dashboard; correlation via GitHub delivery IDs.
- **AR-16 — CI/CD:** GitHub Actions (typecheck, lint, migration check, build) + Vercel preview/prod with Neon branch-per-PR.

### UX Design Requirements

*From DESIGN.md + EXPERIENCE.md (first-class inputs; each is story-specific):*

- **UX-DR1 — Design token system (Tailwind v4 `@theme`):** Warm Paper `#FBFAF8`, Soloist Ink `#1C1B1F`, warm `border`/`muted-foreground`; fixed status tokens (✅ `#15803D`/`#ECFDF3`, 🚧 `#92400E`/`#FEF6E7`, 📦 `#475569`/`#F1F5F9`); runtime `--tenant-accent` / `--tenant-accent-foreground` / `--tenant-accent-text`; soft radii (sm6/md10/lg14/xl20/full).
- **UX-DR2 — Typography:** Fraunces serif `display`/`display-sm` (premium moments only) + Geist Sans body (shadcn) + Geist Mono numeric (money/counts/timestamps).
- **UX-DR3 — Per-Tenant branding application:** Client Portal root sets `--tenant-accent` from Branding and re-scopes shadcn `--primary`; Cockpit never tenant-branded; neutral default (Soloist Iris `#5B5BD6` + monogram).
- **UX-DR4 — Branding contrast guard (3-way, server-enforced):** fill 4.5 / text 4.5 (decoupled `tenant-accent-text`, auto-darken) / non-text 3.0 (focus ring falls back to Ink); blocks save with an `aria-live` error + nearest passing shade.
- **UX-DR5 — Ship Update card** (hero object): status tag · plain-English title · 1–2 line summary · relative timestamp; read-only in feed, edit affordances in queue; never renders raw dev artifacts.
- **UX-DR6 — Status tag component** (3 fixed variants, emoji + text label always; editable segmented control in curation).
- **UX-DR7 — Curation queue row** (= Ship Update card in edit mode): inline-edit title/summary, status toggle, dismiss/hide, single-click Publish, bulk-select on `lg+`.
- **UX-DR8 — Engagement row + candidate-count badge** (Soloist Iris pill; absent at zero); status enum (Active/Paused/Completed/Archived) + "last-activity" (most recent of candidate pulled / published / invoice sent / client viewed); list sorts by last-activity then candidate count.
- **UX-DR9 — Repo Connection card** (4 states: connected / pulling / error / disconnected) mapped to shadcn Badge/Alert/Spinner.
- **UX-DR10 — Onboarding hero** (pure reassurance, no input): full-bleed Tenant-accent panel, logo, serif welcome, one orientation line, primary CTA; one-time (server flag).
- **UX-DR11 — Notification toast + notification center:** toast only when active; center lists published-update + invoice events, read/unread, links to target.
- **UX-DR12 — Invoice builder + premium in-portal view + branded PDF (✓ v1):** prefilled fields, `numeric` amounts, status chip; serif document feel; downloadable branded PDF (`@react-pdf/renderer` + Vercel Blob) alongside the in-portal view.
- **UX-DR13 — Designed empty states (5):** pre-first-publish feed, no Engagements, no repo connected, curation queue clear, no Invoices.
- **UX-DR14 — Error/degraded states:** GitHub-failure banner + repo error card, token-revoked, neutral not-found (unknown/unauthorized path), invite-expired, offline (Client feed).
- **UX-DR15 — Accessibility Floor:** keyboard/focus (trap+return, focus-to-`<h1>` on route change), `aria-live="polite"` feed announcements (no focus move), ≥44px Client / ≥24px Cockpit touch targets, shortcuts suppressed in inputs + `?` overlay, forms a11y (labels, `role="alert"` errors), `prefers-reduced-motion`, contrast thresholds (4.5 text / 3.0 non-text).
- **UX-DR16 — Voice & microcopy library:** plain-English, founder-friendly, momentum-positive; ✅/🚧/📦 vocabulary; per the EXPERIENCE.md Do/Don't table (feed, notifications, empties, errors, onboarding, invoice).
- **UX-DR17 — Responsive layouts:** Client Portal single-column mobile-first (`max-w-2xl`, never widens to a dashboard); Cockpit desktop-primary (sidebar → Sheet on small; bulk actions on `lg+`).
- **UX-DR18 — Cockpit interaction primitives:** keyboard curation (`j/k/e/1/2/3/p/x`, `⌘K`); inline-edit (click-to-edit, blur-to-save); Client Portal touch-first zero-learning.

### FR Coverage Map

- **FR-1** → Epic 1 — Freelancer sign-up + Tenant provisioning + slug.
- **FR-2** → Epic 1 — Per-Tenant Branding set + contrast guard (applied to surfaces as they ship).
- **FR-3** → Epic 1 — Path-based surface routing + neutral not-found.
- **FR-4** → Epic 1 — Email/password auth (both roles; Client login realized via the Epic 2 invite).
- **FR-5** → Epic 2 — Client invitation & engagement-scoped access.
- **FR-6** → Epic 2 — Create & manage Engagement.
- **FR-7** → Epic 2 — Engagement Dashboard (status, last-activity, candidate-count badge).
- **FR-8** → Epic 2 — Branded premium Onboarding.
- **FR-9** → Epic 3 — Connect GitHub repository.
- **FR-10** → Epic 3 — Auto-pull repo activity → candidate Ship Updates.
- **FR-11** → Epic 3 — Founder-readable rendering (heuristic v1).
- **FR-12** → Epic 3 — Curation & publishing (the privacy gate).
- **FR-13** → Epic 3 — Manual Ship Update (fallback).
- **FR-14** → Epic 3 — Client Ship Feed.
- **FR-15** → Epic 4 — Multi-channel notifications.
- **FR-16** → Epic 5 — Create Invoice from template.
- **FR-17** → Epic 5 — Shared Engagement/Client data reuse.
- **FR-18** → Epic 5 — Invoice delivery & manual status.

All 18 FRs mapped. NFRs and UX-DRs are cross-cutting and called out in each epic's implementation notes (NFR-2 isolation is built and proven in Epic 1).

## Epic List

### Epic 1: Freelancer Account & Branded Workspace
A dev-freelancer can sign up, claim an isolated Tenant (at `/app` on `soloist.cjjutba.com`), log in/out securely, and set their Branding (logo + accent with the contrast guard) — on a foundation where **no Tenant can ever read or affect another's data** (NFR-2, enforced at both the app layer and the database).
**FRs covered:** FR-1, FR-2, FR-3, FR-4.
**Delivers:** the multi-tenant foundation + a working, isolated, branded freelancer account (UJ-1 entry state). Standalone: a freelancer has a real account and workspace.
**Implementation notes:** starter scaffold (AR-1/2), schema + drizzle-kit migrations (AR-3), the **tenant-scoped data-access layer + Postgres RLS** (AR-4/5 — built and proven first), Better Auth with organization=Tenant (AR-6), path routing + auth/role guard (AR-7), the design-system foundation (UX-DR1/2 tokens + type) and Branding setup + 3-way contrast guard + application mechanism (UX-DR3/4). Cockpit shell at `/app`.
**Pre-mortem guardrails:** Story 1 = a **deployable walking skeleton** (single domain `soloist.cjjutba.com`, `/app` + `/portal` live on Vercel) so deploy + path routing + tenancy are proven end-to-end on day one; every Epic 1 story ships independently. Decide the **single-domain session + role guard explicitly** (one cookie domain; role+tenant re-checked server-side on every request — a Client's `/portal` session must never act on `/app`). `TenantContext` + RLS GUCs carry **both** `app.tenant_id` *and* `app.engagement_id`; the **isolation test suite includes the engagement-scoped Client case as a fixture from day one** (before the Client UI exists). Includes thin cross-cutting stories: Cockpit Account settings, observability/CI (AR-15/16).

### Epic 2: Engagements & the Premium Client Welcome
A freelancer can create and manage Engagements, invite a Client by email; the Client accepts, sets a password, and lands in a branded premium Onboarding that leads to their Ship Feed — the "you hired an agency" first impression, even before any GitHub data flows.
**FRs covered:** FR-5, FR-6, FR-7, FR-8.
**Delivers:** UJ-1 (stand up an engagement, invite client) + UJ-2 (Client's first branded entry). Standalone: a Client can be invited and reach a branded, empty-but-intentional portal.
**Implementation notes:** Engagement CRUD + Cockpit dashboard (status/last-activity/candidate-count badge shell — UX-DR8); tabbed Engagement-detail shell + Client tab; engagement-scoped Invitation + ClientAccess (FR-5); branded Onboarding hero, pure reassurance (UX-DR10); Client Portal shell + empty pre-first-publish feed state (UX-DR13); Branding applied to portal/onboarding (from Epic 1); mobile-first portal (UX-DR17).

### Epic 3: The Live Ship Feed — GitHub → Curate → Publish (the moat)
A freelancer connects GitHub repos to an Engagement, sees auto-pulled commits/PRs/releases as founder-readable candidate Ship Updates, curates them (edit, status-tag, dismiss) and publishes — and the Client sees a live, status-tagged Ship Feed of **only what's published**; a manual fallback always works.
**FRs covered:** FR-9, FR-10, FR-11, FR-12, FR-13, FR-14.
**Delivers:** the defensible core + UJ-4 (curate→publish) and the feed half of UJ-3. Standalone: the Client sees live curated progress (notifications come next).
**Implementation notes:** GitHub App + webhooks + Inngest pipeline + reconciliation cron (AR-8/9); heuristic SummarizationProvider (AR-13, FR-11); curation queue + status tag + publish gate (UX-DR5/6/7, the privacy boundary); repo connection card's 4 states (UX-DR9); Client feed via polling (AR-10); manual Ship Update (FR-13); degraded/error states + GitHub-failure banner (UX-DR14, NFR-4); near-real-time targets (NFR-5); `raw_meta` never exposed (NFR-2/3).
**Pre-mortem guardrails:** Story 1 = a **vertical moat spike** (GitHub App install → one webhook → one rendered candidate visible) to validate the pipeline + local-dev webhook tunneling *before* the full curation UI. **Minimal email-on-publish ships here** (the one load-bearing channel for UJ-3) so the feed is never dead during dogfood — the full notification center/toast/prefs come in Epic 4. **Founder-readable rendering is the dogfood kill-signal:** measure "% of candidates rewritten"; make the heuristic strong (conventional-commit `feat/fix` → "Added/Fixed", lean on PR titles, squash commit noise); keep the AI-summary seam hot as the first fast-follow. Story-slice to 3-day sprints (~8–10 stories expected).

### Epic 4: Notifications — the Momentum Loop
The moment something ships, the Client is notified — a branded email, an in-app notification, and a toast if they're active — each linking straight to the update; with a simple per-Client on/off.
**FRs covered:** FR-15.
**Delivers:** completes UJ-3 (momentum without lifting a finger). Standalone subsystem; also serves Epic 5's invoice-sent notification.
**Implementation notes:** builds on the minimal ship-published email shipped in Epic 3 — Epic 4 adds the full system: in-app **notification center + toast** (UX-DR11), polished branded React Email templates (AR-11) + email-accessibility rules (UX-DR15), the other event types (invoice-sent, engagement-start), and the per-Client **on/off** preference (FR-15). Inngest fan-out from `ship.published` / `invoice.sent`.

### Epic 5: Doc Engine — Invoices
A freelancer generates a branded Invoice prefilled from Engagement/Client data, sends it (the Client views it in-portal and downloads a branded PDF), and tracks status Draft → Sent → Paid manually — no re-typing, no payments.
**FRs covered:** FR-16, FR-17, FR-18.
**Delivers:** completes UJ-4 (turn work into client-ready proof *and bill for it*). Standalone given Engagement data (Epic 2) and notifications (Epic 4).
**Implementation notes:** Invoice builder + premium in-portal view + **branded PDF** via `@react-pdf/renderer` + Vercel Blob (UX-DR12, AR-12); per-Tenant numbering; shared-data reuse (FR-17) behind the `DocumentType` seam (AR-13); manual Draft→Sent→Paid; invoice-sent fires a notification (uses Epic 4).

### Sequencing & Risk Guardrails (pre-mortem)

Cross-epic hazards surfaced by a pre-mortem and the mitigations baked into the plan. These harden *sequencing within and across* epics without changing the 5 epics or FR coverage.

1. **Walking skeleton first (vs a foundation swamp).** Epic 1's heavy foundation risks weeks with nothing demoable, breaking the 3-day cadence. → Epic 1 Story 1 is a **deployable skeleton** (auth + `/app` + `/portal` live on Vercel); every Epic 1 story ships independently.
2. **De-risk the moat early.** The riskiest work (GitHub App + webhooks + Inngest + local-dev tunneling) is in Epic 3. → Epic 3 Story 1 is a **vertical spike** (install → webhook → one rendered candidate) before any curation chrome; consider a throwaway spike alongside Epic 1.
3. **Founder-readable rendering = the kill-signal.** The heuristic (AI deferred) must read like plain English or the trust wow (SM-2) and the no-busywork promise (SM-1) both fail. → Strong heuristic; measure "% candidates rewritten" in dogfood; AI-summary seam stays hot as the first fast-follow.
4. **Don't ship a dead feed.** Notifications in Epic 4 mean Epic 3's "live" feed would rely on the Client remembering to check. → **Minimal email-on-publish moves into Epic 3**; the full center/toast/prefs stay in Epic 4.
5. **Isolation must cover the engagement-scoped Client case from day one.** Tenant-level isolation is easy; the subtle cases (a Client scoped to one Engagement within CJ's own Tenant; single-domain session + role guard) leak if discovered late — the most dangerous refactor (NFR-2 is the launch blocker). → Epic 1 designs `TenantContext` + RLS GUCs for `tenant_id` **and** `engagement_id`, fixes the single-domain session + role guard, and ships an **isolation test suite covering the Client case before the Client UI exists**.
6. **Story sizing.** Epics 3 (and 1) are large. → Step 3 slices into small, independently shippable, single-context stories (Epic 3 ≈ 8–10).

---

## Epic 1: Freelancer Account & Branded Workspace

A dev-freelancer can sign up, claim an isolated Tenant (at `/app` on `soloist.cjjutba.com`), log in/out securely, and set their Branding — on a foundation where no Tenant can ever read or affect another's data (NFR-2, enforced at the app layer **and** the database). **Covers FR-1, FR-2, FR-3, FR-4.**

### Story 1.1: Deployable Walking Skeleton

As the builder,
I want the app scaffolded, themed, and deployed with both surfaces resolving by path,
So that deploy + path routing + the design system are proven end-to-end on day one and every later story layers onto something already shipping.

**Acceptance Criteria:**

**Given** a fresh repo
**When** the starter is initialized (`create-next-app` Next.js 16.2 + `shadcn init` + core libs per AR-1)
**Then** the app builds and runs locally with TypeScript strict, Tailwind v4, and the `@/*` alias
**And** `src/env.ts` validates required environment variables with Zod and fails fast when one is missing.

**Given** the deployed app on Vercel on the single domain `soloist.cjjutba.com`
**When** a request hits `GET /app`
**Then** the path/role guard resolves the Cockpit surface and renders a Cockpit shell
**And When** a request hits `GET /portal`, the guard resolves the Client-Portal surface (placeholder Tenant lookup) and renders a Portal shell
**And When** a request hits an unknown/unauthorized path, it renders the neutral `not-found` page (no disclosure).

**Given** the DESIGN.md token system
**When** `globals.css` is authored with the Tailwind v4 `@theme`
**Then** Warm Paper, Soloist Ink, the three status tokens, the runtime `--tenant-accent`/`--tenant-accent-text`, soft radii, and the Fraunces/Geist/Geist-Mono families are all defined as CSS variables (UX-DR1, UX-DR2).

### Story 1.2: Tenant-Scoped Data Layer + Postgres RLS (Isolation Core)

As the builder,
I want all database access routed through a tenant-scoped layer backed by Postgres RLS,
So that NFR-2 isolation is enforced at a single auditable choke point and at the database before any feature rides on it.

**Acceptance Criteria:**

**Given** Neon Postgres connected via Drizzle
**When** the initial migration runs (drizzle-kit)
**Then** the `users`, `tenants`, and `branding` tables exist with uuid-v7 PKs and `tenant_id` on tenant-owned tables
**And** RLS is enabled on every tenant-owned table with `USING (tenant_id = current_setting('app.tenant_id')::uuid)` policies.

**Given** the repository layer in `src/server/db/`
**When** any feature code needs data
**Then** it must call a repository that requires a `TenantContext` (`{ tenantId, userId, role, engagementId? }`) which opens a transaction and `SET LOCAL app.tenant_id` (and is built to also set `app.engagement_id`)
**And** Drizzle is importable only inside `src/server/db/` (verified by lint/convention).

**Given** the isolation test suite
**When** a query is attempted for a different Tenant's row
**Then** it returns empty (→ surfaced as not-found), proven by automated tests for both the app layer and a raw RLS check
**And** the suite is structured to add the engagement-scoped Client fixture as soon as Engagements exist (Epic 2).

### Story 1.3: Freelancer Sign-Up + Tenant Provisioning + Slug

As a dev-freelancer,
I want to sign up with email and password and claim my Tenant,
So that I get my own isolated branded workspace.

**Acceptance Criteria:**

**Given** the sign-up screen
**When** I register with email + password (Better Auth)
**Then** exactly one Tenant (Better Auth Organization) is created with me as owner, and my password is stored hashed (FR-1, FR-4)
**And** an email-verification step is required before my Tenant is active.

**Given** the slug picker
**When** I choose a Tenant slug
**Then** the system accepts the slug only if unique and valid (internal Tenant identifier; reserved system names still disallowed)
**And** duplicate/invalid/reserved slugs are rejected with a clear message.

### Story 1.4: Authentication, Sessions & Single-Domain Role Guard

As a Freelancer,
I want to log in and out securely with a single-domain session with a role guard,
So that my workspace is protected and a Client's portal session can never act on the Cockpit.

**Acceptance Criteria:**

**Given** a registered Freelancer
**When** I log in and later log out
**Then** a session is established and can be ended; sessions expire per policy (FR-4).

**Given** the single-domain session + role guard
**When** any request is served
**Then** role + Tenant are re-checked server-side on every request (never trusted from the cookie), so a `client`-role session presented to the Cockpit is rejected → not-found
**And** Cockpit routes are inaccessible without a `freelancer` session for the matching Tenant.

**Given** the role guard
**When** a request hits a guarded surface
**Then** `/app` requires a freelancer session for this Tenant, `/portal` requires a client session for this Engagement; mismatch/unauthorized → not-found (folds in the former Story 1.5).

### Story 1.5: Superseded — Tenant resolved from session

**Superseded by Story 1.4 (path-based course correction, 2026-06-06).** With single-domain path routing there is no subdomain to resolve — the Tenant/Engagement is taken authoritatively from the authenticated session, and unauthorized access returns not-found. That behavior is folded into Story 1.4's role guard. No separate story required.

### Story 1.6: Per-Tenant Branding + Contrast Guard

As a Freelancer,
I want to set my logo and accent color with a guard that keeps text readable,
So that my Client-facing surfaces feel like my own product without me shipping unreadable UI.

**Acceptance Criteria:**

**Given** the Branding settings screen
**When** I upload a logo and pick an accent color
**Then** the logo is stored in Vercel Blob, the accent is saved, and both apply via `--tenant-accent` on Client-facing surfaces; a neutral default (Soloist Iris + monogram) applies until customized (FR-2, UX-DR3).

**Given** the contrast guard (UX-DR4)
**When** I choose an accent
**Then** the save is blocked unless it passes all three checks — fill (white on accent ≥4.5), text (`tenant-accent-text` on Paper/white ≥4.5, auto-darkened if needed), non-text (≥3.0, else focus ring falls back to Ink)
**And** a failure surfaces as an `aria-live` error naming the nearest passing shade.

### Story 1.7: Cockpit Account Settings + Observability/CI Baseline

As a Freelancer (and the builder),
I want account settings and basic observability/CI in place,
So that I can manage my login and the project ships safely from day one.

**Acceptance Criteria:**

**Given** the Account screen
**When** I update my email or password
**Then** the change is applied via Better Auth with verification where appropriate.

**Given** the project
**When** code is pushed
**Then** GitHub Actions runs typecheck, lint, a drizzle-kit migration check, and build; Vercel deploys previews per PR (Neon branch) and prod on merge (AR-16)
**And** Sentry captures server + client errors (AR-15).

## Epic 2: Engagements & the Premium Client Welcome

A freelancer can create and manage Engagements, invite a Client by email; the Client accepts, sets a password, and lands in a branded premium Onboarding that leads to their Ship Feed — the "you hired an agency" first impression, before any GitHub data. **Covers FR-5, FR-6, FR-7, FR-8.**

### Story 2.1: Create & Manage Engagement

As a Freelancer,
I want to create and manage Engagements in my Tenant,
So that each client project has its own container for progress and documents.

**Acceptance Criteria:**

**Given** the Cockpit
**When** I create an Engagement (name, client basics, scope)
**Then** the `engagements` table is created/used, the Engagement belongs to my Tenant, and exactly one Ship Feed is associated on creation (FR-6)
**And** engagement-scoped RLS (`app.engagement_id`) policies and the **engagement-scoped isolation test fixture** are added now that Engagements exist (pre-mortem guardrail).

**Given** an existing Engagement
**When** I edit or archive it
**Then** edits persist and archiving hides it from the active list without deleting its history.

### Story 2.2: Engagement Dashboard

As a Freelancer,
I want to see all my Engagements at a glance,
So that I know where my attention is needed without opening each one.

**Acceptance Criteria:**

**Given** Engagements in my Tenant
**When** I open the Cockpit home
**Then** I see each Engagement with its status (Active/Paused/Completed/Archived) and last-activity (most recent of candidate pulled / published / invoice sent / client viewed), sorted by last-activity then candidate count (FR-7, UX-DR8).

**Given** the candidate-count badge component
**When** an Engagement has unpublished candidates
**Then** a Soloist-Iris badge shows the count (absent at zero) — reading 0/absent now, populating once Epic 3 produces candidates
**And** opening a row navigates to the tabbed Engagement-detail shell (curation queue · repos · client · documents).

### Story 2.3: Invite a Client (Engagement-Scoped)

As a Freelancer,
I want to invite my client by email,
So that they can securely access just their Engagement.

**Acceptance Criteria:**

**Given** an Engagement's Client tab
**When** I send an invite to the client's email
**Then** an `invitations` row is created with a unique, hashed, expiring token, and a branded transactional email (basic Resend send with my logo/accent) is delivered (FR-5)
**And** I can see invite state (not-sent / sent / accepted) and resend.

### Story 2.4: Client Accepts Invite & Sets Password

As an invited Client,
I want to accept my invite and set a password,
So that I can enter my Engagement's portal.

**Acceptance Criteria:**

**Given** a valid invite link on `soloist.cjjutba.com/invite/[token]`
**When** I set a password
**Then** a `client` User is created/linked, a `ClientAccess` row scopes me to that one Engagement, and I am logged in scoped to it (FR-5, FR-4)
**And** an expired/invalid token shows the branded "ask for a new link" state with no account disclosure.

### Story 2.5: Branded Premium Onboarding (One-Time)

As a Client,
I want a calm, branded welcome on my first visit,
So that I feel I hired an agency before I even see any updates.

**Acceptance Criteria:**

**Given** my first authenticated Client session
**When** I enter the portal
**Then** I'm routed through a one-screen branded Onboarding hero (Tenant logo + accent, serif welcome, one orientation line, primary CTA) — pure reassurance, no input (FR-8, UX-DR10)
**And** completing it sets a server-side flag and lands me on the Ship Feed; it never repeats on later sessions.

### Story 2.6: Client Portal Shell + Empty Ship Feed

As a Client,
I want a branded, intentional portal home even before any updates exist,
So that my first impression is premium, not a blank screen.

**Acceptance Criteria:**

**Given** the Client Portal post-Onboarding
**When** I view the home with no published updates yet
**Then** I see the calm empty state ("CJ is getting set up. Your first update will land here soon.") with the Tenant branding (UX-DR13)
**And** the portal is single-column mobile-first (`max-w-2xl`) with minimal nav (Updates · Documents · bell · avatar) and ≥44px touch targets (UX-DR17, UX-DR15).

## Epic 3: The Live Ship Feed — GitHub → Curate → Publish (the moat)

A freelancer connects GitHub repos to an Engagement, sees auto-pulled activity as founder-readable candidate Ship Updates, curates and publishes them — and the Client sees a live, status-tagged Ship Feed of only what's published; a manual fallback always works. **Covers FR-9, FR-10, FR-11, FR-12, FR-13, FR-14.**

### Story 3.1: Moat Spike — GitHub App → Webhook → One Candidate

As the builder,
I want one GitHub event to flow end-to-end into a rendered candidate,
So that the riskiest pipeline (App install, webhooks, local-dev tunneling, Inngest) is validated before any curation UI is built.

**Acceptance Criteria:**

**Given** a registered GitHub App (least-privilege read-only contents/metadata/pull_requests)
**When** I install it and a single qualifying event is delivered to `/api/webhooks/github`
**Then** the handler verifies the HMAC signature, records a `webhook_events` row (dedupe on `gh_delivery_id`), and emits an Inngest event; an unsigned/invalid delivery is rejected (AR-8, NFR-3).

**Given** the Inngest function
**When** it processes that event
**Then** it creates one candidate `ship_updates` row (table created here) with a basic heuristic title and `raw_meta` stored separately, visible to the Freelancer only
**And** the local-dev webhook path (tunnel) and Inngest dev server are documented and working.

### Story 3.2: Connect & Disconnect GitHub Repositories

As a Freelancer,
I want to connect one or more repos to an Engagement and see their status,
So that the right repositories feed this client's progress.

**Acceptance Criteria:**

**Given** an Engagement's Repo Connections tab
**When** I connect a repo via the installed App
**Then** a `repo_connections` row is created scoped to the Engagement, and the connection card shows one of four states — connected / pulling / error / disconnected (FR-9, UX-DR9).

**Given** a connected repo
**When** I disconnect it
**Then** it stops feeding the Engagement and the card reflects disconnected; multiple repos can feed one Engagement.

### Story 3.3: Auto-Pull Commits/PRs/Releases → Candidates

As a Freelancer,
I want repo activity to become candidate Ship Updates automatically,
So that I don't have to write status updates by hand.

**Acceptance Criteria:**

**Given** connected repos
**When** commits, PRs, or releases occur
**Then** qualifying events become candidate Ship Updates in my curation queue within ~5 minutes, each with a default status tag (merged PR/release → ✅ Shipped; open PR/active branch → 🚧 In Progress; planned → 📦 Next) (FR-10, NFR-5).

**Given** duplicate webhook deliveries or retries
**When** events are processed
**Then** idempotency (via `source_event_key`) prevents duplicate candidates
**And** a scheduled reconciliation job pulls anything missed by webhooks (rate-limit-aware) so latency holds even if a delivery drops (NFR-4).

### Story 3.4: Founder-Readable Rendering (Heuristic)

As a Client (served by the Freelancer),
I want updates in plain English,
So that I understand progress without reading dev jargon.

**Acceptance Criteria:**

**Given** the `SummarizationProvider` (heuristic v1)
**When** a candidate is rendered
**Then** it shows a plain-English title/summary (clean PR titles, conventional-commit `feat/fix` → "Added/Fixed", squashed commit noise) and never exposes SHAs/diffs/branches (FR-11, NFR-3).

**Given** the kill-signal instrumentation
**When** the Freelancer curates
**Then** the system can report "% of candidates edited before publish" so rendering quality is measurable
**And** the provider is swappable so AI summaries can replace the heuristic without UI changes (AR-13).

### Story 3.5: Curate Candidates (Edit, Status, Dismiss)

As a Freelancer,
I want to review, edit, re-tag, and dismiss candidates,
So that only meaningful, well-worded progress reaches my client.

**Acceptance Criteria:**

**Given** the curation queue
**When** I open a candidate
**Then** I can inline-edit its title/summary (click-to-edit, blur-to-save), cycle its status tag, and dismiss/hide it so it never reaches the Client (FR-12, UX-DR5/6/7).

**Given** keyboard primitives (UX-DR18)
**When** I work the queue
**Then** `j/k/e/1/2/3/x` operate it (suppressed while a field is focused), bulk-select is available on `lg+`, and the Engagement's candidate-count badge now reflects the real count.

### Story 3.6: Publish (the Privacy Gate) + Minimal Email-on-Publish

As a Freelancer,
I want publishing to be the single deliberate gate that reveals an update,
So that the client only ever sees what I chose to share, and they're pinged when I do.

**Acceptance Criteria:**

**Given** a curated candidate
**When** I publish it
**Then** the publish Server Action is the **only** path that flips `state=published`, sets `published_at`, bumps `last_activity_at`, and emits Inngest `ship.published` (FR-12)
**And** no candidate is Client-visible until published; `raw_meta` is never selectable by a Client query (NFR-2/3).

**Given** `ship.published`
**When** the fan-out runs
**Then** an in-app `notifications` row is created and a minimal branded email is sent to the Client (reusing Epic 2's Resend setup) within ~30 s, so the feed is never silently dead (NFR-5; full center/toast/prefs in Epic 4)
**And** if the email fails, publish still succeeds and the Freelancer gets a retry toast (NFR-4).

### Story 3.7: Client Ship Feed (Live via Polling)

As a Client,
I want a live, status-tagged feed of published updates,
So that I see momentum the moment it happens, on my phone.

**Acceptance Criteria:**

**Given** published updates on my Engagement
**When** I view the Ship Feed
**Then** I see only published updates newest-first as Ship Update cards (status tag + plain title + summary + relative time), filterable by status (FR-14, UX-DR5)
**And** I never see source code, raw repo contents, candidates, or another Engagement's data.

**Given** the polling transport (AR-10)
**When** a new update is published while I'm viewing
**Then** the feed refreshes within ~30 s (TanStack Query ~20s + on-focus), announces via `aria-live="polite"` without moving focus, and honors reduced-motion (NFR-5, UX-DR15).

### Story 3.8: Manual Ship Update (Fallback)

As a Freelancer,
I want to write a Ship Update by hand,
So that I can keep my client informed even with no repo connected or GitHub down.

**Acceptance Criteria:**

**Given** any Engagement (repo or not)
**When** I author a manual Ship Update (title, summary, status)
**Then** it supports the same status tags and publish flow as auto-pulled ones (FR-13)
**And** it works when no repo is connected or GitHub integration is unavailable (NFR-4).

### Story 3.9: GitHub Degraded & Error States

As a Freelancer,
I want clear signals when GitHub integration has trouble,
So that I'm never silently blind and my client's view is never affected.

**Acceptance Criteria:**

**Given** a GitHub failure (rate limit, outage, revoked token)
**When** it occurs
**Then** the Cockpit shows a non-blocking banner and the repo card enters its error state with `last_error`; auto-updates pause but publishing and the Client's already-published feed are unaffected (FR-9, NFR-4, UX-DR14).

**Given** a revoked token
**When** I view the repo
**Then** I see "GitHub access was revoked. Reconnect to resume auto-pull," and the manual path remains available.

## Epic 4: Notifications — the Momentum Loop

The moment something ships, the Client is notified — branded email, in-app notification, and a toast if active — each linking straight to the update, with a simple on/off. Builds on the minimal email shipped in Epic 3. **Covers FR-15.**

### Story 4.1: In-App Notification Center

As a Client,
I want an in-app inbox of my updates,
So that I can catch up on what shipped in one place.

**Acceptance Criteria:**

**Given** notifications created on publish (Epic 3)
**When** I open the bell
**Then** I see a notification center listing published-update events newest-first with read/unread state, each linking to its Ship Update (FR-15, UX-DR11)
**And** unread counts update via the same polling as the feed.

### Story 4.2: Toast on Publish When Active

As a Client,
I want a gentle toast when an update lands while I'm in the app,
So that I notice momentum in real time without it being intrusive.

**Acceptance Criteria:**

**Given** I am active in the portal
**When** a Ship Update is published on my Engagement
**Then** a non-blocking toast appears linking to the update; it does not appear when I'm inactive (FR-15)
**And** the toast respects reduced-motion and is dismissible.

### Story 4.3: Polished Branded Email Templates + Email Accessibility

As a Client,
I want the emails I receive to look like my freelancer's brand and be readable anywhere,
So that even my inbox feels premium and works with images off.

**Acceptance Criteria:**

**Given** React Email templates (AR-11)
**When** a ship-published or invite email is sent
**Then** it renders the Tenant logo + accent (upgrading Epic 3's minimal email), with logo `alt`, emoji+label status surviving images-off, pinned inline backgrounds for dark-mode clients, and semantic headings (FR-15, UX-DR15).

### Story 4.4: Other Events + Per-Client Notification Preference

As a Client,
I want notifications for key events and a simple way to turn them off,
So that I stay informed on my terms.

**Acceptance Criteria:**

**Given** key Engagement events
**When** an engagement starts or (from Epic 5) an Invoice is sent
**Then** the corresponding notification fires through the same fan-out (FR-15).

**Given** my notification preference
**When** I toggle notifications off
**Then** no further notifications are sent to me until I turn them back on (simple per-Client on/off; no granular per-channel prefs in v1).

## Epic 5: Doc Engine — Invoices

A freelancer generates a branded Invoice prefilled from Engagement/Client data, sends it (Client views it in-portal and downloads a branded PDF), and tracks status Draft → Sent → Paid manually — no re-typing, no payments. **Covers FR-16, FR-17, FR-18.**

### Story 5.1: Create Invoice from Template (Prefilled, Shared Data)

As a Freelancer,
I want to generate an Invoice prefilled with my client's data,
So that I bill without re-typing anything.

**Acceptance Criteria:**

**Given** an Engagement's Documents tab
**When** I create an Invoice
**Then** the `invoices` table is created/used, the Invoice prefills Engagement/Client data (FR-17), captures line items/amounts/dates/notes, and is auto-numbered per Tenant (FR-16, UX-DR12)
**And** the Doc Engine is built around a `DocumentType` seam so proposals/contracts can extend it later without re-typing (AR-13).

**Given** money fields
**When** amounts are entered and displayed
**Then** they use integer minor units + currency and format via `Intl.NumberFormat` (no float math), rendered in the `numeric` token.

### Story 5.2: Send Invoice + Client View + Manual Status

As a Freelancer,
I want to send an Invoice and track its status,
So that my client can see it and I can mark it paid.

**Acceptance Criteria:**

**Given** a Draft Invoice
**When** I send it
**Then** its status becomes Sent, an `invoice.sent` notification fires (via Epic 4), and the Client can view it in-portal as a premium document (FR-18, UX-DR12).

**Given** a Sent Invoice
**When** the client pays me out-of-band
**Then** I can mark it Paid manually; status transitions are Draft → Sent → Paid only; there is no payment processing in the product (FR-18, §11).

### Story 5.3: Branded Invoice PDF Export

As a Client,
I want to download a branded PDF of my Invoice,
So that I have a clean record for my own books.

**Acceptance Criteria:**

**Given** a Sent or Paid Invoice
**When** I download it
**Then** a branded PDF (Tenant logo/accent, serif document feel) is generated server-side via `@react-pdf/renderer`, stored in Vercel Blob, and downloadable from the in-portal view (FR-18, UX-DR12, AR-12).
