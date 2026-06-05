---
baseline_commit: 1584226eedb10d0d280d9f5a621d4728ce0247ea
---
# Story 1.1: Deployable Walking Skeleton

Status: in-progress

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As the builder,
I want the app scaffolded, themed, and deployed with both surfaces resolving by subdomain,
so that deploy + subdomain routing + the design system are proven end-to-end on day one and every later story layers onto something already shipping.

## Acceptance Criteria

1. **Scaffold builds & runs.** A fresh Next.js 16 app (TypeScript strict, Tailwind v4, App Router, `src/` dir, `@/*` alias, Turbopack) plus `shadcn` init builds and runs locally with no errors. The full core dependency set (AR-1) is installed and committed as the baseline.
2. **Env contract fails fast.** `src/env.ts` validates the environment with Zod and throws at boot when a required variable is missing. The schema starts minimal (only the vars this story uses) and is extended by later stories.
3. **Both surfaces route by host.** Deployed on Vercel with `*.cjjutba.com` (wildcard) + `soloist.cjjutba.com`: a request to `soloist.cjjutba.com` resolves the **Cockpit** surface and renders a Cockpit shell; a request to any `<slug>.cjjutba.com` resolves the **Client-Portal** surface (placeholder lookup — no DB yet) and renders a Portal shell; an apex/unrecognized host renders the neutral `not-found` page. Routing works in local dev too.
4. **Design tokens defined.** `globals.css` authors the Tailwind v4 `@theme` with the DESIGN.md token system: Warm Paper, Soloist Ink, warm border/muted, the three fixed status token pairs, the runtime `--tenant-accent` / `--tenant-accent-foreground` / `--tenant-accent-text`, soft radii (sm6/md10/lg14/xl20/full), and the Fraunces (display) / Geist Sans (body) / Geist Mono (numeric) font families wired via `next/font` as CSS variables.

## Tasks / Subtasks

