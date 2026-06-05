---
name: Soloist
status: final
sources:
  - "{planning_artifacts}/prds/prd-soloist-2026-06-05/prd.md"
  - "{planning_artifacts}/briefs/brief-soloist-2026-06-05/brief.md"
updated: 2026-06-06
---

# Soloist — Experience Spine

> Owns *how it works* — IA, behavior, states, interactions, accessibility, flows. Visual identity lives in `DESIGN.md`; this spine references its tokens by `{path.to.token}`. Both spines win on conflict with any mock or import.
>
> **Fast-path draft.** `[ASSUMPTION]` marks decisions the author derived from the PRD/brief that those docs left open, awaiting CJ's confirmation. `[OPEN]` marks gaps the PRD itself flagged for this UX phase.

## Foundation

Soloist is **two role-keyed responsive web surfaces sharing one design system**, resolved by **subdomain + authenticated role** — no native apps in v1. Built on **shadcn/ui + Tailwind on Next.js (App Router)**; `DESIGN.md` is the visual identity reference and the component library does most of the work.

- **Cockpit** — the Freelancer's working tool. Served at `soloist.cjjutba.com` (✓ confirmed, CJ 2026-06-06; resolves PRD Open Q #8). Soloist-branded; responsive but **desktop-primary** (it's where CJ works). Audience: a developer — reward keyboard fluency.
- **Client Portal** — the premium, **Tenant-branded** experience at `<slug>.cjjutba.com`. **Mobile-first** ("clients read updates on their phone"). Audience: a non-technical founder — reward dead-simple, zero-learning reading.

**Tenancy:** one **Tenant** per Freelancer (one subdomain) → many **Engagements**; an Engagement has one **Ship Feed**, 0+ **Repo Connections**, one **Client** (v1), 0+ **Invoices**. A **Ship Update** is either a *candidate* (Freelancer-only) or *published* (Client-visible). The whole product hinges on that one distinction — see Privacy & Visibility.

## Information Architecture

**Cockpit (Freelancer) — Soloist-branded, desktop-primary.**

| Surface | Reached from | Purpose |
|---|---|---|
| Engagements (home) | App open / sidebar | List of all Engagements with status, last-activity, and a `{components.candidate-badge}` count of updates awaiting curation (the "needs attention" signal). |
| Engagement detail | Engagements row | Tabbed working surface: **Ship Feed (curation queue)** · **Repo Connections** · **Client** (status, invite) · **Documents** (Invoices). |
| Curation queue | Engagement detail (default tab) | Candidate Ship Updates pulled from GitHub + manual-update authoring; edit, status-tag, dismiss, publish. |
| Repo Connections | Engagement detail tab | Connect/disconnect GitHub repos; connection-status indicator. |
| Documents | Engagement detail tab | Create/send Invoices; Draft → Sent → Paid (manual). |
| Branding & Tenant settings | Account menu | Logo upload + accent picker (with contrast guard), subdomain, neutral default. |
| Account | Account menu | Auth, email, password, notification defaults. `[OPEN]` detail undefined in PRD. |

Sidebar visible on `lg+`, collapses to a `Sheet` on smaller viewports. Modal stacks one level deep, never two.

**Client Portal (Client) — Tenant-branded, mobile-first. "Deliberately minimal navigation; the Ship Feed is the center of gravity."**

| Surface | Reached from | Purpose |
|---|---|---|
| Onboarding | First authenticated session only | Branded welcome ({components.onboarding-hero}) + one-screen orientation to the Ship Feed. One-time; never repeats. |
| Ship Feed (home) | Default after Onboarding / app open | Live, chronological, status-tagged feed of **published** updates, newest first. The home surface. |
| Update detail | Tap a Ship Update / notification link | `[ASSUMPTION]` Full update view (title, summary, status, timestamp). May be inline-expand rather than a route on mobile. |
| Documents | Single nav affordance from Ship Feed | Invoices the Freelancer has sent; in-portal view + status chip. |
| Notifications | Bell affordance | In-app notification center: published updates + new Invoice, read/unread. |
| Account | Avatar menu | Password, notification on/off `[ASSUMPTION: simple toggle]`. |

Navigation is **two destinations max** (Ship Feed + Documents) plus the bell and avatar. No dashboards, no tabs to learn.

