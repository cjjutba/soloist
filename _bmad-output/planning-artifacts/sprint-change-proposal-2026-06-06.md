---
title: Sprint Change Proposal — Subdomain → Path-Based Routing
project: soloist
date: 2026-06-06
author: CJ Jutba (decision) · Claude (analysis)
scope: Moderate (Direct Adjustment)
status: proposed
---

# Sprint Change Proposal: Path-Based Single-Domain Routing

## 1. Issue Summary

**Trigger.** During Story 1.1 deployment, the per-Tenant **subdomain** model (`<slug>.cjjutba.com` for portals, `soloist.cjjutba.com` for the Cockpit) hit a real-world constraint: the dynamic-tenant **wildcard `*.cjjutba.com` requires delegating `cjjutba.com`'s nameservers to Vercel**, which would move CJ's **live GoDaddy email (MX + SPF + Brevo)** off GoDaddy and risk breaking it. Per-client CNAMEs avoid that but add DNS friction per Tenant.

**Decision (CJ, 2026-06-06).** Switch v1 to **path-based, single-domain routing** on `soloist.cjjutba.com`. Custom per-freelancer domains become a **deferred upgrade feature**, not a v1 requirement.

**Rationale.** At dogfood stage (CJ + a couple of real clients) the subdomain's payoff — a premium *URL* and per-freelancer custom domains — is a *scale* concern, while its cost (DNS-per-tenant or the email-risking wildcard, plus cross-subdomain auth) is a *present* one. The premium *experience* (branded onboarding, logo/accent, serif, live Ship Feed) is **identical** under path routing — it lives in the UI, not the hostname.

## 2. New Routing Model

Single domain **`soloist.cjjutba.com`**:

| Path | Surface | Tenant resolved from |
|---|---|---|
| `/` | Landing → (authed freelancer) Cockpit | — |
| `/app/*` | **Cockpit** (freelancer) | authenticated session → owner's Tenant |
| `/portal/*` | **Client Portal** (client) | authenticated session → ClientAccess → Engagement + Tenant (branding) |
| `/invite/[token]` | Branded accept/onboarding (pre-auth) | the invite token → Tenant (branding) |
| anything else | neutral not-found | — |

- **Branding** resolves from the authenticated user's Tenant (post-auth) or the invite token (pre-auth) — not the URL.
- **NFR-2 isolation is UNCHANGED** — still the tenant-scoped data layer + Postgres RLS; the Tenant/Engagement is now taken from the **session** (authoritatively) instead of the subdomain. Unauthorized access still resolves to **not-found, never denied**.
- **Auth simplifies** — one cookie domain, no cross-subdomain session model.
- **Deferred upgrade:** an optional per-freelancer **custom domain** (`portal.theiragency.com` → that Tenant) behind the same routing seam, when productizing for other freelancers.

## 3. Impact Analysis

- **PRD** — §4 Information Architecture (subdomain → path); FR-3 (Subdomain Routing → Path Routing); §10 Platform; Glossary "Branding/Tenant" subdomain mentions; §15 / Open Q #8 (resolved differently).
- **UX `EXPERIENCE.md`** — Foundation (two surfaces by subdomain → by path), Information Architecture tables (hosts → paths), Per-Tenant Branding (resolved from session/token), the not-found state (unknown subdomain → unknown/unauthorized path), Key Flows (UJ-2 URL).
- **`architecture.md`** — Decisions table (subdomain routing, cross-subdomain auth → single-domain session); Auth (cross-subdomain model → single-domain role guard); Subsystem A (subdomain resolution → path/session resolution); Infrastructure (Vercel wildcard → single domain); Project Structure (`(cockpit)`/`(portal)` → `/app`,`/portal`,`/invite`); the reserved-slug list (no longer URL-facing — slugs become an internal Tenant identifier only).
- **`epics.md`** — Story 1.1 (host routing → path routing), Story 1.4 (cross-subdomain auth → single-domain session + role guard), Story 1.5 (subdomain resolves real Tenant → REMOVED/repurposed: Tenant comes from session; this story is largely obsolete), AR-7 (middleware subdomain → path/session), UX-DR3/17 (branding application), Story 2.x invite/onboarding URLs (`/invite/[token]`, `/portal`).
- **Code (Story 1.1, already built + deployed)** — remove `src/proxy.ts` host-router + `src/lib/resolve-surface.ts` (+ test); restructure `app/cockpit`→`app/app`, keep `app/portal`, add `app/page.tsx` (landing), `app/invite/[token]` placeholder; simplify `src/env.ts` (drop `NEXT_PUBLIC_ROOT_DOMAIN`/`COCKPIT_SUBDOMAIN`); redeploy; remove now-unused Vercel env vars.

**Net effect: the architecture gets SIMPLER** (native Next routing, no host-rewriting proxy, no cross-subdomain cookies, no wildcard/DNS). NFR-2, the data model, and every other decision are unaffected.

## 4. Detailed Change Proposals

### 4.1 PRD

