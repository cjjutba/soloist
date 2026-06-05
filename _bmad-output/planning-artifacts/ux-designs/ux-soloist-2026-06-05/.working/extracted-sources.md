# Extracted Sources — Soloist (PRD + Brief)

> Subagent extraction of `briefs/brief-soloist-2026-06-05/` + `prds/prd-soloist-2026-06-05/`, 2026-06-05.
> This is the distilled upstream context the UX spines are authored from. Spines win on conflict.

## 1. Product concept

**Soloist** is a dev-native, multi-tenant client portal that lets a solo product engineer ("Freelancer") operate like a full agency. When a Freelancer starts an Engagement, their Client lands in a premium, branded Onboarding and then watches a live "what shipped" window (the **Ship Feed**) that auto-populates from the developer's real tools — GitHub in v1, with Vercel and Linear to follow — rendered as plain-English, status-tagged progress a non-technical founder understands. The Client always sees momentum and never has to ask *"any updates?"* Meanwhile the Freelancer runs the Engagement and sends fill-in-the-blank documents (Invoice in v1) from a single Cockpit, all under their own brand on a `*.cjjutba.com` subdomain. Core value: closes the **trust gap** (clients pay before they receive; silence breeds anxiety) and the **legitimacy gap** with transparency that is *automatic, not manual*. Defensible edge: "**dev-native is the moat**" — none of the incumbents speak "merged PR / deployed / shipped a feature" natively. Tagline: **"Run solo. Deliver like an agency."** Supporting line: *"your client never asks 'any updates?' again."*

## 2. Personas

