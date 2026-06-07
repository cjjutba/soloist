---
baseline_commit: 22823a1
---

# Story 5.1: Create Invoice from Template (Prefilled, Shared Data)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Freelancer,
I want to generate an Invoice prefilled with my client's data,
so that I bill without re-typing anything (FR-16, FR-17, UX-DR12, AR-13).

## Acceptance Criteria

1. **A prefilled, auto-numbered Draft Invoice — created from shared Engagement/Client data (FR-16, FR-17, UX-DR12).**
   **Given** an Engagement's **Documents** tab in the Cockpit
   **When** I create an Invoice
   **Then** a new `invoices` row is inserted as **`status='draft'`**, **prefilled** from the Engagement/Client (the `client_display_name` as the bill-to, the Engagement `name` as a reference, the Tenant name + branding as the "from" — **FR-17 write-once-reuse, no re-typing**), capturing **line items / amounts / dates / notes**, with a **per-Tenant `number`** assigned atomically at creation (FR-16). The Documents tab then **lists** the Engagement's invoices (number · status chip · total · dates) and I can **view** a draft as a premium document. (Editing a draft + sending are Story 5.2; the PDF is 5.3 — **5.1 is create + list + view only**, CJ-confirmed.)

2. **Money is integer minor units + `Intl.NumberFormat` — never float math (AR money rule, architecture.md L297).**
   **Given** amounts on line items and the total
   **When** they are entered, computed, and displayed
   **Then** every monetary value is stored as an **integer in minor units** with a **`currency` code** (per-invoice, **default PHP**, selectable — CJ-confirmed); line totals and the invoice `amount_total` are computed with **integer arithmetic** (a single rounding step at the line boundary, never float accumulation); and all amounts render via **`Intl.NumberFormat`** in the **`numeric` (Geist Mono, tabular)** token.

3. **The Doc Engine is seam-ready — invoice is the first `DocumentType` (AR-13, FR-17).**
   **Given** the architecture's `DocumentType` seam (so proposals/contracts extend later without re-typing)
   **Then** the invoice code lives under **`src/server/doc-engine/`** with **doc-type-agnostic helpers** (money) and an invoice-specific repository/schema/actions, plus a minimal `DocumentType` type. It is a **light code-level seam, NOT a document-registry/plugin system** (YAGNI — there is exactly one type today; a future "proposal" adds a sibling table + reuses `money.ts`).

## Tasks / Subtasks

