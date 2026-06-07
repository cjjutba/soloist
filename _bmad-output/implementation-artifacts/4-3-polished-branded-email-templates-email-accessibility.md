---
baseline_commit: d1f079a
---

# Story 4.3: Polished Branded Email Templates + Email Accessibility

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Client,
I want the emails I receive to look like my freelancer's brand and be readable anywhere,
so that even my inbox feels premium and works with images off (FR-15, UX-DR15, AR-11).

## Acceptance Criteria

1. **One polished, branded shell — both emails upgraded (FR-15, AR-11).**
   **Given** the two React Email templates (`ship-published-email`, `invite-email`)
   **When** either is sent
   **Then** it renders through ONE shared branded shell carrying the **Tenant logo + accent** (a premium upgrade over Epic 3's minimal layout): a pinned-inline **accent brand bar**, the **logo** (alt-text) header, the accent button (white-on-accent), and a consistent footer. The ship-published email keeps the **status as emoji + text label** (✅ Shipped) and the publish title/summary; the invite keeps its set-password CTA — both now share the polished chrome.

2. **Readable anywhere — the email-a11y rules (UX-DR15, EXPERIENCE.md L75).**
   **Given** an email in any client (images off, dark mode, screen reader)
   **Then** it degrades safely: the Tenant **logo has `alt="{Tenant name}"`** (it's the only naming in the header); **status survives images-off** (emoji + text label, never color-only); the brand colors are **explicit inline backgrounds** (so dark-mode clients invert less); the structure uses **semantic headings**; and the **body text is ≥14px** (fine print may be smaller).

## Tasks / Subtasks

- [x] **Task 1 — The shared branded email shell** (AC: 1, 2)
  - [x] `src/emails/email-shell.tsx` (NEW): `EmailShell({ tenantName, logoUrl, accentHex, preview, children })` — the common chrome both emails share: `<Html><Head/><Preview>{preview}</Preview><Body>` (warm `#faf9f7` bg, `Arial, Helvetica, sans-serif`) → a `<Container>` (white card, `maxWidth: 480`, `overflow: hidden`, rounded, warm border) → **the accent as a 4px top BORDER on the card** (review-hardened: a thin spacer `<Section height:4>` collapses to 0px in Outlook/MSO — which ignores table `height` — so the accent would vanish there; a `border-top` is honored everywhere and is still an explicit inline color) → a **logo header** (`<Img alt={tenantName} height={32}>` on white when `logoUrl`, else the **tenant name** as a bold `<Text>` — the logo is the only naming, so `alt={tenantName}`; with no logo the text already names the Tenant) → `{children}` (the body, padded `32px`). Keep it RSC/server-render-only (React Email). All colors inline (email clients strip `<style>`/classes).
  - [x] **Test** (`src/emails/__tests__/email-shell.test.ts`, render to HTML): with a logo → the `<img>` has `alt="{tenantName}"` + the logo src; without a logo → no `<img>`, the tenant name text present; the `accentHex` appears (the brand bar); the preview text present.

- [x] **Task 2 — Refactor the ship-published email through the shell** (AC: 1, 2)
  - [x] `src/emails/ship-published-email.tsx` (MODIFY): wrap the body in `<EmailShell tenantName logoUrl accentHex preview={\`${statusLabel}: ${title}\`}>`; keep the **status pill** (emoji + **text label**, the tinted `statusBg`/`statusFg` inline — survives images-off), a semantic `<Heading>` ("New progress on your project"), the greeting (`Hi {clientDisplayName}, …`), the plain-English **title** (bold) + **summary**, and the **"View in your portal"** accent (`accentHex`) Button. Ensure **all body text ≥14px** (bumped the status pill 13px→14px; the footer fine print stays ~12px). Removed the now-shell-owned Html/Head/Body/Container/logo boilerplate. Props unchanged (the `ship-published-email.ts` wrapper already passes everything).
  - [x] **Test** (`src/server/ship-feed/__tests__/ship-published-email.test.ts`, MODIFY): existing asserts (title, the status **label** text, the `accentHex`, the `portalUrl`, the logo `alt`/tenant-name fallback, summary-omitted-when-null) confirmed still passing through the shell.

- [x] **Task 3 — Refactor the invite email through the shell** (AC: 1, 2)
  - [x] `src/emails/invite-email.tsx` (MODIFY): wrapped in `<EmailShell tenantName logoUrl accentHex preview={\`${tenantName} invited you to your client portal\`}>`; kept the "You're invited" `<Heading>`, the set-password copy, the **"Accept invitation"** accent Button, the paste-link line, and the 7-day-expiry footer. **Bumped the 13px paste-link → 14px** (the 15px heading-body fine; the 12px footer fine print stays). Removed the now-shell-owned boilerplate. Updated the docstring. Props unchanged (the `invitations/email.ts` wrapper is unaffected).
  - [x] **Test** (`src/emails/__tests__/invite-email.test.ts`, NEW): render → the invite URL present (both the Button href + the paste-link), the logo `alt`/tenant-name fallback, the `accentHex`, the "Accept invitation" CTA; no images-off failure (the tenant name is text, the CTA is text).

- [x] **Task 4 — Gates + deploy** (AC: 1, 2)
  - [x] `lint && typecheck && test && build` green (343 tests, +4 over the prior 339; the `ship-published-email` + `invitations/email` WRAPPERS + their callers — the 3.6 fan-out, the 2.3 invite action — untouched, only the templates changed). **No schema/route/action/Inngest change** (`db:generate` → no drift). Deployed (`vercel --prod`; `.env.local` checksum `ecedc7314b8e405f0a7bba826b19ef73` verified unchanged) + pushed. **No Inngest re-sync.**
  - [ ] **Live validation (CJ):** trigger both emails (publish an update → ship-published; invite a test email → invite) and check the inbox: the branded shell (logo + accent bar + accent button) renders; toggle images-off → the tenant name + status label + CTA still read; check a dark-mode client → the accent bar/button don't invert badly; the body is comfortably ≥14px.

## Dev Notes

### What exists vs net-new (read this first)

[Source: `src/emails/{ship-published-email.tsx (3.6), invite-email.tsx (2.3)}`; the wrappers `ship-feed/ship-published-email.ts` + `invitations/email.ts`; DESIGN.md L125-131/L180; EXPERIENCE.md L75]

- **Reused (don't rebuild):**
  - **Both templates already exist + already carry logo+accent+alt+emoji-label** — 4.3 is a **polish + consolidation**, not a rebuild. The invite template's own comment names this story: "Epic 4.3 replaces this with the polished, a11y-audited template system."
  - The **wrappers are untouched** — `ship-published-email.ts` (3.6) already passes `statusEmoji/statusLabel/statusBg/statusFg/title/summary/clientDisplayName/tenantName/logoUrl/accentHex/portalUrl`; `invitations/email.ts` (2.3) passes `inviteUrl/tenantName/logoUrl/accentHex`. The shell + refactored templates consume the SAME props → **no wrapper/caller change** (the 3.6 fan-out + the 2.3 invite action keep working).
  - `SHIP_STATUS` (the emoji/label/`bg`/`fg` hex — the wrapper already resolves these); the accent default (`#5b5bd6` Soloist Iris, passed by the fan-out when the Tenant set none).
  - The `render(createElement(Template, props))` test pattern (the existing `ship-published-email.test.ts`).

- **Net-new (this story):** the shared `EmailShell`; the two template refactors to use it + the ≥14px/semantic-heading polish; one new test (invite) + the shell test + the ship-published test update. **No backend, schema, route, action, or Inngest change.**

### The email-a11y spec (the load-bearing requirements)

[Source: EXPERIENCE.md L75 (verbatim the a11y rules); DESIGN.md L131 (status emoji is "never the sole carrier — the text label always accompanies it, so status survives … images-off email"); L126 (the guard-validated accent pair: white-on-accent ≥4.5 for the button fill)]

- **Logo alt:** `alt="{Tenant name}"` because the logo is the ONLY naming in the header (no adjacent tenant-name text). (The "alt='' when adjacent text already names it" case doesn't apply here — there's no sibling name.)
- **Images-off survival:** the **status label is TEXT** (the emoji is decorative-adjacent, the word "Shipped"/"In Progress"/"Next" carries it); the logo falls back to the **tenant name text**; the CTA is a **text** button. So with images off, the email still reads.
- **Dark-mode:** brand colors are **explicit inline `backgroundColor`** (the accent bar + the button) — pinning limits dark-mode clients' auto-inversion damage (a known, accepted email limitation; we don't fight it, we bound it).
- **Semantic headings + ≥14px body:** a real `<Heading>` per email; body copy ≥14px (fine print may be smaller).
- The accent is **guard-validated at save-time** (Story 1.6 branding) — white-on-accent ≥4.5, so the button's white text is legible; the email trusts that (it can't run the live guard at open-time).

### Architecture compliance

[Source: architecture.md L142 (Resend + React Email, per-Tenant branding props), L250 (the branded email is step 2 of the publish fan-out), AR-11 (React Email templates); EXPERIENCE.md L75; DESIGN.md L109 ("premium while disappearing into someone else's brand")]

- This realizes the brand paradox: the Soloist craft (spacing, calm, the shell) as the substrate; the Tenant's logo + accent painted on top → "this person's own product." The accent stays Client-facing (emails are a Client surface — correct, never the Cockpit).
- Pure presentation — the publish privacy gate, the fan-out, and the send-policy (dev-log/prod-throw) are unchanged; only the rendered HTML improves.

### Project Structure Notes

- **NEW:** `src/emails/email-shell.tsx` (+ `__tests__/email-shell.test.ts`, `__tests__/invite-email.test.ts`).
- **MODIFIED:** `src/emails/{ship-published-email.tsx, invite-email.tsx}` (use the shell + a11y polish); `src/server/ship-feed/__tests__/ship-published-email.test.ts` (assert the polished output still holds).
- **Naming:** `EmailShell` (the shared layout); templates stay `ship-published-email.tsx`/`invite-email.tsx`.
- **Watch:** (1) props are UNCHANGED — don't touch the wrappers or callers (a prop rename would break the 3.6 fan-out / the 2.3 invite send). (2) ALL colors inline (email clients strip `<style>`/CSS classes — no Tailwind). (3) the logo header `alt={tenantName}`; the no-logo fallback is the tenant-name text. (4) the accent appears in ≥2 places (bar + button) — both pinned inline. (5) keep the status as **emoji + text label** (don't drop the word). (6) React Email `render()` runs in the node test env (server-side to an HTML string) — the existing test proves this works.

