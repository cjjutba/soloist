---
title: Soloist
status: final
created: 2026-06-05
updated: 2026-06-05
---

# PRD: Soloist
*Run solo. Deliver like an agency.*

## 0. Document Purpose

This PRD is for CJ (the builder and primary user), the downstream BMad workflows that consume it (UX, architecture, epics & stories, sprint planning), and any future contributor. It builds on the **Product Brief** (`_bmad-output/planning-artifacts/briefs/brief-soloist-2026-06-05/`) — it does not duplicate it. Vocabulary is anchored in the **Glossary (§5)**; every Feature, Journey, and Metric uses those terms verbatim. Features are grouped with globally numbered Functional Requirements (FR-N) nested under them so downstream artifacts have stable references. Inferred decisions are tagged inline `[ASSUMPTION: …]` and collected in the **Assumptions Index (§15)** for explicit confirmation. Technology choices (Next.js, Tailwind, shadcn/ui, Neon Postgres, Drizzle/Prisma, Vercel) and integration mechanisms live in the companion **`addendum.md`**, not here — this PRD defines *what*, not *how*.

**Scope decision (this PRD):** the full brief-v1 is captured as the MVP. The 3-day-sprint sequencing and "ship the earliest slice first" plan are deliberately **not** in this document — they are the job of `bmad-sprint-planning` downstream.

## 1. Vision

Soloist is a dev-native client portal that lets a solo product engineer operate like a full agency. When a freelancer starts an engagement, their client lands in a premium, branded onboarding and then watches a live "what shipped" window that auto-populates from the developer's real tools — GitHub in v1 — rendered as plain-English progress a non-technical founder actually understands. The client always sees momentum and never has to ask *"any updates?"*. Meanwhile the freelancer runs the engagement and sends fill-in-the-blank documents (invoice in v1) from a single cockpit — under their own brand on `soloist.cjjutba.com`.

This matters because clients pay *before* they receive, and that gap breeds anxiety that erodes trust — the thing that costs solo freelancers their repeat business and referrals. Soloist closes the trust and legitimacy gaps with transparency that's automatic, not manual.

The defensible edge is narrow and real: **dev-native is the moat.** Soloist auto-pulls "what shipped" from a developer's actual tools, while every incumbent is integrated with *creative* tools (Figma, Loom) and relies on manual updates. Onboarding polish is the entry; the live Ship Feed is the retention hook; dev-tool integration is the thing that's hard to copy. A *generic* Soloist would be DOA — the niche, the speed, and the integrations are the product.

**The longer arc.** The flywheel: CJ dogfoods Soloist on his own clients → other dev-freelancers adopt and brand their own Tenants → their clients' experiences become proof → Soloist becomes the default "client window" for independent builders. In two to three years it is the **transparency layer for independent software work** — wired into every dev tool, AI-summarizing progress, the thing a founder *expects* when they hire a solo engineer — and the living centerpiece of CJ's portfolio proving "idea → shipped in weeks." v1 earns the right to that arc; it does not assume it.

## 2. Why Now

Timing is load-bearing, not incidental:
- **Incumbents raised prices in 2025** (HoneyBook and others) while staying creative-tool-centric and manual — opening room for a lean, dev-native entrant.
- **AI just made commit/PR → client-readable progress trivial**, turning the previously-manual "status update" into something that can auto-generate from a developer's real activity.
- The **solo product-engineer niche is genuinely underserved** — every serious portal skews creative-agency, photographer, or productized-SEO. None speak "shipped a feature / deployed / merged PR" natively.

## 3. Target User

### 3.1 Jobs To Be Done