→ **Composition references** (the spine wins on conflict — these illustrate, they don't decide):
- [`mockups/client-ship-feed.html`](mockups/client-ship-feed.html) — Client Ship Feed (Tenant-branded), with the four status cards + the "CJ is getting set up" empty pre-first-publish state. Illustrates *Ship Update card*, *Status tag*, the empty state, and Flow 2's climax.
- [`mockups/client-onboarding.html`](mockups/client-onboarding.html) — Client first-run Onboarding hero (pure reassurance, no input). Illustrates *Onboarding* + Flow 2 step 3.
- [`mockups/cockpit-curation-queue.html`](mockups/cockpit-curation-queue.html) — Cockpit curation queue (Soloist-branded), one row in inline-edit. Illustrates *Curation queue row*, *Engagement row*/candidate-badge, *Repo Connection card*, Cockpit interaction primitives, and Flow 4.

## Privacy & Visibility (the curation boundary)

The single load-bearing behavioral rule. **"The Freelancer's curation is the privacy boundary."** (PRD §9, NFR-2/3.)

- A Ship Update is invisible to the Client until the Freelancer **publishes** it. Candidates live only in the Cockpit curation queue.
- The Client **never** sees: source code, raw repo contents, commit SHAs, diffs, branch names, unpublished candidates, other Engagements, or anything from another Tenant.
- **Publishing is the only gate** that makes an update Client-visible *and* fires notifications. There is no silent auto-publish `[ASSUMPTION — PRD implies but does not state "no auto-publish"; treated as a hard rule]`.
- **Cross-tenant / unknown subdomain → not-found, never denied-with-disclosure.** An unknown `<slug>.cjjutba.com` and an unauthorized Engagement both resolve to the same neutral not-found state — the UI never confirms a resource exists to someone who shouldn't see it.
- Founder-readable rendering is enforced at the data boundary, not just styling: the Client-facing model carries only `{title, summary, status, timestamp}` — there is no field that *could* leak a SHA.

## Per-Tenant Branding system

- **Inputs:** Tenant **logo** (`[ASSUMPTION]` PNG/SVG, ≤1MB, transparent preferred) + one **accent color** → `{colors.tenant-accent}`.
- **Applied to:** all Client-facing surfaces (Onboarding hero, Ship Feed header, primary buttons/links/active states via re-scoped `primary`) and **branded notification emails**. **Never the Cockpit.**
- **Neutral default:** until customized, accent falls back to `{colors.tenant-accent}` default (Soloist Iris) and logo to a Tenant-initial monogram `[ASSUMPTION]`. The portal must look intentional even before CJ touches Branding.
- **Contrast guard (hard rule — three checks, blocks on any failure):** the accent picker validates, before it will save, **(1) fill:** white (`{colors.tenant-accent-foreground}`) on the accent ≥ 4.5:1; **(2) text:** the accent as link/inline text (`{colors.tenant-accent-text}`) on `{colors.background}` *and* on white ≥ 4.5:1 — if a pale brand fill fails as text, the guard auto-darkens `tenant-accent-text` (fill and text are decoupled tokens); **(3) non-text:** the accent as focus-ring/active/badge boundary on `{colors.background}` ≥ 3:1, and if it fails the **focus ring falls back to Soloist Ink** so brand choice can never hide keyboard focus. Failure surfaces as an `aria-live` error message (not color-only) naming the nearest passing shade. (Closes rubric FR-2 + a11y C-1/C-2.)
- **Branded email accessibility:** emails are branded but cannot run the live guard at open-time, so they degrade safely: Tenant **logo `alt="{Tenant name}"`** (or `alt=""` when adjacent text already names the Tenant); status as **emoji + text label**, never color-only, so "✅ Shipped" survives images-off; the header uses the guard-validated accent pair with **explicit inline background colors** (dark-mode email clients invert — pinning limits the damage, a known limitation); semantic heading structure and a ≥14px body minimum.

## Voice and Tone

Microcopy. Brand voice/posture lives in `DESIGN.md.Brand & Style`. The product's promise is **plain-English, founder-friendly, momentum-positive but honest — no dev jargon, no raw commit language.** Status always uses the fixed **✅ Shipped · 🚧 In Progress · 📦 Next** vocabulary.

| Do | Don't |
|---|---|
| "Shipped the onboarding flow" | "Merged PR #42: refactor auth middleware" |
| "CJ is building your dashboard" | "feat(dashboard): scaffold layout (3 commits)" |
| "New update from CJ" (notification) | "1 new ship_update event" |
| "CJ is getting set up. Your first update will land here soon." (empty feed) | "No data." / "Nothing to display." |
| "Invoice #003 · $2,400 · due Mar 15" | "Document record created successfully ✓" |
| "Couldn't reach GitHub. Auto-updates are paused — your published feed is unaffected." | "Error 502: webhook handler failed" |
| "Welcome to CJ's workspace, Maya." (Onboarding) | "Onboarding complete! Let's get productive 🚀" |
| Calm, declarative, specific. Client copy never asks the founder to learn anything. | Cheerful exclamation, emoji confetti, system/CRUD language, dev jargon. |

Cockpit copy is the same register but may be terser and assume competence (CJ is technical) — e.g. "3 candidates need curation," "Repo connected · last pull 2m ago."

## Component Patterns

Behavioral. Visual specs live in `DESIGN.md.Components` (or shadcn defaults).

| Component | Surface | Behavioral rules |
|---|---|---|
| **Ship Update card** `{components.ship-update-card}` | Client feed; curation queue | One status tag, plain-English title, 1–2 line summary, relative timestamp. Tap → detail/expand. In the feed it is read-only; in the queue it gains edit affordances. Never renders raw dev artifacts. |
| **Status tag** `{components.status-tag-*}` | Everywhere status appears | Exactly one per update. In curation, it's an editable control (cycle ✅/🚧/📦); a sensible default is pre-suggested from event type — `[ASSUMPTION]` merged PR/release → ✅ Shipped; open PR/commits → 🚧 In Progress; manual → author picks. **Engine-agnostic** (✓ CJ, 2026-06-05): v1 candidate text is heuristic/template from commit/PR metadata; AI summaries are a fast-follow — the curation queue, the editable title/summary, and the feed behave identically regardless of which engine produced the candidate. UX assumes nothing about the source. |
| **Curation queue row** | Cockpit · curation queue | Candidate from GitHub or manual. Inline-edit title/summary (click to edit, blur to save). Actions: edit · set status · **dismiss/hide noise** · **publish**. Publish is the deliberate, single-click commit that crosses the privacy boundary and fires notifications. `[ASSUMPTION]` bulk-select for publish/dismiss on `lg+`. |
| **Manual Ship Update** | Cockpit · curation queue | Author by hand (title, summary, status) when no repo is connected or GitHub is down. Same publish flow. Always available — the fallback that keeps the promise alive. |
| **Engagement row** | Cockpit · Engagements | Shows name, **status**, **last-activity**, and `{components.candidate-badge}` count when >0. Click → Engagement detail. `[ASSUMPTION — author-proposed, closes rubric FR-7 gap]` **Status enum: Active · Paused · Completed · Archived** (default Active on create; Paused = intentionally on hold; Completed = work done, portal stays readable; Archived = hidden from the default list). **"Last-activity" = the most recent of {candidate pulled, update published, Invoice sent, Client viewed}**, shown as a relative timestamp (`numeric`). Sort the list by last-activity, then by candidate-count, so "needs attention" floats up. |
| **Repo Connection card** | Cockpit · Repo Connections | Connect (GitHub authorize) · status indicator (connected / pulling / error / disconnected) · last-pull time · disconnect. Error state is explicit and recoverable. |
| **Invite control** | Cockpit · Client tab | Send unique expiring email link; shows invite state (not sent / sent / accepted) + resend. |
| **Invoice (builder + view)** | Cockpit build / Client view | Builder: fill-in-the-blank prefilled with Engagement/Client data; `[ASSUMPTION]` line items, amounts, dates, notes; auto-numbered per Tenant. View (Client): in-portal premium document + status chip; `[ASSUMPTION]` PDF/link export. Status Draft → Sent → Paid; **Paid is marked manually** in the Cockpit. No payment UI. |
| **Notification — toast** | Client (and Cockpit) | shadcn `Toast`, fired only when the recipient is **active**. Tapping routes to the relevant update/document. Auto-dismiss; non-blocking. |
| **Notification center** | Client · bell | List of published-update + new-Invoice events, read/unread, newest first. Each links to its target. `[OPEN]` grouping/read-state design. |
| **Branding controls** | Cockpit · settings | Logo upload + live preview; accent picker with the contrast guard; "see how the Client sees it" preview. |
| **Onboarding** `{components.onboarding-hero}` | Client · first run | Branded hero + a single orientation screen pointing at the Ship Feed; "Got it"/scroll proceeds. One-time; flagged complete server-side so it never repeats. ✓ Confirmed (CJ, 2026-06-05): **pure reassurance, no Client input** — fastest path to the day-one "wow." The premium is in the craft (branded hero, serif welcome, calm), not in steps. |

## State Patterns

Empty and error states carry the "premium" weight — they're where cheap products feel cheap. Every surface below has a *designed* empty/error state, not a blank.

| State | Surface | Treatment |
|---|---|---|
| Loading (cold) | Client feed / Cockpit queue | shadcn `Skeleton` cards matching Ship Update layout. Resolves on data. |
| **Empty — pre-first-publish** | Client Ship Feed | `display-sm` (serif) reassurance: "CJ is getting set up. Your first update will land here soon." Calm, branded, never "no data." This is the most-seen empty state on day one — it must feel intentional. |
| Empty — no Engagements | Cockpit home | Serif greeting + single primary action: "Start your first engagement." |
| Empty — no repo connected | Curation queue | "No repo connected yet. Connect GitHub to auto-pull updates — or write one by hand." Two paths offered (connect / manual). |
| Empty — curation queue clear | Curation queue | "All caught up. New activity from GitHub will appear here." (Not an error; a calm done-state.) |
| Empty — no Invoices | Client Documents | "No documents yet." Quiet, no CTA (the Client can't create one). |
| **GitHub failure / degraded** | Cockpit | Non-blocking banner on the Engagement: "Couldn't reach GitHub. Auto-updates are paused — your published feed is unaffected. Retry." Manual updates remain available. (Closes rubric NFR-4 done-ness gap — the indicator is a **banner + repo card error state**.) |
| Token revoked | Repo Connections | Repo card → error: "GitHub access was revoked. Reconnect to resume auto-pull." |
| **Unknown subdomain / unauthorized** | Client Portal | Neutral **not-found** — never "access denied." Soloist-neutral (no Tenant brand to leak). |
| Invite expired | Client invite-accept | "This invite link has expired. Ask CJ to send a new one." No account detail leaked. |
| Live update arrives | Client feed (active) | New published card animates in at top (honoring `prefers-reduced-motion`) + a toast + an `aria-live="polite"` summary; the insert does **not** move keyboard focus. `[OPEN: real-time vs poll deferred to architecture]` — if poll, surface a "Load new updates" control (itself the announced element) rather than silent insert. |
| Offline / connection lost | Client feed (mobile) | `[ASSUMPTION]` Last-loaded feed stays readable; a quiet inline banner "You're offline — showing your latest updates" appears, and refresh resumes on reconnect. (Sources mark offline NOT MENTIONED; this one-liner makes the omission a decision, not a gap, given the mobile-first/flaky-4G reality.) |
| Optimistic publish | Curation queue | Publish reflects immediately in the Cockpit; if the downstream notify fails, a `Toast` (destructive) "Published, but the email didn't send. Retry?" — publish state is never silently lost. |
| Success — publish | Curation queue | Card leaves the queue, count decrements; quiet confirmation, no confetti. |

## Interaction Primitives

**Two interaction philosophies, by surface — this is deliberate.**

**Cockpit (CJ, a developer): reward fluency.**
- Keyboard-friendly where it speeds curation: `[ASSUMPTION]` `j/k` move between candidates, `e` edit, `1/2/3` set status (✅/🚧/📦), `p` publish, `x` dismiss, `Esc` exits edit. `⌘K` `[ASSUMPTION]` command/jump for power use. (Single-key shortcuts are suppressed while a field is focused, and each maps to a visible control — see Accessibility Floor.)
- Inline-edit (click-to-edit, blur-to-save) — no separate edit modes.
- Curation should be doable in seconds per candidate; bulk-select on `lg+`.

**Client Portal (Maya, a founder): reward zero-learning.**
- **Touch-first, read-first.** Everything reachable with a thumb; no shortcuts to learn, no power features. Tap a card to read, tap a notification to jump, scroll the feed. That's the whole vocabulary.
- No drag, no multi-step interactions, no settings the Client must configure to get value.

**Banned everywhere:** dev jargon in any Client-visible string; hover-only affordances on touch viewports; modal stacks >1 deep; infinite scroll where pagination/"load older" reads clearer; any path that publishes to the Client without an explicit Freelancer action.

## Accessibility Floor & the Branding contrast guard

Behavioral floor; visual contrast detail lives in `DESIGN.md`.

**Baseline (NFR-7):** keyboard operability, semantic markup, and AA contrast across both surfaces. `[ASSUMPTION]` Not a formal WCAG 2.1 AA audit in v1 (`[NOTE FOR UX]` revisit if a client requires formal compliance) — but the floor below is non-negotiable, and most of it comes free from unmodified shadcn primitives; the residual risk is the *custom* and *runtime-variable* parts named here.

- **Contrast thresholds:** **4.5:1 for normal text, 3:1 for large/non-text** UI (focus rings, active boundaries, the accent-filled badge/hero edge). The Branding guard enforces both for the runtime accent (see Per-Tenant Branding); the fixed palette already passes (DESIGN.md states measured ratios).
- **Status is never color/emoji alone** — the text label ("Shipped" / "In Progress" / "Next") always accompanies the ✅/🚧/📦, in feed, email, and copy. This single rule clears the most common colorblind/SR status failure.
- **Keyboard & focus.** Tab order matches reading order on every surface. Visible focus rings (shadcn `ring`, or Soloist Ink when a pale Tenant accent fails the 3:1 non-text check). Overlays (`Dialog`/`Sheet`, and the mobile fullscreen notification center even if it's a route) **trap focus and return it to the invoking control on close**; `Esc` closes the topmost overlay. Onboarding and not-found set initial focus to their `<h1>`.
- **Route/surface announcement.** SPA navigation is silent by default — so on each route/tab change (Ship Feed → Update → Documents; Cockpit tabs) move focus to the new view's `<h1>` and keep one `<main>` landmark per surface. The live feed announces new cards via **`aria-live="polite"`** with a concise summary ("New update: {title}, {status label}") — never `assertive`, never the full body, and new cards insert **without moving keyboard focus**. On the poll branch (`[OPEN: real-time vs poll]`) the announced element is the "Load new updates" control, not a live region.
- **Touch targets.** Client Portal interactive elements (bell, avatar, nav, tappable pills, notification-center close) have a **≥44px hit area** (padding may exceed the visual size); Cockpit controls **≥24px** hard floor. No hover-only affordances on touch.
- **Cockpit shortcuts (a11y constraints):** every shortcut (`j/k/e/1/2/3/p/x`) also maps to a visible, focusable control (shortcuts are never the only path); single-key shortcuts are **suppressed while a text input/textarea has focus** (prevents `p`/`x` firing mid-edit); a `?` overlay lists them.
- **Forms** (Branding picker, Invoice builder, Invite/set-password, Manual update): every field has a programmatic `<label>`; hints via `aria-describedby`; errors are `role="alert"`, tied to the field, and never color-only; password requirements stated up front. The contrast-guard rejection is one such announced error.
- **Images & motion.** Tenant logo `alt="{Tenant name}"` when it's the only naming of the Tenant, `alt=""` when adjacent text already names it (monogram fallback inherits the rule). All entrance/insertion animation honors `prefers-reduced-motion: reduce` (collapses to an instant state change).
- **not-found-never-denied at the AT layer too:** the unknown-subdomain / unauthorized page reads as ordinary page content with a focused `<h1>` — identical for both causes, no `role="alert"` interruption — so existence is never disclosed to a screen reader either.
- **The Branding contrast guard is an accessibility control, not just a brand one** — the one place a non-designer Freelancer could otherwise ship unreadable or un-keyboard-navigable Client UI. Full three-check spec lives in Per-Tenant Branding.

## Responsive & Platform

| Surface | `< md` (phone) | `md`–`lg` | `≥ lg` (desktop) |
|---|---|---|---|
| **Client Portal** | **Primary target.** Single column, `portal-gutter` margins, thumb-reachable nav, fullscreen notification center. | Same single column, centered `max-w-2xl`. | Single column centered — never widens into a dashboard. The reading experience is identical; only the margins grow. |
| **Cockpit** | Usable: stacked, sidebar → `Sheet`, queue rows full-width, bulk actions hidden. | Sidebar → icons; queue two-up. | **Primary target.** Sidebar, multi-column Engagements/queue, keyboard shortcuts, bulk-select. |

Responsive web only; no native apps. The Client side is designed phone-up; the Cockpit is designed desktop-down.

## Inspiration & Anti-patterns

- **Lifted from premium consumer onboarding (Linear/Stripe-grade):** the first-run "wow" — branded, calm, one screen, then straight to value. The Onboarding's only job is to convert anxiety to confidence in <15 seconds.
- **Lifted from Linear:** the Cockpit's keyboard-driven, low-chrome working feel and explicit status vocabulary.
- **Rejected — cluttered PM dashboards** (anti-reference): the Client Portal is a *reading* surface, not a project-management cockpit. No charts, burndowns, or backlogs on the Client side.
- **Rejected — jargon-heavy dev changelogs** (anti-reference): no commit lists, no SHAs, no "what's new" engineering tone. Plain English, always.
- **Rejected — generic SaaS templates** (anti-reference): per-Tenant branding + warm Paper + serif moments exist specifically so the Client never feels they're in a third-party tool.
- **Rejected — "learn the tool" friction** (anti-reference): the Client configures nothing and learns nothing. Value is delivered on first scroll.
- **Rejected — celebratory gamification** (anti-reference): progress is the reward; no streaks, confetti, or achievement toasts. Calm and trustworthy, not hype.

## Key Flows

### Flow 1 — CJ stands up a new engagement in minutes (UJ-1)
1. CJ, a solo full-stack product engineer who just closed a founder client, opens the Cockpit before the kickoff call.
2. "Start your first engagement" → he enters the engagement name and Maya's basics.
3. In the Engagement's **Repo Connections** tab he authorizes GitHub and connects the project repo; the status indicator goes connected → pulling.
4. He opens the **Client** tab and sends Maya an invite by email.
5. **Climax:** by the time the invite sends, the curation queue has *already populated* with candidate Ship Updates from his recent commits, and the Engagement row shows a `{components.candidate-badge}` "3 need curation." The portal is live before the call — Maya is one click from a branded experience.

Failure: GitHub authorize fails → repo card error + "write one by hand" path stays open; CJ can still publish a manual first update.

### Flow 2 — Maya opens her portal for the first time (UJ-2)
1. Maya, a non-technical pre-seed founder who paid CJ upfront and is quietly anxious the work is real, gets the invite email (branded with CJ's logo + accent).
2. She taps it on her phone, sets a password, and lands on `cj.cjjutba.com`.
3. **Onboarding** — a `{components.onboarding-hero}` welcome in CJ's brand, one calm orientation line pointing at the feed. No forms, nothing to learn.
4. She arrives at the **Ship Feed**.
5. **Climax:** the very first thing she sees is ✅ *"Set up the authentication system"* and 🚧 *"Building the dashboard"* — in plain English, in CJ's brand, on her phone. Day-one proof she hired someone agency-grade. She closes the tab reassured, having asked nothing.

Failure: the invite link expired → branded "ask CJ for a new link" state, no dead end, no leaked account detail.

### Flow 3 — Maya feels momentum without lifting a finger (UJ-3)
1. Maya is heads-down on her own work, not in the app.
2. CJ publishes an update; she gets a notification — *"New update from CJ"* (branded email + in-app; a toast if she happens to be active).
3. She taps through on her phone straight to the update.
4. **Climax:** ✅ *"Shipped the onboarding flow"* — visible progress, the dopamine of momentum. Her "any updates?" message never gets typed; trust compounds silently.

Failure: notification email bounces/doesn't send → the published update is still safely in her feed; CJ sees a "email didn't send — retry?" toast in the Cockpit so the channel failure is recoverable, not invisible.

### Flow 4 — CJ turns a day of commits into client-ready proof — and bills for it (UJ-4)
1. After a build session — a dozen commits and a merged PR — CJ opens the Engagement's **curation queue**.
2. Auto-pulled candidates are waiting. He edits one title into plainer English ("Refactor auth middleware" → "Made sign-in faster and more reliable"), dismisses the noise, and sets statuses with `1/2/3`.
3. He selects the meaningful ones and **publishes**.
4. He opens **Documents** → generates an **Invoice** prefilled with Maya's name, scope, and rate — no re-typing.
5. **Climax:** Maya's Ship Feed lights up with curated, plain-English progress and an Invoice goes out — no status report written, no data re-entered. The engagement looks agency-grade; CJ is back to building in minutes.

Failure: a publish's downstream notify fails → publish still succeeds (the feed updates); a destructive `Toast` offers retry so the Client is never left un-notified silently.