### Testing requirements

- **Render-to-HTML (node, the existing pattern):** `EmailShell` (logo alt vs name fallback; accent bar; preview); `ship-published-email` (title, status **label text**, accent in bar+button, portal URL, logo alt, summary-null-omitted); `invite-email` (invite URL in CTA + paste-link, accent, logo alt, "Accept invitation").
- **Regression:** the 339 prior tests stay green; the wrappers + callers untouched; no schema/route/Inngest change. (The actual inbox rendering — dark mode, images-off, ≥14px feel — is live-validated, CJ's Task 4; HTML-string asserts can't fully judge visual rendering.)

### References

- [Source: epics.md#Story 4.3 (React Email templates render Tenant logo + accent, logo alt, emoji+label status surviving images-off, pinned inline backgrounds for dark-mode, semantic headings); #Story 3.6 (the ship-published email + wrapper), #Story 2.3 (the invite email + wrapper)]
- [Source: architecture.md L142/L250, AR-11; EXPERIENCE.md L75; DESIGN.md L109/L125-131/L180]
- [Source: src/emails/{ship-published-email.tsx, invite-email.tsx}; src/server/ship-feed/ship-published-email.ts + __tests__/ship-published-email.test.ts; src/server/invitations/email.ts; src/components/ui/ship-status.ts (SHIP_STATUS emoji/label/bg/fg)]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (1M context) — dev-story + xhigh review chain.

### Debug Log References

- `npx tsc --noEmit` → clean. `npm run lint` → clean. `npx vitest run` → **343 passed (43 files)**. `npm run build` → ✓ Compiled. `npm run db:generate` → "No schema changes" (no drift).
- Render sanity-check: `ShipPublishedEmail` HTML carries `border-top:4px solid #5b5bd6`; accent `#5b5bd6` appears exactly twice (the card border + the button), the expected count.

### Completion Notes List

- **One shared `EmailShell`** now backs both emails — warm `#faf9f7` page → white rounded card → **accent top-border** → logo (alt) / tenant-name header → padded body. Both templates dropped their Html/Head/Body/Container/logo boilerplate (net simplification) and pass only their own props (UNCHANGED prop shapes → the 3.6 fan-out + the 2.3 invite send are untouched; the wrappers `ship-feed/ship-published-email.ts` and `invitations/email.ts` were not modified — confirmed by `git status`).
- **Email-a11y rules all met (verified in rendered HTML):** logo `alt="{tenantName}"` + a tenant-name `<Text>` fallback when no logo (images-off safe, no `<img>` present); the ship status is **emoji + the text label** in the pill (the word "Shipped" survives images-off); all brand colors are **explicit inline backgrounds** (the card border + both buttons — no CSS classes/`<style>`); one semantic `<Heading>` per email; **body copy ≥14px** (the only sub-14 values are the two 12px footer/legal lines — genuine fine print; the status pill 13→14 and the invite paste-link 13→14 were bumped).
- **Review fix (the one real finding):** the accent was first built as a thin spacer `<Section style={{ height: 4 }}>` with a single-space cell. Outlook/MSO ignores a table's CSS `height` and collapses the space → the accent (one of only two brand cues in the chrome) would render as a 0-px invisible strip there. Reworked to a **`border-top: 4px solid {accent}` on the Container** — honored across clients (incl. Outlook), and it deletes the fragile spacer entirely. The second finding (Outlook ignores `border-radius`/`overflow:hidden` → square corners) is a known-acceptable degradation; no action.
- **Scope discipline:** pure presentation. No backend, schema, route, action, or Inngest change; the publish privacy gate, the fan-out, and the dev-log/prod-throw send-policy are all unchanged — only the rendered HTML improved.

### File List

- `src/emails/email-shell.tsx` (NEW) — the shared branded shell (accent top-border + logo/name header + body).
- `src/emails/ship-published-email.tsx` (MODIFIED) — renders through `EmailShell`; status pill 13→14px; boilerplate removed.
- `src/emails/invite-email.tsx` (MODIFIED) — renders through `EmailShell`; paste-link 13→14px; docstring updated; boilerplate removed.
- `src/emails/__tests__/email-shell.test.ts` (NEW) — logo-alt vs name-fallback, accent present, body + preview.
- `src/emails/__tests__/invite-email.test.ts` (NEW) — invite URL (CTA + paste), accent, logo alt, CTA text, images-off fallback.
- `src/server/ship-feed/__tests__/ship-published-email.test.ts` (UNCHANGED) — existing asserts confirmed still green through the shell.

## Senior Developer Review (AI)

**Reviewer:** CJ (via Claude xhigh review) · **Date:** 2026-06-07 · **Outcome:** ✅ Approve (one finding fixed pre-merge)

**Scope:** presentation-only — the `EmailShell` + the two template refactors. A single focused finder (extra-high effort) rendered the templates to HTML and audited the prop/wrapper contract, each email-a11y rule, and cross-client robustness.

**Findings (2; 1 actioned):**

1. **[Med — FIXED] Accent bar invisible in Outlook.** The spacer-`<Section height:4>` accent collapsed to 0px in Outlook/MSO (ignores table `height` + strips the single-space cell), so the brand accent — one of two brand cues in the chrome — vanished in a major client, undercutting AC-1/AC-2. **Fix:** moved the accent to a `border-top: 4px solid {accent}` on the card (honored everywhere; also removed the fragile spacer). Re-rendered + re-tested green.
2. **[Low — ACCEPTED] Outlook ignores `border-radius` + `overflow:hidden`.** The card shows square corners in Outlook. Known, graceful email-client limitation; nothing breaks; removing `overflow:hidden` would unclip in clients that DO honor radius — left as-is.

**Verified clean:** prop/wrapper contract preserved (wrappers untouched per `git status`; the 3.6 fan-out + 2.3 invite send unaffected); all five a11y rules met in the rendered HTML (logo alt + name fallback, emoji+label status survives images-off, inline brand colors, semantic heading, ≥14px body with only the 12px footer as fine print); the existing ship-published test's assertions still hold and none mask a regression; the `Preview` snippets are meaningful with no SHA/branch/secret leak; no unused imports (lint clean).

## Change Log

| Date       | Version | Description                                  | Author |
| ---------- | ------- | -------------------------------------------- | ------ |
| 2026-06-07 | 0.1     | Story drafted (context-engineered).          | Scrum  |
| 2026-06-07 | 1.0     | Implemented: shared `EmailShell` + both templates refactored + a11y polish; xhigh review (accent→border-top fix); 343 tests green; deployed. | Dev    |
