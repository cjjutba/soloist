# Spine Pair Review — Soloist

## Overall verdict

This is a **strong, source-grounded spine pair** that a downstream consumer (architecture, story-dev) can extract from cleanly: every `{path.to.token}` reference resolves, all load-bearing color combos pass WCAG AA when computed, section order is canonical, the glossary is consistent across both spines and the extracted sources, and all four UJs render as full Key Flows with named protagonist, numbered steps, climax, and failure path. The defects are confined to **component-coverage asymmetry** — several EXPERIENCE.md behavioral rows (notably Repo Connection card, with four distinct states) have no corresponding DESIGN.md visual spec, and they are not all cleanly attributable to shadcn inheritance. Nothing is broken; the gaps are "thin in one spine," plus a `status: draft` / finalize-pass mismatch and a few low-severity documentation omissions (no stated contrast ratios; one UJ title punctuation drift).

## 1. Flow coverage — strong

Checked: all four UJs from `extracted-sources.md` (UJ-1..UJ-4) against EXPERIENCE.md Key Flows. Each UJ maps 1:1 to a flow (lines 175/184/193/201), each cites its UJ tag, each has a named protagonist (CJ / Maya), numbered steps, an explicit **Climax** beat (lines 180/189/197/206), and a **Failure** path (lines 182/191/199/208). Climaxes match the source-specified climaxes (e.g. UJ-2's "✅ Set up the authentication system / 🚧 Building the dashboard" appears verbatim). Failure paths are non-trivial and recovery-oriented, not stubs.

### Findings
- **low** Flow 4 title reads "...client-ready proof, and bills for it" (EXPERIENCE.md:201) vs source UJ-4 "...client-ready proof — **and** bills for it" (extracted-sources.md:45) — comma substituted for em-dash. Flows 1–3 titles are verbatim. (EXPERIENCE.md:201). *Fix:* restore the em-dash to keep UJ titles verbatim across artifacts.

## 2. Token completeness — strong

Checked: every YAML frontmatter token in DESIGN.md, and every `{path.to.token}` reference in prose across both files. Result: **all references resolve.** DESIGN.md refs (`colors.*`, `rounded.*`, `components.*`) and EXPERIENCE.md refs (`{components.ship-update-card}`, `{components.candidate-badge}`, `{components.onboarding-hero}`, `{colors.tenant-accent}`, `{colors.background}`) all map to defined frontmatter keys. The `{components.status-tag-*}` wildcard in EXPERIENCE.md:97 resolves to the three defined variants (`status-tag-shipped` / `-progress` / `-next`). Every color token carries a hex; no color is missing a value. The per-Tenant accent mechanism is fully specified: runtime CSS var `--tenant-accent`, default Soloist Iris `#5B5BD6`, Client-Portal-root re-scope of shadcn `primary` → `tenant-accent`, Cockpit explicitly excluded, neutral fallback before customization (DESIGN.md:19–24, 124; EXPERIENCE.md:66–71).

I computed every load-bearing combo independently — all pass WCAG AA for normal text: Soloist Iris on white **5.37**, Ink on Paper **16.42**, Shipped **4.76**, In Progress **4.67**, Next **6.92**, warm muted-foreground on Paper **5.39**. The palette is internally sound.

### Findings
- **low** The contrast *mechanism* (the runtime accent guard, "AA against white") is well specified, but no **numeric contrast ratio is stated** for any load-bearing static combo — including the default accent (`#5B5BD6` on white) and the three status text-on-surface pairs. A consumer must re-derive them to trust the floor. (DESIGN.md:125, 126–130). *Fix:* annotate the default accent and each status pair with its measured ratio (e.g. "Iris on white = 5.37, AA✓"); they all pass, so this is documentation, not a redesign.
- **low** `tenant-accent-foreground` is fixed to white (`#FFFFFF`) and the guard only validates white-on-accent. A Freelancer who picks a *pale* accent (e.g. a light pastel) would fail white-on-accent and be blocked, but the spec never offers a dark-foreground fallback — the guard can only reject, never flip the foreground. (DESIGN.md:24; EXPERIENCE.md:71). *Fix:* either state "accents must be dark enough for white text (light accents rejected by design)" explicitly, or allow the guard to swap to a dark foreground.

## 3. Component coverage — adequate

Checked: every component name used anywhere in both spines, verifying each has a DESIGN.md visual spec **and** an EXPERIENCE.md behavioral row. DESIGN.md Components defines 6 brand-layer components (Button-primary, Ship Update card, Status tag, Candidate-count badge, Onboarding hero, Invoice card/document) plus the shadcn as-is list. EXPERIENCE.md Component Patterns has 12 behavioral rows. The shared core — Ship Update card, Status tag, Onboarding, Invoice, Candidate badge — is specified in **both** spines with real rules (not stubs). The asymmetry: several EXPERIENCE.md behavioral rows have **no dedicated DESIGN.md visual entry**, and not all are cleanly shadcn-inherited.

### Findings
- **medium** **Repo Connection card** has a behavioral row with four distinct visual states (connected / pulling / error / disconnected, EXPERIENCE.md:101) but **no DESIGN.md visual spec at all** (grep: absent). A four-state custom card is not a plain shadcn primitive; a consumer has no token/anatomy guidance for the error and pulling states. (EXPERIENCE.md:101). *Fix:* add a DESIGN.md Components entry for the Repo Connection card (or explicitly map each state to a shadcn `Badge`/`Alert` variant + token).
- **medium** **Curation queue row** is the Cockpit's primary work object (inline-edit, bulk-select, dismiss/publish affordances, EXPERIENCE.md:98) but has no DESIGN.md visual spec; it is only implicitly "a Ship Update card in edit mode." The edit-affordance and bulk-select chrome are unspecified visually. (EXPERIENCE.md:98). *Fix:* either add a DESIGN.md entry, or state in DESIGN.md that the queue row = `ship-update-card` + shadcn inline-edit controls, so the inheritance is explicit rather than inferred.
- **low** **Branding controls**, **Invite control**, and **Notification center** have behavioral rows (EXPERIENCE.md:102, 105, 106) but no DESIGN.md visual entry. These are plausibly pure shadcn compositions (color picker, Button+Input+Badge, list of rows), but neither spine *states* that inheritance, so the "no visual spec" is ambiguous between "inherits shadcn" and "underspecified." (EXPERIENCE.md:102/105/106). *Fix:* one line in DESIGN.md Components confirming these compose from shadcn as-is.
- **low** **Candidate-count badge** has a DESIGN.md visual spec (DESIGN.md:178) but no standalone EXPERIENCE.md behavioral row — its behavior (count >0 only, zero-state absent) is folded into the Engagement row (EXPERIENCE.md:100). Acceptable as a sub-element, noted for completeness. *Fix:* none required.

## 4. State coverage — strong

Checked: each IA surface in both the Cockpit and Client Portal tables against the state checklist (empty, cold-load, error, not-found, offline, permission-denied). Coverage is broad and intentionally designed (EXPERIENCE.md:109–127): cold-load (Skeleton), multiple empties (pre-first-publish, no Engagements, no repo, queue-clear, no Invoices), error/degraded (GitHub failure banner + repo card error, token revoked), not-found (unknown subdomain / unauthorized → neutral not-found), invite expired, optimistic-publish failure, live-update arrival. Permission-denied is correctly *folded into* not-found by design (the curation/privacy boundary collapses unauthorized → not-found so existence is never confirmed — EXPERIENCE.md:63, 123), which is the right call, not a gap.

### Findings
- **low** **Offline** is not addressed as a state, and extracted-sources.md:59 explicitly lists offline as "NOT MENTIONED" in sources — so this is faithful to scope, not an oversight. Worth an explicit one-liner since the Client Portal is mobile-first (a founder reads on a phone on flaky 4G) and "what the feed shows with no connection" is a real mobile case. (EXPERIENCE.md State Patterns, 113–127). *Fix:* add a single offline/connection-lost row for the Client feed, or state "offline out of v1 scope" so the omission is a decision, not a gap.
- **low** **Update detail** surface (EXPERIENCE.md:47) and **Notifications** center (EXPERIENCE.md:49) have no empty/error state row of their own (e.g. a notification-center empty state). Low impact — both inherit feed states — but not explicitly covered. *Fix:* optionally add a "notification center empty" row; currently only `[OPEN]` grouping/read-state is flagged.

## 5. Visual reference coverage — strong (correct for this pass)

Checked: inline links to `mockups/` and whether spines-win-on-conflict is stated. There are **zero inline `.html` links** in either file (grep confirms none), so there are no broken cross-refs. The single mockup reference is forward-looking: "Composition references **will be added to `mockups/`** at finalize for ... Onboarding, Ship Feed, curation queue. Spine wins on conflict." (EXPERIENCE.md:54). The `mockups/` directory does not yet exist — consistent with "being generated this same finalize pass." Spines-win-on-conflict is stated **three times**: both file headers ("Both spines win on conflict with any mock or import" — DESIGN.md:100, EXPERIENCE.md:12) and the mockup line itself. No findings.

## 6. Bloat & overspecification — strong (verdict: lean)

EXPERIENCE.md contains **zero pixel/hex literals** (grep clean) — all visual values are deferred to DESIGN.md tokens, exactly as the contract wants. DESIGN.md prose carries a handful of pixel restatements (34px display, `portal-gutter` 20px, radius 6/10/14/20 — DESIGN.md:139, 152, 167), but these are inline annotations of frontmatter values for narrative readability in the *visual* spine, and each matches the frontmatter exactly; this is acceptable editorial annotation, not bloat. No persona/FR restatement detected in either spine beyond load-bearing one-liners. Editorial voice is correctly partitioned: DESIGN.md prose carries it ("substrate of premium," "you hired an agency"); EXPERIENCE.md prose stays operational.

### Findings
- **low** EXPERIENCE.md Foundation/Privacy sections restate some source framing ("the whole product hinges on that one distinction," EXPERIENCE.md:23; the curation-boundary recap, 56–64). It earns its place as the load-bearing rule, but is the closest thing to source-restatement in the experience spine. *Fix:* none required; flagged only for awareness.

## 7. Inheritance discipline — strong

Sources frontmatter resolves to real directories (`prds/prd-soloist-2026-06-05/`, `briefs/brief-soloist-2026-06-05/` both exist on disk). UJ names are verbatim for 3 of 4 flows (Flow 4 punctuation drift — see §1). Glossary is **identical and consistent** across both spines and the extracted sources: Tenant → Engagement → Ship Feed → Ship Update (candidate/published) → Client → Repo Connection → Invoice all used with the same hierarchy and casing in all three documents. Component names are identical across DESIGN.md frontmatter, DESIGN.md Components prose, and EXPERIENCE.md Component Patterns (Ship Update card, Status tag, Candidate-count badge, Onboarding hero). EXPERIENCE.md token refs all resolve to DESIGN.md tokens by name (verified in §2). No naming drift found.

### Findings
- (none beyond the Flow-4 title in §1)

## 8. Shape fit — strong

DESIGN.md sections are in **exact canonical order**: Brand & Style → Colors → Typography → Layout & Spacing → Elevation & Depth → Shapes → Components → Do's and Don'ts (DESIGN.md:106–182). EXPERIENCE.md has all required defaults present (Foundation, IA, Voice and Tone, Component Patterns, State Patterns, Interaction Primitives, Accessibility Floor, Key Flows) plus required-when-applicable Inspiration & Anti-patterns and Responsive & Platform. The two invented sections — **Privacy & Visibility (the curation boundary)** and **Per-Tenant Branding system** — clearly earn their place: privacy-via-curation is the single load-bearing product rule (PRD NFR-2/3) and per-Tenant branding is the core mechanism the whole DESIGN.md accent system depends on; neither duplicates a default section.

### Findings
- (none)

## Mechanical notes

- **Frontmatter completeness:** Both spines carry `name`, `status`, `sources` (identical, resolving), `updated`. DESIGN.md additionally carries the full token set (`colors`, `typography`, `rounded`, `spacing`, `components`) — complete and self-consistent. No missing required keys.
- **Status / finalize-pass mismatch (medium):** Both spines are `status: draft` (DESIGN.md:4, EXPERIENCE.md:3), but the `.decision-log.md` records CJ confirming all three load-bearing forks (2026-06-05) and the task frames this as a *finalize* pass generating mockups. A downstream consumer keys off `status`; leaving it `draft` understates readiness and conflicts with the confirmation log. *Fix:* promote to `status: final` (matching the example spine's `status: final`) if this pass finalizes, or document why it remains draft.
- **Residual `[ASSUMPTION]` / `[OPEN]` tags:** Spines still carry author assumptions and PRD-deferred opens (Cockpit domain `app.cjjutba.com`, real-time-vs-poll feed, notification-center grouping, Invoice field set, radius scale). These are appropriately tagged and the decision-log enumerates them as non-blocking for spine completion — correct discipline, not a defect. The `[ASSUMPTION: default hue]` on the accent (DESIGN.md:124) slightly contradicts the header's "Confirmed (CJ): Soloist Iris #5B5BD6 as the neutral default accent" (DESIGN.md:104) — minor stale tag.
- **No broken cross-refs:** all `{path.to.token}` resolve; cross-spine section pointers ("see EXPERIENCE.md.Accessibility", "Visual specs live in DESIGN.md.Components") point to sections that exist under those names.
- **Contrast (verified, not just asserted):** independently computed — all load-bearing combos pass WCAG AA normal-text. The spec's claims are accurate; they're just not numerically stated (see §2).
