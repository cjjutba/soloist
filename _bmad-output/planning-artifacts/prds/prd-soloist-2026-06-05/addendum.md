# Addendum — PRD: Soloist

Technical depth and supporting material that informs the PRD but lives downstream (architecture, solution design, UX). The PRD body stays capability-focused; mechanism and tech choices are preserved here so the architecture workflow inherits them without re-deciding.

## Strategic Reference

The competitive landscape digest (named incumbents — SuperOkay, Copilot, Moxie, Bonsai, Dubsado, HoneyBook, etc. — positioning gaps, pricing norms `$9–24/mo` solo tier, and the ranked honest-moat check) lives in the **brief's** addendum: `_bmad-output/planning-artifacts/briefs/brief-soloist-2026-06-05/addendum.md`. The PRD's §1 Vision, §2 Why Now, and §11 Non-Goals carry the *conclusions*; that file holds the *evidence* for pricing and positioning decisions when they come (Open Question #1).

## Tech Stack (user-provided, 2026-06-05)

Intended stack for v1. Captured for the architecture phase; not binding requirements in the PRD body, but the chosen direction.

- **Framework:** Next.js (latest version) — full-stack React, App Router assumed.
- **Styling:** Tailwind CSS + **shadcn/ui** component library.
- **Database:** PostgreSQL hosted on **Neon** (serverless Postgres).
- **ORM:** Drizzle **or** Prisma — *[OPEN: pick one in architecture]*. (Drizzle leans serverless/edge-friendly + lighter; Prisma leans DX/maturity. Decide against the GitHub-integration + multi-tenant query patterns.)
- **Hosting / Deploy:** **Vercel** for production.
- **Other:** "best fit" libraries to be chosen during architecture (auth implementation, GitHub API client, email delivery, background jobs for polling/webhooks, subdomain routing on `*.cjjutba.com`).

**Architecture notes to resolve downstream:**
- Multi-tenant data model + per-tenant subdomain routing on Vercel (`*.cjjutba.com` wildcard domain).
- GitHub integration mechanism: webhooks vs. polling for commits/PRs/releases (affects "live" latency and Vercel function model).
- Email delivery provider for notifications (transactional email).
- Where AI commit→plain-English summarization runs, if/when included (model + cost).

## Sprint Cadence & Timeline (user-provided, 2026-06-05)

- **Cadence:** Short sprints, **3 days maximum** per sprint. Iterative, ship-early. Explicitly *not* weeks/months.
- **Goal:** Launch ASAP — get the earliest meaningful slice live, then layer. Portfolio centerpiece, so a public, demoable artifact matters early.
- **Tension noted:** The brief's full v1 scope (dev-native GitHub auto-feed + multi-tenant-from-day-1 + premium onboarding + invoice engine + notifications) was estimated at ~4–8 weeks. The ASAP/3-day-sprint goal requires either tight sprint sequencing of the full v1 or a trimmed first-launch slice. Reconciliation captured in the PRD's MVP Scope section and decision log.
