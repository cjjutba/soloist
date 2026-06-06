---
baseline_commit: 6e7978e30cede0e457a22e6222b842e3f6bc2964
---

# Story 1.6: Per-Tenant Branding + Contrast Guard

Status: done

<!-- Note: Validation is optional. Run validate-create-story for a quality check before dev-story. -->

## Story

As a Freelancer,
I want to set my logo and accent color with a guard that keeps text readable,
so that my Client-facing surfaces feel like my own product without me shipping unreadable UI.

## Acceptance Criteria

1. **Set logo + accent; both apply via `--tenant-accent`; neutral default until customized (FR-2, UX-DR3).**
   **Given** the Branding settings screen (Cockpit)
   **When** I upload a logo and pick an accent color
   **Then** the logo is stored in Vercel Blob, the accent is saved, and both apply via `--tenant-accent` (+ `--tenant-accent-foreground` / `--tenant-accent-text`) on Client-facing surfaces; a neutral default (Soloist Iris `#5B5BD6` + a Tenant-initial **monogram**) applies until customized.

2. **Three-check contrast guard, server-enforced (UX-DR4).**
   **Given** the accent picker
   **When** I choose an accent
   **Then** the save is **blocked** unless it passes all three checks:
   - **fill** — white (`--tenant-accent-foreground`) on the accent **≥ 4.5:1** (hard block; this is the brand fill, it can't be silently changed),
   - **text** — `--tenant-accent-text` (accent as link/inline text) on `background` (Paper `#FBFAF8`) **and** on white **≥ 4.5:1**, **auto-darkened** from the fill when a pale fill would be illegible (fill + text are decoupled tokens),
   - **non-text** — the accent as focus-ring/active/badge boundary on `background` **≥ 3.0:1**, else the **focus ring falls back to Soloist Ink** (`#1C1B1F`) so a brand choice can never hide keyboard focus.
   **And** a failure surfaces as an **`aria-live`/`role="alert"` error (not color-only)** naming the **nearest passing shade**.

> **Scope boundary — the live `/portal` application is Epic 2.** The Client Portal is gated behind the Story 1.4 `requireClient()` guard, and Clients/Engagements don't exist until Epic 2 — so the *real* `/portal` render can't be exercised yet. 1.6 delivers: the Cockpit Branding settings (logo + accent + the guard + save), and a **live "how the Client sees it" preview** (EXPERIENCE.md) that applies `--tenant-accent` to a sample Client surface — that preview is where the application is demonstrated + tested now. Wiring the `/portal` layout + branded emails to the same `resolveBrandingVars` helper lands in Epic 2 (Story 2.6) / Epic 4. The accent guard + save are **fully** delivered here.

## Tasks / Subtasks

- [x] **Task 1 — WCAG contrast guard service (pure, the load-bearing logic)** (AC: 2)
  - [x] Create `src/server/branding/contrast.ts` (no I/O, no React — pure + offline-testable):
    - `hexToRgb(hex)`, `relativeLuminance(rgb)` (sRGB linearization: channel `c/255`, then `c≤0.03928 ? c/12.92 : ((c+0.055)/1.055)**2.4`; `L = 0.2126r+0.7152g+0.0722b`), `contrastRatio(hexA, hexB)` = `(Llight+0.05)/(Ldark+0.05)`.
    - `darken(hex, byL)` — reduce HSL lightness (preserves hue/saturation). `nearestPassingFill(hex)` — darken in small steps until `contrastRatio("#FFFFFF", result) ≥ 4.5`; return that hex. `deriveAccentText(hex)` — darken until `min(contrast(result, PAPER), contrast(result, WHITE)) ≥ 4.5` (PAPER `#FBFAF8` is the binding constraint).
    - `guardAccent(accentHex)`: → `{ ok: false, error, suggestion }` when `contrastRatio("#FFFFFF", accentHex) < 4.5` (suggestion = `nearestPassingFill`); else `{ ok: true, accentHex, accentTextHex: deriveAccentText(accentHex), focusRingFallback: contrastRatio(accentHex, PAPER) < 3.0 }`.
    - Constants: `WHITE="#FFFFFF"`, `PAPER="#FBFAF8"` (= `--background`), `INK="#1C1B1F"` (= `--foreground`). Only the **fill** check blocks; text auto-darkens, non-text falls back.
  - [x] `src/server/branding/__tests__/contrast.test.ts`: `contrastRatio(WHITE, "#5B5BD6") ≈ 5.37` and `contrastRatio("#5B5BD6", PAPER) ≈ 5.15` (DESIGN.md measured, ±0.05); Iris `guardAccent` → ok, `accentTextHex === "#5B5BD6"` (unchanged — already passes), `focusRingFallback === false`; a pale accent (e.g. `#FFD700`) → `ok:false` with a `suggestion` that itself passes (`contrastRatio(WHITE, suggestion) ≥ 4.5`) and is darker; `deriveAccentText` on a fill that fails as text returns a darker hex that passes; symmetry/identity edges (`contrastRatio(x,x)===1`).

- [x] **Task 2 — Branding Zod schema + the branding→CSS-vars resolver** (AC: 1, 2)
  - [x] `src/server/branding/branding.schema.ts`: `accentHex` = `z.string().regex(/^#[0-9a-fA-F]{6}$/)` (normalize to uppercase); logo constraints (mime `image/png|image/svg+xml|image/jpeg`, size ≤ 1MB) as a shared constant + zod for the action.
  - [x] `src/server/branding/branding-vars.ts`: `resolveBrandingVars(branding: Branding | null, tenantName: string)` → `{ style: Record<string,string>, focusRingFallback: boolean, monogram: string, logoUrl: string | null }`. `style` sets `--tenant-accent`, `--tenant-accent-foreground` (`#FFFFFF`), `--tenant-accent-text`, and `--tenant-accent-ring` (= accent, or `INK` when `focusRingFallback`). **Default** (no branding / no accent): Soloist Iris `#5B5BD6` + `monogram = tenantName.trim()[0].toUpperCase()`. This pure helper is what the preview uses now and the `/portal` layout + emails reuse in Epic 2/4.
  - [x] Unit-test `resolveBrandingVars`: null branding → Iris default + correct monogram; a customized accent → vars reflect it; `focusRingFallback` flips `--tenant-accent-ring` to Ink.
  - [x] Reuse the existing repo as-is: `getBranding(ctx)` / `upsertBranding(ctx, { accentHex?, accentTextHex?, logoBlobUrl? })` (partial upsert already supported — Story 1.2). **No schema/migration change** — `focusRingFallback` is derived at render, not stored.

- [x] **Task 3 — Server Actions: save accent + upload logo** (AC: 1, 2)
  - [x] `src/server/branding/branding.actions.ts` (`"use server"`):
    - `saveAccent(input)`: `requireFreelancer()` → zod-parse `accentHex` → `guardAccent` → on `ok:false` return `{ ok:false, field:"accent", error, suggestion }`; on ok → `upsertBranding(ctx, { accentHex, accentTextHex })` → `revalidatePath("/app/settings/branding")` → `{ ok:true, accentTextHex, focusRingFallback }`.
    - `uploadLogo(formData)`: `requireFreelancer()` → validate file (mime + ≤1MB) → if `!env.BLOB_READ_WRITE_TOKEN` return `{ ok:false, error:"Logo upload isn't configured yet." }` (graceful in local dev) → `put(\`tenants/${ctx.tenantId}/logo-${Date.now()}.<ext>\`, file, { access:"public", token: env.BLOB_READ_WRITE_TOKEN, contentType })` → `upsertBranding(ctx, { logoBlobUrl: url })` → revalidate → `{ ok:true, url }`. (Server-side `put` is fine for ≤1MB logos; bump the Server Action body limit — see Task 4.)
  - [x] `src/env.ts`: add `BLOB_READ_WRITE_TOKEN: z.preprocess(v => v===""?undefined:v, z.string().optional())` (optional — accent guard works without it; logo upload needs it). Update `.env.example`.
  - [x] The actions live in the branding **feature** module (`src/server/branding/`) per the architecture's feature-first layout; they import the sanctioned repo (`@/server/db/repositories/branding.repository`) + `requireFreelancer` + the contrast service — no raw db, so no ESLint exemption needed.

- [x] **Task 4 — Branding settings page + live "how the Client sees it" preview** (AC: 1, 2)
  - [x] `src/app/app/settings/branding/page.tsx` (server): `requireFreelancer()` → `getBranding(ctx)` + tenant name (`getTenant(ctx)`) → render the form with current values.
  - [x] `branding-form.tsx` (client): an **accent color input** (`<input type="color">` + a hex text field, react-hook-form) that calls `saveAccent`; on `ok:false` show the error via `role="alert"`/`aria-live` naming the suggested shade (with an "Use this shade" affordance that sets the input to `suggestion`); on ok, toast + update the preview. A **logo upload** (`<input type="file">`) calling `uploadLogo`; ≤1MB png/svg/jpg; on success show the logo. A **live preview** card ("How your clients see it") that applies `resolveBrandingVars(...)` as an inline `style` to a sample Client surface (a Tenant-accent button + a mock Ship-Feed header with the logo/monogram) — re-rendering as the accent changes. Use the design tokens (`bg-tenant-accent`, `text-tenant-accent-foreground`, `text-tenant-accent-text`), never hardcoded hex.
  - [x] Cockpit nav: add a **Branding / Settings** link to the `/app` header (`app/layout.tsx`) → `/app/settings/branding`.
  - [x] `next.config.ts`: set `experimental.serverActions.bodySizeLimit = "2mb"` so a ≤1MB logo + form overhead isn't rejected by the default 1MB Server Action cap.
  - [x] Accessibility (NFR-7 / EXPERIENCE Accessibility Floor): the contrast-guard rejection is `role="alert"`, tied to the field, **not color-only**; the logo `alt` = Tenant name; the monogram fallback inherits the rule; the color input has a programmatic `<label>`.

- [x] **Task 5 — Gates + deploy** (AC: 1, 2)
  - [x] `npm run lint && npm run typecheck && npm test && npm run build` clean.
  - [x] **Ops:** ensure a **Vercel Blob store** is connected to the project so `BLOB_READ_WRITE_TOKEN` is available in Production (Vercel auto-injects it when a Blob store is linked; otherwise set it). Add it to env (+ local `.env.local` if dogfooding logo upload).
  - [x] Deployed to Vercel production → https://soloist.cjjutba.com. Live smoke: `/app/settings/branding` → **307 → /login** (guarded, no 500); `/`, `/login` → 200; `/api/auth/get-session` → `null` @200. The signed-in round-trip (save dark accent → preview; too-light → blocked + suggestion; logo upload) is CJ's to run. **Ops note:** logo upload needs a **Vercel Blob store** connected (Dashboard → Storage → Blob; the token auto-injects, then redeploy) — the accent guard works without it.

## Dev Notes

### The contrast model (DESIGN.md — get this exactly right)

[Source: DESIGN.md#Colors / #Do's and Don'ts; EXPERIENCE.md#Per-Tenant Branding system / #Accessibility Floor]
- The accent is used **three ways**, validated against **WCAG**: **4.5:1 for text, 3:1 for non-text**.
  - `--tenant-accent` = the **fill** (buttons, hero). `--tenant-accent-foreground` = **white** text on the fill (guard: white-on-accent ≥ 4.5).
  - `--tenant-accent-text` = the accent **as text** (links/inline) on Paper/white — a **decoupled** token, **auto-darkened** from the fill so a pale brand fill can't make link text illegible (guard: ≥ 4.5 on Paper AND white).
  - **non-text** = the accent as a focus ring / active boundary on Paper ≥ 3.0; **else the focus ring uses Soloist Ink** (keyboard focus must never disappear).
- **Only the fill check hard-blocks** (you can't silently change the brand fill). Text always becomes passable by darkening the decoupled text token; non-text always degrades to the Ink focus ring. Net: `guardAccent` blocks **iff** white-on-accent < 4.5, and returns the **nearest darker passing shade** as the suggestion.
- Measured anchors (for tests): Soloist Iris `#5B5BD6` → white-on-fill **5.37**, as-text-on-Paper **5.15**, as-text-on-white **5.37** — a safe neutral default both ways.
- **Cockpit is Soloist-branded and NEVER uses a Tenant accent** (DESIGN.md "Avoid: letting a Tenant accent touch the Cockpit"). The Tenant accent appears in the Cockpit **only** inside the "how the Client sees it" preview (a scoped element with its own inline `--tenant-accent`), never on the Cockpit chrome.

### Architecture compliance

[Source: architecture.md L202, L208, L222, L285, L316]
- **The contrast guard is an authz-independent invariant enforced in the branding Server Action — not just client UI.** The client picker gives instant feedback, but `saveAccent` re-runs `guardAccent` server-side and is the source of truth (UX can't be trusted).
- **Server Actions** for the mutation: resolve `TenantContext` (`requireFreelancer`) → Zod-parse → repository → `revalidatePath`. [L208]
- **Feature-first server module:** `src/server/branding/` with `contrast.ts` (service), `branding.schema.ts`, `branding.actions.ts`. The data lives in the existing `branding.repository.ts` (Story 1.2). [L285]
- **Theming:** Tailwind v4 `@theme` already maps `--color-tenant-accent*` → utilities. The preview/Portal sets the **raw** `--tenant-accent*` vars via inline `style`; **never hardcode hex in components — use the tokens.** [L222, L281, L316]
- **Branding is server-resolved (no flash)** and read by both the Portal layout and email templates later — hence the shared `resolveBrandingVars` helper. [L222, L267]

### Previous-story intelligence (Stories 1.2–1.4 — read first)

- **`branding` table + repo already exist** (Story 1.2): `branding(tenant_id PK→tenants cascade, logo_blob_url, accent_hex, accent_text_hex, updated_at)` with RLS `branding_tenant` + FORCE; `getBranding`/`upsertBranding` go through `withTenant` (RLS-scoped). Partial upsert works — accent-only and logo-only saves are fine. **No migration in this story.**
- **`requireFreelancer()`** (Story 1.4, `src/server/auth/session.ts`) returns the freelancer principal which **is** a `TenantContext` — pass it straight to `getBranding`/`upsertBranding`/`getTenant`. The `/app` layout already guards the whole Cockpit subtree (so `/app/settings/*` is guarded), but the settings page should still self-guard via `requireFreelancer()` (positional-guard discipline from the 1.4 review).
- **Server Action pattern** (Story 1.3): action returns a typed result `{ ok: true, ... } | { ok: false, ... }`; the client form maps it to field errors / toasts; **never throws to the client**. Wrap the action's body so an unexpected failure returns a neutral form error (and `console.error`s), like `signUpFreelancer`.
- **shadcn primitives** exist in `src/components/ui/` (`button`, `input`, `label`, `card`, `field`). Reuse the shared `Field`. Scaffold any new primitive you need (e.g. nothing exotic — a color input is native).
- **Tokens:** `src/app/globals.css` defines `--tenant-accent` (default `#5B5BD6`), `--tenant-accent-foreground` (`#FFFFFF`), `--tenant-accent-text` (`#5B5BD6`) in `:root` and maps them in `@theme inline`. Add `--tenant-accent-ring` if you introduce the ring fallback token (default = accent).
- Test infra: **vitest**; pure modules test trivially (contrast). Build = Turbopack (`serverExternalPackages` + `kysely@0.28.17` override in place — don't touch).

### Vercel Blob (`@vercel/blob`)

- `import { put } from "@vercel/blob"` → `await put(pathname, file, { access: "public", token, contentType })` → `{ url, downloadUrl, ... }`. Server-side `put` needs `BLOB_READ_WRITE_TOKEN` (Vercel auto-injects it when a Blob store is linked to the project; locally, `vercel env pull` or set it).
- Logos are small (≤1MB) → server-side `put` from the Server Action is fine; bump `serverActions.bodySizeLimit` to `"2mb"`. (Client-side `upload()` is only needed for large files — not here.)
- Store under a Tenant-scoped path (`tenants/<tenantId>/logo-*`) for tidiness; the blob is public (logos are shown to clients). Old logos aren't deleted on replace in v1 (note as a minor follow-up; `del()` could clean up later).

### Project Structure Notes

- `src/app/app/settings/branding/page.tsx` — the FR-2 settings surface (architecture L356). Nests under the guarded `/app` layout.
- `src/server/branding/` — new feature module (architecture L384). `contrast.ts` is pure; `branding.actions.ts` is `"use server"`.
- Do **not** apply the Tenant accent to the Cockpit chrome — only inside the scoped preview element.
- Do **not** add a DB column for the focus-ring fallback — it's derived (`resolveBrandingVars`).

### Testing requirements

- **Pure unit (vitest):** `contrast.ts` — the full guard matrix (measured anchors, block on too-light + passing suggestion, auto-darken text, non-text fallback). `resolveBrandingVars` — default/monogram, customized, ring fallback. This is the security/a11y-critical logic and must be airtight.
- **Server Action:** `saveAccent` orchestration with a stubbed repo + `guardAccent` — block path returns the error+suggestion (no upsert), ok path upserts the derived `accentTextHex`. (Pattern: the `sign-up.test.ts` hoisted-mock approach.)
- **Live smoke (Task 5):** dark accent saves; too-light accent blocked with suggestion; logo uploads + renders; preview reflects the accent.
- Don't regress the 68 prior tests.

### References

- [Source: epics.md#Story 1.6]
- [Source: DESIGN.md#Colors (Tenant Accent + contrast guard), #Do's and Don'ts]
- [Source: EXPERIENCE.md#Per-Tenant Branding system, #Accessibility Floor & the Branding contrast guard, #Cockpit IA (Branding & Tenant settings)]
- [Source: architecture.md#Security (L202 contrast guard), #Server Actions (L208), #Theming (L222), #Feature modules (L285), #Source tree (L356, L384)]
- [Source: src/server/db/repositories/branding.repository.ts; src/server/db/schema.ts (branding); src/app/globals.css (tenant-accent tokens); src/server/auth/session.ts (requireFreelancer)]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (Claude Opus 4.8, 1M context)

### Debug Log References

- Hand-verified the WCAG math before coding: Soloist Iris `#5B5BD6` → white-on-fill **5.365**, as-text-on-Paper **5.146** (matches DESIGN.md's 5.37 / 5.15). Tests assert the anchors at ±0.05.
- Local prod smoke (:3100): `/app/settings/branding` (no auth) → **307 → /login** (guarded, no 500); route compiles as `ƒ (Dynamic)`.

### Completion Notes List

- **Contrast guard is a pure module** (`src/server/branding/contrast.ts`) — runs identically in the client picker and the **authoritative server action**. Only the **fill** check (white-on-accent < 4.5) hard-blocks (with a nearest-darker-passing suggestion); the **text** token auto-darkens (`deriveAccentText`, decoupled), and **non-text** falls back to Soloist Ink for the focus ring (`focusRingFallback`, derived at render — no DB column).
- **`resolveBrandingVars`** is the single branding→`--tenant-accent*` mapping (Iris + monogram default). It's pure/isomorphic, so the **Cockpit preview** uses it now and the `/portal` layout + branded emails reuse it in Epic 2 / Epic 4. **Live `/portal` application is out of scope** (client-gated; no clients until Epic 2) — demonstrated via the in-Cockpit "how the Client sees it" preview.
- **Server Actions** (`branding.actions.ts`): `saveAccent` (`requireFreelancer` → re-run `guardAccent` server-side → `upsertBranding({accentHex, accentTextHex})` → revalidate) and `uploadLogo` (validate mime/size → Vercel Blob `put` under `tenants/<id>/` → `upsertBranding({logoBlobUrl})`); both return typed results, never throw to the client. Logo upload **degrades gracefully** without `BLOB_READ_WRITE_TOKEN`.
- **No DB migration** — reused the 1.2 `branding` table + `getBranding`/`upsertBranding` (partial upsert). `env.ts` += optional `BLOB_READ_WRITE_TOKEN`; `next.config.ts` Server Action `bodySizeLimit: "2mb"` for logos.
- **Cockpit stays Soloist-branded** — the Tenant accent appears only inside the scoped preview element (DESIGN.md "never let a Tenant accent touch the Cockpit"). Added a **Branding** nav link to the `/app` header. a11y: contrast error is `role="alert"`/`aria-live` (not color-only) naming the suggested shade; logo `alt` = Tenant name; monogram fallback.
- **Tests: 85/85** (+17 branding: 9 contrast incl. the measured anchors + block/suggest/auto-darken, 4 `resolveBrandingVars`, 4 `saveAccent` orchestration). lint/typecheck/build clean.
- **Deferred:** old logos aren't `del()`'d on replace (minor v1 follow-up); the `/portal` live application + branded-email branding = Epic 2 / Epic 4.

### File List

**New:** `src/server/branding/contrast.ts` · `src/server/branding/branding-vars.ts` · `src/server/branding/branding.schema.ts` · `src/server/branding/branding.actions.ts` · `src/server/branding/__tests__/{contrast,branding-vars,branding.actions}.test.ts` · `src/app/app/settings/branding/page.tsx` · `src/app/app/settings/branding/branding-form.tsx`

**Modified:** `src/env.ts` (+`BLOB_READ_WRITE_TOKEN`) · `.env.example` · `next.config.ts` (Server Action `bodySizeLimit`) · `src/app/app/layout.tsx` (Branding nav link + linked brand)

## Senior Developer Review (AI)

**Reviewed:** 2026-06-06 · **Effort:** extra-high (5 finder angles + verify) · **Outcome:** **the WCAG math is confirmed correct** (an independent reviewer swept 5,854 accents — every block-suggestion passes ≥4.5; Iris anchors match) and the guard is **server-authoritative + tenant-scoped** (re-runs `guardAccent` in `saveAccent`; `requireFreelancer` → `withTenant`/RLS; `tenantId` is `input:false`/uuid-validated so the blob path isn't injectable). Findings were security/robustness/a11y hardening — required fixes applied + re-verified (92/92).

**Fixed:**
- [x] **SVG logo stored-XSS (HIGH):** `image/svg+xml` was in the allowlist; SVG is an active document and the blob is `access:"public"` on a shared origin with no CSP/nosniff. **Dropped SVG — PNG/JPG only** (transparent PNG covers "transparent preferred"); documented to revisit only with sanitization. Added an SVG-reject test.
- [x] **Malformed-hex robustness:** the exported pure fns took unvalidated hex → `NaN` luminance → a garbage shade. `guardAccent` now rejects non-`#RRGGBB` input; `resolveBrandingVars` falls back to the default for a bad stored value (never emits NaN CSS vars). Tested.
- [x] **`uploadLogo` had ZERO tests** — the validation is the only guard on public blob uploads. Added 6: valid upload, SVG-reject, bad-mime-reject, >1MB-reject, empty-reject, **fail-closed on missing token**.
- [x] **a11y (this IS an a11y feature):** the contrast error is `role="alert"` (dropped the contradictory `aria-live="polite"` — alert is already assertive) with the **"Use {suggestion}" button moved OUT of the alert** as a real actionable control; logo `alt=""` (decorative — the Tenant name is adjacent, avoids a duplicate SR read).
- [x] **Cleanup:** consolidated `DEFAULT_ACCENT` + `HEX_RE` into `contrast.ts` (were duplicated 3–4×); the Zod schema reuses `HEX_RE`; the file input is cleared after a successful upload (no silent re-upload of the same file).

**Noted (accepted for v1 / future):**
- Magic-byte content sniffing deferred — dropping SVG removes the active-content XSS; PNG/JPG served with their content-type aren't executed in `<img>`. A future hardening can sniff + add `nosniff`/CSP.
- `guardAccent.focusRingFallback` can't be `true` for a fill-passing (dark) accent — correct + harmless; the real non-text fallback path is tested via `resolveBrandingVars`.
- `bodySizeLimit: 2mb` is intentional headroom over the 1MB logo cap; old logos aren't `del()`'d on replace (minor v1 follow-up).
- Live `/portal` branding application + branded-email branding remain Epic 2 / Epic 4 (the shared `resolveBrandingVars` is ready).

## Change Log

| Date       | Version | Description                                                                 | Author |
| ---------- | ------- | --------------------------------------------------------------------------- | ------ |
| 2026-06-06 | 0.1     | Story drafted (ultimate context engine).                                    | Scrum  |
| 2026-06-06 | 1.0     | Implemented Tasks 1–5: WCAG contrast guard + branding vars + save/upload actions + Cockpit settings page & live preview. 85/85 tests, build clean, route guarded. | Dev (Opus 4.8) |
| 2026-06-06 | 1.1     | Code review (xhigh, math confirmed): dropped SVG (XSS), hardened malformed-hex, added uploadLogo tests, a11y on the contrast error, consolidated constants. 92/92 tests, build clean. | Review (Opus 4.8) |
| 2026-06-06 | 1.2     | Deployed to production → https://soloist.cjjutba.com. Live smoke green (branding route guarded). Story done. (Logo upload needs a Vercel Blob store — ops note.) | Dev (Opus 4.8) |
