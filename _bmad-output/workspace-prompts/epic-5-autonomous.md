# Autonomous Workspace Prompt — Soloist · Epic 5 (Doc Engine: Invoices)

> **How to use this:** In Superset, create a workspace/worktree **based on the `dev` branch** (NOT `main`).
> Paste everything below the line into that workspace and let it run hands-off. It will take Epic 5 to
> done — Story 5.2, then Story 5.3, then the Epic 5 retro — opening a PR into `dev` for each.
> CJ keeps the human gate at `dev → main`.

---

You are an autonomous senior engineer working in an isolated git worktree on **Soloist**, a multi-tenant
SaaS for freelancers (Next.js 16 App Router · TypeScript strict · Tailwind v4 · Drizzle + Neon Postgres ·
Better Auth · Inngest · Resend/React Email · TanStack Query · Vercel Blob · BMad Method v6).

## Mission

Take **Epic 5 — Doc Engine: Invoices** to **DONE**, fully autonomously, following the BMad story cycle.
Two stories remain and **they are sequential — 5.3 depends on 5.2's files, never parallelize them**:

1. **Story 5.2** — Send Invoice + Client View + Manual Status
2. **Story 5.3** — Branded Invoice PDF Export

Then run the Epic 5 retrospective and mark the epic done.

## Branch & integration rules (CRITICAL)

- This worktree is based on `dev`. **Never commit to or push `main`.** Flow is always: feature branch → PR into `dev`. CJ merges `dev → main` himself.
- **Verify you are not on `main` before every commit** (`git branch --show-current`). If on `main`, STOP and report.
- Cut each story's branch from the latest `dev`:
  - Story 5.2 → `feat/story-5.2-send-invoice`
  - Story 5.3 → `feat/story-5.3-invoice-pdf` (cut **after** 5.2 has merged into `dev`)
  - Epic 5 retro → `chore/epic-5-retro`
- When a story's code review passes: push the feature branch, open a PR with **base `dev`** (`gh pr create --base dev`), then squash-merge it into `dev` so the next story builds on it. If `gh` is unavailable, push the branch and leave a note for CJ — don't block.

## The BMad cycle, per story (use the Skill tool)

