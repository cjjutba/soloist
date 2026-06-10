---
title: Password reset flow + show/hide password toggle
type: feature
created: 2026-06-10
status: done
baseline_commit: d468c29db797632b141f068ed6ab4083cb7879b0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Soloist has no password recovery — a user who forgets their password is locked out for good. And every password field is a blind type (no show/hide), hurting entry accuracy on login, signup, and invite-accept.

**Approach:** Wire Better Auth's built-in password reset (already in the stack) — a `sendResetPassword` transport plus `/forgot-password` and `/reset-password` pages — and add a shared `PasswordInput` (eye toggle) that every password field adopts.

## Boundaries & Constraints

**Always:**
- Reuse Better Auth's built-in reset (`requestPasswordReset` / `resetPassword`). Never hand-roll tokens, hashing, expiry, or storage.
- The reset email mirrors `sendVerificationEmail` exactly: plain text, dev logs the link, **production throws** when `RESEND_API_KEY` is missing — a reset link is an account-takeover credential, so it is never silently dropped or logged in prod.
- New pages live under `src/app/(auth)/` so they inherit the branded `AuthLayout` and stay outside the `/app` role guard.
- Forms follow the house pattern: `react-hook-form` + `zodResolver`, shadcn `Field`/`Button`, `sonner` toasts, `noValidate`, `aria-invalid`.
- `PasswordInput` forwards its ref (so `register()` works); the toggle is `type="button"` (never submits), is keyboard-focusable, and its `aria-label` flips Show/Hide.

**Ask First:**
- Branding the reset email with the react-email shell (Epic 4.3 templates) instead of plain text.
- Any change to password policy (min length stays 8) or session behavior.

**Never:**
- No new dependency — lucide-react, sonner, react-hook-form, zod are all present.
- No email-enumeration signal: the UI shows the same "check your inbox" state regardless of whether the address exists (Better Auth already equalizes the server response + timing).
- No auto sign-in after reset — redirect to `/login` (matches `autoSignIn: false`).
- No jsdom/RTL test infra added for the UI (out of scope for this slice).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Request reset | any email submitted at `/forgot-password` | UI shows "If an account exists, we've sent a link"; Better Auth emails the link only if the user exists | transport throw → generic toast, state unchanged |
| Toggle visibility | click eye on any password field | input `type` flips password↔text; icon + `aria-label` flip; form not submitted | N/A |
| Open valid reset link | `/reset-password?token=…` | reset form renders (new password + confirm) | N/A |
| Open invalid/expired link | `?error=INVALID_TOKEN` or missing `token` | "This link is invalid or expired" + link to `/forgot-password` | N/A |
| Submit new password | newPassword ≥8, confirm matches, valid token | `resetPassword` succeeds → success toast → redirect `/login` | token expired at submit → inline error + relink |
| Confirm mismatch / too short | client-side validation | zod error under the field; no request sent | N/A |
| Unverified user resets | password changes, `requireEmailVerification` still gates sign-in | login then shows "verify your email" (resends link) — graceful, no special handling | N/A |

</frozen-after-approval>

## Code Map

- `src/server/auth/index.ts` -- Better Auth config; add `sendResetPassword` + `resetPasswordTokenExpiresIn` to `emailAndPassword`.
- `src/server/auth/email.ts` -- add `sendResetPasswordEmail` (mirror of `sendVerificationEmail` incl. the dev-log/prod-throw guard).
- `src/server/auth/client.ts` -- export `requestPasswordReset`, `resetPassword` from `authClient`.
- `src/components/ui/input.tsx` -- base `Input` reused by `PasswordInput`.
- `src/components/ui/field.tsx` -- `Field` label/hint/error wrapper used by every form.
- `src/app/(auth)/layout.tsx`, `(auth)/login/page.tsx` -- page/layout pattern to mirror for the two new routes.
- `(auth)/login/login-form.tsx`, `(auth)/signup/signup-form.tsx`, `invite/[token]/accept-form.tsx` -- adopt `PasswordInput`.

## Tasks & Acceptance

**Execution:**
- [x] `src/components/ui/password-input.tsx` -- new `forwardRef` component wrapping `Input` with internal `show` state + a positioned `type="button"` toggle (lucide `Eye`/`EyeOff`, `aria-label`, `pr-10` so text clears the button). Passes through all input props; when `disabled`, the toggle is disabled too.
- [x] `src/server/auth/email.ts` -- add `sendResetPasswordEmail({ user, url })`: plain text, subject "Reset your Soloist password", body with `url` + "expires in 1 hour"; copy the verification guard (dev logs, prod throws when no Resend key).
- [x] `src/server/auth/index.ts` -- add `sendResetPassword: async ({ user, url, token }) => sendResetPasswordEmail({ user, url, token })` and `resetPasswordTokenExpiresIn: 60 * 60` inside `emailAndPassword`.
- [x] `src/server/auth/client.ts` -- add `requestPasswordReset`, `resetPassword` to the destructured exports.
- [x] `src/app/(auth)/forgot-password/page.tsx` + `forgot-password-form.tsx` -- email form → `requestPasswordReset({ email, redirectTo: "/reset-password" })` → render a "check your inbox" card (always, regardless of result); link back to `/login`.
- [x] `src/app/(auth)/reset-password/page.tsx` + `reset-password-form.tsx` -- server page reads `searchParams` (`token`, `error`); missing/invalid token → error card with relink; otherwise the client form (newPassword + confirm via `PasswordInput`, zod min-8 + match) → `resetPassword({ newPassword, token })` → success toast → `/login`. Map a `resetPassword` error to an inline message.
- [x] `(auth)/login/login-form.tsx` -- swap password `Input`→`PasswordInput`; add a "Forgot password?" link to `/forgot-password` by the password field.
- [x] `(auth)/signup/signup-form.tsx` + `invite/[token]/accept-form.tsx` -- swap password `Input`→`PasswordInput`.
- [x] `src/server/auth/__tests__/reset-email.test.ts` -- unit-test `sendResetPasswordEmail`: (1) with key → `resend.emails.send` called with correct `to`/`subject` and a body containing the `url`; (2) prod + no key → throws; (3) dev + no key → logs, no throw. Mock `resend` + `@/env`; use `vi.resetModules()` + dynamic import for the load-time `resend` branch (mirror the existing `vi.hoisted` + `vi.mock` style).

