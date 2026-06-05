---
title: "Product Brief: Soloist"
status: ready
created: 2026-06-05
updated: 2026-06-05
---

# Product Brief: Soloist

> _Run solo. Deliver like an agency._

## Executive Summary

**Soloist** is a dev-native client portal that lets a solo product engineer operate like a full agency. When a freelancer kicks off an engagement, their client lands in a **premium, branded onboarding** and then watches a **live "what shipped" window** that auto-populates from the developer's real tools — GitHub in v1, with Vercel and Linear to follow — rendered as plain-English progress a non-technical founder actually understands. The client always sees momentum and never has to ask *"any updates?"*. Meanwhile the freelancer runs the engagement and sends fill-in-the-blank documents (invoice in v1; proposals and contracts next) from a single cockpit.

This matters because clients pay *before* they receive, and that gap breeds anxiety that erodes trust — the thing that costs solo freelancers repeat business and referrals. Soloist closes the trust and legitimacy gaps with transparency that's automatic, not manual.

**Why now:** incumbents raised prices in 2025 while staying creative-tool-centric and manual, and AI has just made turning commits and PRs into client-readable updates trivial — opening the underserved solo product-engineer niche. Soloist is multi-tenant from day one so any dev-freelancer can brand and run their own portal.

## The Problem

A solo developer who freelances for startups lives with three compounding pains:

- **The trust gap.** A founder pays upfront, then sits in the dark between updates. That silence reads as risk — *"is this person actually working? Am I getting what I paid for?"* It produces "any updates?" pings, slow approvals, and second-guessing — even when the work is excellent.
- **The legitimacy gap.** Same skill as an agency, far less *perceived* legitimacy. A scattered trail of Slack messages, Loom links, and ad-hoc invoices makes a great engineer look junior.
- **The busywork tax.** Writing status updates, re-typing the same client/scope/rate data across proposals, invoices, and contracts, and stitching together tools to *look* professional — hours that aren't billable and aren't building.

**The cost of the status quo:** eroded trust → fewer referrals and repeat gigs (a freelancer's lifeblood), and time bled on coordination instead of shipping.

## The Solution

A two-sided, multi-tenant web app:

**Client Portal (the premium experience)**
- A polished, branded **onboarding** that sets the "you hired an agency" tone from minute one.
- A **live ship-feed** that auto-updates from the developer's connected repos and deploys — commits/PRs/releases mapped into founder-readable, status-tagged updates (✅ shipped · 🚧 in progress · 📦 next).
- **Notifications** (email + in-app + toast) the moment something ships — the dopamine of visible progress.

**Freelancer Cockpit (the engine)**
- Manage engagements; connect **GitHub** (Vercel/Linear to follow); curate what the client sees.
- **Fill-in-the-blank Doc Engine** — one invoice template in v1, sharing client data so nothing is re-typed.

**The outcome:** the client *feels* momentum in real time; the freelancer looks agency-grade and stops doing status busywork — all under their own brand on a `*.cjjutba.com` subdomain.

## What Makes This Different

Branded client portals are table stakes — a dozen players exist, several at solo pricing. A *generic* Soloist would be DOA. The honest, defensible edge is narrow and real:

- **Dev-native is the moat.** Soloist auto-pulls "what shipped" from a developer's actual tools (GitHub/Vercel/Linear). Every incumbent is integrated with *creative* tools (Figma, Loom) and relies on manual updates — they won't structurally chase dev integration. This is the one thing that's hard to copy.
- **Transparency-first as the whole pitch**, not a buried feature: *"your client never asks 'any updates?' again."*
- **AI-native progress.** Raw commits/PRs → plain-English summaries a founder understands — squarely in a builder's native habitat.
- **Niche focus.** Built for solo product engineers serving founders, an audience the big players treat as an afterthought.

**Honest caveat:** execution speed, dev-tool integration, and the niche are the moat — not the portal itself.

## Who This Serves

**Primary user — the solo product-engineer freelancer** (CJ is user #1). Full-stack, AI-native, ships fast, lives in GitHub/Vercel/Linear, serves startup and founder clients. Wants to look agency-grade and despises status-update busywork. Multi-tenant from day one means CJ *and* other dev-freelancers can each run their own branded workspace. _[ASSUMPTION] secondary-later: small 2–3 person dev studios._

**The other side — the client.** Non-technical or semi-technical **founders / startup operators** who have paid and want visible, trustworthy proof of progress without having to chase it.

> _[ASSUMPTION / RISK]_ Designing for "other dev-freelancers" before they're real users carries the risk of building on assumed workflows. The dogfood loop (CJ on real clients) is the primary validation signal; other-freelancer features should track that signal closely.

## Success Criteria

_All metrics below are [ASSUMPTION] starting targets — correct them to what you'd actually call success._

- **Dogfood depth:** CJ runs **≥ 2 real client engagements** fully on Soloist within the first month of using it. _[ASSUMPTION]_
- **The trust signal (qualitative, the real one):** at least one client unprompted cites the ship-feed / portal as why they trust or rehire — and "any updates?" messages drop to ~zero on engagements using it. _[ASSUMPTION]_
- **Productize signal:** **first 5–10 other dev-freelancers** sign up and brand a workspace after public launch. _[ASSUMPTION]_
- **Portfolio payoff:** Soloist headlines CJ's portfolio with a public demo and is attributable to **≥ 1 inbound gig**. _[ASSUMPTION]_

## Scope

**In — v1**
- Multi-tenant + per-tenant branding (logo, accent color); subdomain routing on `*.cjjutba.com`
- Email + password auth (freelancer and client)
- Engagement/project object
- Premium client onboarding (one polished flow)
- **Live ship-feed with GitHub integration** — auto-pull commits/PRs → client-readable updates; manual update as fallback
- Notifications: email + in-app + toast
- Doc Engine: invoice (fill-in-the-blank)
- Mobile/responsive throughout (constraint, not a feature)

**Fast-follow (post-v1)**
- Vercel + Linear integrations _[ASSUMPTION: GitHub first, these next]_
- AI commit→plain-English summaries _[ASSUMPTION: may land in v1 if cheap; otherwise here — see open questions]_
- Proposals; contracts + e-signature; issue tracker; testimonial-at-the-peak

**Out — v1**
- Real-money payment processing, deposits, retainer auto-billing
- Auto case studies, real-time chat, standalone analytics

**Scope reality:** dev-native-in-v1 + multi-tenant-from-day-1 + building for other freelancers pushes the realistic build to **~4–8 weeks** — the upper end of "weeks not months." A deliberate trade to own the moat in v1 rather than bolt it on later.

## Open Questions

- **Business model / pricing** — deferred by decision; revisit post-MVP (market norms in addendum).
- **AI summaries in v1 or fast-follow?** — depends on build effort of commit→plain-English mapping.
- **Dev-tool ordering** — GitHub first assumed; confirm Vercel vs Linear next.
- **Public demo portal** — the portfolio artifact; how it's seeded with believable demo data and exposed publicly is unspecced.
- **What makes onboarding "premium," concretely** — to be defined in the UX phase.
- **Other-freelancer demand** — validate before over-investing in multi-tenant polish.

## Vision

The flywheel: **dogfood** Soloist on CJ's own clients → **other dev-freelancers adopt** and brand their own portals → their clients' experiences become **proof** → Soloist becomes the default "client window" for independent builders. In 2–3 years it's the **transparency layer for independent software work** — wired into every dev tool, AI-summarizing progress, the thing a founder *expects* when they hire a solo engineer — and the living centerpiece of CJ's portfolio proving "idea → shipped in weeks."
