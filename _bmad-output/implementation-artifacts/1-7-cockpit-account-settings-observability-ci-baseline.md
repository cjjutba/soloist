---
baseline_commit: 2d8635c4d88e7f8cd42d00618dc9c1b8a366d2a3
---

# Story 1.7: Cockpit Account Settings + Observability/CI Baseline

Status: review

<!-- Note: Validation is optional. Run validate-create-story for a quality check before dev-story. -->

## Story

As a Freelancer (and the builder),
I want account settings and basic observability/CI in place,
so that I can manage my login and the project ships safely from day one.

## Acceptance Criteria

1. **Account screen — change email or password via Better Auth, with verification where appropriate.**
   **Given** the Account screen (Cockpit, `/app/settings/account`)
   **When** I update my name, email, or password
   **Then** the change is applied via Better Auth: **password** requires my current password (and revokes other sessions); **email** triggers Better Auth's change-email **verification** (the email only updates after the new address is verified); **name** updates immediately.

2. **CI baseline (AR-16).**
   **Given** the project
   **When** code is pushed
   **Then** a GitHub Actions workflow runs **typecheck, lint, a drizzle-kit migration drift check, the test suite, and build**.
   **And** the path to Vercel preview-per-PR (Neon branch) + prod-on-merge is documented as the activation step (it's a Vercel/GitHub/Neon **integration**, set up when the repo lands on GitHub — there's no remote yet).

3. **Observability — Sentry captures server + client errors (AR-15).**
   **Given** the deployed app
   **When** an unhandled error occurs on the server (Server Component / Action / Route Handler) or the client
   **Then** **Sentry** captures it. The SDK is wired with a **DSN-optional** config (no DSN → no-op, never breaks the build/local dev); setting `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` activates it.

> **Scope reality:** this is the infra-heavy Epic-1 closer — mostly wiring + thin forms, so it has a small *unit-testable* surface (the account forms call Better Auth client methods directly, like the 1.4 login form; Sentry/CI are validated by the build + the workflow itself). The bar is: gates green, the Sentry SDK builds DSN-less, the CI workflow is correct, and the account mutations work end-to-end.

## Tasks / Subtasks

- [x] **Task 1 — Account settings (name / email / password) + settings IA** (AC: 1)
  - [x] Enable change-email in the auth instance: add `changeEmail: { enabled: true }` to the existing `user:` block in `src/server/auth/index.ts`. Better Auth sends the change verification via the **already-wired** `emailVerification.sendVerificationEmail` (Story 1.3) — the email only updates after the new address is verified. (No new transport needed.)
  - [x] `src/app/app/settings/layout.tsx` — a settings shell with a sub-nav (**Account** · **Branding**), so both settings pages share chrome. Self-guard with `requireFreelancer()` (positional-guard discipline) or rely on the parent `/app` layout guard — the sub-pages still self-guard.
  - [x] `src/app/app/settings/account/page.tsx` (server): `requireFreelancer()` → `getAppSession()` (name/email) + `getTenant(ctx)` (tenant name/slug, read-only display) → render the form.
  - [x] `account-form.tsx` (client): three sections, each a small form using the **client** `authClient` (`@/server/auth/client`):
    - **Name:** `authClient.updateUser({ name })` → toast + `router.refresh()`.
    - **Email:** `authClient.changeEmail({ newEmail })` → on success show "Check your new email to confirm the change." Map `EMAIL_NOT_VERIFIED` / already-in-use / same-email errors to clear messages.
    - **Password:** `authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true })` → toast; map wrong-current-password to a field error (generic on others). Min length 8 (matches `emailAndPassword.minPasswordLength`).
    - Reuse the shared `Field` (`@/components/ui/field`), `Card`, `Button`, `Input`, `sonner`. Wrap each action call in try/catch (never let a thrown action strand the button). Use `role="alert"` for field errors.
  - [x] Cockpit nav: change the `/app` header link from "Branding" → **"Settings"** (`→ /app/settings/account`); the settings sub-nav covers Account/Branding.

