# Validation Report — Soloist

- **DESIGN.md:** `_bmad-output/planning-artifacts/ux-designs/ux-soloist-2026-06-05/DESIGN.md`
- **EXPERIENCE.md:** `_bmad-output/planning-artifacts/ux-designs/ux-soloist-2026-06-05/EXPERIENCE.md`
- **Run at:** 2026-06-06 (Reviewer Gate at Finalize)
- **Reviewers:** rubric walker (`review-rubric.md`) · accessibility lens (`review-accessibility.md`)

## Overall verdict

**Rubric walker — strong, extractable.** A downstream consumer (architecture, story-dev) can source-extract the spine pair cleanly: every `{path.to.token}` reference resolves, all four UJs render as complete Key Flows (named protagonist, numbered steps, climax, failure path), section order is canonical, and the glossary is consistent across both spines and the sources. The one real weakness was component-coverage asymmetry. Nothing was broken. *(0 critical · 0 high · 4 medium · 12 low.)*

**Accessibility lens — sound default palette, risk in the runtime accent.** All six fixed color pairs pass WCAG AA (Ink-on-Paper 16.42:1). The dominant residual risk was the runtime-variable Tenant accent, where the guard was specified in intent but validated only white-on-accent. *(2 critical · 4 high · 5 medium · 3 low.)*

**Resolution (2026-06-06 finalize pass).** Both accessibility criticals, all four highs, and both rubric medium component-coverage gaps were folded into the spines, along with a consolidated Accessibility Floor and the low-severity tidy-ups. Both spines are now `status: final`. Findings below are marked **resolved** where the fix is already in the spine.

## Category verdicts

- Flow coverage — **strong**
- Token completeness — **strong**
- Component coverage — **adequate → resolved**
- State coverage — **strong**
- Visual reference coverage — **strong**
- Bloat & overspecification — **strong (lean)**
- Inheritance discipline — **strong**
- Shape fit — **strong**

## Contrast computations (all AA-passing)

| Foreground | Background | Ratio | AA |
|---|---|---|---|
| Soloist Ink `#1C1B1F` | Warm Paper `#FBFAF8` | 16.42:1 | PASS |
| White `#FFFFFF` | Soloist Iris `#5B5BD6` | 5.37:1 | PASS |
| Iris `#5B5BD6` as link text | Warm Paper `#FBFAF8` | 5.15:1 | PASS |
| status-shipped `#15803D` | `#ECFDF3` | 4.76:1 | PASS |
| status-progress (was `#B45309`) | `#FEF6E7` | 4.67:1 → darkened to `#92400E` (5.93:1) | PASS+ |
| status-next `#475569` | `#F1F5F9` | 6.92:1 | PASS |
| muted-foreground `#6B6760` | Warm Paper `#FBFAF8` | 5.39:1 | PASS |

## Findings by severity

### Critical (2) — both resolved
- **[Accessibility C-1]** Guard validated only white-on-accent, not accent-as-link-text (EXPERIENCE.md › Per-Tenant Branding). *Resolved:* decoupled `tenant-accent-text` token, validated ≥4.5:1 on background + white, auto-darkens for pale fills.
- **[Accessibility C-2]** No 3:1 non-text floor for accent focus rings / active states (EXPERIENCE.md › Accessibility Floor). *Resolved:* 3:1 non-text threshold added; focus ring falls back to Soloist Ink when the accent fails.

### High (4) — all resolved
- **[A11y H-1]** Branded email accessibility unspecified. *Resolved:* email-a11y clause (logo alt, images-off survival, pinned inline backgrounds, semantic headings, ≥14px body).
- **[A11y H-2]** Status tint pairs passed AA with no margin. *Resolved:* amber darkened `#B45309 → #92400E` (5.93:1); ratios documented.
- **[A11y H-3]** Live-feed `aria-live` unspecified. *Resolved:* `aria-live="polite"` + concise summary + no focus move; poll branch announces the "Load new updates" control.
- **[A11y H-4]** No touch-target minimum. *Resolved:* ≥44px Client Portal hit area, ≥24px Cockpit floor.

### Medium (7) — all resolved
- **[Rubric]** Repo Connection card — no DESIGN.md visual spec. *Resolved:* four states mapped to shadcn Badge/Alert/Spinner + tokens.
- **[Rubric]** Curation queue row — visual spec only implicit. *Resolved:* DESIGN.md states queue row = `ship-update-card` (edit mode) + shadcn inline-edit controls.
- **[A11y M-1..M-5]** Shortcuts-while-typing, overlay focus trap/return, SPA route announcement, form label/error semantics, logo alt rule. *Resolved:* folded into the consolidated Accessibility Floor.

### Low (15) — resolved or accepted
- **[Rubric]** Flow-4 em-dash drift → *Resolved* (verbatim restored). Contrast ratios not stated → *Resolved* (annotated). Guard reject-only → *Resolved* (decoupled text token). Branding/Invite/Notification inheritance ambiguity → *Resolved* (one DESIGN.md line). Offline state → *Resolved* (Client offline row). Remaining low items (source-framing echo in Privacy/Foundation, candidate-badge as sub-element) accepted as faithful, not defects.
- **[A11y L-1..L-3]** Reduced-motion, 4.5/3.0 threshold-split naming, not-found AT semantics → *Resolved* in Accessibility Floor.

## Mechanical notes

- Both spines `status: draft → final`, `updated: 2026-06-06`.
- Stale `[ASSUMPTION]` tags (default hue, radius scale) cleared to ✓ Confirmed.
- Editorial polish: 6 mechanical fixes; no decision/token/reference altered.
- Remaining `[OPEN]` items are PRD-deferred and non-blocking.

## Reviewer files

- `review-rubric.md`
- `review-accessibility.md`