- [x] **Task 1 — The `invoices` table + the per-Tenant counter (schema + RLS + migration) — LAND THIS FIRST** (AC: 1, 2)
  - [x] `src/server/db/schema.ts` (MODIFY): add the **`invoices`** table (architecture.md L180-181 shape): `id` (uuidv7), `tenantId`→tenants (cascade), `engagementId`→engagements (cascade), **`number` integer NOT NULL** (per-Tenant seq), **`status` text NOT NULL DEFAULT 'draft'** (`draft|sent|paid`), **`lineItems` jsonb NOT NULL`** (array of `{description, quantity, unitAmount}` — `unitAmount` in minor units), **`amountTotal` integer NOT NULL`** (minor units, computed server-side), **`currency` text NOT NULL`**, `issuedAt` timestamptz NOT NULL DEFAULT now(), `dueAt` timestamptz (nullable), `notes` text (nullable), **`pdfBlobUrl` text (nullable — reserved for 5.3)**, `createdAt`. Add a **dual-scope `invoice_scope` `pgPolicy`** identical in shape to `ship_update_scope`/`engagement_scope` (`using`/`withCheck` = `tenant_id = ${currentTenant} AND (${currentEngagement} IS NULL OR engagement_id = ${currentEngagement})`). Add a **`unique("invoices_tenant_number").on(tenantId, number)`** backstop. Export the `Invoice` type.
  - [x] `src/server/db/schema.ts` (MODIFY): add **`invoiceSeq: integer("invoice_seq").notNull().default(0)`** to the **`tenants`** table — the atomic per-Tenant invoice counter (incremented + returned in the create tx; see Task 2).
  - [x] **Migration** (`npm run db:generate` → `drizzle/0014_*.sql`): the `CREATE TABLE invoices` + `CREATE POLICY invoice_scope` + the unique + the `tenants.invoice_seq` ADD COLUMN. **Manually append `ALTER TABLE "invoices" FORCE ROW LEVEL SECURITY;`** after the `ENABLE` (drizzle-kit does NOT emit FORCE — the established hand-edit each migration, verified in 0006/0008). Apply to Neon in Task 5.
  - [x] **Test** (`src/server/db/__tests__/isolation.test.ts`, EXTEND — a new `invoices` block, the backstop-first habit from Epics 2/3): a Freelancer sees only their **own Tenant's** invoices; **WITH CHECK blocks** an invoice forged for another Tenant; **fails closed** with no scope (soloist_app, no GUCs → 0 rows). Seed an invoice per Tenant in a scoped tx (exercises WITH CHECK on insert), mirroring the ship_updates/client_access blocks.

- [x] **Task 2 — Doc Engine data layer: money helpers + the invoices repository** (AC: 1, 2, 3)
  - [x] `src/server/doc-engine/money.ts` (NEW, pure + unit-tested): **`computeLineTotal({quantity, unitAmount})`** = `Math.round(quantity * unitAmount)` (the ONE rounding step, integer minor units out); **`computeAmountTotal(lineItems)`** = integer **sum** of line totals (pure integer addition, no float accumulation); **`formatMoney(minorUnits, currency)`** = `Intl.NumberFormat(undefined, {style:"currency", currency}).format(minorUnits / 10 ** fractionDigits)` where `fractionDigits` is derived from the currency itself (`Intl.NumberFormat(undefined,{style:"currency",currency}).resolvedOptions().maximumFractionDigits`) so PHP/USD (2) and a future JPY (0) are all correct. Doc-type-agnostic (the seam — any document reuses it).
  - [x] `src/server/doc-engine/invoices.repository.ts` (NEW): **`createInvoice(ctx, input)`** — `withTenant(ctx, tx)`: **(a)** atomically bump the counter `UPDATE tenants SET invoice_seq = invoice_seq + 1 WHERE id = ctx.tenantId RETURNING invoice_seq` (the row-lock serializes concurrent creates → no duplicate numbers; in-tx so a failed insert rolls the increment back), **(b)** `computeAmountTotal` server-side (NEVER trust a client-sent total), **(c)** insert the invoice (`status:'draft'`, `number` = the returned seq, `tenantId` from ctx). Returns the row. **`listInvoices(ctx, engagementId)`** — RLS-scoped, engagement-filtered, newest-first (number · status · amountTotal · currency · issuedAt · dueAt). **`getInvoice(ctx, id)`** — RLS-scoped single read (null if not the caller's).
  - [x] `src/server/doc-engine/document-type.ts` (NEW, minimal): `export type DocumentType = "invoice";` + a one-line comment naming the extension path (a future "proposal"/"contract" adds to the union + a sibling table + reuses `money.ts`). **Do NOT build a registry/dispatch** — there is one type.
  - [x] **Test** (`money.test.ts` + `invoices.repository` PGlite): money — line-total rounding, integer total sum, `formatMoney` for PHP/USD (+ a 0-decimal currency); repo — `createInvoice` assigns **1 then 2** on consecutive creates (atomic counter), computes `amountTotal` server-side (ignores any client total), inserts as `draft`; `listInvoices` is engagement-scoped; `getInvoice` returns null cross-tenant.

- [x] **Task 3 — The create action (with the load-bearing engagement-ownership guard) + Zod** (AC: 1, 2)
  - [x] `src/server/doc-engine/invoice.schema.ts` (NEW, Zod): `lineItemSchema` = `{ description: z.string().trim().min(1).max(500), quantity: z.number().positive().finite(), unitAmount: z.number().int().min(0) }`; `createInvoiceSchema` = `{ engagementId: z.uuid(), lineItems: z.array(lineItemSchema).min(1).max(100), currency: z.string().length(3), issuedAt?: ..., dueAt?: ..., notes?: z.string().max(2000) }`. (Amounts are minor-unit **integers** at the boundary — reject floats.)
  - [x] `src/server/doc-engine/invoice.actions.ts` (NEW): **`createInvoiceAction(input)`** — `requireFreelancer()` → Zod parse → **`getEngagement(ctx, input.engagementId)` ownership guard → null ⇒ `{ok:false}`** (THE LOAD-BEARING GUARD, the 3.8/4.4 lesson: `invoice_scope`'s WITH CHECK for a freelancer ctx (no `app.engagement_id` GUC) reduces to `tenant_id` only, so RLS alone does NOT block an invoice stamped to your tenant but pointing at a **foreign** engagement — the action must verify ownership) → `createInvoice(ctx, …)` → `revalidatePath` the engagement's documents path → typed `{ok:true, id}`. Mirror the `manual-update.actions.ts` shape exactly.
  - [x] **Test** (`invoice.actions.test.ts`, hoisted vi.mock): requires a freelancer; rejects malformed/empty line items + a non-3-letter currency before any repo call; **a foreign/own-tenant `engagementId` the freelancer doesn't own → `getEngagement` returns null → `{ok:false}`, no insert** (the guard); a happy path calls `createInvoice` + revalidates.

- [x] **Task 4 — The Cockpit Documents tab: list + create + view** (AC: 1, 2)
  - [x] `src/app/app/engagements/[id]/(detail)/documents/page.tsx` (REPLACE the placeholder, RSC): the detail layout already guards (freelancer); read `getEngagement` (prefill source + a 404 if not the caller's) + `listInvoices(ctx, id)`. Render the **invoice list** (each: `#{number}` · a **Draft/Sent/Paid** status `Badge` · the total via `formatMoney` in the **`numeric`** font · issued/due dates) with a calm empty state, and a **"New invoice"** affordance opening the builder. No invoices → a friendly "Create your first invoice" empty hero.
  - [x] `src/app/app/engagements/[id]/(detail)/documents/invoice-builder.tsx` (NEW, client island): a form (shadcn `Dialog` or an inline panel) **prefilled** with the bill-to (`engagement.clientDisplayName`, read-only display) — line-item rows (description · quantity · unit amount, add/remove) · a **currency selector (default PHP)** · issue date (default today) · optional due date · notes · a **live running total** (`computeAmountTotal` + `formatMoney`, `numeric` font, recomputed client-side for display only — the server recomputes authoritatively). Submit → `createInvoiceAction` → on `{ok}` close + refresh the list (router.refresh) ; on `{ok:false}` a sonner error toast. Amount inputs collect **major units** in the UI and convert to integer minor units before submit (×100 for 2-decimal currencies — derive from the currency), so the user types "1500.00" not "150000".
  - [x] `src/app/app/engagements/[id]/(detail)/documents/[invoiceId]/page.tsx` (NEW, RSC): a **premium read-only document view** (`getInvoice` → 404 if not theirs) — a presentational **`InvoiceDocument`** component with the **serif** document title, the Tenant "from" (name + branding logo/accent), the "bill to" (client_display_name), the line-items table (descriptions + `numeric` amounts), the `amount_total` (`numeric`, prominent), dates, notes, and the status chip. **Premium document feel, NOT a form printout** (DESIGN.md L181). Build `InvoiceDocument` as a standalone presentational component (`invoice-document.tsx`) — **5.2 reuses it for the client portal view; 5.3's PDF mirrors it** (don't inline it into the page).
  - [x] **Test:** the money/total math + any pure formatting helpers are unit-tested (Task 2). The builder/view are interactive/visual → live-validated (Task 5). If a pure helper emerges (e.g. major↔minor conversion), unit-test it.

