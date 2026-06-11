---
title: 'Mailpit-for-dev / Resend-for-prod email transport'
type: 'refactor'
created: '2026-06-10'
status: 'done'
context: []
baseline_commit: '837330de775e472c2bf18783ecd569d2da93bb38'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Email is sent by five functions that each construct their own Resend client and copy-paste an `if (!resend)` dev/prod guard. To *see* a rendered branded email in dev you must paste a real Resend key, which burns quota and risks emailing real people; the console-log-only fallback never shows the actual HTML. There is no local inbox.

**Approach:** Introduce one centralized mailer port — `src/server/email/mailer.ts` exposing `sendEmail({ to, subject, html?, text })` — that selects a transport from env: SMTP (→ Mailpit in Docker) for dev, the existing Resend SDK for prod, and a console-log fallback when neither is configured. Refactor the five senders to call `sendEmail`. Prod behavior stays identical; dev gets a real Mailpit inbox at `http://localhost:8025`.

## Boundaries & Constraints

**Always:**
- Prod keeps sending via the Resend SDK (`resend.emails.send`); payload shape (`from/to/subject/html/text`) unchanged.
- Sender signatures and their composed HTML/text stay byte-identical — they only swap *how* mail leaves (call `sendEmail`, not build-Resend-and-guard). `from` defaults to `env.EMAIL_FROM` inside the mailer.
- Loud-fail preserved: prod with NO usable transport must THROW (a reset/invite/invoice ping is never silently dropped). Dev never throws for transport reasons.
- Transport precedence: explicit `EMAIL_TRANSPORT` > `SMTP_HOST` present (smtp) > `RESEND_API_KEY` present (resend) > console.
- `text` is always provided; `html` is optional (auth emails are text-only).

**Ask First:** changing prod off the Resend SDK; altering any email's content/subject; adding features beyond transport routing (queues, retries, new templates).

