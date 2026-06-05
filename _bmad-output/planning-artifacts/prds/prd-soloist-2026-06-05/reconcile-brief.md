# Reconciliation: Brief → PRD (Soloist)

_Reviewed 2026-06-05. Source: brief.md + brief addendum.md. Target: prd.md + prd addendum.md._

## 1. Verdict

The PRD faithfully carries forward the brief's substance — every v1 scope item, the moat thesis, the qualitative "you hired an agency" tone, and all success criteria are present — with only minor weakenings (the dogfood-as-primary-validation caveat, the brief's competitive digest, and the "≥2 client engagements" framing) that are worth confirming but none high-severity.

## 2. Gaps (brief → what's missing/weakened in PRD → severity)

### GAP-1 — "Dogfood loop is the primary validation signal" caveat is softened
- **Brief location:** §Who This Serves, the boxed `[ASSUMPTION / RISK]`: _"Designing for 'other dev-freelancers' before they're real users carries the risk of building on assumed workflows. The dogfood loop (CJ on real clients) is the primary validation signal; other-freelancer features should track that signal closely."_
- **PRD state:** The dogfood-as-primary-signal idea survives in fragments (Open Question #6 says "dogfood (SM-1) is the primary validation signal"; SM-3 is "Secondary"). But the brief framed it as an explicit **risk**: that building multi-tenant / other-freelancer features on *assumed* workflows is dangerous. The PRD does not carry this as a named risk — there is no risk section, and the "track that signal closely" guidance is gone. The counter-metric SM-C2 partially compensates by warning against breadth-over-dogfood.
- **Severity:** **Medium** — the strategic guardrail (don't over-build for hypothetical users) is the brief's single most important risk and is only implicitly preserved.

### GAP-2 — Competitive landscape / named incumbents dropped
- **Brief location:** Brief addendum "Competitive Landscape Digest" (full table: SuperOkay, Copilot, Moxie, Bonsai, Dubsado, HoneyBook, SPP/ManyRequests/Agency Handy, Client Portal.io) + pricing norms + "honest moat check" ranking.
- **PRD state:** The PRD addendum is **purely technical** (tech stack + sprint cadence). The competitive digest, the named comparables, the pricing norms ($9–24/mo solo), and the ranked moat list did NOT carry into the PRD addendum. The PRD body keeps the *conclusions* (dev-native moat, "creative-tool incumbents won't chase dev integration," transparency-first, niche) in §1/§2, so the strategy survives — but the supporting evidence/competitor names are gone.
- **Severity:** **Low–Medium** — PRDs legitimately don't need the full competitor table, and the conclusions are preserved. Flag only because pricing norms ($9–24/mo) are referenced in Open Question #1 ("lives in the brief addendum") and a downstream reader of *only* the PRD won't find them.

### GAP-3 — Brief's "scope reality: ~4–8 weeks" time estimate is relocated, not in PRD body
- **Brief location:** §Scope, "Scope reality": _"dev-native-in-v1 + multi-tenant-from-day-1 + building for other freelancers pushes the realistic build to ~4–8 weeks … A deliberate trade to own the moat in v1 rather than bolt it on later."_
- **PRD state:** The ~4–8 week estimate appears only in the **PRD addendum** (Sprint Cadence section, as "Tension noted"). The PRD body §0 explicitly defers sequencing to sprint-planning. The "deliberate trade to own the moat in v1" rationale is preserved in §1 ("the niche, the speed, and the integrations are the product"). Acceptable relocation, but the explicit trade-off framing ("own the moat in v1 rather than bolt it on later") is weaker in the PRD.
- **Severity:** **Low** — intentional and reasonable (PRD defines what, not when); noted for completeness.

### GAP-4 — Subdomain branding example narrowed from "any dev-freelancer" to CJ-specific
- **Brief location:** Executive Summary + Solution: _"all under their own brand on a `*.cjjutba.com` subdomain"_ and "Soloist is multi-tenant from day one so any dev-freelancer can brand and run their own portal."
- **PRD state:** Multi-tenancy is fully preserved (FR-1–FR-3, Glossary Tenant). The PRD uses `<slug>.cjjutba.com` correctly. No real gap — the "any dev-freelancer" multi-tenant promise is intact in §6.1 description. Listed only to confirm it was NOT weakened.
- **Severity:** **Low** (no action — verification pass).

### GAP-5 — "Notifications = the dopamine of visible progress" present but the brief's emphasis on *the moment something ships* is slightly generalized
- **Brief location:** Solution: _"Notifications (email + in-app + toast) the moment something ships — the dopamine of visible progress."_
- **PRD state:** Fully preserved — §6.5 description literally says "The dopamine of visible progress — the moment something ships," and UJ-3's climax captures the emotional beat. FR-15 adds "other key Engagement events" (an intentional expansion, see §4 below). No weakening.
- **Severity:** **Low** (no action — verification pass).

## 3. Qualitative / Voice Elements Check

These are the brief's "feel" elements that an FR structure tends to silently drop. Each checked against the PRD:

| Brief qualitative element | Carried into PRD? | Where / Note |
|---|---|---|
| Tagline _"Run solo. Deliver like an agency."_ | ✅ Yes | PRD title line (verbatim). |
| _"You hired an agency"_ tone from minute one | ✅ Yes, strongly | §6.3 description + §7 Aesthetic & Tone ("Feel: 'You hired an agency.'"). |
| _"your client never asks 'any updates?' again"_ as the whole pitch | ✅ Yes | §1, §3.1, UJ-3 resolution ("Her 'any updates?' message never gets typed"), SM-2. |
| The trust gap / client anxiety / "paying before receiving" emotional framing | ✅ Yes | §1 (verbatim "clients pay *before* they receive…anxiety that erodes trust"), §3.1 emotional JTBD. |
| The legitimacy gap ("great engineer look junior" / "scattered Slack + Loom + ad-hoc invoices") | ✅ Yes | §3.1 Social JTBD ("not like a scattered trail of Slack messages and ad-hoc invoices"). |
| The busywork tax (re-typing client/scope/rate; hours not billable) | ✅ Yes | §3.1 Functional JTBD; §6.6 ("The busywork killer"); FR-17. |
| ✅ / 🚧 / 📦 status vocabulary | ✅ Yes | Glossary (Ship Update), FR-10, §7 voice. |
| "dopamine of visible progress" | ✅ Yes | §6.5 description, UJ-3 climax. |
| Voice of product-generated text: plain-English, founder-friendly, no dev jargon, no raw commit language | ✅ Yes — *strengthened* | §7 Voice paragraph is more explicit than the brief; FR-11 enforces it; NFR-3 enforces "never expose source code." |
| Anti-references (cluttered PM dashboards, jargon dev changelogs, generic SaaS templates) | ✅ Yes — *added detail* | §7 Anti-references — this is MORE specific than the brief (good, intentional sharpening of the "feel"). |
| "Premium onboarding as the wedge" / "what makes it premium is undefined" | ✅ Yes | §6.3 ("The wedge"), FR-8 NOTE FOR PM defers concrete "premium" to UX, matches brief Open Question. |
| Honest moat caveat: _"execution speed, dev-tool integration, and the niche are the moat — not the portal itself"_ + _"a generic Soloist would be DOA"_ | ✅ Yes | §1 ("A generic Soloist would be DOA — the niche, the speed, and the integrations are the product"). Both halves preserved. |
| Flywheel / 2–3 year vision ("transparency layer for independent software work") | ⚠️ **Partial** | §1 keeps the near-term vision and moat, but the brief's **flywheel** (dogfood → other freelancers adopt → their clients become proof → default "client window" → "transparency layer for independent software work" in 2–3 years) and the portfolio "idea → shipped in weeks" centerpiece framing are **largely dropped** from the PRD. SM-4 keeps the portfolio payoff metric only. **Severity: Low-Medium** — long-horizon vision is arguably out of PRD scope, but the flywheel is a strategic thesis the brief leaned on. |

**Voice verdict:** Strong. The PRD did NOT silently drop the emotional/tone layer — §7 is a dedicated, load-bearing section and §3.1 preserves emotional JTBD. The only qualitative thinning is the long-term **flywheel/vision narrative** (see last row).

## 4. PRD Additions Not in the Brief (confirm intentional, not invention)

These appear in the PRD but not the brief. All look like reasonable downstream elaboration; flagged for confirmation:

- **A1 — "releases" added to GitHub auto-pull.** Brief says "commits/PRs"; PRD FR-10/§12 adds "commits, PRs, **and releases**." Intentional elaboration; consistent with the moat. Confirm.
- **A2 — Curation queue / candidate-vs-published distinction.** The brief says "curate what the client sees"; the PRD formalizes this into a `candidate` vs `published` model (Glossary, FR-10, FR-12) and makes curation **mandatory (no silent auto-publish)** `[ASSUMPTION]`. Good, but it is a *new explicit decision* the brief didn't make. Confirm.
- **A3 — Notifications on "other key Engagement events"** (new Invoice sent, engagement start) — FR-15. Brief scoped notifications to "the moment something ships." Reasonable expansion; confirm it's wanted in v1.
- **A4 — Counter-metrics SM-C1 (don't optimize update volume) and SM-C2 (don't trade launch speed for breadth).** Not in brief. Strong additions that protect the brief's intent (curation quality; dogfood-first). Confirm — these are good but invented.
- **A5 — Full NFR set:** NFR-2 Multi-Tenant Isolation (launch blocker), NFR-3 Security, NFR-4 Graceful Degradation, NFR-5 Live Performance, NFR-6 Cost, NFR-7 Accessibility. The brief implied responsive (NFR-1) and isolation; the rest (security hardening, graceful degradation, cost/solo-budget, accessibility baseline) are PRD-introduced. All sensible; NFR-2 and NFR-4 are well-justified. Confirm NFR-7 (baseline, not WCAG AA) is acceptable.
- **A6 — `app.cjjutba.com` Cockpit-domain assumption.** Brief only specified `*.cjjutba.com` for client subdomains; PRD infers a separate Cockpit host `[ASSUMPTION]`. Flagged in Open Question #8. Confirm.
- **A7 — Email verification before Tenant is publicly reachable** (FR-1 `[ASSUMPTION]`). Not in brief. Confirm.
- **A8 — Maya / persona names in user journeys.** Brief described "the client" abstractly; PRD names personas (CJ, Maya). Narrative aid, not a scope change. Fine.
- **A9 — Engagement archive, invoice numbering, line items, Draft→Sent→Paid status flow.** PRD-level detail not in brief. Reasonable; all tagged `[ASSUMPTION]`. Confirm.

## 5. Contradictions

**None material.** Checked the high-risk areas:
- **AI summaries timing** — Brief said AI is fast-follow "may land in v1 if cheap." PRD agrees: FR-11 = heuristic in v1, AI fast-follow, with NOTE FOR PM "pull into v1 if the build proves cheap." Consistent.
- **Scope (in/out)** — PRD §12 / §11 match the brief's In-v1 / Fast-follow / Out lists item-for-item (multi-tenant, branding, auth, engagement, onboarding, GitHub ship-feed, notifications, invoice in; Vercel/Linear, proposals, contracts, testimonial fast-follow; payments, chat, analytics, case studies out). No contradiction.
- **Real-money processing** — Both: explicitly out, invoice status manual. Consistent (FR-18, §11).
- **Timeline** — Brief "~4–8 weeks / weeks not months"; PRD addendum "3-day sprints / launch ASAP" with the tension **explicitly acknowledged** as a noted tension to reconcile in sprint planning — this is a surfaced tension, not a hidden contradiction. Acceptable.

One soft tension worth a note (not a contradiction): the **brief's "≥2 real client engagements within the first month"** (SM-1) coexists with the addendum's "launch ASAP / 3-day sprints." The PRD preserves both faithfully; the feasibility of "2 engagements in month 1" given a multi-week build is a sequencing question for sprint planning, not a PRD defect.

---

### Bottom line
No content was contradicted or dropped at high severity. The qualitative/voice layer — the part most at risk — is well preserved and in places sharpened (§7). The items most worth a confirmation pass: (1) re-state the dogfood-as-primary-validation **risk** explicitly [GAP-1, Med]; (2) decide whether the flywheel/2–3-yr vision belongs in the PRD or is intentionally deferred [§3 last row, Low-Med]; (3) confirm the PRD's invented decisions (mandatory curation, releases, extra notification events, counter-metrics) are wanted [§4].