- [x] **Task 5 — Gates + deploy** (AC: 1, 2, 3)
  - [x] `lint && typecheck && test && build` green (don't regress the 352 prior tests). Apply **migration 0014** to Neon (`npm run db:migrate`; **verify the `FORCE` line is present** before applying). **No Inngest change** (no fan-out/event in 5.1 — `invoice.sent` is 5.2). Deploy (`vercel --prod`; verify `.env.local` checksum `ecedc7314b8e405f0a7bba826b19ef73` unchanged) + push.
  - [x] **Live validation (CJ):** open an Engagement's **Documents** tab → "New invoice" → confirm the **bill-to is prefilled** (no re-typing) → add line items, pick PHP, set dates/notes → see the **live total** in the tabular `numeric` font → create → the draft appears in the list with **`#1`** + a **Draft** chip + the formatted total → open it → the **premium document view** renders (serif title, Tenant brand, line items, total). Create a second → it numbers **`#2`**.

## Dev Notes

### What exists vs net-new (read this first)

[Source: architecture.md L178-181 (the Invoice + Notification schema), L253-254 (Doc Engine D), L267/L383 (`DocumentType` seam + `server/doc-engine`), L208 (Server Actions incl. create Invoice), L294-297 (Dates/Money rules); DESIGN.md L47-48/L144-145/L181 (`numeric` token, Invoice document feel); epics.md#Story 5.1; the retro `epic-4-retro-2026-06-08.md` (backstop-first action item)]

- **Reused (don't rebuild):**
  - **`getEngagement(ctx, id)`** (engagements.repository) — the prefill source (returns the full Engagement row: `clientDisplayName`, `name`, …) AND the ownership guard (RLS-scoped → null if not the caller's; the 3.8 `getEngagement`-guard template).
  - **The detail route group + tabs** — the Documents tab placeholder (`(detail)/documents/page.tsx`) is wired into `engagement-tabs.tsx`; the `(detail)/layout.tsx` already guards freelancer + provides the tab chrome. Just replace the placeholder.
  - **The `withTenant` data layer + dual-scope RLS pattern** (`ship_update_scope`/`engagement_scope` are the exact shape for `invoice_scope`); the **manual-FORCE-append** migration habit (0006/0008).
  - **The action shape** (`manual-update.actions.ts` — requireFreelancer → Zod → **getEngagement ownership guard** → repo → revalidate → `{ok}`) is the precise template for `createInvoiceAction` (3.8 is the closest sibling: a freelancer write that RLS does NOT fully scope to the engagement).
  - **Branding** (`getBranding`/`resolveBrandingVars`) for the document's Tenant logo/accent (the "from"); the **`numeric`** font token (Geist Mono, tabular) for all amounts; shadcn `Badge` (status chip), `Dialog`, `Input`, `Select`.
  - The PGlite isolation harness (`isolation.test.ts`) — extend with an `invoices` block.

- **Net-new (this story):** the `invoices` table + `invoice_scope` RLS + the `tenants.invoice_seq` counter (migration 0014); `src/server/doc-engine/` (`money.ts`, `invoices.repository.ts`, `invoice.schema.ts`, `invoice.actions.ts`, `document-type.ts`); the Documents-tab list + the `invoice-builder` island + the `[invoiceId]` view + the `InvoiceDocument` component. **No Inngest, no notification, no email, no PDF** (those are 5.2/5.3).

### The CJ-confirmed decisions (load-bearing)

[Source: this story's create-story Q&A, 2026-06-08]

1. **Currency = per-invoice, default PHP, selectable.** A `currency` column on each invoice; the builder defaults the selector to `PHP` (CJ's locale) but allows USD/others for international clients. No Tenant-level default setting in v1. Amounts are integer minor units regardless; `formatMoney` derives the right fraction digits from the currency.
2. **5.1 = create + list + view ONLY.** Editing a draft lands with 5.2's send flow (a final review-and-edit before send); 5.1 does not build an edit surface. The PDF is 5.3.
3. **(My calls, noted):** number at **draft-creation** via an **atomic `tenants.invoice_seq` counter** (the AC says "auto-numbered" at creation; gaps from a deleted draft are acceptable for v1 — most invoicing numbers at creation); **line items as JSONB** (architecture-decided — `line_items(jsonb)`, not a child table); a **light code-level `DocumentType` seam** (the `doc-engine/` namespace + doc-agnostic `money.ts`, NOT a registry — the 4.4 over-engineering lesson).

### The load-bearing implementation details

[Source: architecture.md L297 (money), L180 (per-tenant seq); the 3.8 manual-update + 4.4 isolation lessons; schema.ts tenants `tenant_self` (L55) + ship_update_scope]

- **The engagement-ownership guard in the action is load-bearing, NOT just fail-fast.** `invoice_scope`'s WITH CHECK is `tenant_id = currentTenant AND (currentEngagement IS NULL OR engagement_id = currentEngagement)`. A **freelancer** ctx sets no `app.engagement_id` GUC → it reduces to `tenant_id = currentTenant`. So RLS would happily insert an invoice stamped to your tenant but pointing at a **foreign engagement** (one not yours, or — harmless but wrong — another of your own). `createInvoiceAction` MUST `getEngagement(ctx, engagementId)` (RLS-scoped → null if not the caller's) and bail before insert. Exactly the 3.8 pattern.
- **Atomic numbering — the row-lock is the concurrency guarantee.** `UPDATE tenants SET invoice_seq = invoice_seq + 1 ... RETURNING` takes a row lock on the tenant, so two concurrent `createInvoice` calls serialize → distinct numbers; in the same tx as the insert, so a failed insert rolls the increment back (no orphan number). The `unique(tenant_id, number)` is a hard backstop. Do NOT compute `MAX(number)+1` (race-prone).
- **Money never touches a float path.** Inputs arrive as integer minor units at the Zod boundary (the UI converts major→minor before submit). `computeLineTotal` rounds **once** (`quantity` may be fractional, e.g. 2.5 hours); `computeAmountTotal` is pure integer summation. The **server recomputes `amount_total`** — never trust a client-sent total (it's display-only in the builder). Display always via `Intl.NumberFormat` in `numeric`.
- **The privacy boundary (for 5.2):** invoices have no `raw_meta`-style hidden column; the whole row is freelancer-facing in 5.1. 5.2 adds the client read (the dual-scope RLS already supports a client engagement ctx) — build `listInvoices`/`getInvoice` so the projection is clean now.

### Architecture compliance

[Source: architecture.md L40/L253-254 (Doc Engine, PDF-in-v1), L208 (Server Actions), L294-297 (Dates/Money), L355/L383/L410 (file locations); DESIGN.md L181 (premium document feel); EXPERIENCE.md (Documents tab)]

- **Cockpit-only surface** — invoice creation is a Freelancer action; the document wears the **Tenant** brand (logo/accent) as the "from". (The Client view is 5.2; the accent is correct on a client-facing document then.)
- **Server Action + RSC reads** (no bespoke REST) — `createInvoiceAction` is a `"use server"` mutation; the tab + view are RSC.
- **Premium document feel** (serif title, generous spacing, `numeric` amounts) — NOT a form printout. The `InvoiceDocument` component is the reusable premium render (5.2 client view + 5.3 PDF mirror it).
- Money/Dates per the global rules (integer minor units + `Intl.NumberFormat`; `timestamptz` in DB, formatted in UI).

### Project Structure Notes

- **NEW:** `drizzle/0014_*.sql`; `src/server/doc-engine/{money.ts, invoices.repository.ts, invoice.schema.ts, invoice.actions.ts, document-type.ts}`; `src/app/app/engagements/[id]/(detail)/documents/{invoice-builder.tsx, invoice-document.tsx, [invoiceId]/page.tsx}`; tests (`money.test.ts`, `invoices.repository.test.ts`, `invoice.actions.test.ts`, isolation `invoices` block).
- **MODIFIED:** `src/server/db/schema.ts` (the `invoices` table + `tenants.invoice_seq` + `Invoice` type + `integer` import); `…/(detail)/documents/page.tsx` (replace the placeholder).
- **Watch:** (1) **land the table + RLS + FORCE + isolation BEFORE the UI** (the retro action item). (2) **manually append the FORCE line** to 0014 (drizzle won't). (3) the **getEngagement ownership guard** in the action (RLS doesn't scope a freelancer write to the engagement). (4) **server recomputes `amount_total`** (don't trust the client). (5) **integer minor units everywhere** — the UI converts major→minor; Zod takes integers; no float math. (6) **atomic counter**, not MAX+1. (7) keep the `DocumentType` seam **light** (no registry). (8) currency default **PHP**, selectable. (9) the `InvoiceDocument` render is a standalone component (5.2/5.3 reuse it).

### Testing requirements

- **RLS (PGlite, the new `invoices` block in isolation.test.ts):** freelancer sees only own tenant's; WITH CHECK blocks a forged-tenant insert; fails closed with no scope. (A client-scoped read is 5.2 — the dual-scope policy already supports it.)
- **Money (`money.test.ts`, pure):** `computeLineTotal` rounding (fractional quantity → integer minor units), `computeAmountTotal` integer sum, `formatMoney` for PHP + USD (2-decimal) + a 0-decimal currency (JPY) — correct symbol + fraction digits.
- **Repo (`invoices.repository.test.ts`, PGlite):** atomic numbering (1 then 2 on consecutive creates; a 3rd after a rolled-back insert does NOT skip beyond the committed count — or document the gap-on-rollback behavior), server-computed `amount_total` (ignores a client-sent total), draft status, engagement-scoped `listInvoices`, cross-tenant `getInvoice` → null.
- **Action (`invoice.actions.test.ts`):** requireFreelancer; Zod rejects empty/oversized line items + bad currency; **the getEngagement guard blocks a non-owned engagement → `{ok:false}`, no insert**; happy path inserts + revalidates.
- **Regression:** the 352 prior tests stay green; no change to existing tables/routes/Inngest. (The builder/view UI is live-validated — Task 5.)

### References

- [Source: epics.md#Story 5.1 (prefilled, auto-numbered, line items/amounts/dates/notes, `DocumentType` seam, money as integer minor units + `Intl.NumberFormat`); #Epic 5 (Doc Engine — Invoices, FR-16-18); #Story 5.2 (send + `invoice.sent` + client view — reuses `InvoiceDocument`), #Story 5.3 (PDF via `@react-pdf/renderer` → Blob — `pdfBlobUrl`)]
- [Source: architecture.md L40, L178-181, L208, L253-254, L267, L294-297, L355/L383/L410, L439; DESIGN.md L47-48/L144-145/L181; EXPERIENCE.md (Documents)]
- [Source: src/server/db/schema.ts (tenants L30, the ship_update_scope/engagement_scope policies); src/server/db/repositories/engagements.repository.ts (getEngagement); src/server/ship-feed/manual-update.actions.ts (the getEngagement-guard action template); src/app/app/engagements/[id]/(detail)/{layout,engagement-tabs,documents/page}.tsx; drizzle/0006 + 0008 (the FORCE-append pattern)]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (1M context) — dev-story + 2-angle xhigh review (server/money/security + UI/altitude).

### Debug Log References

- `npx tsc --noEmit` → clean. `npm run lint` → clean. `npx vitest run` → **375 passed (47 files)**, +23 over 352. `npm run build` → ✓ Compiled. `npm run db:generate` → `drizzle/0014_wise_goliath.sql` (+ hand-appended FORCE). `npm run db:migrate` → applied to Neon.
- **Lint-driven structural fix:** the NFR-2 ESLint rule forbids importing `drizzle-orm`/`@/server/db/schema` outside `src/server/db`. So the invoices **repository** lives at `src/server/db/repositories/invoices.repository.ts` (with every other repo — the tenant-scoping choke point); `doc-engine/` keeps the seam, money, schema, and actions. The `Invoice` type is re-exported from the repository so UI types a row without importing the schema.

### Completion Notes List

- **`invoices` table + `invoice_scope` dual-scope RLS + FORCE (migration 0014)** — the architecture L180-181 shape (JSONB `line_items`, integer-minor-unit `amount_total`, `currency`, per-Tenant `number`, `status` draft|sent|paid, `pdf_blob_url` reserved for 5.3). Landed **before** any UI (the retro's backstop-first habit). Isolation matrix grown `(ak)–(ao)`: tenant isolation, the client engagement-scoped read (the 5.2 path), WITH CHECK block, fail-closed.
- **Atomic per-Tenant numbering** via `tenants.invoice_seq` — `UPDATE … +1 RETURNING` in the create tx (the row lock serializes concurrent creates; in-tx so a failed insert rolls the increment back). `unique(tenant_id, number)` backstop. Proven: consecutive creates → #1, #2; Tenant B's sequence independent (#1).
- **Money = integer minor units, no float path** (`doc-engine/money.ts`, pure + unit-tested): one `Math.round` at the line boundary, pure integer summation, `formatMoney` derives fraction digits from the currency (PHP/USD→2, JPY→0, so JPY isn't mis-divided). The server **recomputes `amount_total`** (a client-sent total is impossible — there's no input field). The builder converts MAJOR→minor before submit; the live total uses the identical computation (no live-vs-server drift).
- **The load-bearing `getEngagement` guard in `createInvoiceAction`** (the 3.8/4.4 lesson): `invoice_scope`'s WITH CHECK for a freelancer ctx reduces to `tenant_id` only, so RLS would NOT block a foreign `engagement_id` — the RLS-scoped `getEngagement` (null → `{ok:false}`) is what prevents the cross-engagement write.
- **The Cockpit Documents tab** (replaced the placeholder): list (`#number` · status chip · total in `numeric` · dates) + the `InvoiceBuilder` inline panel (prefilled bill-to, line-item rows, currency selector default PHP, dates, notes, a live total) + the `[invoiceId]` premium read-only **`InvoiceDocument`** (serif title, Tenant brand "from", `numeric` amounts — reused by 5.2's client view + mirrored by 5.3's PDF). The view route guards `invoice.engagementId !== id` (URL-tamper) atop RLS.
- **Light `DocumentType` seam** — `doc-engine/` namespace + doc-agnostic `money.ts` + `type DocumentType = "invoice"`. No registry (the 4.4 over-engineering lesson). **No Inngest/notification/email/PDF** (those are 5.2/5.3).
- **Review hardening (2 finders; the load-bearing logic was clean — applied 6 fixes):** (server) tightened `currency` to a real **3-letter regex** (a length-3 junk code like `"P!P"` would crash `Intl.NumberFormat` at render → a persistent DoS on the documents page) + a **`formatMoney` try/catch fallback** (defense-in-depth so no bad currency can ever crash an RSC render) + a **total-overflow refine** (a >int4 invoice gets a clear message, not a cryptic insert crash) + de-vacuumed the isolation `(am)` client-read assertion; (UI) the builder now **never silently drops a half-filled line** (a started-but-incomplete row blocks submit with a clear message instead of vanishing — the under-bill risk) and rejects qty≤0/NaN client-side, and **focuses the first field on open** (the ManualUpdate precedent).

### File List

- `src/server/db/schema.ts` (MODIFIED) — `invoices` table + `invoice_scope` + `tenants.invoice_seq` + `Invoice` type + `integer` import.
- `drizzle/0014_wise_goliath.sql` (NEW) — CREATE invoices + policy + unique + FORCE (hand-appended) + `tenants.invoice_seq`.
- `src/server/db/repositories/invoices.repository.ts` (NEW) — `createInvoice` (atomic #, server total), `listInvoices`, `getInvoice`, `Invoice` re-export.
- `src/server/doc-engine/{money.ts, invoice.schema.ts, invoice.actions.ts, document-type.ts}` (NEW).
- `src/app/app/engagements/[id]/(detail)/documents/{page.tsx (replaced), invoice-builder.tsx, invoice-document.tsx, [invoiceId]/page.tsx}` (NEW/MODIFIED).
- Tests: `src/server/db/__tests__/{invoices.repository.test.ts (NEW), isolation.test.ts (extended ak–ao)}`, `src/server/doc-engine/__tests__/{money.test.ts, invoice.actions.test.ts}` (NEW).

## Senior Developer Review (AI)

**Reviewer:** CJ (via Claude xhigh review, 2 parallel finders) · **Date:** 2026-06-08 · **Outcome:** ✅ Approve (6 hardening fixes applied; the load-bearing logic was clean)

**Scope:** split into a **server/money/security** finder (atomic numbering concurrency, money float-safety, the engagement guard, server-recomputed total, RLS/FORCE, Zod, int4 overflow) and a **UI/altitude** finder (the major→minor conversion, live-vs-server total drift, partial-row handling, authz on the view route, a11y, branding).

**Headline: the high-risk logic is correct.** Both finders verified — atomic numbering can't collide (the row lock serializes; backstop unique); money never touches a float path and JPY (0-decimal) is not mis-divided; the major→minor conversion is exact (no 100× error) and the live total matches the server's computation byte-for-byte; the `getEngagement` guard is genuinely load-bearing and correctly placed; the total can't be forged (no input field); RLS mirrors `ship_update_scope` with both ENABLE + the hand-appended FORCE; the view route's `engagementId !== id` catches the URL-`[id]`-swap tamper.

**Findings (6; all actioned):**

1. **[Med — FIXED] `currency` render-crash / DoS.** Zod validated only `.length(3)`, so a junk code like `"P!P"` persisted and then threw a `RangeError` in `Intl.NumberFormat` during the documents-page RSC render — a poison row that 500s the page on every load. **Fix:** a real `^[a-zA-Z]{3}$` regex (uppercased) + a `formatMoney` try/catch fallback (so even a pre-existing bad row can't crash render).
2. **[Med — FIXED] int4 overflow on `amount_total`.** A large invoice's total could exceed PG `integer` → a cryptic "try again". **Fix:** per-field caps + a total-overflow `refine` returning a clear message.
3. **[Med — FIXED] the builder silently dropped a half-filled line.** A row with a description but no amount (or vice versa) was filtered out on submit with no feedback → an under-bill risk. **Fix:** a started-but-incomplete row now blocks submit with a clear message; nothing is dropped silently.
4. **[Low — FIXED] qty `0`/`""`/negative + NaN amounts** passed the client filter and bounced the whole submit with a generic error. **Fix:** client-side validation matching the server Zod (positive qty, finite amount).
5. **[Low — FIXED] no focus-on-open** in the builder (diverged from `ManualUpdate`). **Fix:** `requestAnimationFrame` focus of the first field.
6. **[Low — FIXED] a vacuous isolation assertion** — `(am)`'s client-read used `.every()` (true on empty), so it wouldn't catch a regression that hid the invoice. **Fix:** added `toHaveLength(1)`.

**Verified clean (no action):** the `listInvoices` projection (omits `line_items`/`tenant_id`); the jsonb cast (server-written + Zod-validated in); RSC dates (`toISOString().slice(0,10)`, no hydration risk); branding (Tenant brand on a client-facing doc, no Cockpit leak); `InvoiceStatusChip` shared not duplicated; no reinvented formatters.

## Change Log

| Date       | Version | Description                                  | Author |
| ---------- | ------- | -------------------------------------------- | ------ |
| 2026-06-08 | 0.1     | Story drafted (context-engineered): invoices table + RLS/FORCE + atomic per-Tenant numbering + integer-minor-unit money + light DocumentType seam; create+list+view; currency per-invoice default PHP. | Scrum  |
| 2026-06-08 | 1.0     | Implemented: invoices table + dual-scope RLS/FORCE (mig 0014) + atomic numbering + integer-money Doc Engine + Cockpit builder/list/view; xhigh review (2 finders, 6 hardening fixes); 375 tests; migrated + deployed. | Dev    |