**Never:** point the Resend SDK at Mailpit (HTTP-only vs SMTP — that's why nodemailer exists); commit secrets (`.env.local` is gitignored); touch the auto-generated `next-env.d.ts`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Resend (prod) | `RESEND_API_KEY` set, no `SMTP_HOST`, no `EMAIL_TRANSPORT` | `resend.emails.send({from,to,subject,html?,text})` called once | propagate send error |
| SMTP (dev/Mailpit) | `SMTP_HOST` set OR `EMAIL_TRANSPORT=smtp` | `nodemailer` transporter `.sendMail({from,to,subject,html?,text})` called once | see next two rows |
| SMTP down, dev | smtp transport, `sendMail` throws, `NODE_ENV!=='production'` | catch → `console.info` to/subject/text; resolve (no throw) | swallow + log |
| SMTP down, prod | smtp transport, `sendMail` throws, `NODE_ENV==='production'` | re-throw | loud |
| No transport, dev | no key, no host, no override, `NODE_ENV!=='production'` | `console.info` the message; resolve (no send) | none |
| No transport, prod | same but `NODE_ENV==='production'` | throw `No email transport configured …` incl. subject+to | loud |
| Explicit override | `EMAIL_TRANSPORT=resend` while `SMTP_HOST` also set | resend used (explicit beats inference) | — |

</frozen-after-approval>

## Code Map

- `src/server/email/mailer.ts` — **NEW.** The port: `sendEmail()`, `resolveTransport()`, lazy Resend + nodemailer singletons, console fallback, prod-throw guard.
- `src/server/auth/email.ts` — `sendVerificationEmail` + `sendResetPasswordEmail`: drop `Resend`+`env` imports and the `if(!resend)` guard; call `sendEmail`.
- `src/server/invitations/email.ts`, `src/server/doc-engine/invoice-sent-email.ts`, `src/server/ship-feed/ship-published-email.ts` — same refactor (keep each one's render + text + helpers).
- `src/env.ts` — add `EMAIL_TRANSPORT` (enum) + `SMTP_HOST/PORT/SECURE/USER/PASS`.
- `.env.example` — document the Mailpit/SMTP block. `.env.local` (dev-only, gitignored) — append the block so dev routes to Mailpit immediately.
- `docker-compose.yml` — **NEW.** `mailpit` service (UI `:8025`, SMTP `:1025`).
- `package.json` — add `nodemailer` + `@types/nodemailer`; `mail` / `mail:stop` scripts.
- `src/server/email/__tests__/mailer.test.ts` — **NEW**, full matrix. `src/server/auth/__tests__/reset-email.test.ts` — rewrite to mock the mailer (`sendEmail` spy) + assert composition.

## Tasks & Acceptance

**Execution:**
- [x] `package.json` — add `nodemailer` (dep) + `@types/nodemailer` (devDep) via `npm i`; add scripts `"mail": "docker compose up -d mailpit"`, `"mail:stop": "docker compose stop mailpit"`.
- [x] `docker-compose.yml` — add `mailpit` service (`axllent/mailpit`), ports `8027:8025` + `1027:1025` (host ports shifted off Mailpit's defaults — see Spec Change Log), `restart: unless-stopped`, accept-any-insecure-auth env so any SMTP creds work.
- [x] `src/env.ts` — add `EMAIL_TRANSPORT: z.enum(["resend","smtp","console"]).optional()` (empty→undefined), `SMTP_HOST` (optional), `SMTP_PORT` (coerce number, default `1027` — matches the published host port; see Spec Change Log), `SMTP_SECURE` (preprocess `v==="true"||v==="1"` → boolean, default false), `SMTP_USER`/`SMTP_PASS` (optional). Keep the empty-string→undefined preprocess pattern used by the existing optionals.
- [x] `src/server/email/mailer.ts` — implement `sendEmail`, `resolveTransport`, lazy Resend + nodemailer singletons, console fallback, prod-throw (message includes subject + to). Implements the full I/O matrix.
- [x] `src/server/auth/email.ts` — refactor both senders to `sendEmail`; remove Resend client, guard, and now-unused `env` import.
- [x] `src/server/invitations/email.ts` — refactor `sendInviteEmail` to `sendEmail`.
- [x] `src/server/doc-engine/invoice-sent-email.ts` — refactor `sendInvoiceSentEmail` to `sendEmail`.
- [x] `src/server/ship-feed/ship-published-email.ts` — refactor `sendShipPublishedEmail` to `sendEmail`.
- [x] `src/server/email/__tests__/mailer.test.ts` — cover every I/O matrix row (mock `resend`, `nodemailer`, `@/env`; reset modules per scenario like the existing reset-email test).
- [x] `src/server/auth/__tests__/reset-email.test.ts` — rewrite to mock `@/server/email/mailer`; assert `sendEmail` called with `to`, subject `/reset/i`, and `text` containing the url.
- [x] `.env.example` — add commented Mailpit/SMTP block referencing `npm run mail` + `http://localhost:8027`.
- [x] `.env.local` — append the Mailpit block (`EMAIL_TRANSPORT=smtp`, `SMTP_HOST=localhost`, `SMTP_PORT=1027`) so local dev uses Mailpit; read before editing, append only.

**Acceptance Criteria:**
- Given a dev with Mailpit running and `.env.local` set, when any of the five emails sends, then the message appears in the Mailpit inbox (`:8027`) and nothing hits Resend.
- Given a dev with Mailpit/Docker down, when an email sends, then it is console-logged (link visible) and no error surfaces.
- Given production with `RESEND_API_KEY` set, when an email sends, then it goes via the Resend SDK exactly as before (no behavior change).
- Given production with no transport configured, when an email sends, then `sendEmail` throws (loud fail).
- Given the full suite, when `npm test` runs, then all tests pass (the ~421 existing + new mailer tests), and `npm run typecheck` is clean.

## Verification

**Commands:**
- `npm run typecheck` -- expected: no errors (new env fields + mailer typed).
- `npm test` -- expected: all pass, including `mailer.test.ts` and the rewritten `reset-email.test.ts`.
- `npm run lint` -- expected: clean.
- `docker compose config` -- expected: validates the mailpit service.

**Manual checks:**
- `npm run mail` then trigger a password reset in dev → message visible at `http://localhost:8027` with branded HTML; Resend dashboard shows no send.

## Spec Change Log

- **2026-06-11 — Review patches (step-04).** Adversarial review applied four `patch` fixes: (1) `SMTP_PORT` default 1025 → 1027 so it matches the published host port and `.env.example`'s "SMTP_HOST alone is enough" promise holds (was: would dial 1025 → another project's Mailpit); (2) SMTP `auth` now requires BOTH `SMTP_USER` and `SMTP_PASS` (was: user-only → AUTH with undefined pass); (3) added auth-branch test coverage; (4) added a pin-test for `EMAIL_TRANSPORT=resend` + no key → fail-loud. Two findings were surfaced to the human, not auto-applied (load-bearing): the Resend SDK's `{error}` return is unchecked (silent-drop parity with the pre-refactor senders), and prod-transport hardening against a stray `SMTP_HOST`. KEEP: prod path stays on the Resend SDK; dev-never-throws for transport reasons.
- **2026-06-11 — Mailpit host ports 8025/1025 → 8027/1027.** Verification (`npm run mail`) found 8025/1025 already held by `aurahire-mailpit` on this machine (and `fiscplus-mailhog` on 1026/8026). The default would have (a) failed to bind and (b) routed Soloist's dev mail into aurahire's inbox. Shifted Soloist's *host* ports to 8027/1027 (container internals unchanged) across `docker-compose.yml`, `.env.example`, `.env.local`. Avoids cross-project mail mixing; matches the per-project port-shift convention already in use. KEEP: container stays on Mailpit's internal 1025/8025 defaults — only the published host port differs.

## Suggested Review Order

**The transport decision (start here)**

- Entry point — the one function that decides resend vs smtp vs console, in precedence order.
  [`mailer.ts:35`](../../src/server/email/mailer.ts#L35)

- The dispatcher: how each transport is invoked and where `from` defaults to `EMAIL_FROM`.
  [`mailer.ts:86`](../../src/server/email/mailer.ts#L86)

- Loud-fail vs forgiving: prod throws, dev falls back to console.
  [`mailer.ts:98`](../../src/server/email/mailer.ts#L98)

**Lazy clients (the two real transports)**

- Resend SDK kept for prod; conditional-spread avoids passing `html: undefined`.
  [`mailer.ts:45`](../../src/server/email/mailer.ts#L45)

- nodemailer → Mailpit; `auth` requires BOTH user and pass (review fix).
  [`mailer.ts:58`](../../src/server/email/mailer.ts#L58)

**Env contract**

- New transport vars; `SMTP_PORT` defaults to 1027 (the published host port).
  [`env.ts:37`](../../src/env.ts#L37)

**Senders now just compose + hand off (parity check)**

- Auth: text-only, no Resend client or guard — content byte-identical to before.
  [`email.ts:16`](../../src/server/auth/email.ts#L16)

- Branded fan-out sender: renders HTML, then `sendEmail` (same for invite/ship).
  [`invoice-sent-email.ts:48`](../../src/server/doc-engine/invoice-sent-email.ts#L48)

**Infra & tests (peripherals)**

- Mailpit service; host ports 8027/1027 to avoid colliding with other local catchers.
  [`docker-compose.yml:16`](../../docker-compose.yml#L16)

- Transport-selection matrix (resend/smtp/console + auth branches).
  [`mailer.test.ts:68`](../../src/server/email/__tests__/mailer.test.ts#L68)

- Failure & fallback semantics (SMTP-down dev/prod, no-transport, fail-loud pins).
  [`mailer.test.ts:166`](../../src/server/email/__tests__/mailer.test.ts#L166)