**Acceptance Criteria:** (system-level; I/O scenarios live in the matrix, not here)
- Given a registered user, when they request a reset and open the emailed link, then they can set a new password and sign in with it (full round trip).
- Given no `RESEND_API_KEY` in production, when a reset is requested, then the transport throws — the link is never silently lost or logged.
- Given all five password fields (login, signup, invite, reset ×2), then each renders the single shared `PasswordInput` — no duplicated toggle logic.

## Spec Change Log

- **2026-06-10 — Review (Edge-Case Hunter):** Reset left the user's other live sessions valid. CJ approved (Ask-First "session behavior" gate) adding `emailAndPassword.revokeSessionsOnPasswordReset: true` in `src/server/auth/index.ts`, so a reset deletes the user's other sessions — avoids the known-bad state where a compromise-recovery reset leaves an attacker's session alive. KEEP on any re-derivation: the enumeration/timing equalization (library-handled) and the prod-throw transport guard are correct — do not re-touch.
- **2026-06-10 — Review patches:** `PasswordInput` toggle got a visible `focus-visible` ring (was color-only); reset-email test resets mutated env in `afterEach`.

## Design Notes

- Email `url` (built by Better Auth) = `{origin}/api/auth/reset-password/{token}?callbackURL=/reset-password`; clicking it validates server-side, then redirects to `/reset-password?token=…` or `?error=INVALID_TOKEN`. The page consumes the query — it never parses the token.
- Client: `requestPasswordReset({ email, redirectTo })` (canonical 1.6; legacy alias `forgetPassword`) then `resetPassword({ newPassword, token })`. Confirm both on `authClient` via types.
- `PasswordInput` sketch:
  ```tsx
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input ref={ref} type={show ? "text" : "password"} className="pr-10" {...props} />
      <button type="button" onClick={() => setShow((v) => !v)} disabled={props.disabled}
        aria-label={show ? "Hide password" : "Show password"}
        className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground">
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
  ```

## Verification

**Commands:**
- `npm run lint` -- expected: clean (no a11y or `no-restricted-imports` violations).
- `npm run typecheck` -- expected: passes (PasswordInput ref + better-auth client types resolve).
- `npm test` -- expected: full suite green, including the new `reset-email.test.ts`; no regressions.

**Manual checks:**
- `/forgot-password` → submit → "check your inbox" card; with no Resend key, the dev console logs the reset link.
- Open the logged link → land on `/reset-password?token=…` → set a new password → redirected to `/login` → sign in with it.
- Eye toggle works on login, signup, invite-accept, and reset; no layout shift; operable by keyboard.

## Suggested Review Order

**Reset — server wiring (start here)**

- Entry point: where reset is wired — transport + 1h single-use token + session revocation on reset.
  [`index.ts:39`](../../src/server/auth/index.ts#L39)

- Transport mirrors the verification email; **production throws** so a reset link never silently drops or hits the logs.
  [`email.ts:50`](../../src/server/auth/email.ts#L50)

- Exposes Better Auth's built-in `requestPasswordReset` / `resetPassword` to the client.
  [`client.ts:12`](../../src/server/auth/client.ts#L12)

**Reset — pages & flow**

- Security gate: missing/invalid token → dead-end card before the form ever mounts.
  [`reset-password/page.tsx:24`](../../src/app/%28auth%29/reset-password/page.tsx#L24)

- Submit splits transport error vs invalid/expired token; success → no auto-login, redirect to `/login`.
  [`reset-password-form.tsx:48`](../../src/app/%28auth%29/reset-password/reset-password-form.tsx#L48)

- Non-enumerating: every outcome lands on the same neutral "check your inbox".
  [`forgot-password-form.tsx:39`](../../src/app/%28auth%29/forgot-password/forgot-password-form.tsx#L39)

**Show/hide toggle**

- Shared component: forwards ref (so `register()` works), toggle is `type="button"` (never submits), keyboard-focusable.
  [`password-input.tsx:15`](../../src/components/ui/password-input.tsx#L15)

- Adopts the component + adds the new "Forgot password?" link.
  [`login-form.tsx:83`](../../src/app/%28auth%29/login/login-form.tsx#L83)

- Remaining adoptions of the shared field.
  [`signup-form.tsx:117`](../../src/app/%28auth%29/signup/signup-form.tsx#L117) ·
  [`accept-form.tsx:58`](../../src/app/invite/%5Btoken%5D/accept-form.tsx#L58)

**Tests**

- Transport guard: prod-throw on missing key, dev-log, correct Resend payload.
  [`reset-email.test.ts:41`](../../src/server/auth/__tests__/reset-email.test.ts#L41)
