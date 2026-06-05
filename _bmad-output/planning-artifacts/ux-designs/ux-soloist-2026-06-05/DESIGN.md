---
name: Soloist
description: Dev-native multi-tenant client portal. Premium, calm, trustworthy — "you hired an agency." shadcn/ui on Next.js + Tailwind; this DESIGN.md specifies the brand-layer delta plus the per-Tenant accent mechanism. Visual identity owner; pairs with EXPERIENCE.md.
status: final
sources:
  - "{planning_artifacts}/prds/prd-soloist-2026-06-05/prd.md"
  - "{planning_artifacts}/briefs/brief-soloist-2026-06-05/brief.md"
updated: 2026-06-06
colors:
  # Brand-layer delta on shadcn defaults. All unlisted shadcn tokens
  # (muted, muted-foreground, popover, card, border, input, ring, secondary,
  # destructive, …) inherit as-is unless named below.
  primary: '#1C1B1F'            # Soloist Ink — warm near-black. Primary text + Cockpit primary actions. Overrides shadcn primary.
  primary-foreground: '#FBFAF8'
  background: '#FBFAF8'         # Warm Paper — overrides shadcn's cool-gray background. Premium-calm base.
  foreground: '#1C1B1F'
  muted-foreground: '#6B6760'   # Warm muted ink (overrides shadcn's cool muted-foreground)
  border: '#EAE7E1'            # Warm hairline
  # --- Per-Tenant accent: RUNTIME VARIABLE ---
  # `tenant-accent` is set per Tenant (Freelancer-chosen) via the CSS var
  # --tenant-accent. Default below = Soloist Iris (neutral pre-customization).
  # The Client Portal root re-maps shadcn `primary` -> tenant-accent.
  tenant-accent: '#5B5BD6'      # Soloist Iris — accent FILL (buttons, hero). Default; per-Tenant overridable.
  tenant-accent-foreground: '#FFFFFF'   # text ON the accent fill. Guard: ≥4.5:1 (Iris = 5.37 ✓)
  tenant-accent-text: '#5B5BD6' # accent AS text (links/inline) on Paper/white — DECOUPLED from fill so a pale brand fill can't make link text illegible. Guard: ≥4.5:1 on background AND white (Iris = 5.15 / 5.37 ✓). Auto-darkens if the chosen fill fails as text.
  # --- Status vocabulary: FIXED product semantics, never per-Tenant. Ratios measured on their own surface. ---
  status-shipped: '#15803D'         # ✅ Shipped   (4.76:1 on surface, AA ✓)
  status-shipped-surface: '#ECFDF3'
  status-progress: '#92400E'        # 🚧 In Progress (5.93:1 on surface, AA ✓ — darkened from #B45309's brittle 4.67 per a11y H-2)
  status-progress-surface: '#FEF6E7'
  status-next: '#475569'            # 📦 Next       (6.92:1 on surface, AA ✓)
  status-next-surface: '#F1F5F9'
typography:
  # body / label / caption inherit shadcn's Geist Sans ramp.
  # Only `display` is brand-overridden — a serif "premium moment."
  display:
    fontFamily: 'Fraunces'
    fontSize: 34px
    fontWeight: '450'
    lineHeight: '1.12'
    letterSpacing: -0.01em
  display-sm:
    fontFamily: 'Fraunces'
    fontSize: 22px
    fontWeight: '450'
    lineHeight: '1.2'
  numeric:
    fontFamily: 'Geist Mono'      # invoice amounts, counts, timestamps
    fontSize: 14px
    letterSpacing: '0'
rounded:
  # A touch softer than shadcn defaults — reads "premium consumer," not "sharp tool."
  sm: 6px
  md: 10px
  lg: 14px      # cards, Ship Update tiles
  xl: 20px      # Onboarding hero, premium panels
  full: 9999px  # status tags, avatars
spacing:
  # shadcn / Tailwind 4-based scale inherited (4,8,12,16,20,24,32,40,48,64).
  # Named brand rhythm tokens:
  portal-gutter: 20px       # Client Portal horizontal margin (mobile-first)
  feed-gap: 16px            # vertical gap between Ship Update cards
  cockpit-gutter: 24px      # Cockpit working-surface padding