**The Freelancer (primary user — CJ is user #1):**
- *Functional:* Run a client engagement end-to-end — show progress, send documents — from one place, without stitching tools together.
- *Functional:* Eliminate status-update busywork; never re-type the same client/scope/rate data across documents.
- *Social:* Look agency-grade and legitimate to a founder, not like a scattered trail of Slack messages and ad-hoc invoices.
- *Emotional:* Feel in control and proud of the client-facing experience; spend hours building, not coordinating.

**The Client (the other side — non-technical/semi-technical founder):**
- *Emotional:* Feel confident the money was well spent — *see* progress without having to chase it.
- *Functional:* Understand "what's happening" in plain language, on any device, the moment it happens.
- *Social:* Trust this person enough to rehire them and refer them.

### 3.2 Non-Users (v1)

- **Creative/non-dev freelancers** (designers, photographers, marketers) — Soloist's moat is dev-tool integration; they are served by existing creative-centric portals.
- **Agencies / multi-person teams** — multi-seat collaboration is out of v1. `[ASSUMPTION]` small 2–3 person dev studios are a *later* audience, not a v1 target.
- **Clients wanting to pay through the portal** — no real-money processing in v1 (see §11 Non-Goals).

### 3.3 Key User Journeys

- **UJ-1. CJ stands up a new engagement in minutes.**
  - **Persona + context:** CJ, a solo full-stack product engineer, just closed a new founder client and wants the portal live before the kickoff call.
  - **Entry state:** Authenticated in the Cockpit on his Tenant.
  - **Path:** Creates an Engagement → enters the client's basics → connects the project's GitHub repo (Repo Connection) → invites the client by email.
  - **Climax:** The Engagement shows "connected," the first candidate Ship Updates have already pulled in from recent commits, and the invite is sent.
  - **Resolution:** CJ curates a first update or two and the client is one click away from a branded experience.

- **UJ-2. Maya, a non-technical founder, opens her portal for the first time.**
  - **Persona + context:** Maya runs a pre-seed startup, paid CJ upfront, and is quietly anxious about whether the work is real.
  - **Entry state:** Receives an invite email, clicks the link (`soloist.cjjutba.com/invite/<token>`), sets a password, and lands on the branded `/portal`.
  - **Path:** Branded premium Onboarding (CJ's logo + accent color) orients her → she arrives at the Ship Feed.
  - **Climax:** She immediately sees ✅ *"Set up the authentication system"* and 🚧 *"Building the dashboard"* in plain English — proof, on day one, that she hired someone who operates like an agency.
  - **Resolution:** She closes the tab reassured; she did not have to ask a single question.

- **UJ-3. Maya feels momentum without lifting a finger.**
  - **Persona + context:** Mid-engagement, Maya is heads-down on her own work.
  - **Entry state:** Not in the app.
  - **Path:** Gets a notification — *"New update from CJ"* (email + in-app + toast next time she's active) → taps through on her phone → reads the plain-English Ship Update.
  - **Climax:** She sees ✅ *"Shipped the onboarding flow"* and feels the dopamine of visible progress.
  - **Resolution:** Her "any updates?" message never gets typed. Trust compounds.

- **UJ-4. CJ turns a day of commits into client-ready proof — and bills for it.**
  - **Persona + context:** CJ finishes a build session with a dozen commits and a merged PR.
  - **Entry state:** Authenticated in the Cockpit, Engagement open.
  - **Path:** Sees auto-pulled candidate Ship Updates in his curation queue → edits one title into plainer English, drops the noise, sets statuses → publishes the meaningful ones → opens the Doc Engine and generates an Invoice prefilled with the client's data.
  - **Climax:** The Client's Ship Feed lights up with curated progress and an Invoice goes out — all without re-typing client details or writing a status report.
  - **Resolution:** CJ is back to building in minutes; the engagement looks agency-grade.

## 4. Information Architecture

Two role-keyed experiences on a **single domain** (`soloist.cjjutba.com`), resolved by **path + authenticated role** (revised 2026-06-06; see Sprint Change Proposal):

- **Cockpit (Freelancer) —** served at **`/app/*`**; the freelancer's Tenant is resolved from the authenticated session.
  - Engagements list → Engagement detail (Ship Feed curation queue · Repo Connections · Client management · Documents/Invoices) → Tenant & Branding settings → Account.
- **Client Portal (Client) —** served at **`/portal/*`**, fully branded; the Client's Engagement + Tenant (branding) are resolved from the authenticated session.
  - First-run Onboarding → Engagement home (Ship Feed) → Documents (Invoices). Deliberately minimal navigation; the Ship Feed is the center of gravity.
- **Invite/onboarding —** **`/invite/[token]`** (pre-auth); the Tenant (for branding) is resolved from the invite token.

A per-freelancer **custom domain** (`portal.theiragency.com`) is a deferred upgrade, not v1 — dynamic per-Tenant subdomains would require Vercel nameserver delegation that risks the operator's live email on `cjjutba.com`, and the premium experience lives in the branded UI, not the hostname. Both experiences are responsive and fully usable on mobile (a constraint, not a feature — see §10).

## 5. Glossary

*Downstream workflows and readers must use these terms exactly. Introducing a synonym anywhere in the PRD is a discipline violation.*

- **Tenant** — A single Freelancer's branded workspace. One Freelancer owns one Tenant. Has an internal `slug` identifier (reserved for future custom domains; **not URL-facing in v1** — see FR-3). Contains many Engagements.
- **Freelancer** — The primary user; the solo product engineer who owns a Tenant and runs Engagements. Operates in the Cockpit.
- **Client** — The founder/operator on the receiving side of an Engagement. Operates in the Client Portal. One Client per Engagement (v1).
- **Engagement** — The unit of work between a Freelancer and a Client (a project). Belongs to one Tenant, has one Client, one Ship Feed, zero-or-more Repo Connections, and zero-or-more Invoices.
- **Cockpit** — The Freelancer's management interface (the engine).
- **Client Portal** — The Client-facing branded experience (the premium experience).
- **Branding** — Per-Tenant logo + accent color applied to all Client-facing surfaces and notification emails.
- **Onboarding** — The premium, branded first-run flow a Client experiences before reaching the Ship Feed.
- **Repo Connection** — A linked GitHub repository that feeds an Engagement's Ship Feed.
- **Ship Feed** — The chronological stream of published, client-readable progress updates for an Engagement. One per Engagement.
- **Ship Update** — A single entry in a Ship Feed. Status-tagged: ✅ **Shipped** · 🚧 **In Progress** · 📦 **Next**. Originates from a Repo Connection (auto) or is authored manually. A Ship Update is either a *candidate* (visible only to the Freelancer) or *published* (visible to the Client).
- **Curation** — The Freelancer's act of reviewing, editing, status-tagging, hiding, and publishing candidate Ship Updates.
- **Doc Engine** — The fill-in-the-blank document generator that reuses Engagement/Client data. Produces Invoices in v1.
- **Invoice** — The v1 Doc Engine document type. No real-money processing; status is tracked manually.
- **Notification** — An alert delivered via email + in-app + toast, triggered by a published Ship Update and other key Engagement events.

## 6. Features

### 6.1 Tenancy, Branding & Authentication

**Description:** The multi-tenant foundation. Any dev-freelancer can sign up, get their own branded workspace (a Tenant) at `/app`, and invite clients — all isolated from every other Tenant. Email + password auth for both roles. Realizes UJ-1, UJ-2.

#### FR-1: Freelancer Sign-Up & Tenant Provisioning
A Freelancer can sign up with email + password, which provisions a new Tenant. Realizes UJ-1.
**Consequences (testable):**
- Successful sign-up creates exactly one Tenant owned by the Freelancer.
- The Freelancer chooses a Tenant slug (an internal identifier, reserved for future custom domains — not URL-facing in v1); the system rejects duplicates and invalid slugs.
- `[ASSUMPTION]` Email verification is required before the Tenant is publicly reachable.

#### FR-2: Per-Tenant Branding
A Freelancer can set Branding (logo + accent color) applied across all Client-facing surfaces. Realizes UJ-2.
**Consequences (testable):**
- The uploaded logo and accent color render on Onboarding, the Client Portal, and notification emails.
- A neutral default Branding applies until customized.

#### FR-3: Surface Routing (path-based) *(revised 2026-06-06)*
The Cockpit and Client Portals are served by **path** on the single domain `soloist.cjjutba.com`, resolved with the authenticated session.
**Consequences (testable):**
- `/app/*` resolves the Cockpit for the authenticated Freelancer (their Tenant); `/portal/*` resolves the Client's Engagement and applies that Tenant's Branding.
- An unknown path — or access to an Engagement the user is not authorized for — returns a clear not-found state (no leakage of other Tenants).

#### FR-4: Authentication (both roles)
A Freelancer and a Client can each authenticate with email + password.
**Consequences (testable):**
- Passwords are stored hashed; plaintext is never persisted.
- Sessions can be ended (logout) and expire per policy.
- A request only resolves resources within the authenticated user's authorized Tenant/Engagement scope (see NFR-2 isolation).

#### FR-5: Client Invitation & Access
A Freelancer can invite a Client to an Engagement by email; the Client sets a password and enters that Engagement. Realizes UJ-2.
**Consequences (testable):**
- An invite generates a unique, expiring link.
- Accepting the invite creates a Client account scoped to that Engagement's Tenant.
- `[ASSUMPTION]` One Client identity per Engagement in v1.

### 6.2 Engagements

**Description:** The core object that everything hangs off. A Freelancer creates and manages Engagements from the Cockpit; each is the container for a Ship Feed, Repo Connections, a Client, and Invoices. Realizes UJ-1, UJ-4.

#### FR-6: Create & Manage Engagement
A Freelancer can create an Engagement within their Tenant and edit/archive it.
**Consequences (testable):**
- An Engagement captures at least a name, the Client's basics, and a scope/description. `[ASSUMPTION]` exact field set.
- Each Engagement has exactly one Ship Feed on creation.
- Archiving hides an Engagement from the active list without deleting its history.

#### FR-7: Engagement Dashboard (Cockpit)
A Freelancer sees all Engagements at a glance and can triage where attention is needed.
**Consequences (testable):**
- The Cockpit lists Engagements with status and last-activity.
- Each Engagement row surfaces a **count of unpublished candidate Ship Updates awaiting Curation** (the "needs attention" signal) so the Freelancer knows where to act without opening each Engagement.
- Opening an Engagement navigates to its detail view (curation queue, connected repos, Client status, Invoices).

### 6.3 Premium Client Onboarding

**Description:** The wedge — the "you hired an agency" tone from minute one. On first entry the Client moves through a polished, branded flow before reaching the Ship Feed. Realizes UJ-2.

#### FR-8: Branded Onboarding Flow
On first entry, a Client is routed through a branded Onboarding before reaching the Engagement home.
**Consequences (testable):**
- A Client's first authenticated session routes through Onboarding before the Ship Feed.
- Onboarding renders the Tenant's Branding (logo + accent).
- Completing Onboarding lands the Client on the Ship Feed; it does not repeat on later sessions.
- `[ASSUMPTION]` v1 requires at minimum a branded welcome + orientation to the Ship Feed. [NOTE FOR PM] "what makes it *premium*, concretely" is a UX-phase deliverable — this FR fixes the behavior, not the visual spec.

### 6.4 Ship Feed — GitHub Integration & Curation *(the moat)*

**Description:** The defensible core. Soloist auto-pulls activity from connected GitHub repos, renders it as founder-readable candidate Ship Updates, and lets the Freelancer curate and publish what the Client sees — with a manual fallback that always works. Realizes UJ-1, UJ-3, UJ-4.

#### FR-9: Connect GitHub Repository
A Freelancer can connect one or more GitHub repositories to an Engagement.
**Consequences (testable):**
- Authorization uses `[ASSUMPTION]` read-only repo scope (least privilege); mechanism (GitHub App vs OAuth, webhook vs poll) is decided in architecture (addendum).
- Multiple Repo Connections can feed one Engagement.
- Connection status is visible; a Freelancer can disconnect a repo.

#### FR-10: Auto-Pull Repo Activity → Candidate Ship Updates
The system pulls commits, PRs, and releases from connected repos and creates candidate Ship Updates in the Freelancer's curation queue. Realizes UJ-4.
**Consequences (testable):**
- A new qualifying GitHub event produces a candidate Ship Update within `[ASSUMPTION]` a few minutes of occurring.
- Each candidate carries a default status tag. `[ASSUMPTION]` default mapping: merged PR / release → ✅ Shipped; open PR / active branch → 🚧 In Progress; planned items → 📦 Next.
- Candidates are visible only to the Freelancer until published (see FR-12).

#### FR-11: Founder-Readable Rendering
Candidate Ship Updates are presented in plain English a non-technical founder understands — not raw commit messages.
**Consequences (testable):**
- A Ship Update displays a human-readable title/summary + status tag; it never shows raw SHAs or diffs to the Client.
- `[ASSUMPTION]` v1 rendering is template/heuristic-based (e.g. PR-title cleanup); **AI commit→plain-English summarization is fast-follow** (see §14 Open Questions). [NOTE FOR PM] this is the "AI in v1 or not" fork carried from the brief.

#### FR-12: Curation & Publishing
A Freelancer reviews candidate Ship Updates, edits text/status, hides noise, and publishes the ones the Client should see. Realizes UJ-4.
**Consequences (testable):**
- A candidate is NOT visible to the Client until the Freelancer publishes it.
- The Freelancer can edit a candidate's title/summary and change its status tag before publishing.
- The Freelancer can dismiss/hide a candidate so it never reaches the Client.
- Publishing makes the update appear in the Client Ship Feed (FR-14) and triggers Notifications (FR-15).
- `[ASSUMPTION]` Curation is required in v1 (no silent auto-publish) to protect client-facing quality.

#### FR-13: Manual Ship Update (fallback)
A Freelancer can author a Ship Update manually, independent of any Repo Connection. Realizes UJ-4.
**Consequences (testable):**
- A manual Ship Update supports the same status tags and publishing flow as auto-pulled ones.
- It works when no repo is connected or when GitHub integration is unavailable (graceful degradation — see NFR-4).

#### FR-14: Client Ship Feed
A Client sees a live, chronological, status-tagged Ship Feed of published updates for their Engagement. Realizes UJ-3.
**Consequences (testable):**
- The feed shows only *published* Ship Updates, newest first; `[ASSUMPTION]` filterable/groupable by status tag.
- The Client never sees source code, raw repo contents, or unpublished candidates.
- New published updates are reflected `[ASSUMPTION]` on next load / near-real-time (real-time vs refresh decided in architecture).

### 6.5 Notifications

**Description:** The dopamine of visible progress — the moment something ships, the Client knows. Realizes UJ-3.

#### FR-15: Multi-Channel Notifications
A Client is notified via email + in-app + toast when a Ship Update is published and on other key Engagement events.
**Consequences (testable):**
- Publishing a Ship Update sends a branded email, creates an in-app notification, and shows a toast if the Client is active.
- Each notification links to the relevant Ship Update or document.
- `[ASSUMPTION]` Other key events also notify (new Invoice sent, engagement start).
- `[ASSUMPTION]` v1 offers at most a simple per-Client on/off; granular per-channel preferences are out of v1.

### 6.6 Doc Engine — Invoice

**Description:** The busywork killer. One fill-in-the-blank template (Invoice in v1) that reuses Engagement/Client data so nothing is re-typed — architected to extend to proposals and contracts later. Realizes UJ-4.

#### FR-16: Create Invoice from Template
A Freelancer can generate an Invoice from a fill-in-the-blank template prefilled with Engagement/Client data.
**Consequences (testable):**
- The Invoice prefills Client/Engagement data so it is not re-typed.
- The Invoice captures `[ASSUMPTION]` line items, amounts, dates, and notes.
- `[ASSUMPTION]` Invoice numbering is auto-assigned per Tenant.

#### FR-17: Shared Engagement/Client Data
Data entered once (client name, scope, rate) is reused across documents.
**Consequences (testable):**
- Updating Engagement/Client data updates the source used by newly generated documents.
- The data model supports extending to proposals/contracts (fast-follow) without re-typing. `[ASSUMPTION]` extension is a design constraint, not a v1 feature.

#### FR-18: Invoice Delivery & Manual Status *(no real payments)*
A Freelancer can send/share an Invoice; the Client views it in the Client Portal; status is tracked manually.
**Consequences (testable):**
- The Client can view the Invoice in their portal; sending an Invoice fires a Notification (FR-15).
- Status transitions Draft → Sent → Paid, where **Paid is marked manually** by the Freelancer.
- `[ASSUMPTION]` The Invoice is shareable as an in-portal view plus PDF/export or link.
- **Out of Scope:** real-money processing, deposits, retainer auto-billing (see §11).

## 7. Aesthetic & Tone

Load-bearing, because "premium" *is* the wedge.

- **Feel:** "You hired an agency." Polished, confident, calm, trustworthy. Per-Tenant Branding makes the experience feel like *the Freelancer's own product*, not a third-party SaaS.
- **Voice of product-generated text** (Ship Updates, notifications, onboarding copy): plain-English, founder-friendly, momentum-positive but honest. No dev jargon, no raw commit language. Status communicated with the ✅ / 🚧 / 📦 vocabulary.
- **Anti-references:** cluttered PM dashboards, jargon-heavy dev changelogs, generic SaaS templates, anything that makes a founder feel they need to "learn the tool."
- `[ASSUMPTION]` Concrete visual system (type, spacing, motion) is a UX-phase deliverable; shadcn/ui + Tailwind is the implementation substrate (addendum).

## 8. Non-Functional Requirements (Cross-Cutting)

#### NFR-1: Responsive / Mobile
All Cockpit and Client Portal surfaces are fully usable on mobile and desktop. The Client experience in particular (Onboarding, Ship Feed, notifications, Invoice view) is mobile-first — clients read updates on their phones (UJ-3).

#### NFR-2: Multi-Tenant Isolation
No user can ever read or affect data outside their authorized Tenant/Engagement. Every data access is tenant-scoped; cross-tenant access returns not-found, not denied-with-disclosure. This is a launch blocker, not a nicety.

#### NFR-3: Security
- GitHub credentials/tokens stored encrypted at rest; least-privilege (read-only repo) scope `[ASSUMPTION]`.
- Passwords hashed; standard session/auth hardening.
- The Client surface never exposes source code or raw repo data — only published, curated Ship Updates.

#### NFR-4: Reliability & Graceful Degradation
GitHub integration failures (rate limits, outages, revoked tokens) degrade gracefully: the Freelancer is informed, and the manual Ship Update path (FR-13) always works. A failed auto-pull never blocks publishing or the Client's view of already-published updates.

#### NFR-5: "Live" Performance
The product must *feel* live. `[ASSUMPTION]` targets to confirm in architecture: auto-pulled GitHub events surface in the curation queue within **~5 minutes** of occurring; a published Ship Update reaches the Client Ship Feed and fires Notifications within **~30 seconds** of publishing; Client Portal pages reach interactive within **~2 seconds** on a mid-range mobile device on 4G. Numbers are starting targets, not committed SLAs.

#### NFR-6: Cost (solo-operator constraint)
v1 should run on solo-budget-friendly infrastructure (serverless / free-or-cheap tiers — Neon, Vercel). `[ASSUMPTION]` no dedicated ops; cost-per-Tenant must stay near-zero at low volume.

#### NFR-7: Accessibility
`[ASSUMPTION]` v1 targets reasonable baseline accessibility (keyboard, contrast, semantic markup) rather than a formal WCAG 2.1 AA audit. [NOTE FOR PM] revisit if any client requires formal compliance.

## 9. Constraints & Guardrails

- **Privacy:** A Client sees only what the Freelancer publishes. No source code, no unpublished candidates, no other Engagement's data. The Freelancer's curation is the privacy boundary.
- **Data ownership:** `[ASSUMPTION]` each Tenant's data belongs to that Freelancer; Soloist is the operator. Formal data-handling/retention policy deferred (see Open Questions).
- **Single-builder operability:** Every guardrail must be maintainable by one person — favor managed services and opinionated defaults over configurable complexity.

## 10. Platform

- **v1:** Responsive web app (Cockpit + Client Portal), mobile-first on the Client side. No native mobile apps.
- **Surfaces** keyed by path + role on `soloist.cjjutba.com` (see §4).

## 11. Non-Goals (Explicit)

Soloist v1 is **not**:
- A **payment processor.** No real-money processing, deposits, or retainer auto-billing. (Invoice status is manual.)
- A **project-management tool.** No task boards, time tracking, or issue management for the Client. (Linear integration is fast-follow, and feeds the Ship Feed — it is not a PM surface.)
- A **chat/messaging app.** No real-time chat in v1.
- An **analytics product.** No standalone analytics dashboards in v1.
- An **auto-case-study / testimonial generator.** Fast-follow.
- A **team/agency multi-seat tool.** One Freelancer per Tenant; no internal collaboration in v1.
- A **creative-asset portal.** No Figma/Loom-centric feature set — that is the incumbents' space, deliberately not ours.

## 12. MVP Scope

### 12.1 In Scope (full brief-v1)
- Multi-tenant + per-Tenant Branding (logo, accent); single-domain path routing on `soloist.cjjutba.com` (`/app`, `/portal`, `/invite/[token]`). (FR-1–FR-3)
- Email + password auth for Freelancer and Client. (FR-4, FR-5)
- Engagement object + Cockpit management. (FR-6, FR-7)
- Premium branded Client Onboarding. (FR-8)
- **Live Ship Feed with GitHub integration** — auto-pull commits/PRs/releases → curated, founder-readable, status-tagged updates; manual fallback. (FR-9–FR-14)
- Notifications: email + in-app + toast. (FR-15)
- Doc Engine: Invoice (fill-in-the-blank, shared data, manual status). (FR-16–FR-18)
- Mobile/responsive throughout. (NFR-1)

### 12.2 Out of Scope for MVP
- **Vercel + Linear integrations** — fast-follow. `[ASSUMPTION]` GitHub first; confirm Vercel-vs-Linear ordering next.
- **AI commit→plain-English summaries** — fast-follow; v1 uses heuristic rendering (FR-11). [NOTE FOR PM] emotionally load-bearing — pull into v1 if the build proves cheap.
- **Proposals; contracts + e-signature** — fast-follow (the Doc Engine is architected to extend, FR-17).
- **Testimonial-at-the-peak** — fast-follow.
- Real-money payments, deposits, retainer auto-billing — see §11.
- Real-time chat, standalone analytics, auto case studies — see §11.
- **Public demo portal** — the portfolio artifact. [NOTE FOR PM] how it's seeded with believable demo data and exposed publicly is unspecced — see Open Questions; decide before public launch.

## 13. Success Metrics

*Targets carried from the brief and tagged `[ASSUMPTION]` — correct them to what you'd actually call success.*

**Primary**
- **SM-1 — Dogfood depth:** CJ runs **≥ 2 real Client Engagements** fully on Soloist within the first month of using it. Validates the whole system (FR-1–FR-18). `[ASSUMPTION]`
- **SM-2 — Trust signal (the real one, qualitative):** at least one Client unprompted cites the Ship Feed / portal as why they trust or rehire, **and** "any updates?" messages drop to ~zero on Engagements using Soloist. Validates FR-8, FR-12, FR-14, FR-15. `[ASSUMPTION]`

**Secondary**
- **SM-3 — Productize signal:** the first **5–10 other dev-freelancers** sign up and brand a Tenant after public launch. Validates FR-1–FR-3. `[ASSUMPTION]`
- **SM-4 — Portfolio payoff:** Soloist headlines CJ's portfolio with a public demo and is attributable to **≥ 1 inbound gig**. `[ASSUMPTION]`

**Counter-metrics (do not optimize)**
- **SM-C1 — Ship Update volume:** do **not** optimize for number of published updates. Flooding the Client with noisy updates would inflate "activity" while *eroding* the trust SM-2 measures. Curation quality > quantity. Counterbalances SM-2.
- **SM-C2 — Feature breadth vs. launch speed:** do **not** optimize for shipping more features at the expense of the dogfood loop. Breadth that delays CJ running real Engagements works against SM-1 and the whole launch-ASAP intent. Counterbalances SM-1/SM-3.

## 14. Open Questions

1. **Business model / pricing** — deferred by decision; revisit post-MVP. Market reference ($9–24/mo solo norm) lives in the brief addendum.
2. **AI summaries in v1 or fast-follow?** — depends on the build effort of commit→plain-English mapping (FR-11). Default: fast-follow.
3. **Dev-tool ordering** — GitHub first (committed); confirm **Vercel vs. Linear** next.
4. **Public demo portal** — how it's seeded with believable demo data and exposed publicly is unspecced. Blocks public launch / SM-4, not dogfood.
5. **What makes Onboarding "premium," concretely** — a UX-phase deliverable (FR-8).
6. **Other-freelancer demand (named risk).** Designing for other dev-freelancers before they are real users risks building on assumed workflows. **The dogfood loop (CJ on real clients, SM-1) is the *primary* validation signal**; other-freelancer features should track that signal and not get multi-tenant polish ahead of demonstrated demand.
7. **Data retention / ownership policy** — deferred; revisit before onboarding non-CJ Freelancers (§9).
8. **Cockpit domain** — ✅ **RESOLVED (2026-06-06):** single domain, path-based — Cockpit at `soloist.cjjutba.com/app`, Client Portal at `/portal` (no per-Tenant subdomains in v1; custom domains deferred). See FR-3, §4, Sprint Change Proposal.

## 15. Assumptions Index

*Every `[ASSUMPTION]` above, surfaced for explicit confirmation:*

- **§3.2** — Small 2–3 person dev studios are a later audience, not v1.
- **FR-1** — Email verification required before a Tenant is publicly reachable.
- **FR-3 / §4** — ✅ resolved: single-domain path-based routing (`/app`, `/portal`, `/invite/[token]`) on `soloist.cjjutba.com`; per-Tenant subdomains/custom domains deferred.
- **FR-5** — One Client identity per Engagement in v1.
- **FR-6** — Exact Engagement field set (name, client basics, scope/description).
- **FR-9 / NFR-3** — GitHub authorization uses read-only repo scope; App-vs-OAuth + webhook-vs-poll decided in architecture.
- **FR-10** — Auto-pull latency "a few minutes"; default status mapping (merged PR/release → Shipped; open PR/branch → In Progress; planned → Next).
- **FR-11** — v1 rendering is heuristic/template-based; AI plain-English summaries are fast-follow.
- **FR-12** — Curation is required (no silent auto-publish) in v1.
- **FR-14** — Feed filterable by status; new updates reflected on next load / near-real-time (TBD in architecture).
- **FR-15** — Non-ship events also notify; v1 has at most a simple on/off, no granular per-channel prefs.
- **FR-16 / FR-18** — Invoice field set; per-Tenant auto-numbering; shareable as in-portal view + PDF/export or link.
- **FR-17** — Doc Engine data model designed to extend to proposals/contracts (constraint, not a v1 feature).
- **§7** — Visual system is a UX deliverable; shadcn/ui + Tailwind is the substrate.
- **NFR-5** — "Live" performance targets (auto-pull latency, publish-to-client latency, mobile load) to confirm.
- **NFR-6** — Solo-budget infra; near-zero cost per Tenant at low volume.
- **NFR-7** — Baseline accessibility, not formal WCAG 2.1 AA, in v1.
- **§9** — Each Tenant's data belongs to its Freelancer; formal retention policy deferred.
- **SM-1–SM-4** — All success targets are starting `[ASSUMPTION]` values to correct.