1. **Create the spec** — invoke `bmad-create-story` (action: `create`). It picks the next `backlog` story from `_bmad-output/implementation-artifacts/sprint-status.yaml` and writes a context-rich spec into `_bmad-output/implementation-artifacts/`. Match the depth/format of the existing `5-1-create-invoice-from-template-prefilled-shared-data.md`.
2. **Validate (optional)** — `bmad-create-story` (action: `validate`) if the spec feels thin.
3. **Implement** — `bmad-dev-story`, **test-driven**: write failing tests first, then implement to green, for every acceptance criterion. **Land the DB migration before the UI that depends on it** (project pattern).
4. **Review** — `bmad-code-review`; fix every blocking finding and re-run until approved. This project reviews every story at high rigor — match that bar.
5. **Verify locally before pushing** — all four must pass:
   - `npm run typecheck`
   - `npm run lint`
   - `npm test`  *(vitest — keep the whole suite green; it's ~375 tests and growing, including isolation/RLS tests you must not weaken)*
   - `npm run build`
6. **Commit → push → PR (base `dev`) → squash-merge into `dev`.** Commit subject style matches history: `Story 5.2: <summary>`.
7. **Update tracking** — set the story to `done` in `sprint-status.yaml`.
8. Move to the next story.

After 5.3 merges into `dev`: run `bmad-retrospective` for Epic 5, write it to `_bmad-output/implementation-artifacts/epic-5-retro-<date>.md`, set `epic-5: done` in `sprint-status.yaml`, and PR that into `dev` on `chore/epic-5-retro`.

## Story specifics you MUST honor

### Story 5.2 — Send Invoice + Client View + Manual Status  (FR-18, UX-DR12)
- A **Draft** invoice can be **Sent** via a Server Action. Status enum is **Draft → Sent → Paid ONLY**. **Paid is marked manually** (out-of-band). **There is no payment processing in the product — do not add any.**
- On send, fire an **`invoice.sent`** Inngest event that fans out through the **existing Epic 4 notification seam** (in-app notification + branded email + toast-if-active), **respecting the per-Client mute preference** already built in Epic 4 (muted = no row/email/toast).
- This requires:
  - Adding **`invoice_id`** (nullable FK) to the `notifications` table — a new migration (`drizzle/0015_*`) with dual-scope RLS, landed before the UI.
  - An **invoice entry type / label** in the Story 4.1 notification center so invoice notifications render and **link to the in-portal invoice**.
- The **Client views the invoice in-portal** as a premium document (serif feel, `numeric`-token money, status chip) in the portal Documents area — **reuse/extend the `InvoiceDocument` view from Story 5.1.** This view is the foundation 5.3 builds on.

### Story 5.3 — Branded Invoice PDF Export  (FR-18, UX-DR12, AR-12)
- For a **Sent or Paid** invoice, generate a branded PDF **server-side via `@react-pdf/renderer`** (Tenant logo + accent, serif document feel), store it in **Vercel Blob**, and expose a **Download** action from the in-portal invoice view that 5.2 built.
- **Reuse** the invoice data + 5.2's view + the existing money/format helpers — do not duplicate them.

## Non-negotiable project constraints (these fail review/CI if violated)

- **NFR-2 isolation (LAUNCH BLOCKER):** every DB access goes through a repository in `src/server/db/repositories/` requiring a `TenantContext`. **Never import Drizzle outside `src/server/db/`** — a lint rule enforces this. Reuse the `getEngagement` / scoped guards; all new invoice + notification reads are tenant- AND engagement-scoped. Cross-scope → not-found, never disclosed.
- **RLS:** new columns/tables get dual-scope (`app.tenant_id` + `app.engagement_id`) policies with FORCE, in the same migration. Follow the pattern in `drizzle/0014_*` and the invoices migration.
- **Money:** integer **minor units + currency code**, never floats. Format via the existing `formatMoney` / `Intl.NumberFormat` helper, rendered in the `numeric` (Geist Mono) token, with per-currency fraction digits.
- **Architecture (AR-14):** mutations = Server Actions, IO boundaries = Route Handlers, **Zod at every boundary**, typed result contract.
- **Emails:** use the shared **`EmailShell`** from Epic 4 (accent border-top, ≥14px, Outlook-robust) — don't hand-roll a new email layout.
- **Accessibility floor (UX-DR15):** keyboard + focus-to-`<h1>` on route change, `role="alert"` form errors, ≥44px Client touch targets, `prefers-reduced-motion`, contrast 4.5 text / 3.0 non-text.
- **Voice/microcopy:** plain-English, founder-friendly, momentum-positive (see EXPERIENCE.md Do/Don't table).

## Read these before implementing

- `_bmad-output/planning-artifacts/epics.md` — Epic 5 section (Stories 5.2, 5.3) + Requirements Inventory (FR-16/17/18, AR-12/13/14, UX-DR12/15).
- `_bmad-output/planning-artifacts/architecture.md` — data model, seams, conventions.
- `_bmad-output/planning-artifacts/ux-designs/ux-soloist-2026-06-05/DESIGN.md` and `EXPERIENCE.md` — UX-DR12 invoice document + voice.
- `_bmad-output/implementation-artifacts/5-1-create-invoice-from-template-prefilled-shared-data.md` — the invoice patterns to extend (`invoices` table, `formatMoney`, `InvoiceDocument`, the `DocumentType` seam, the repository).
- `_bmad-output/implementation-artifacts/epic-4-retro-2026-06-08.md` — the notification fan-out seam you'll reuse + carried debt.
- `src/server/db/schema.ts`, `src/server/db/repositories/`, `drizzle/` — current schema + repos + migration history (next is `0015`).

## Definition of Done (per story)

- [ ] Spec created via `bmad-create-story`
- [ ] Every acceptance criterion implemented, tests written first (TDD)
- [ ] `npm run typecheck && npm run lint && npm test && npm run build` all green
- [ ] `bmad-code-review` passed (all blocking findings fixed)
- [ ] Committed on the feature branch, pushed, PR opened with base `dev`, merged into `dev`
- [ ] `sprint-status.yaml` updated (story → `done`)

## Stop / escalate conditions

- If a story is genuinely blocked (missing secret, an AC you can't resolve from the docs, failing infra), **STOP**, write what you found and what you need, and do not fake progress or skip tests.
- **Never** push to `main`. **Never** weaken an isolation/RLS test to make it pass. **Never** introduce float money math. **Never** add payment processing.

**Begin with Story 5.2 now:** read the reference docs, confirm your branch is off `dev` (create `feat/story-5.2-send-invoice`), then invoke `bmad-create-story` to write its spec.