components:
  button-primary:
    background: '{colors.primary}'        # Cockpit; Client Portal scope re-maps to {colors.tenant-accent}
    foreground: '{colors.primary-foreground}'
    radius: '{rounded.md}'
  button-tenant:
    background: '{colors.tenant-accent}'  # explicit per-Tenant CTA (Onboarding, Client Portal primary)
    foreground: '{colors.tenant-accent-foreground}'
    radius: '{rounded.md}'
  ship-update-card:
    background: '{colors.background}'
    border: '{colors.border}'
    radius: '{rounded.lg}'
  status-tag-shipped:
    background: '{colors.status-shipped-surface}'
    foreground: '{colors.status-shipped}'
    radius: '{rounded.full}'
  status-tag-progress:
    background: '{colors.status-progress-surface}'
    foreground: '{colors.status-progress}'
    radius: '{rounded.full}'
  status-tag-next:
    background: '{colors.status-next-surface}'
    foreground: '{colors.status-next}'
    radius: '{rounded.full}'
  candidate-badge:
    background: '{colors.tenant-accent}'  # Cockpit "needs curation" count — uses Soloist Iris (Cockpit is Soloist-branded)
    foreground: '{colors.tenant-accent-foreground}'
    radius: '{rounded.full}'
  onboarding-hero:
    background: '{colors.tenant-accent}'  # Tenant-branded welcome panel
    foreground: '{colors.tenant-accent-foreground}'
    radius: '{rounded.xl}'
---

# Soloist — Visual Identity

> Pairs with `EXPERIENCE.md` (IA, behavior, flows). DESIGN.md owns *how it looks*; EXPERIENCE.md owns *how it works* and references these tokens by `{path.to.token}`. Both spines win on conflict with any mock or import.
>
> **Fast-path draft.** `[ASSUMPTION]` tags mark decisions made by the author from the PRD/brief that the brief did not fix and that are awaiting CJ's confirmation. The PRD explicitly deferred the concrete visual system to this UX phase.
>
> **Confirmed (CJ, 2026-06-05):** premium serif-accented direction (warm Paper + Soloist Ink + Fraunces serif moments) · Soloist Iris `#5B5BD6` as the neutral default accent · softer radius scale. These are settled; remaining `[ASSUMPTION]` tags are lower-stakes.

## Brand & Style

Soloist has a paradoxical brand: **it must feel premium while disappearing into someone else's brand.** Every Client-facing surface carries the *Freelancer's* logo and accent color, not Soloist's. So the Soloist design language is the *substrate of premium* — the typographic craft, the spacing, the calm, the restraint — onto which a Tenant paints a single accent and a logo, and the result reads as "this person's own product," never "a third-party SaaS tool."

The posture is **calm, confident, trustworthy — "you hired an agency."** Not loud, not playful, not "productivity-app cheerful." The emotional job on the Client side is to convert a founder's quiet anxiety ("is this real?") into quiet confidence ("this person is legit"). That is done through *craft signals*: a serif display moment, generous breathing room, honest plain-English status, and zero clutter. The emotional job on the Freelancer (Cockpit) side is to make CJ feel in control and proud of what the Client sees — a sober, fast tool that gets out of the way.

Soloist inherits **shadcn/ui on Next.js + Tailwind** wholesale. This document specifies only the brand-layer deltas — a warm-neutral base, the per-Tenant accent mechanism, a serif display face, slightly softer corners, the fixed status vocabulary, and a handful of brand components. Every component that ships from shadcn (Button, Card, Dialog, Sheet, Dropdown, Toast, Tabs, Input, Avatar, Skeleton) inherits its visual spec as-is. Customizing those beyond the brand layer is against the discipline — shadcn's defaults are the contract.

**Two surfaces, one system, different temperatures:**
- **Client Portal** — the premium, *Tenant-branded* surface. Warm, spacious, serif moments, the Tenant accent as the one chromatic voice. Mobile-first.
- **Cockpit** — the *Soloist-branded* working tool. Same system, denser, cooler in feel, accent = Soloist Iris (never a Tenant's color — CJ's workspace is Soloist's, not his client's).

## Colors

The palette is **warm-neutral base + one per-Tenant accent + a fixed three-color status vocabulary.** Discipline: if the brand can't justify a color, it doesn't add one.

