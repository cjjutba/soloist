# Accessibility Review — Soloist UX Spine Pair

> Reviewer: accessibility reviewer. Date: 2026-06-05.
> Scope: `DESIGN.md` + `EXPERIENCE.md` for Soloist (Client Portal + Cockpit), evaluated against the product's **stated floor** — NFR-7 "reasonable baseline" (keyboard, contrast, semantic markup), explicitly **not** a formal WCAG 2.1 AA audit in v1. Where a gap between "baseline" and AA creates real risk for a consumer product, it is called out as such.

## Overall verdict

The stated default palette is accessibility-sound: every fixed color pair the spines name passes WCAG AA, and the spines deserve real credit for treating the per-Tenant contrast guard, color-independent status labels, and the not-found-vs-denied pattern as explicit, load-bearing rules rather than afterthoughts. The dominant residual risk is concentrated in one place — the **runtime-variable Tenant accent** — where the guard is specified in *intent* but not in *implementable detail*: it validates only white-on-accent, says nothing about the accent used as link text on Paper, nothing about 3:1 non-text contrast for focus rings / active states, and nothing about how branded **emails** (no CSS guard at render time, frequently dark-mode-inverted) degrade. Closing those, plus a handful of touch-target and aria specifics, would lift the design from "baseline-plus-good-intentions" to a defensibly accessible consumer product.

## Contrast computations

Ratios computed with the WCAG 2.x relative-luminance formula (sRGB). Thresholds: 4.5:1 normal text, 3:1 large text (≥18.66px bold / ≥24px) and non-text UI.

| Foreground | Background | Ratio | Normal (4.5) | Large/Non-text (3.0) |
|---|---|---|---|---|
| Soloist Ink `#1C1B1F` | Warm Paper `#FBFAF8` | **16.42:1** | PASS | PASS |
| White `#FFFFFF` | Soloist Iris `#5B5BD6` | **5.37:1** | PASS | PASS |
| status-shipped `#15803D` | shipped-surface `#ECFDF3` | **4.76:1** | PASS | PASS |
| status-progress `#B45309` | progress-surface `#FEF6E7` | **4.67:1** | PASS | PASS |
| status-next `#475569` | next-surface `#F1F5F9` | **6.92:1** | PASS | PASS |
| muted-foreground `#6B6760` | Warm Paper `#FBFAF8` | **5.39:1** | PASS | PASS |

**Supplementary spot-checks (not requested but load-bearing for the findings below):**

| Foreground | Background | Ratio | Normal (4.5) | Large/Non-text (3.0) |
|---|---|---|---|---|
| Soloist Iris `#5B5BD6` as **link text** | Warm Paper `#FBFAF8` | **5.15:1** | PASS | PASS |
| Soloist Iris `#5B5BD6` as **link text** | White `#FFFFFF` | **5.37:1** | PASS | PASS |
| Soloist Iris `#5B5BD6` as **focus ring / non-text** | Warm Paper `#FBFAF8` | **5.15:1** | — | PASS |
| muted-foreground `#6B6760` | White `#FFFFFF` | **5.62:1** | PASS | PASS |

**Result: 0 of the 6 requested pairs fail. All 6 pass at AA for normal text.** The two status pairs (shipped 4.76, progress 4.67) pass but sit only marginally above the 4.5 line — see High-2 (these are the at-risk values if the tints ever drift, or if the emoji/label renders at small size). The Soloist Iris default is comfortable as foreground *and* background, which is what makes it a safe neutral default; the risk is entirely in Tenant-chosen accents, which are unbounded and unvalidated by these numbers.

## Findings

### Critical

**C-1 — The contrast guard validates only white-on-accent; it does not cover the accent used AS text (links) on Paper/white.**
*Location:* `EXPERIENCE.md` §Per-Tenant Branding ("validates AA contrast for `tenant-accent-foreground` (white) text on the chosen accent") and §Accessibility ("enforces AA for accent-foreground text on the Tenant accent"). `DESIGN.md` §Colors contrast-guard note and the Do/Don't row.
*Problem:* `DESIGN.md` re-scopes shadcn `primary` → `tenant-accent` on the Client Portal, and explicitly applies the accent to **links and active states** ("applied to ALL Client-facing surfaces … primary buttons/links/active states"). That is the accent rendered *as foreground text on Warm Paper / white* — the exact inverse of what the guard checks. A Freelancer can pick a pale accent (e.g. a soft yellow/mint) that easily clears white-on-accent for a button yet renders link text at ~2:1 on Paper, illegible to the founder audience. The default Iris passes both (5.15 / 5.37), which masks the gap in testing. The guard as written is *necessary but not sufficient*.
*Fix:* The guard must validate **two** ratios and block on either: (a) `tenant-accent-foreground` (white) on accent ≥ 4.5; (b) accent-as-text on `background` (`#FBFAF8`) **and** on `#FFFFFF` ≥ 4.5. If (b) fails, either auto-darken a separate `--tenant-accent-text` token used only for links/inline-accent text (decoupling "fill color" from "text color" is the clean solution), or reject. State this as two named tokens so it is implementable, not a single "AA contrast" hand-wave.