- [x] **Task 1 — Scaffold the app (AC: 1)**
  - [x] Ran `create-next-app@latest` (resolved Next 16.2.7) with `--ts --tailwind --eslint --app --src-dir --import-alias "@/*" --turbopack --react-compiler` (React 19.2.4, Tailwind v4). Scaffolded into a sibling dir then merged into the repo root (preserving `_bmad/`, `docs/`, the existing `.gitignore`).
  - [x] shadcn/ui foundation set up **manually** (deterministic, avoids the CLI's interactive prompts on a flaky network): `components.json` (Tailwind v4, neutral base, CSS variables) + `src/lib/utils.ts` (`cn`) + its runtime deps (cva, clsx, tailwind-merge, lucide-react, tw-animate-css). Equivalent outcome to `shadcn init`.
  - [x] Installed the full core dep baseline (AR-1): drizzle-orm, @neondatabase/serverless, better-auth, inngest, resend, react-email, @react-email/components, zod, the @octokit suite, @tanstack/react-query, react-hook-form, @hookform/resolvers, sonner, @vercel/blob, geist + `-D drizzle-kit vitest`.
  - [x] Install ≠ configure: only the skeleton is wired; Drizzle/Neon, Better Auth, Inngest, Octokit, Resend remain dormant deps for their own stories.
  - [x] `npm run build` succeeds with TS strict (verified twice).
- [x] **Task 2 — Env contract (AC: 2)**
  - [x] `src/env.ts` validates via Zod at module load and throws a clear error listing missing vars.
  - [x] Minimal schema (`NEXT_PUBLIC_ROOT_DOMAIN`, `NEXT_PUBLIC_COCKPIT_SUBDOMAIN`) + `.env.local` (gitignored) + `.env.example`.
  - [x] Documented in-file that later stories extend the schema (DATABASE_URL, etc.) — not added now.
- [x] **Task 3 — Design tokens + fonts (AC: 4)**
  - [x] `src/app/globals.css` defines the full DESIGN.md token set in the Tailwind v4 `@theme` (raw values in `:root` so `--tenant-accent` is runtime-overridable; exposed as utilities).
  - [x] Fonts via `next/font/google`: Fraunces (`--font-fraunces` → `font-display`), Geist (`--font-geist-sans` → `font-sans`), Geist Mono (`--font-geist-mono` → `font-mono`); applied on `<body>`.
  - [x] Verified tokens render (production HTML shows `text-muted-foreground`, `font-display`, etc. on the live responses).
- [x] **Task 4 — Subdomain routing + surface shells (AC: 3)**
  - [x] Implemented as `src/proxy.ts` — **[variance]** Next 16 renamed the `middleware.ts` convention to `proxy.ts` (runs on the **Node.js** runtime, not Edge as the architecture noted; host resolution is lightweight so Node is fine). Reads `host`, calls the pure `resolveSurface()`, rewrites to the surface; carries the slug via `x-tenant-slug` header; unknown host → neutral not-found.
  - [x] Surface shells at **`src/app/cockpit/`** + **`src/app/portal/`** — **[variance]** used real internal segments (rewrite targets) instead of `(cockpit)`/`(portal)` route groups, because two route-group `page.tsx` both resolving to `/` is a Next route collision. URLs stay clean via the proxy rewrite. Portal reads the slug header (no DB lookup — Story 1.5). Removed the unreachable root `app/page.tsx`.
  - [x] `src/app/not-found.tsx` — neutral, no Tenant detail (NFR-2).
  - [x] Local-dev routing works via `*.localhost` (root domain `localhost` in `.env.local`); proxy handles `.localhost` + `*.vercel.app` preview hosts. `.env.example` documents it.
- [x] **Task 5 — Providers baseline (AC: 1)**
  - [x] `src/app/providers.tsx`: TanStack Query provider (refetch-on-focus, 15s staleTime) + sonner `<Toaster/>` in the root layout. No Sentry/CI (Story 1.7).
- [ ] **Task 6 — Deploy + domains (AC: 3) — ⚠️ REQUIRES CJ (external credentials)**
  - [ ] Connect the repo to Vercel; first deploy. *(Needs your Vercel account — `vercel login` is interactive; I can't authenticate as you.)*
  - [ ] In Vercel → Project → Domains, add `*.cjjutba.com` **and** `soloist.cjjutba.com`. Wildcard SSL requires `cjjutba.com` on Vercel nameservers (`ns1.vercel-dns.com` / `ns2.vercel-dns.com`) — a DNS change at your registrar. *(Only you can change your domain's DNS.)*
  - [ ] Verify live: `soloist.cjjutba.com` → Cockpit; `<slug>.cjjutba.com` → Portal; apex/unknown → not-found. *(The exact same routing is already proven locally — see Completion Notes.)*
- [x] **Task 7 — Verify (all ACs)**
  - [x] `npm run build` clean (Next 16.2.7, Turbopack); `tsc --noEmit` clean; `eslint` clean.
  - [x] `src/lib/resolve-surface.test.ts` (vitest): **11 tests pass** — cockpit/portal/apex/www/unrelated/empty/case-insensitive across prod, `.localhost`, and `*.vercel.app` host shapes.
  - [x] Runtime routing proven against the production server: `soloist.localhost` → 200 Cockpit; `cj.localhost` → 200 Portal (rendered slug "cj"); apex `localhost` → 404 not-found; direct `/cockpit` on a portal host → 404 (guard).

## Dev Notes

**This story is the SKELETON. Hard scope boundaries — do NOT build these here (they have their own stories):**
- ❌ No database, schema, Drizzle client, or RLS → **Story 1.2**.
- ❌ No auth, sign-up, sessions, or cookies → **Stories 1.3 / 1.4**. Middleware here routes by host only; it does NOT check auth.
- ❌ No real Tenant lookup. `<slug>` → Portal is a **placeholder** (any slug renders the shell); the real "unknown slug → not-found" check needs the DB and is **Story 1.5**.
- ❌ No Branding settings/upload, no Sentry, no CI pipeline → **Stories 1.6 / 1.7**.
- Keep the Cockpit/Portal pages as minimal shells ("hello"-level), correctly themed.

**Verified tooling (June 2026):** Next.js **16.2** (Turbopack + React Compiler stable, App Router). Tailwind **v4** is CSS-first — **there is no `tailwind.config.js`**; all config lives in `globals.css` via `@theme` + CSS variables. `shadcn init` configures Tailwind v4 + App Router + `@/*` automatically. `create-next-app@16` defaults already enable TS/Tailwind/App Router/Turbopack/`@/*` and emit an `AGENTS.md`. [Source: web research 2026-06-06; architecture.md#Starter-Template-Evaluation]

**Design Tokens — author these exactly in `globals.css` `@theme`** [Source: DESIGN.md frontmatter]:
- `--color-background: #FBFAF8` (Warm Paper) · `--color-foreground: #1C1B1F` (Soloist Ink) · `--color-muted-foreground: #6B6760` · `--color-border: #EAE7E1`
- Status (fixed, never per-Tenant): shipped `#15803D` on `#ECFDF3`; in-progress `#92400E` on `#FEF6E7`; next `#475569` on `#F1F5F9`
- Per-Tenant runtime (defaults now; set per-Tenant in Story 1.6): `--tenant-accent: #5B5BD6` (Soloist Iris) · `--tenant-accent-foreground: #FFFFFF` · `--tenant-accent-text: #5B5BD6`
- Radii: `--radius-sm: 6px` · `--radius-md: 10px` · `--radius-lg: 14px` · `--radius-xl: 20px` · `--radius-full: 9999px`
- Fonts (via `next/font`, exposed as vars): `--font-display: Fraunces` (serif, premium moments only) · `--font-sans: Geist Sans` (body) · `--font-mono: Geist Mono` (numeric/money/timestamps). Geist ships in the `geist` package or `next/font/google`; Fraunces via `next/font/google`.

**Middleware routing logic** [Source: architecture.md#Key-Subsystem-Designs-A; EXPERIENCE.md#Foundation; PRD FR-3]:
- Extract host (strip `:port`). Cockpit host = `${NEXT_PUBLIC_COCKPIT_SUBDOMAIN}.${NEXT_PUBLIC_ROOT_DOMAIN}` (`soloist.cjjutba.com`). `soloist` is a reserved slug (full reserved list — `soloist, www, api, app, admin, mail` — is enforced by the slug picker in Story 1.3; here only the cockpit subdomain is special).
- Decision (extract as a pure function `resolveSurface(host)` for testability): cockpit-subdomain → `cockpit`; other non-empty subdomain → `portal` (carry slug); apex / `www` / unrecognized → `not-found`.
- Must also resolve `.localhost` (dev) and `*.vercel.app` preview hosts, not only prod. Run middleware on the Edge runtime.
- **Cross-subdomain auth is NOT this story** — but don't bake in anything that blocks it: Story 1.4 will decide cookie scoping (`.cjjutba.com`) with server-side role+tenant re-checks. Leave auth out entirely here.

**Vercel domains** [Source: web research 2026-06-06]: add `*.cjjutba.com` + `soloist.cjjutba.com` in Project → Domains; wildcard SSL requires the apex on Vercel nameservers. Vercel issues per-subdomain certs automatically.

**Testing standards** [Source: architecture.md#Project-Structure]: co-locate `*.test.ts`; e2e in `e2e/`. For this story, the meaningful test is the pure `resolveSurface(host)` decision function (Task 7) — middleware itself is thin glue. No DB/auth tests yet.

### Project Structure Notes

Aligns with the architecture's tree [Source: architecture.md#Project-Structure-&-Boundaries]. Files this story creates: `src/middleware.ts`, `src/env.ts`, `src/app/globals.css` (tokens), `src/app/layout.tsx` (fonts + providers), `src/app/(cockpit)/{layout,page}.tsx`, `src/app/(portal)/{layout,page}.tsx`, `src/app/not-found.tsx`, `.env.example`, `.github/workflows/ci.yml` is **deferred to Story 1.7** (don't create it here). `src/server/*` directories are created by later stories when first needed — do not scaffold empty server modules now.

No structural conflicts. The `(cockpit)` / `(portal)` route groups are the canonical home for the two surfaces per the architecture; keep all Cockpit UI under `(cockpit)` and all Client-facing UI under `(portal)`.

### References

- [Source: epics.md#Story-1.1-Deployable-Walking-Skeleton] — story + ACs + pre-mortem guardrail (skeleton first).
- [Source: architecture.md#Starter-Template-Evaluation] — init commands, Tailwind v4, Turbopack/React Compiler.
- [Source: architecture.md#Key-Subsystem-Designs] (A. subdomain resolution) + #Infrastructure-&-Deployment — host routing, Vercel domains.
- [Source: architecture.md#Project-Structure-&-Boundaries] — directory tree + boundaries.
- [Source: DESIGN.md] — token system (Colors, Typography, Shapes frontmatter + body).
- [Source: EXPERIENCE.md#Foundation] — two role-keyed surfaces, `soloist.cjjutba.com` confirmed.
- [Source: PRD FR-3] — subdomain routing + unknown → not-found (no leakage).

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (Claude Opus 4.8, 1M context)

### Debug Log References

- Flaky/slow network: `create-next-app`'s bundled install timed out (ETIMEDOUT on `next`). Recovered by setting npm resilience (`fetch-timeout=600000`, `fetch-retries=6`) and installing deps in separate resilient rounds.
- `create-next-app .` refuses a non-empty dir (existing `_bmad/`, `docs/`) → scaffolded into sibling `soloist-scaffold/` then `mv` into the repo root (same volume, instant), skipping the scaffold's `.gitignore`.
- Build flagged the Next 16 `middleware → proxy` deprecation → migrated `src/middleware.ts` → `src/proxy.ts` (`middleware()` → `proxy()`); rebuild clean, warning gone.

### Completion Notes List

- **Implementation complete and verified locally. The ONLY remaining item is Task 6 (Vercel deploy + DNS), which requires CJ's Vercel account and a registrar nameserver change — I cannot perform those.** The code is ready for `/code-review` now; deploy can happen in parallel.
- Build: Next 16.2.7 (Turbopack) compiles clean → routes `/cockpit` (static), `/portal` (dynamic, reads slug header), `/_not-found`; proxy active.
- Verified: 11 vitest unit tests on `resolveSurface`; `tsc --noEmit` clean; `eslint` clean; runtime curl tests on the production server for all four host cases — `soloist.localhost` → 200 Cockpit, `cj.localhost` → 200 Portal (rendered slug "cj"), apex `localhost` → 404 not-found, direct `/cockpit` on a portal host → 404 (guard). This is the exact routing Task 6's deploy verification will confirm in prod.
- **Variances from architecture.md (framework-forced, intentional):**
  1. `proxy.ts` (Node.js runtime) instead of `middleware.ts` (Edge) — Next 16 renamed the convention and proxy is Node-only. Host resolution is lightweight → no impact. *Recommend updating architecture.md's "edge middleware" wording.*
  2. Real `app/cockpit/` & `app/portal/` segments (proxy rewrite targets) instead of `(cockpit)`/`(portal)` route groups — two route-group pages cannot both resolve to `/` (Next collision). URLs stay clean via the rewrite; later stories add routes under `app/cockpit/...` and `app/portal/...`.
- shadcn/ui foundation set up manually (components.json + `cn` + runtime deps) instead of `shadcn init`, to stay deterministic on the flaky network — identical outcome.
- Scope boundaries respected: no DB/auth/branding/Sentry/CI (all deferred to their stories); core deps installed but dormant.

### File List

**New:** `src/env.ts` · `src/proxy.ts` · `src/lib/resolve-surface.ts` · `src/lib/resolve-surface.test.ts` · `src/lib/utils.ts` · `src/app/providers.tsx` · `src/app/cockpit/layout.tsx` · `src/app/cockpit/page.tsx` · `src/app/portal/layout.tsx` · `src/app/portal/page.tsx` · `src/app/not-found.tsx` · `components.json` · `vitest.config.ts` · `.env.example` · `.env.local` (gitignored) · scaffold baseline (`package.json`, `package-lock.json`, `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `postcss.config.mjs`, `next-env.d.ts`, `README.md`, `public/`, `node_modules/`)

**Modified:** `src/app/layout.tsx` (Fraunces + providers + metadata) · `src/app/globals.css` (DESIGN.md token system) · `.gitignore` (+`.vercel`, `/coverage`)

**Deleted:** `src/app/page.tsx` (unreachable under host routing)

## Change Log

- 2026-06-06 — Story 1.1 implemented: Next 16 scaffold + DESIGN.md tokens/fonts + `proxy.ts` host routing (`resolveSurface`) + cockpit/portal/not-found shells + TanStack Query/sonner providers + Zod env contract. Verified locally (build, 11 tests, runtime routing on all four host cases). Task 6 (Vercel deploy + DNS) handed off to CJ.