- [x] **Task 2 — Sentry observability (DSN-optional)** (AC: 3)
  - [x] Add dependency **`@sentry/nextjs`** (the story specifies it; AR-15). Use the v8 **`instrumentation.ts`** approach (Turbopack-compatible — the old `sentry.*.config` auto-load is gone, but the config files are still imported by `register()`).
  - [x] `instrumentation.ts` (repo root or `src/`): `register()` imports `./sentry.server.config` when `NEXT_RUNTIME==="nodejs"` and `./sentry.edge.config` when `"edge"`; `export const onRequestError = Sentry.captureRequestError` (captures Server Component / Action / Route Handler errors).
  - [x] `sentry.server.config.ts` + `sentry.edge.config.ts`: `Sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0.1, enabled: !!process.env.SENTRY_DSN })` — **DSN-optional** (no DSN → disabled, no errors).
  - [x] `instrumentation-client.ts` (root): `Sentry.init({ dsn: process.env.NEXT_PUBLIC_SENTRY_DSN, tracesSampleRate: 0.1, enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN })` + `export const onRouterTransitionStart = Sentry.captureRouterTransitionStart`.
  - [x] `src/app/global-error.tsx` — a Client Component that `Sentry.captureException(error)` in a `useEffect` and renders a minimal neutral error UI (this catches React render errors the error boundary surfaces).
  - [x] `next.config.ts`: wrap with `withSentryConfig(nextConfig, { silent: !process.env.CI, org: process.env.SENTRY_ORG, project: process.env.SENTRY_PROJECT, authToken: process.env.SENTRY_AUTH_TOKEN })` — source-map upload only runs when an auth token is present; **verify `npm run build` (Turbopack) still passes**. If `withSentryConfig` breaks the Turbopack build, fall back to **instrumentation-only** (drop `withSentryConfig`; the `instrumentation*.ts` init + `onRequestError` still capture errors) and note it.
  - [x] `src/env.ts` += `SENTRY_DSN` (optional). `.env.example` += `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` (commented; optional). Add `instrumentation*.ts` / `sentry.*.config.ts` / `.sentryclirc` patterns to `.gitignore` only if generated; the config files are committed.

- [x] **Task 3 — GitHub Actions CI** (AC: 2)
  - [x] `.github/workflows/ci.yml`: trigger on `push` (main) + `pull_request`. One `ubuntu-latest` job: `actions/checkout@v4`, `actions/setup-node@v4` (node 22, `cache: npm`), `npm ci`, then **`npm run typecheck`**, **`npm run lint`**, **migration drift check** (`npm run db:generate` then `git diff --exit-code drizzle` — fails if the schema drifted from the committed migrations), **`npm test`**, **`npm run build`**.
  - [x] Provide build-time env in the job (the Zod `env.ts` validates at build): `DATABASE_URL=postgresql://user:pass@localhost:5432/soloist`, `BETTER_AUTH_SECRET` (≥32 chars placeholder), `BETTER_AUTH_URL=http://localhost:3000`. These are **format-valid placeholders** — `next build` doesn't connect to the DB, and `drizzle-kit generate` is offline (diffs the schema against the committed `drizzle/meta` snapshot, no DB needed). No real secrets in CI.