- **The Freelancer (primary) — "CJ"** (user #1). Solo full-stack AI-native product engineer; lives in GitHub/Vercel/Linear; serves startup/founder clients. Operates the **Cockpit**. Goals: run an Engagement end-to-end from one place; kill status-update busywork; never re-type client/scope/rate; look agency-grade; feel in control. Journey protagonist: "CJ, a solo full-stack product engineer."
- **The Client — "Maya"** (named). Non-technical pre-seed **founder**; paid CJ upfront; "quietly anxious about whether the work is real." Operates the **Client Portal**, mobile-first ("reads updates on her phone"). Goals: feel confident the money was well spent; *see* progress without chasing; understand in plain language; trust enough to rehire/refer.
- **Secondary / later (NOT v1):** small 2–3 person dev studios `[ASSUMPTION]`; other dev-freelancers branding their own Tenants post-launch (multi-tenant supports them, but designing ahead of demand is a flagged risk).
- **Explicit Non-Users (v1):** creative/non-dev freelancers; agencies/multi-person teams; clients wanting to pay through the portal.

## 3. Form-factor & platforms

- **v1:** Responsive **web app** only — two surfaces: **Cockpit** (Freelancer) + **Client Portal** (Client). No native mobile apps.
- "Mobile/responsive throughout" = constraint (NFR-1). **Client experience is mobile-first.** Both surfaces fully usable mobile + desktop.
- Surfaces keyed by **subdomain + authenticated role.** Client Portal at `<slug>.cjjutba.com` (fully branded). Cockpit `[ASSUMPTION: app.cjjutba.com]` (Open Q #8, unconfirmed).
- **UI system:** **Tailwind CSS + shadcn/ui** substrate; **Next.js** (App Router assumed). Concrete visual system (type/spacing/motion) deferred to UX.

## 4. Core features → surfaces

- **Tenancy/Branding/Auth (FR-1–5):** Freelancer Sign-Up (email+pw) → provisions Tenant; subdomain slug picker (reject dup/invalid); per-Tenant Branding (logo + accent) renders on Onboarding, Client Portal, notification emails (neutral default until set); subdomain routing (unknown → clear not-found state); login/logout both roles; Client Invitation (unique expiring email link → Client sets password → enters Engagement).
- **Engagements (FR-6–7):** create/manage (name, client basics, scope `[ASSUMPTION]`), edit/archive; **Engagement Dashboard (Cockpit)** lists Engagements with status + last-activity + **count of unpublished candidate Ship Updates** (needs-attention signal); **Engagement detail view** = curation queue · Repo Connections · Client mgmt · Documents/Invoices.
- **Premium Client Onboarding (FR-8):** branded first-run flow (Tenant logo+accent) before Ship Feed; one-time. "What makes it premium concretely" = UX deliverable.
- **Ship Feed — GitHub + Curation, the moat (FR-9–14):** Connect GitHub repo(s) to Engagement (status, disconnect); auto-pull commits/PRs/releases → **candidate Ship Updates** in Freelancer-only **curation queue**; founder-readable rendering (plain-English title/summary + status tag, never SHAs/diffs; v1 heuristic/template, AI fast-follow); **curation & publishing** (edit, set status tag, hide noise, publish — gate to Client visibility + Notifications); **manual Ship Update fallback**; **Client Ship Feed** (live chronological status-tagged feed of published updates, newest first; `[ASSUMPTION]` filter/group by status).
- **Notifications (FR-15):** tri-channel email + in-app + toast on publish (+ `[ASSUMPTION]` new Invoice, engagement start); branded email; toast only if Client active; each links to its update/doc; `[ASSUMPTION]` simple on/off only v1. Implies in-app notification center, toast, branded email template.
- **Doc Engine — Invoice (FR-16–18):** fill-in-the-blank Invoice prefilled with Engagement/Client data (`[ASSUMPTION]` line items, amounts, dates, notes; auto-numbered per Tenant); shared data reused across docs (extensible to proposals/contracts); deliver/share; Client views in-portal (Documents surface); status **Draft → Sent → Paid (Paid marked manually)**; `[ASSUMPTION]` in-portal view + PDF/link. **No real-money processing.**

## 5. IA & navigation

Two role-keyed experiences resolved by subdomain + role.
- **Cockpit (Freelancer)** @ `[ASSUMPTION] app.cjjutba.com`: Engagements list → Engagement detail (curation queue · Repo Connections · Client mgmt · Documents/Invoices) → Tenant & Branding settings → Account.
- **Client Portal (Client)** @ `<slug>.cjjutba.com`, fully branded: First-run Onboarding → Engagement home (Ship Feed) → Documents (Invoices). **"Deliberately minimal navigation; the Ship Feed is the center of gravity."**
- Glossary hierarchy: **Tenant** (1/Freelancer, 1 subdomain) → many **Engagements**; Engagement has 1 Ship Feed, 0+ Repo Connections, 1 Client (v1), 0+ Invoices. **Ship Update** = candidate (Freelancer-only) or published (Client-visible).

## 6. Journeys (4)

- **UJ-1 — "CJ stands up a new engagement in minutes."** Cockpit: create Engagement → client basics → connect GitHub repo → invite client by email. **Climax:** Engagement shows "connected," first candidate Ship Updates already pulled from recent commits, invite sent.
- **UJ-2 — "Maya opens her portal for the first time."** Invite email → set password → lands on `cj.cjjutba.com` → branded premium Onboarding → Ship Feed. **Climax:** immediately sees ✅ *"Set up the authentication system"* + 🚧 *"Building the dashboard"* in plain English — day-one proof she hired someone agency-grade. Closes the tab reassured, asked nothing.
- **UJ-3 — "Maya feels momentum without lifting a finger."** Gets notification *"New update from CJ"* → taps through on phone → reads plain-English update. **Climax:** sees ✅ *"Shipped the onboarding flow"*, feels dopamine of visible progress. Her "any updates?" never gets typed.
- **UJ-4 — "CJ turns a day of commits into client-ready proof — and bills for it."** Curation queue full of auto-pulled candidates → edits a title into plainer English, drops noise, sets statuses → publishes the meaningful ones → Doc Engine → Invoice prefilled with client data. **Climax:** Client's Ship Feed lights up + Invoice goes out, no re-typing, no status report.

## 7. Brand / tone / voice

- **Feel:** "You hired an agency." Polished, confident, **calm, trustworthy.** Per-Tenant Branding makes it feel like the Freelancer's own product, not third-party SaaS.
- **Voice (product text):** plain-English, founder-friendly, momentum-positive but honest. **No dev jargon, no raw commit language.** Status vocab **✅ Shipped · 🚧 In Progress · 📦 Next.**
- **Anti-references (verbatim):** "cluttered PM dashboards, jargon-heavy dev changelogs, generic SaaS templates, anything that makes a founder feel they need to 'learn the tool.'"
- **Branding mechanics:** per-Tenant logo + accent applied to ALL Client-facing surfaces + notification emails; neutral default until set.
- **Visual system:** `[ASSUMPTION]` UX-phase deliverable. Substrate shadcn/ui + Tailwind.
- **Competitors (positioning, not visual):** SuperOkay, Copilot/Portal, Moxie, Bonsai, Dubsado, HoneyBook, SPP/ManyRequests/Agency Handy, Client Portal.io. Edge: only one auto-pulling "what shipped" from dev tools as a premium founder-facing experience.

## 8. Cross-cutting concerns

- **Accessibility:** STATED — NFR-7 `[ASSUMPTION]` "reasonable baseline (keyboard, contrast, semantic markup)", NOT formal WCAG 2.1 AA. Rubric flags FR-2 lacks contrast guard on accent color (renders on emails + premium surface).
- **Regulated/i18n/dark mode/offline/voice:** NOT MENTIONED.
- **Motion:** STATED only as deferred (part of visual system, UX-phase).
- **Content density:** low-density, focused Client UI implied (anti "cluttered"; "deliberately minimal").
- **Notifications:** STATED prominent (see §4).
- **Performance:** STATED — NFR-5 `[ASSUMPTION]` targets: GitHub events → curation queue ~5 min; publish → Client feed + notifications ~30 s; Client Portal interactive ~2 s on mid-range mobile/4G. Real-time-vs-refresh deferred to architecture.
- **Privacy:** STATED load-bearing — Client sees ONLY published; never source/candidates/other Engagements. "Curation is the privacy boundary." Multi-Tenant Isolation (NFR-2) launch blocker; cross-tenant access → **not-found, not denied-with-disclosure**.

## 9. Constraints & stakes

- **Stack:** Next.js (App Router); Tailwind + shadcn/ui; Postgres on Neon; Drizzle OR Prisma; Vercel; `*.cjjutba.com` wildcard.
- **Cadence:** 3-day-max sprints, ship-early, launch ASAP. Full v1 est ~4–8 wks (reconciliation deferred).
- **Out of v1:** Vercel/Linear, AI summaries, proposals, contracts/e-sign, testimonial-at-peak (fast-follow); real-money payments, chat, analytics, auto case studies, multi-seat (out).
- **Stakes (INFERRED):** consumer-facing/SaaS that's also a **portfolio centerpiece**; "launch-level but solo-built." UX is load-bearing; "premium" is the wedge. Not enterprise/regulated.

## 10. Decided (UX must honor)

Two role-keyed surfaces · Client Portal minimal nav, Ship Feed center of gravity · Client first-run through branded Onboarding (one-time) · fixed status vocab ✅/🚧/📦 · **curation mandatory, no silent auto-publish** `[ASSUMPTION]` · Client never sees raw dev artifacts · per-Tenant Branding on all Client surfaces + emails (neutral default) · tri-channel notifications (toast only when active) · Engagement Dashboard shows per-Engagement candidate-count signal · Invoice in-portal, Draft→Sent→Paid (manual Paid), no payment UI · Engagement detail = curation queue · Repo Connections · Client status · Invoices · mobile-first Client, responsive everywhere · shadcn/ui + Tailwind substrate · anti-references are a constraint.

## 11. Gaps / open questions for UX

Flagged by docs: **what makes Onboarding "premium" concretely** (biggest UX gap, Open Q #5) · concrete visual system incl. motion · AI summaries v1-vs-fast-follow (Open Q #2) · Cockpit host domain (Open Q #8) · public demo portal seeding/exposure (Open Q #4) · real-time vs refresh feed (FR-14) · Ship Feed filter/group existence.

Absent but needed: Engagement field set · **Engagement status values + "last-activity" definition** (rubric) · Invoice field set/layout/numbering/export · notification center + toast + on/off-pref design · Freelancer sign-up/slug/Branding-setup/first-run flow + email-verify UX · **Branding setup guardrails (logo formats, accent picker, contrast safeguard)** · **empty states** (no updates, no repo, no invoices, pre-first-publish portal, empty queue) · **error/degraded states** (GitHub failure banner, token revocation, not-found subdomain page) · curation queue interaction design (bulk, edit, dismiss, ordering) · repo connect/disconnect flow · invite/accept visuals + branded invite email · Client-with-multiple-Engagements model · notification pref granularity · Account/settings screens · microcopy library.

Strategic note (reconcile GAP-1): prioritize the **CJ-on-real-clients** experience; do not over-invest in onboarding-for-other-freelancers UX ahead of demand.