- **Soloist Ink (`#1C1B1F`)** — warm near-black. Primary text everywhere, and the primary-action fill *in the Cockpit*. Overrides shadcn's `primary` and `foreground`. Warm (not pure `#000`/cool-gray) so the whole product reads considered rather than clinical.
- **Warm Paper (`#FBFAF8`)** — the background. Overrides shadcn's cool-gray `background`. A barely-warm off-white is the single biggest "premium calm" signal versus default-SaaS gray.
- **Tenant Accent (default Soloist Iris `#5B5BD6`)** ✓ default confirmed. **The only per-Tenant color and a runtime variable.** Set by the Freelancer in Branding settings; applied to ALL Client-facing surfaces (Onboarding hero, Client Portal primary actions, links, active states) and branded notification emails. Until a Tenant customizes, it falls back to Soloist Iris — a calm, modern indigo that reads premium-neutral (as fill, white-on-Iris = 5.37:1; as link text on Paper = 5.15:1 — comfortable both ways, which is what makes it a safe default). **On Client surfaces, shadcn `primary` is re-scoped to `tenant-accent`** at the Portal root; in the Cockpit, `primary` stays Soloist Ink and the Iris default appears only as Soloist's own chrome (e.g. the candidate-count badge).
  - **Contrast guard (load-bearing — see EXPERIENCE.md › Accessibility Floor & the Branding contrast guard).** The accent is used three ways, and the guard validates all three before it will save (WCAG split: **4.5:1 for text, 3:1 for non-text**): **(1) fill** — `tenant-accent-foreground` (white) text on the accent ≥ 4.5; **(2) text** — `tenant-accent-text` (the accent rendered as link/inline text) on `background` *and* on white ≥ 4.5, auto-darkened from the fill when a pale brand fill would otherwise be illegible (fill and text colors are decoupled tokens for exactly this reason); **(3) non-text** — the accent as a focus ring / active-state / badge boundary on `background` ≥ 3:1, and if it fails, the **focus ring falls back to Soloist Ink** so a brand choice can never remove the keyboard-focus cue. The rubric flagged guard scope on FR-2; the design treats all three as hard rules.
- **Status vocabulary — fixed, never per-Tenant.** The product's promise is plain-English status, so these three carry meaning and must stay constant across every Tenant's brand:
  - **✅ Shipped — Green (`#15803D` on `#ECFDF3`, 4.76:1 AA ✓)**
  - **🚧 In Progress — Amber (`#92400E` on `#FEF6E7`, 5.93:1 AA ✓)**
  - **📦 Next — Slate (`#475569` on `#F1F5F9`, 6.92:1 AA ✓)**
  - Rendered as soft tinted pill tags, not saturated badges. The emoji is part of the token's identity (it appears in feed, email, and copy) — but **never the sole carrier**: the text label always accompanies it, so status survives for colorblind readers and images-off email. Pill text may render small (11–13px), so the 4.5 threshold genuinely applies; the amber was darkened from `#B45309` (a brittle 4.67) to hold a real margin.
- **All other tokens** (`muted`, `card`, `popover`, `input`, `ring`, `secondary`, `destructive`) inherit shadcn defaults; `border` and `muted-foreground` are the two nudged warm (declared in frontmatter above) to match Paper/Ink.

**Avoid:** gradients on chrome, a second decorative brand color, saturated status badges, using the Tenant accent for anything other than brand expression and primary affordance, letting a Tenant accent touch the *Cockpit*.

## Typography

Body, label, and caption inherit shadcn's **Geist Sans** ramp as-is. Two brand overrides:

- **Display — Fraunces (serif), 34px / 22px small.** ✓ Confirmed: premium serif-accented direction approved (CJ, 2026-06-05). The serif is the craft signal — the single clearest "an agency made this" cue. Used *sparingly* (a punctuation mark, never the default voice):
  - The Onboarding welcome line ("Welcome to {Tenant}'s workspace, {Client}")
  - The Ship Feed header / Engagement title on the Client Portal
  - Cockpit empty-state and first-run greetings
  - Invoice document title
- **Numeric — Geist Mono, 14px.** Invoice amounts, money totals, the candidate count, relative timestamps, and repo metadata. Tabular figures keep money and counts honest and aligned.

Everything else is Geist Sans. The serif never sets body copy or button labels.

## Layout & Spacing

shadcn / Tailwind 4-based scale inherited. Two surfaces, two rhythms:

- **Client Portal — generous, single-column, mobile-first.** `portal-gutter` 20px side margins; `feed-gap` 16px between Ship Update cards. Max content width `max-w-2xl` (672px) centered — the feed is a *reading* surface, not a dashboard. Breathing room *is* the premium signal; never fill the width with chrome.
- **Cockpit — denser, working width.** `cockpit-gutter` 24px; content up to `max-w-6xl` for the Engagements list and curation queue (these are work tables). Sidebar nav on `lg+`, collapses to a `Sheet` on smaller viewports.

Grid: 12-col on `lg+` for the Cockpit; single column everywhere on the Client Portal regardless of viewport (a founder reads top-to-bottom on a phone).

## Elevation & Depth

Inherited from shadcn — soft, restrained. Elevation is *not* a hierarchy device; it's a focus cue.
- Ship Update cards: a single gentle resting shadow + a slightly stronger lift on hover/tap (the only "interactive" cue they need).
- The Onboarding hero panel sits flat on its own accent fill — no shadow inside a colored panel.
- Cockpit tables: flat, hairline `border` separation, no card shadows (a tool, not a gallery).
Premium = soft and few shadows, never heavy or stacked.