**C-2 — No 3:1 non-text contrast rule for accent-driven focus rings, active states, and the candidate badge.**
*Location:* `EXPERIENCE.md` §Accessibility ("visible focus rings (shadcn `ring`) at AA contrast on `{colors.background}`") and §Per-Tenant Branding ("active states via re-scoped `primary`"). `DESIGN.md` `candidate-badge` and `onboarding-hero` both fill with `tenant-accent`.
*Problem:* The floor names "AA contrast" for focus rings but (i) for **non-text** UI the relevant threshold is WCAG 1.4.11 **3:1**, not 4.5, and the spine never says this; (ii) more importantly, where the focus ring or active-state indicator is *itself* the Tenant accent on Paper, a pale Tenant accent can drop the ring/active boundary below 3:1, making keyboard focus invisible — a keyboard-operability failure, which is the floor's own first promise. The contrast guard (C-1) checks text legibility but nothing about whether the accent works as a 3:1 *non-text* boundary. This is the single most likely way a non-designer Freelancer ships an unusable-by-keyboard portal without any visible "text is unreadable" symptom to warn them.
*Fix:* (1) Add an explicit 3:1 non-text floor for focus rings, active states, the accent-filled badge/hero edge, and any accent-on-Paper boundary. (2) Extend the contrast guard's gate to include a 3:1 check of accent vs `background`; if it fails, render focus rings in Soloist Ink (or a guaranteed-contrast neutral) rather than the accent — decouple the *focus indicator* from the *brand accent* so brand choice can never remove the focus cue.

### High

**H-1 — Branded email accessibility is asserted as a target but has no degradation, alt, or contrast spec — and email cannot run the live picker guard.**
*Location:* `EXPERIENCE.md` §Per-Tenant Branding ("branded notification emails"), Flow 2/3 (branded invite + "New update" emails); `DESIGN.md` §Colors ("email headers"). Prompt item #7.
*Problem:* The contrast guard runs in the Branding picker (build time) and so *can* protect the email header color — good — but the spines never state: (a) Tenant **logo alt text** in email (only the Onboarding hero alt is specified); (b) plain-text / no-images fallback (many founders read email with images off — the "✅ Shipped" status must survive as text, which the emoji+label convention supports, but it is never tied to email); (c) dark-mode email clients invert backgrounds and can destroy a guard-passing header (white-on-accent becomes accent-on-dark); (d) minimum font size / semantic heading structure. For a consumer product whose entire day-one "wow" arrives by email (Flow 2), email a11y is not optional.
*Fix:* Add an "Email accessibility" clause: logo `alt="{Tenant name}"`; status conveyed as `emoji + text label` never color-only (reuse the existing rule); ensure header text/background pair is the guard-validated accent pair *and* specify a bulletproof-button / table-based layout that degrades to readable text with images disabled; note dark-mode is a known limitation and pin background colors with explicit inline styles.

**H-2 — Status tint pairs pass AA but with almost no margin; small-size or weight changes will tip them under.**
*Location:* `DESIGN.md` status tokens; computed shipped 4.76:1, progress 4.67:1.
*Problem:* Both are above 4.5 only by a hair. Status tags are "soft tinted pills" and the label may render small (pill chips are typically 11–13px, well under the 18.66px "large text" exemption), so the 4.5 threshold genuinely applies. Any future tint lightening, anti-aliasing on the emoji, or sub-pixel rendering on low-DPI screens pushes these into perceived failure. Not a current fail, but a brittle pass for fixed, product-defining tokens.
*Fix:* Nudge `status-progress` foreground slightly darker (e.g. toward `#92400E`, which lifts it comfortably clear) and re-verify shipped, so the three fixed status colors carry a safety margin rather than sitting on the line. Document the computed ratios in `DESIGN.md` so they are not silently changed later.