**§4 Information Architecture** — OLD: "Two role-keyed experiences, resolved by **subdomain** and authenticated role… Cockpit served at a primary app domain… Client Portal served at the Tenant subdomain `<slug>.cjjutba.com`."
**NEW:** "Two role-keyed experiences on a **single domain** (`soloist.cjjutba.com`), resolved by **path + authenticated role**: `/app/*` = Cockpit (freelancer; Tenant from session); `/portal/*` = Client Portal (client; Engagement + branding from session); `/invite/[token]` = branded pre-auth onboarding (Tenant from token). Per-freelancer **custom domains** are a deferred upgrade, not v1."

**FR-3** — retitle "Subdomain Routing" → **"Surface Routing (path-based)"**; consequences become: a request to `/app` resolves the Cockpit for the authenticated freelancer; `/portal` resolves that Client's Engagement; an unknown or unauthorized path returns a clear not-found (no leakage). **§14 Open Q #8 (Cockpit domain) → RESOLVED** (single domain, `/app`).

### 4.2 UX `EXPERIENCE.md`

- **Foundation** — "resolved by subdomain + authenticated role" → "resolved by **path + authenticated role** on `soloist.cjjutba.com`"; Cockpit `/app`, Client Portal `/portal` (mobile-first).
- **IA tables** — replace the `<slug>.cjjutba.com` / `soloist.cjjutba.com` host column framing with path framing (`/app/...`, `/portal/...`, `/invite/[token]`).
- **Per-Tenant Branding** — "applied to all Client-facing surfaces" unchanged, but resolved from **session/invite token**, not the subdomain.
- **not-found** — "unknown subdomain → not-found" → "unknown/unauthorized path or Engagement → not-found (NFR-2, no disclosure)."
- **Key Flows UJ-2** — "lands on `cj.cjjutba.com`" → "lands on `soloist.cjjutba.com/invite/<token>` → after set-password, `/portal`."

### 4.3 `architecture.md`

- **Decisions table** — "Tenancy … subdomain" / "Auth … cross-subdomain" → "**path + session** routing on one domain; role-guarded; Tenant from session."
- **Auth** — replace the cross-subdomain cookie model with a **single-domain session**; middleware/guard enforces `/app` ⇒ freelancer-of-this-Tenant, `/portal` ⇒ client-of-this-Engagement; mismatch ⇒ not-found.
- **Subsystem A** — "subdomain resolution" → "**path + session** resolution"; remove host-rewriting; reserved-slug list demoted to an internal Tenant identifier (not URL-facing).
- **Infrastructure** — drop the wildcard `*.cjjutba.com` / nameserver requirement; single custom domain `soloist.cjjutba.com` (CNAME, already live); note the email-risk rationale; custom-domain-per-Tenant = future.
- **Project Structure** — `app/(cockpit)`/`app/(portal)` → `app/app/`, `app/portal/`, `app/invite/[token]/`, `app/page.tsx`.

### 4.4 `epics.md`

- **Story 1.1** — "Both surfaces route by host" → "Both surfaces are real path segments (`/app`, `/portal`) on one domain; root landing; neutral not-found." Drop the host-proxy/`resolveSurface`.
- **Story 1.4** — "cross-subdomain model" → "single-domain session + role guard (`/app` freelancer, `/portal` client; mismatch → not-found)."
- **Story 1.5** — "Subdomain routing resolves a real Tenant" → **largely obsolete**; fold the residual ("Tenant resolved authoritatively from session; unauthorized → not-found") into Story 1.4. Re-number or mark superseded.
- **AR-7** — "edge middleware subdomain/role resolution" → "path + session role resolution (no host rewriting)."
- **Story 2.3/2.4/2.5** — invite link `/invite/[token]`; onboarding → `/portal`.

### 4.5 Code (Story 1.1)

- Delete `src/proxy.ts`, `src/lib/resolve-surface.ts`, `src/lib/resolve-surface.test.ts`.
- Rename `src/app/cockpit/` → `src/app/app/`; keep `src/app/portal/`.
- Add `src/app/page.tsx` (minimal landing → link/redirect to `/app`); add `src/app/invite/[token]/page.tsx` placeholder.
- Simplify `src/env.ts` (remove the two `NEXT_PUBLIC_*` domain vars; keep the fail-fast structure for later stories).
- New tests as appropriate (the host-routing test is removed; routing is now native Next + later auth-guard tests in 1.4).
- `vercel --prod` redeploy; remove the now-unused `NEXT_PUBLIC_ROOT_DOMAIN` / `NEXT_PUBLIC_COCKPIT_SUBDOMAIN` Vercel env vars.

## 5. Implementation Handoff

- **Scope: Moderate** — Direct Adjustment across artifacts + a contained code revision of the (built, unmerged) Story 1.1.
- **Route to:** Developer (Claude) — apply the doc edits (§4.1–4.4), revise + re-verify + redeploy the code (§4.5), update the Story 1.1 file + sprint status.
- **Success criteria:** all five artifacts reflect path routing; `soloist.cjjutba.com/app` → Cockpit and `/portal` → Portal in production; build + tests green; NFR-2 isolation wording intact; no orphaned subdomain references.
- **Not changed:** NFR-2 isolation mechanism, data model, stack, all other epics/stories. Custom domains logged as a deferred upgrade.