- [x] **Task 4 — Gates + deploy + ops notes** (AC: 1, 2, 3)
  - [x] `npm run lint && npm run typecheck && npm test && npm run build` clean (build proves the Sentry wiring compiles DSN-less).
  - [ ] Deploy to Vercel production. Live smoke (signed-in freelancer): `/app/settings/account` renders; change name; change password; request email change → "check your email".
  - [x] **Ops notes (document, don't block):** (a) to activate Sentry, CJ creates a Sentry project + sets `SENTRY_DSN`/`NEXT_PUBLIC_SENTRY_DSN` (+ optional `SENTRY_AUTH_TOKEN`/`SENTRY_ORG`/`SENTRY_PROJECT` for source maps) in Vercel; (b) to activate CI + preview-per-PR: push the repo to GitHub, connect it in Vercel (git integration), and enable Neon's Vercel preview-branch integration (AR-16).

## Dev Notes

### Architecture compliance

[Source: architecture.md L149, L233, L234, L308, L336]
- **Observability:** Sentry (errors, server + client) + Vercel logs + Inngest run history. "Lightweight, solo-friendly." Unexpected errors → throw → Sentry + a generic toast; expected errors → typed result + user copy (already the pattern). [L149, L234, L308]
- **CI/CD:** GitHub Actions — typecheck, lint, `drizzle-kit` migration check, build; Vercel auto-deploys on merge. The source tree expects `.github/workflows/ci.yml`. [L233, L336]
- **Server Action result convention** is established (`{ ok, ... }`), but the account mutations use the **client** `authClient` methods directly (returning `{ data, error }`) — same as the 1.4 login form. That's the simplest correct path (Better Auth handles the cookies/session); no Server Action wrapper needed.

### Better Auth `^1.6` (context7-verified)

- **`authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions })`** — requires an active session + the current password; `revokeOtherSessions: true` logs out other devices on change.
- **Change email** needs config `user: { changeEmail: { enabled: true } }`. Then `authClient.changeEmail({ newEmail, callbackURL? })` sends a verification to the **new** email (via `emailVerification.sendVerificationEmail`, already wired) and only updates after it's confirmed. (Optional `sendChangeEmailConfirmation` would require approval from the *current* email first — not needed for v1.)
- **`authClient.updateUser({ name })`** — updates the profile name immediately.
- Errors come back as `{ error }` with `error.code` / `error.status` / `error.message` — map known codes (e.g. invalid current password) to field errors, generic otherwise (no enumeration).

### Sentry `@sentry/nextjs` v8 (Next 16 / Turbopack)

- v8 **mandates `instrumentation.ts`** (the old `sentry.server.config.ts` auto-load is gone — but you still create those files and `register()` imports them). This is the Turbopack-compatible path. [context7: docs.sentry.io/.../nextjs/manual-setup]
- `export const onRequestError = Sentry.captureRequestError` in `instrumentation.ts` captures server-side request errors (Next 15+ hook).
- Client: `instrumentation-client.ts` with `Sentry.init` + `export const onRouterTransitionStart = Sentry.captureRouterTransitionStart`.
- `global-error.tsx` captures React render errors.
- **DSN-optional is the key constraint:** `enabled: !!dsn` so no-DSN builds/dev are silent no-ops. Client DSN is `NEXT_PUBLIC_SENTRY_DSN` (inlined at build); server is `SENTRY_DSN`. Read them via `process.env` directly in the Sentry config files (these run in the instrumentation context, around env validation).
- `withSentryConfig` is mainly source-map upload + tunneling — keep it minimal and **confirm the Turbopack build passes**; fall back to instrumentation-only if it doesn't.

### Previous-story intelligence (Stories 1.3–1.6)

- The Cockpit header lives in `src/app/app/layout.tsx` (currently "Soloist · Cockpit" + a **Branding** link + LogoutButton). Story 1.6 added `/app/settings/branding`. 1.7 adds the **settings shell** + `/app/settings/account` and reworks the header link to "Settings".
- `requireFreelancer()` (1.4) returns the freelancer principal; pages **self-guard**. The `/app` layout guards the subtree.
- Auth client: `src/server/auth/client.ts` exports `signIn/signOut/useSession` + the `authClient` (add `changePassword/changeEmail/updateUser` via the exported `authClient` or destructure). It has `"use client"`. The login form is the template for the account forms (try/catch, error mapping, toast).
- Shared `Field` (`src/components/ui/field.tsx`), shadcn primitives, `sonner` toaster (global). Tokens in `globals.css`.
- Gates: vitest (`npm test`), `npm run typecheck`/`lint`/`build`. Build = Turbopack (`serverExternalPackages`, `kysely@0.28.17` override, `serverActions.bodySizeLimit`, the `experimental` block — preserve all when wrapping with `withSentryConfig`).
- env.ts pattern: required vars throw at boot; optional vars use `z.preprocess(v => v===""?undefined:v, z.string().optional())`.

### Project Structure Notes

- `instrumentation.ts` + `instrumentation-client.ts` go at the **repo root** (or `src/` — pick one; Next looks at root then `src/`). `sentry.server.config.ts` / `sentry.edge.config.ts` at the root next to `instrumentation.ts`. `global-error.tsx` in `src/app/`.
- `.github/workflows/ci.yml` at the repo root.
- Account settings under `src/app/app/settings/` next to the existing `branding/`.
- Don't introduce a Server Action for the account mutations — the client `authClient` methods are the sanctioned path (cookies handled by the `/api/auth` route).

### Testing requirements

- **Gates are the primary verification** for the infra (Sentry/CI): `npm run build` must pass with the Sentry wiring (DSN-less). The CI workflow encodes the gate set.
- Optional thin unit coverage: if you extract any pure helper (e.g. an account zod schema or an error-code→message mapper), test it. The forms themselves (authClient calls) mirror the untested-but-smoked 1.4 login form.
- Don't regress the 92 prior tests.
- **Live smoke (Task 4):** name/password change apply; email change sends a verification; the account page renders for a signed-in freelancer.

### References

- [Source: epics.md#Story 1.7]
- [Source: architecture.md L149/L233/L234/L308 (observability + CI/CD), L336 (`.github/workflows/ci.yml`), L356 (settings tree)]
- [Source: src/server/auth/{index,client,email}.ts; src/app/app/layout.tsx; src/app/app/settings/branding/* (sibling pattern); src/env.ts; next.config.ts]
- Better Auth `^1.6` (context7): `changePassword`, `changeEmail` (+ `user.changeEmail.enabled`), `updateUser`.
- Sentry `@sentry/nextjs` v8 (context7 docs.sentry.io): `instrumentation.ts` + `onRequestError`, `instrumentation-client.ts` + `onRouterTransitionStart`, `withSentryConfig`, DSN-optional init.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (Claude Opus 4.8, 1M context)

### Debug Log References

- **`withSentryConfig` + Turbopack build: PASSES** (`@sentry/nextjs` 10.56) — no fallback needed. The instrumentation files + `onRequestError`/`onRouterTransitionStart` wire up cleanly; DSN-less init is a silent no-op.
- **Migration-drift check verified locally** (the CI step): `npm run db:generate` → "No schema changes" → `git diff drizzle` clean.
- Local prod smoke (:3100): `/app/settings/account` + `/app/settings/branding` (no auth) → **307 → /login**; clean boot (no Sentry errors).

### Completion Notes List

- **Account settings** (`/app/settings/account`): name (`authClient.updateUser`), email change (`authClient.changeEmail` → Better Auth verification to the new address, reusing the 1.3 transport), password change (`authClient.changePassword` with `revokeOtherSessions`, wrong-current-password → field error). Enabled `user.changeEmail` in the auth instance. Each sub-form has try/catch + `role="alert"` errors (login-form pattern).
- **Settings IA:** a `/app/settings` shell + sub-nav (Account · Branding, active-aware); the `/app` header link is now **"Settings"**. Refactored the 1.6 branding page to drop its own container (the shell provides it). Extended `AppSession` with `name` (session tests updated; 9/9 still green).
- **Sentry (DSN-optional, AR-15):** `instrumentation.ts` (+`onRequestError`), `sentry.server/edge.config.ts`, `instrumentation-client.ts` (+`onRouterTransitionStart`), `global-error.tsx` (captures React errors), `withSentryConfig` in `next.config.ts`. No DSN → disabled (build/dev never break). `env.ts` += optional `SENTRY_DSN`.
- **CI (AR-16):** `.github/workflows/ci.yml` — checkout → node 22 → `npm ci` → typecheck · lint · **migration-drift** (`db:generate` + `git diff --exit-code drizzle`) · test · build, with format-valid placeholder env (no real secrets; build never hits the DB, drizzle generate is offline).
- **Testing:** infra-heavy story — no new unit tests (account forms call `authClient` directly, like the untested-but-smoked 1.4 login form; Sentry/CI are validated by the build + the workflow). The 92 prior tests stay green; the build proves the Sentry wiring compiles DSN-less.
- **Ops (deferred to CJ, documented):** activate Sentry (create a Sentry project → set `SENTRY_DSN`/`NEXT_PUBLIC_SENTRY_DSN` in Vercel); activate CI + preview-per-PR (push to GitHub → connect in Vercel → Neon preview-branch integration).

### File List

**New:** `instrumentation.ts` · `instrumentation-client.ts` · `sentry.server.config.ts` · `sentry.edge.config.ts` · `src/app/global-error.tsx` · `.github/workflows/ci.yml` · `src/app/app/settings/layout.tsx` · `src/app/app/settings/settings-nav.tsx` · `src/app/app/settings/account/page.tsx` · `src/app/app/settings/account/account-form.tsx`

**Modified:** `src/server/auth/index.ts` (+`changeEmail`) · `src/server/auth/session.ts` (+`name` on AppSession) · `src/server/auth/__tests__/session.test.ts` (name fixtures) · `src/server/db/repositories/tenants.repository.ts` (activateTenant idempotent — review) · `src/server/db/__tests__/provision.test.ts` (idempotency test — review) · `src/app/app/layout.tsx` (header → "Settings") · `src/app/app/settings/branding/page.tsx` (drop container) · `src/env.ts` (+`SENTRY_DSN`) · `.env.example` · `next.config.ts` (`withSentryConfig`) · `package.json` + `package-lock.json` (+`@sentry/nextjs`)

## Senior Developer Review (AI)

**Reviewed:** 2026-06-06 · **Effort:** extra-high (4 finder angles + verify) · **Outcome:** the guard/security model holds (settings nest under the guarded `/app` layout + self-guard; Better Auth enforces current-password + change-email verification server-side; the user-controlled `name` is React-escaped); the build (`withSentryConfig` + Turbopack), DSN-optional Sentry, and CI migration-drift were all confirmed correct. One real correctness bug + hardening fixed (92/92).

**Fixed:**
- [x] **Activation timestamp reset (correctness):** Better Auth fires `afterEmailVerification` for change-email confirmations too, so confirming an email change re-ran `activateTenant` and **reset `tenants.activated_at`**. Made `activateTenant` **idempotent** (`isNull(activated_at)` in the predicate — stamp once). New test proves re-activation is a no-op.
- [x] **PasswordForm mis-mapped errors:** every `changePassword` failure was attributed to "wrong current password" → now only `INVALID_PASSWORD`/400 hits that field; other failures show a generic toast.
- [x] **`<main>` landmark:** the settings refactor left `/app/settings/*` with no `<main>` (every other surface has one) → the settings shell is now `<main>`.
- [x] **`global-error.tsx`** imports `globals.css` (it replaces the root layout, so it must pull the stylesheet — otherwise the crash fallback rendered unstyled).
- [x] **Sentry CI noise:** `silent: true` (no auth token → the plugin would warn on every CI build). **CI concurrency:** `cancel-in-progress` so rapid pushes don't pile up runs.
- [x] **EmailForm:** generic error copy (dropped the misleading "may already be in use" — the taken-email path is a deliberate anti-enumeration success), + a "Use a different email" escape from the sent state. Hoisted the three zod schemas to module scope (matches the login-form convention).

**Noted (accepted):** the account forms add no unit tests (they delegate to `authClient` exactly like the smoked-not-unit-tested 1.4 login form; Sentry/CI are build-validated). The shared `Field` doesn't wire `aria-describedby` — a pre-existing shared-pattern gap, out of 1.7's scope. The taken-email "false success" is the intended anti-enumeration behavior.

## Change Log

| Date       | Version | Description                                                                 | Author |
| ---------- | ------- | --------------------------------------------------------------------------- | ------ |
| 2026-06-06 | 0.1     | Story drafted (ultimate context engine).                                    | Scrum  |
| 2026-06-06 | 1.0     | Implemented Tasks 1–4: account settings (name/email/password), settings IA, Sentry (DSN-optional, Turbopack build ✓), GitHub Actions CI. 92 tests green, build clean, migration-drift ✓. | Dev (Opus 4.8) |
| 2026-06-06 | 1.1     | Code review (xhigh): fixed activation-timestamp reset (idempotent activateTenant), password error mapping, `<main>` landmark, global-error CSS, Sentry CI noise + concurrency, email-form UX. 92/92, build clean. | Review (Opus 4.8) |