**H-3 — Live-feed `aria-live` is named but unspecified (politeness, scope, and the poll-vs-realtime branch).**
*Location:* `EXPERIENCE.md` §Accessibility ("announce via `aria-live` when new cards arrive") and §State Patterns "Live update arrives" + `[OPEN: real-time vs poll]`.
*Problem:* "Use aria-live" without `polite` vs `assertive`, without naming what string is announced, and without resolving the poll branch is not implementable. `assertive` on every incoming card would hijack a screen-reader user mid-read (especially with the animated top-insertion); the "subtle new-update affordance" poll path needs its *own* announcement (a button that, when it appears, is announced once), not a live region spewing card bodies.
*Fix:* Specify `aria-live="polite"` on the feed region, announcing a concise summary ("New update: {title}, {status label}") rather than the full card; for the poll branch, the "Load new updates" control is the live-announced element. Confirm new cards insert without moving keyboard focus.

**H-4 — Touch-target minimum size is never stated for a mobile-first consumer surface.**
*Location:* `EXPERIENCE.md` §Interaction Primitives (Client: "Everything reachable with a thumb"), §Responsive (bell, avatar, nav, fullscreen notification center). Prompt item #5.
*Problem:* "Thumb-reachable" addresses *reach* but not *size*. shadcn icon buttons default to ~36px, below the WCAG 2.5.8 (24px AA) and especially the platform-recommended ~44px target for a non-technical phone audience. The bell, avatar menu, status pills (if tappable), and notification-center close are the at-risk controls.
*Fix:* State a ≥44px minimum touch target (or ≥44px hit area via padding even if the visual is smaller) for all Client Portal interactive elements, and ≥24px as the hard floor for Cockpit. Add it to the Do/Don't.

### Medium

**M-1 — Cockpit keyboard shortcuts have no discoverability, no conflict story, and no "don't fire while typing" rule.**
*Location:* `EXPERIENCE.md` §Interaction Primitives (`j/k/e/1/2/3/p/x/Esc`, `⌘K`).
*Problem:* Single-key shortcuts (`e`, `p`, `x`, `1/2/3`) will fire while the user is inline-editing a title unless explicitly suppressed when an input/textarea is focused — a real data-corruption risk given "click to edit, blur to save." Also no shortcut cheatsheet / `?` affordance is mentioned, and no statement that every shortcut action is *also* reachable by a visible, focusable control (keyboard shortcuts must not be the *only* path — WCAG 2.1.1).
*Fix:* State: shortcuts are disabled while a text input has focus; every shortcut maps to a visible button/menu item; add a `?` shortcut overlay. Confirm `⌘K` palette items are themselves keyboard-navigable.

**M-2 — Focus management on overlays specified only as "Esc closes"; no focus-trap or focus-return rule.**
*Location:* `EXPERIENCE.md` §Accessibility ("`Esc` closes the topmost modal/popover"), §IA ("Modal stacks one level deep"), fullscreen notification center.
*Problem:* shadcn `Dialog`/`Sheet` trap and restore focus by default (good, if used unmodified), but the spine never states that focus is *trapped* within the open overlay and *returned* to the trigger on close — and the fullscreen mobile notification center may be a custom route rather than a `Dialog`, where this is not free. The not-found and onboarding screens also need a defined initial focus target.
*Fix:* State explicitly: overlays trap focus and restore it to the invoking control on close; fullscreen mobile overlays set initial focus to the heading or close button; route changes move focus to the new page's `<h1>` / main landmark (ties to M-4).

**M-3 — Per-surface page/route announcement not specified; SPA route changes are silent to screen readers by default.**
*Location:* `EXPERIENCE.md` §Foundation (Next.js App Router, two surfaces), prompt item #4 ("page/surface announcement").
*Problem:* Client-side navigation (Ship Feed → Update detail → Documents; Cockpit tab switches) does not announce the new context to AT unless handled. A founder using VoiceOver tapping a notification link gets no "you are now on the update" cue.
*Fix:* On each route/tab change, move focus to the new view's heading and/or announce the surface name via a polite live region. Name the per-surface `<h1>` (e.g. "Ship Feed", "Documents") and ensure one landmark `<main>` per surface.