## Shapes

Softer than shadcn defaults so the surface reads premium-consumer rather than sharp-tool: `sm` 6px (inputs), `md` 10px (buttons), `lg` 14px (cards, Ship Update tiles), `xl` 20px (Onboarding hero, premium panels), `full` (status tags, avatars). ✓ Scale confirmed. The Cockpit may read fractionally crisper by leaning on `md` where the Portal leans on `lg`, but the scale is shared.

## Components

Used from shadcn **as-is, unchanged:** `Button` (non-primary variants), `Card`, `Dialog`, `Sheet`, `DropdownMenu`, `Popover`, `Toast`, `Tabs`, `Input`, `Textarea`, `Avatar`, `Skeleton`, `Separator`, `Badge` (base). Don't customize these.

Brand-layer components:

- **Button — primary.** Cockpit: `{colors.primary}` (Soloist Ink) fill. Client Portal: re-scoped to `{components.button-tenant}` (Tenant accent). `{rounded.md}` corners. Secondary/outline/ghost/destructive inherit shadcn.
- **Ship Update card** — the product's hero object. `{components.ship-update-card}`: Paper fill, warm `{colors.border}`, `{rounded.lg}`, gentle elevation. Anatomy: status tag (top-left) · plain-English title (`label`/strong) · 1–2 line summary (`body`) · relative timestamp (`numeric`, muted). Never shows SHAs, branches, or diffs. (Behavioral spec in EXPERIENCE.md.)
- **Status tag** — three fixed variants (`status-tag-shipped` / `-progress` / `-next`), soft tinted pills with emoji + label. The same three appear in the Cockpit curation queue, the Client feed, and emails.
- **Candidate-count badge** — Cockpit only. The "N updates need curation" signal on each Engagement row. `{components.candidate-badge}` (Soloist Iris pill). Zero state: badge absent, not "0."
- **Onboarding hero** — Client first-run. `{components.onboarding-hero}`: full-bleed Tenant-accent panel, Tenant logo, `display` welcome line in `tenant-accent-foreground`, `{rounded.xl}`.
- **Invoice card / document** — `numeric` for amounts; status reflected as a chip (Draft / Sent / Paid). Premium document feel (serif title, generous spacing), not a form printout.
- **Curation queue row** — visually = a `ship-update-card` in *edit mode*: same anatomy, plus shadcn inline-edit controls (editable `Input`/`Textarea` for title/summary), the three `status-tag-*` as a segmented toggle, a shadcn `DropdownMenu` for dismiss/hide, and a dark `button-primary` (Soloist Ink) "Publish." Bulk-select uses shadcn `Checkbox` on `lg+`. No new visual primitive — it inherits the card.
- **Repo Connection card** — four states mapped to shadcn primitives so each is specified, not improvised: *connected* = shadcn `Badge` (secondary) + last-pull time in `numeric` muted; *pulling* = `Badge` + shadcn `Spinner`/animated dot; *error* (token revoked / unreachable) = shadcn `Alert` (destructive variant) with a recover action; *disconnected* = `Badge` (outline) + "Connect" `button-primary`. Card chrome = `{rounded.lg}`, hairline `border`.
- **shadcn-composed controls (no brand-layer override).** Branding controls (color picker + logo upload + live preview), Invite control (`Input` + `Button` + state `Badge`), Notification center (list of `Card`/row items with unread dot), and toasts compose from shadcn primitives as-is. They carry behavior (EXPERIENCE.md) but need no DESIGN.md visual spec beyond the inherited defaults — stated here so "no entry" reads as *inherits shadcn*, not *underspecified*.

## Do's and Don'ts

| Do | Don't |
|---|---|
| Inherit shadcn for everything outside the brand layer | Override shadcn tokens beyond those named here |
| Keep the Tenant accent to Client-facing surfaces + emails | Let a Tenant accent touch the Cockpit |
| Use the fixed status colors everywhere status appears | Recolor status per Tenant or invent new statuses |
| Validate the Tenant accent three ways — fill 4.5 / text 4.5 / non-text 3.0 — and fall back to Ink for the focus ring if non-text fails | Ship a Branding picker that only checks white-on-accent (a pale brand then breaks link text and the focus ring) |
| `display` (Fraunces) only for premium moments | Set body or buttons in the serif "to look fancy" |
| Warm Paper + Soloist Ink as the calm base | Default-SaaS cool gray, gradients, or a second brand color |
| Generous single-column reading on the Client Portal | Pack the Portal with dashboard chrome (anti-reference: cluttered PM dashboards) |
| Money/counts/timestamps in `numeric` (tabular) | Proportional figures for amounts and totals |