**M-4 — Form error and validation feedback is undefined across all four form surfaces.**
*Location:* `EXPERIENCE.md` §Component Patterns (Branding controls, Invoice builder, Invite control, Manual Ship Update) and Flow 2 (set-password). Prompt item #6.
*Problem:* The spines specify *behaviors* (inline-edit, prefill) and a few empty/error *states*, but never the form-accessibility basics: programmatic `<label>` association, `aria-describedby` for hints, `aria-invalid` + `role="alert"` / `aria-live` on error messages, and error-summary-on-submit. The set-password screen (the Client's *first* interaction, on a phone) and the Invoice builder (multi-field) are the highest-stakes. The contrast guard's "inline explanation" must itself be announced as an error, not just shown.
*Fix:* Add a forms clause: every field has an associated label; errors are announced (`role="alert"`), tied to the field via `aria-describedby`, and not color-only; the contrast-guard rejection message is an `aria-live` error with the suggested passing shade as actionable text. Password requirements stated up front, not only on failure.

**M-5 — Onboarding hero alt text covers "Tenant name" but the logo is also used elsewhere with no alt rule, and decorative vs informative is unclassified.**
*Location:* `EXPERIENCE.md` §Accessibility ("Onboarding hero image carries the Tenant name as alt text"); `DESIGN.md` `onboarding-hero` (Tenant logo), plus logo in emails, possibly feed header / monogram default.
*Problem:* Only the hero is covered. The monogram-fallback default, the email logo, and any header logo need a consistent rule. A logo that repeats next to the visible Tenant name should arguably be `alt=""` (decorative) to avoid double-announcement, whereas a standalone logo needs `alt="{Tenant name}"`. This is unspecified, so it will be done inconsistently.
*Fix:* One rule: Tenant logo `alt="{Tenant name}"` when it is the only naming of the Tenant; `alt=""` when adjacent visible text already names it. Monogram fallback inherits the same rule.

### Low

**L-1 — Motion / animated card insertion has no reduced-motion provision.**
*Location:* `EXPERIENCE.md` §State Patterns ("New published card animates in at top"); `DESIGN.md` motion deferred. Prompt item #7.
*Problem:* The top-insertion animation (and any onboarding-hero motion) should honor `prefers-reduced-motion`. Low severity because the motion is small and non-essential, but trivially cheap to commit to now.
*Fix:* State: all entrance/insertion animation respects `prefers-reduced-motion: reduce` (reduces to an instant state change). Pairs with H-3 (don't move focus on insert).

**L-2 — "AA contrast" is asserted generically without naming the threshold split (4.5 text / 3.0 non-text).**
*Location:* `EXPERIENCE.md` §Accessibility floor.
*Problem:* The floor says "AA-level contrast" without distinguishing normal-text 4.5 from large-text/non-text 3.0. Implementers will likely apply 4.5 everywhere (harmless) or, worse, assume 3.0 is fine for body text. Naming the split removes ambiguity and is the anchor C-1/C-2 reference.
*Fix:* One sentence stating the two thresholds and that the guard enforces 4.5 for accent text and 3.0 for accent non-text boundaries.

**L-3 — not-found-vs-denied is a privacy/security strength but its a11y surface is unstated.**
*Location:* `EXPERIENCE.md` §Privacy & Visibility and §State Patterns (neutral not-found). Prompt item #4.
*Problem:* The pattern is correct and worth keeping (it never leaks existence to AT either — the screen reader hears the same neutral message regardless of cause, which is the intended behavior). Only gap: the not-found page needs a proper `<h1>`, focus-on-load, and a status semantics note (don't over-announce a 404 as an `role="alert"` interruption).
*Fix:* Confirm not-found page has a focused heading and reads as ordinary page content, identical for unknown-subdomain and unauthorized — preserving the no-disclosure property at the AT layer too.

## What's done well

- **The contrast guard exists at all, and is treated as a hard rule.** Designating it "load-bearing," forbidding a picker without it, and framing it as an *accessibility* control (not just brand) is exactly right and ahead of most consumer products. The findings above tighten its scope; they do not contradict its existence.
- **Color is never the sole status carrier.** The ✅/🚧/📦 *plus the text label* ("Shipped"/"In Progress"/"Next") rule is stated explicitly and propagates to feed, email, and copy — this single decision clears the most common colorblind/screen-reader status failure outright. The emoji-as-part-of-token-identity convention reinforces it.
- **The fixed default palette is genuinely accessible.** Every requested pair passes AA (Ink-on-Paper at a luxurious 16.42:1), and the Soloist Iris default works both as fill *and* as link text — a deliberate, safe neutral that means an un-customized Tenant is never broken.
- **not-found-never-denied** is both a security and an accessibility-of-disclosure win, and the neutral, brand-free treatment is the correct choice.
- **Two-philosophy interaction model is principled:** keyboard-fluent Cockpit for a developer, touch-first/zero-learning Client Portal for a non-technical founder, with hover-only affordances explicitly banned on touch — that ban alone prevents a classic mobile a11y failure.
- **Designed empty/error states everywhere,** keeping AT users out of ambiguous "blank screen" dead-ends, with plain-English copy that doubles as accessible, jargon-free messaging.
- **Semantic-by-default posture:** leaning on unmodified shadcn primitives (Dialog/Sheet focus-trap, Button semantics) inherits a strong accessibility baseline for free — the residual risk is precisely the *custom* and *runtime-variable* parts the findings target.
