---
baseline_commit: 4783e46
---

# Story 5.3: Branded Invoice PDF Export

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Client,
I want to download a branded PDF of my Invoice,
so that I have a clean record for my own books (FR-18, UX-DR12, AR-12).

## Acceptance Criteria

1. **A branded PDF is generated server-side via `@react-pdf/renderer` — Tenant logo + accent, serif document feel — for a Sent or Paid invoice only (FR-18, UX-DR12, AR-12).**
   **Given** a **Sent or Paid** Invoice
   **When** a Download is requested
   **Then** a **branded PDF** is rendered **server-side** with `@react-pdf/renderer` that **mirrors the in-portal `InvoiceDocument`** — a **serif** document title (`Invoice #{number}`), the **Tenant accent** (a top bar / rule), the **Tenant logo** (or the tenant-name text fallback) as the "from", the bill-to, the line-items table (description · qty · unit · amount), the **total** (prominent), the status, the issue/due dates, and notes — with **every monetary value via the existing `formatMoney`** (integer minor units, never float math). A **Draft is never exportable** (no PDF).

2. **The PDF is stored in Vercel Blob and downloadable from the in-portal view (FR-18, AR-12, AR-14).**
   **Given** the generated PDF
   **When** the first download happens
   **Then** it is **stored in Vercel Blob** and its URL persisted to **`invoices.pdf_blob_url`** (the column 5.1 reserved) — **lazy generate-once-and-cache**: a subsequent download reuses the stored blob (no re-render). A **Download action on the in-portal Invoice view** (the Client's `/portal/documents/[invoiceId]`, and the Freelancer's Cockpit invoice view) triggers it through a **Route Handler** (the IO boundary — AR-14), and the response is the branded PDF as an attachment download.

3. **Authz + privacy: only the owner can download; a Draft 404s (NFR-2, AR-14).**
   **Given** the download Route Handler
   **When** it is hit
   **Then** it resolves the session server-side (`getAppSession` — 401 unauthenticated) and reads the invoice **RLS-scoped**: a **Client** can download only **their own engagement's** Sent/Paid invoice; a **Freelancer** only **their own Tenant's**; any other role → **403**; a **Draft**, a cross-engagement/cross-tenant id, or a missing id → **404** (neutral, no existence disclosure) — exactly the `GET /api/feed/[engagementId]` deny-by-default shape.

## Tasks / Subtasks

- [x] **Task 1 — The branded PDF document + the render helper (reuse the money helpers)** (AC: 1)
  - [x] **Dependency:** add **`@react-pdf/renderer`** (server-side PDF; `renderToBuffer` → a Node `Buffer`). It is the architecture-named lib (AR-12) — the only new dep this story.
  - [x] `src/server/doc-engine/invoice-pdf.tsx` (NEW): an **`InvoicePdfDocument`** built from `@react-pdf/renderer` primitives (`Document`/`Page`/`View`/`Text`/`Image`/`StyleSheet`) that **mirrors `src/components/invoice/invoice-document.tsx`** — a **top accent bar** (a filled `View` in `accentHex`), the **logo** (`<Image src={logoUrl}>`; **omit when null** → a tenant-name `<Text>` fallback so no network fetch is attempted), a **serif** title (`Invoice #{number}`), the bill-to (`clientName`), a line-items table (description · qty · unit · amount), the **total** (prominent), the status, `Issued`/`Due` dates (the `toISOString().slice(0,10)` shape), and notes (omit when null). **Fonts = the standard PDF-14 only** (`Times-Roman`/`Times-Bold` serif for the title/headings, `Helvetica` for body, `Courier` for the `numeric` amounts) — **NO `Font.register`** (no font-file/network dependency → robust server render). **Amounts via `formatMoney`/`computeLineTotal`** (the exact helpers the HTML doc uses — no re-rolled formatting, no float math).
  - [x] `renderInvoicePdf(data): Promise<Buffer>` (same file): `renderToBuffer(<InvoicePdfDocument {...data} />)`. `data` = `{ invoice (number, status, lineItems, amountTotal, currency, issuedAt, dueAt, notes), clientName, tenantName, logoUrl, accentHex }` (the `InvoiceDocumentProps` shape).
  - [x] **Test** (`src/server/doc-engine/__tests__/invoice-pdf.test.ts`, NEW): `renderInvoicePdf` returns a **Buffer whose first bytes are `%PDF-`** (a valid PDF) for a representative invoice (`logoUrl: null` to avoid a network fetch); covers a **0-decimal currency (JPY)** + **with/without notes/dueAt** (no throw, valid PDF). Keep it fast (one small invoice each).

- [x] **Task 2 — Blob storage + the lazy generate-once-and-cache seam** (AC: 2)
  - [x] `src/server/db/repositories/invoices.repository.ts` (MODIFY): **`setInvoicePdfUrl(ctx, id, url)`** — RLS-scoped `UPDATE invoices SET pdf_blob_url = ${url} WHERE id = ${id}` (mirrors the guarded writes; defense-in-depth atop RLS). (`pdf_blob_url` already exists — NO migration.)
  - [x] `src/server/doc-engine/invoice-pdf-storage.ts` (NEW): **`ensureInvoicePdfDownloadUrl(ctx, invoice, brand): Promise<string>`** — if `invoice.pdfBlobUrl` is set → return **`getDownloadUrl(invoice.pdfBlobUrl)`** (`@vercel/blob`, a pure URL transform → forces the attachment download, no re-render); else **`renderInvoicePdf(...)`** → **`put(\`tenants/${invoice.tenantId}/invoices/invoice-${invoice.number}-${invoice.id}.pdf\`, buffer, { access: "public", token: env.BLOB_READ_WRITE_TOKEN, contentType: "application/pdf" })`** (mirrors `branding.actions.ts` `uploadLogo`) → **`setInvoicePdfUrl(ctx, invoice.id, url)`** → return the put result's **`downloadUrl`**. If **`!env.BLOB_READ_WRITE_TOKEN`** → throw a clear error (the caller maps to a friendly 503/500), like the logo upload's not-configured guard.
  - [x] **Test** (`invoice-pdf-storage.test.ts`, NEW — hoisted `vi.mock` of `@vercel/blob`, `renderInvoicePdf`, `setInvoicePdfUrl`): a **null `pdfBlobUrl` → renders + `put`s (asserts the `application/pdf` content-type + the tenant-scoped path) + persists via `setInvoicePdfUrl` + returns `downloadUrl`**; a **set `pdfBlobUrl` → returns `getDownloadUrl(stored)` WITHOUT re-rendering or re-putting** (the cache hit); no token → throws.

- [x] **Task 3 — The download Route Handler (the IO boundary + authz)** (AC: 2, 3)
  - [x] `src/app/api/invoices/[invoiceId]/pdf/route.ts` (NEW, `runtime = "nodejs"`): `GET` — **`getAppSession()`** (NOT `requireClient`/`requireFreelancer` — handlers can't redirect) → null ⇒ **401**. Resolve the read scope by role:
    - **freelancer** (`session.role === "freelancer"` + `tenantId`): ctx `{ tenantId, userId, role:"freelancer" }` → **`getInvoice(ctx, invoiceId)`**.
    - **client** (`role === "client"` + `tenantId` + `engagementId`): ctx `{ tenantId, userId, role:"client", engagementId }` → **`getClientInvoice(ctx, invoiceId)`** (draft-excluding) **AND** verify `invoice.engagementId === session.engagementId` (defense-in-depth, the `/api/feed` pattern).
    - else ⇒ **403**.
    - `invoice == null` **OR `invoice.status === "draft"`** ⇒ **404** (a draft is never exportable; neutral).
    - read the Tenant brand (`getTenant(ctx)` + `getBranding(ctx)` — both `tenant_id`-scoped, work for a client ctx, like the portal view) → **`ensureInvoicePdfDownloadUrl(ctx, invoice, { clientName, tenantName, logoUrl, accentHex })`** → **`Response.redirect(downloadUrl, 307)`** (the Blob CDN serves the attachment; the route is the authz gate to OBTAIN the url). Wrap the generate/put in try/catch → a friendly 500/503 (`isUuid` guard + Sentry like the other handlers).
  - [x] **Test** (`src/app/api/invoices/[invoiceId]/pdf/__tests__/route.test.ts`, NEW — mirror `api/feed`/`api/notifications` route tests, hoisted `vi.mock` of session + the repo reads + the storage helper): **401** no session; **403** a non-client/non-freelancer (or a client with no engagement); **404** a Draft (freelancer read returns `status:"draft"`) and a cross-engagement client (getClientInvoice → null); a Freelancer happy path → reads via `getInvoice` + redirects to the storage helper's url; a Client happy path → `getClientInvoice` + the engagement match + redirect. Assert `getClientInvoice`/`getInvoice` is called with the **role-correct ctx** and the storage helper is invoked only after the guards pass.

- [x] **Task 4 — The Download action on the in-portal view (+ the Cockpit view)** (AC: 1, 2)
  - [x] `src/components/invoice/invoice-download-link.tsx` (NEW, tiny presentational): a styled **`<a href={\`/api/invoices/${invoiceId}/pdf\`}>`** ("Download PDF", a download icon) — **≥44px** hit area + a focus ring (the UX-DR15 floor); shared by both surfaces. (A plain anchor: the route redirects to the forced-download Blob url; no client JS needed.)
  - [x] `src/app/portal/(shell)/documents/[invoiceId]/page.tsx` (MODIFY): render the **Download link** near the back-link / under the document (the Client view only ever shows Sent/Paid, so it always applies). 5.2 left layout room here.
  - [x] `src/app/app/engagements/[id]/(detail)/documents/[invoiceId]/page.tsx` (MODIFY): render the Download link **only for `status !== "draft"`** (Sent/Paid) — a Freelancer gets the same branded PDF; a Draft shows none (it isn't exportable).
  - [x] **Test:** the link is a presentational anchor → live-validated (Task 5). If a pure helper emerges (e.g. the href builder), unit-test it; otherwise no new unit test (the route + render + storage are the tested logic).

- [x] **Task 5 — Gates + deploy** (AC: 1, 2, 3)
  - [ ] `lint && typecheck && test && build` green (don't regress the prior 403 tests). **No migration** (`pdf_blob_url` exists since 5.1). The PDF path needs **`BLOB_READ_WRITE_TOKEN`** (already live — the `soloist-logos` store). Deploy (`vercel --prod`; verify `.env.local` checksum unchanged) + push. **No Inngest change** (the download is synchronous on request; no event/cron).
  - [ ] **Live validation (CJ):** as the Client, open a **Sent** invoice in `/portal/documents/[id]` → **Download PDF** → a **branded** PDF (serif title, Tenant logo + accent, line items, the `formatMoney` total) downloads; download again → it's the **cached** blob (instant, no re-render). Mark it **Paid** → the PDF still downloads. Confirm a **Draft** has **no** Download (and the route 404s for it). As the Freelancer, download the same invoice from the Cockpit view. Confirm the PDF is **NOT** accessible to a different Client/Tenant.

## Dev Notes

### What exists vs net-new (read this first)

[Source: 5.1 story (the `invoices` table + `pdf_blob_url` reserved + `InvoiceDocument` + `money.ts`); 5.2 story (the relocated `InvoiceDocument` + the portal `[invoiceId]` view + `getClientInvoice`/`getInvoice`); architecture.md L40/L253-254 (Doc Engine, **PDF-in-v1**), L208 (Route Handlers), AR-12; DESIGN.md L181; epics.md#Story 5.3; `branding.actions.ts` (the Vercel Blob `put` pattern); `src/app/api/feed/[engagementId]/route.ts` (the authz'd Route Handler template)]

- **Reused (DO NOT rebuild):**
  - **`pdf_blob_url`** — the `invoices` column 5.1 reserved exactly for this. **No migration, no schema change.**
  - **`InvoiceDocument`** (`src/components/invoice/`) — the **visual reference** the PDF mirrors (serif title, accent, logo "from", `numeric` money, status). The PDF is a SEPARATE component (react-pdf has its own primitives, not HTML) that **mirrors** it — do NOT try to render the HTML component to PDF.
  - **`formatMoney` / `computeLineTotal`** (`doc-engine/money.ts`) — the money rendering, verbatim (integer minor units; per-currency digits; the try/catch fallback). NO re-rolled `Intl.NumberFormat`, NO float math, NO `÷100`.
  - **`getInvoice` (freelancer) / `getClientInvoice` (client, draft-excluding)** (5.1/5.2) — the RLS-scoped reads; the route picks by role. `getClientInvoice` already excludes drafts (the privacy boundary).
  - **The Vercel Blob `put`** (`branding.actions.ts` `uploadLogo`: `put(path, body, { access:"public", token: env.BLOB_READ_WRITE_TOKEN, contentType })`) — the exact storage pattern; `@vercel/blob` is already a dep. `getDownloadUrl` (same pkg) makes a stored url a forced-download url on a cache hit.
  - **The authz'd Route Handler shape** (`/api/feed/[engagementId]` + `/api/notifications`): `getAppSession` → 401/403, role/engagement checks, `runtime = "nodejs"`, neutral 404 (deny-by-default, no existence disclosure).
  - **`getTenant` / `getBranding`** — the Tenant "from" brand (a client ctx reads its own Tenant's brand; the portal view already does this).

- **Net-new (this story):** the `@react-pdf/renderer` dep; `invoice-pdf.tsx` (the PDF component + `renderInvoicePdf`); `invoice-pdf-storage.ts` (the lazy Blob cache); `setInvoicePdfUrl` (repo); `GET /api/invoices/[invoiceId]/pdf` (the download handler); `invoice-download-link.tsx` + the two view edits. **No new table/column/migration, no Inngest, no email change.**

### The load-bearing decisions (calls made for this story)

[Source: the epics 5.3 AC; the autonomous brief; AR-12/AR-14; the codebase's public-Blob (logo) precedent]

1. **Lazy generate-once-and-cache (not generate-on-send).** The PDF is rendered on the **first download** and the blob url persisted to `pdf_blob_url`; later downloads reuse it (`getDownloadUrl`). Simpler than wiring generation into 5.2's send fan-out, it makes the column 5.1 reserved earn its keep, and it never renders a PDF nobody downloads. (Re-rendering on content change is out of scope — an invoice is immutable once Sent; there is no edit surface.)
2. **The Route Handler is the IO boundary (AR-14), and it redirects to the Blob CDN.** The handler is the **authz gate**; it redirects (307) to the blob's forced-download url. The blob is **`access: "public"`** with an **unguessable** random-suffixed url — the **same model as Tenant logos** (the established codebase precedent). Accepted v1 trade-off: once the (unguessable) url is obtained it is publicly fetchable; consistent with the logo posture and fine for single-tenant v1. (A private-blob/proxy-the-bytes variant is the future hardening if invoices ever need stricter control.)
3. **Both surfaces download (Client + Freelancer), one handler.** The AC centers the Client in-portal download; the same handler authorizes the Freelancer (their own Tenant) so the Cockpit view offers the identical branded PDF — genuinely useful, near-zero extra surface. A **Draft** is exportable from neither (the handler 404s a draft; the Cockpit hides the link for drafts).
4. **Standard PDF-14 fonts, no `Font.register`.** The serif "document feel" uses the built-in `Times-Roman`/`Times-Bold`; no font-file fetch → no network dependency at render time (a registered Google font would add a fetch + a failure mode in a serverless function). `Courier` carries the `numeric` (tabular) amounts.

### The load-bearing implementation details

[Source: 5.1/5.2 guards; `branding.actions.ts`; `@vercel/blob` v2 (`put` → `{url, downloadUrl}`, `getDownloadUrl`); `@react-pdf/renderer` v4 (`renderToBuffer`)]

- **The route's role-scoped read is the security crux.** A **client** ctx must read via `getClientInvoice` (draft-excluding) AND match `session.engagementId` (defense-in-depth atop RLS); a **freelancer** via `getInvoice` then the explicit `status !== "draft"` guard (getInvoice returns drafts — the freelancer's, but a draft is not exportable). `getAppSession` (not the redirecting guards) returns null → 401. Mirror `/api/feed/[engagementId]` exactly.
- **`renderToBuffer` is server-only, Node runtime.** Pin `runtime = "nodejs"` on the route. The PDF component file carries no `"use client"`/`"use server"` — it's a plain module the handler imports.
- **The logo `<Image>` only when `logoUrl` is non-null.** react-pdf fetches a remote `src` at render time; passing `null`/omitting avoids a failed fetch. The tenant-name `<Text>` is the images-off/no-logo fallback (mirrors the HTML doc + the EmailShell).
- **Money stays integer-minor-unit.** `renderInvoicePdf` formats with `formatMoney(amountTotal, currency)` and `formatMoney(computeLineTotal(item), currency)` — identical to the HTML doc, so the PDF and the on-screen document can never disagree.
- **`setInvoicePdfUrl` under a client ctx is safe.** `invoice_scope` WITH CHECK (tenant+engagement) permits a client to persist `pdf_blob_url` on **their own** engagement's invoice (a cache field, not business data); RLS scopes it. The freelancer write is tenant-scoped.

### Architecture compliance

[Source: architecture.md L40/L208/L253-254 (Doc Engine, PDF-in-v1, Route Handlers), AR-12 (`@react-pdf/renderer` → Blob), AR-14 (IO = Route Handler, typed boundaries); DESIGN.md L181 (premium document); UX-DR12/UX-DR15]

- **AR-12:** the branded PDF is `@react-pdf/renderer` server-side → Vercel Blob; the in-portal view exposes the download. **AR-14:** the download is a **Route Handler** (the IO boundary), not a Server Action (a Server Action can't stream/redirect a binary). Reads are RLS-scoped repository calls.
- **Premium document feel** (DESIGN.md L181): the PDF mirrors the `InvoiceDocument` — serif title, generous spacing, Tenant brand, `numeric` amounts — a polished document, not a form dump.
- **UX-DR15:** the Download control is keyboard-focusable, ≥44px on the Client surface, with a focus ring; no motion.

### Project Structure Notes

- **NEW:** `src/server/doc-engine/invoice-pdf.tsx` (component + `renderInvoicePdf`); `src/server/doc-engine/invoice-pdf-storage.ts`; `src/app/api/invoices/[invoiceId]/pdf/route.ts`; `src/components/invoice/invoice-download-link.tsx`; tests (`invoice-pdf.test.ts`, `invoice-pdf-storage.test.ts`, the route `route.test.ts`).
- **MODIFIED:** `src/server/db/repositories/invoices.repository.ts` (`setInvoicePdfUrl`); `src/app/portal/(shell)/documents/[invoiceId]/page.tsx` + `src/app/app/engagements/[id]/(detail)/documents/[invoiceId]/page.tsx` (the Download link); `package.json` (+`@react-pdf/renderer`).
- **Watch:** (1) **no migration** — `pdf_blob_url` exists. (2) **role-scoped read + draft-404** in the handler (the authz crux). (3) **lazy cache** — generate once, reuse via `getDownloadUrl`; don't re-render. (4) **money via `formatMoney`** — never re-roll. (5) **standard PDF fonts** — no `Font.register`. (6) **logo `<Image>` only when non-null**. (7) `runtime = "nodejs"` on the route. (8) the PDF **mirrors** `InvoiceDocument` (a sibling react-pdf component) — don't try to render the HTML one.

### Testing requirements

- **PDF render (`invoice-pdf.test.ts`):** `renderInvoicePdf` → a Buffer starting `%PDF-` for a representative invoice (`logoUrl:null`); a 0-decimal currency (JPY) and with/without notes+dueAt render without throwing.
- **Storage (`invoice-pdf-storage.test.ts`):** null `pdfBlobUrl` → render + `put` (content-type `application/pdf`, tenant-scoped path) + `setInvoicePdfUrl` + returns `downloadUrl`; set `pdfBlobUrl` → `getDownloadUrl(stored)`, NO re-render/re-put; no token → throws.
- **Route (`route.test.ts`):** 401 no session; 403 wrong role / client-no-engagement; 404 a draft + a cross-engagement client; freelancer + client happy paths read with the role-correct ctx and redirect to the storage url. Mirror `api/feed`/`api/notifications` route tests.
- **Regression:** the prior 403 tests stay green; no schema/Inngest change. The Download link + the visual PDF are live-validated (Task 5).

### References

- [Source: epics.md#Story 5.3 (Sent/Paid → branded PDF via `@react-pdf/renderer`, Tenant logo/accent + serif doc feel, server-side → Vercel Blob, downloadable from the in-portal view; FR-18, UX-DR12, AR-12)]
- [Source: architecture.md L40/L208/L253-254, AR-12/AR-14; DESIGN.md L181; 5-1-create-invoice-from-template-prefilled-shared-data.md (`pdf_blob_url` reserved, `InvoiceDocument`, `money.ts`); 5-2-send-invoice-client-view-manual-status.md (relocated `InvoiceDocument`, the portal `[invoiceId]` view, `getClientInvoice`/`getInvoice`)]
- [Source: src/server/branding/branding.actions.ts (the Vercel Blob `put` pattern); src/app/api/feed/[engagementId]/route.ts (the authz'd Route Handler); src/components/invoice/invoice-document.tsx (the mirror target); src/server/doc-engine/money.ts]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (1M context) — dev-story + adversarial code-review.

### Debug Log References

- `npm i @react-pdf/renderer` → `^4.5.1` (the only new dep). **No migration** (`pdf_blob_url` exists since 5.1).
- `npx tsc --noEmit` → clean. `npm run lint` → clean (the react-pdf `<Image>` jsx-a11y/alt-text false positive disabled inline — a PDF primitive has no `alt`). `npx vitest run` → **416 passed (51 files)**, +13 over 403. `npm run build` → ✓ Compiled, `/api/invoices/[invoiceId]/pdf` registered (ƒ dynamic).
- **Infra:** the shared dev machine was at load ~57–87 during this run (multiple concurrent sessions), starving the ~10 parallel PGlite `beforeAll` migration replays → spurious 30s timeouts. Verified green via `--no-file-parallelism` (each PGlite setup runs alone) and raised `hookTimeout` to 60s (a setup-budget ceiling only — a broken hook throws immediately, so it never masks a real failure). The parallel default passes on a normally-loaded machine.
- **Test gotcha (fixed):** a unit test fed react-pdf a malformed data-URL PNG → react-pdf's image decoder HUNG ~250s, starving everything. Removed it; the `<Image>` logo branch is live-validated (a real Tenant Blob logo), the null-logo text-fallback path is unit-tested.
- **Pending (deploy, post-review/merge):** `vercel --prod` (CJ owns dev→main→prod). No Neon migration, no Inngest re-sync. `BLOB_READ_WRITE_TOKEN` already live (the `soloist-logos` store).

### Completion Notes List

- **Branded PDF via `@react-pdf/renderer` (`invoice-pdf.tsx`)** — `InvoicePdfDocument` MIRRORS the on-screen `InvoiceDocument` (a sibling react-pdf render, NOT the HTML reused): a full-bleed Tenant-accent top bar, the logo (or tenant-name fallback), a serif `Invoice #N` title (Times), the bill-to, the line-items table, a prominent total, status, dates, notes. **Standard PDF-14 fonts only** (Times serif / Helvetica body / Courier numeric) — no `Font.register`, so no font-file/network dependency at render. **Money via `formatMoney`/`computeLineTotal`** (the exact helpers — the PDF and screen can never disagree; no float math). `renderInvoicePdf` → a Node Buffer via `renderToBuffer`.
- **Lazy generate-once-and-cache (`invoice-pdf-storage.ts`)** — `ensureInvoicePdfDownloadUrl`: a stored `pdf_blob_url` → `getDownloadUrl(stored)` (no re-render); else render → `put` to Vercel Blob (`access:"public"`, `application/pdf`, tenant-scoped path — the Tenant-logo model) → persist `pdf_blob_url` (the column 5.1 reserved) → return the forced-download `downloadUrl`. `setInvoicePdfUrl` is the RLS-scoped persist.
- **The download Route Handler (`/api/invoices/[invoiceId]/pdf`, `runtime="nodejs"`)** — the IO boundary (AR-14: a Route Handler, not a Server Action, for a binary). Deny-by-default authz like `/api/feed/[engagementId]`: `getAppSession` → 401; role-scoped read (Freelancer→`getInvoice`, Client→`getClientInvoice` draft-excluding + the `engagementId` match) → 403 other roles; **a Draft / cross-scope / bad id → neutral 404** (a draft is never exportable); success → 307-redirect to the forced-download Blob url. Generation failure → 503 (+Sentry).
- **The Download link (`invoice-download-link.tsx`)** — a plain anchor to the route (≥44px, focus ring), shared by the Client portal view (always — only sent/paid show there) and the Cockpit view (only for `status !== "draft"`).
- **Reuse honored:** `pdf_blob_url` (5.1), the `@vercel/blob` `put` pattern (branding), the authz'd Route Handler shape (3.7 feed), `getInvoice`/`getClientInvoice` (5.1/5.2), `formatMoney`/`computeLineTotal`, the `InvoiceDocument` as the visual mirror. **No migration, no Inngest, no email change, no new table/column.**
- **Decisions:** lazy-generate (not on-send); the route 307-redirects to a public-but-unguessable Blob url (the Tenant-logo precedent — accepted v1 trade-off, the route is the authz gate); both Client + Freelancer download via one handler; standard PDF fonts (no network).

### File List

- `package.json` (MODIFIED) — +`@react-pdf/renderer@^4.5.1`.
- `src/server/doc-engine/invoice-pdf.tsx` (NEW) — `InvoicePdfDocument` + `renderInvoicePdf`.
- `src/server/doc-engine/invoice-pdf-storage.ts` (NEW) — `ensureInvoicePdfDownloadUrl` (lazy Blob cache).
- `src/server/db/repositories/invoices.repository.ts` (MODIFIED) — `setInvoicePdfUrl`.
- `src/app/api/invoices/[invoiceId]/pdf/route.ts` (NEW) — the authz'd download handler.
- `src/components/invoice/invoice-download-link.tsx` (NEW) — the shared Download anchor.
- `src/app/portal/(shell)/documents/[invoiceId]/page.tsx` (MODIFIED) — Download link (Client).
- `src/app/app/engagements/[id]/(detail)/documents/[invoiceId]/page.tsx` (MODIFIED) — Download link (Freelancer, non-draft).
- `vitest.config.ts` (MODIFIED) — `hookTimeout` 30s→60s (shared-machine PGlite setup budget).
- Tests (NEW): `src/server/doc-engine/__tests__/{invoice-pdf.test.ts, invoice-pdf-storage.test.ts}`, `src/app/api/invoices/[invoiceId]/pdf/__tests__/route.test.ts`.

## Senior Developer Review (AI)

**Reviewer:** CJ (via Claude adversarial review — 3 parallel layers: Blind Hunter, Edge Case Hunter, Acceptance Auditor) · **Date:** 2026-06-10 · **Outcome:** ✅ Approve (1 High + 1 Med fix applied + 1 cheap hardening; authz/money/reuse were clean)

**Scope:** Blind Hunter (diff only), Edge Case Hunter (diff + repo, vs the `/api/feed` + branding-Blob siblings), Acceptance Auditor (diff + spec + non-negotiables).

**Headline: the authz + money + reuse are correct.** All three layers independently confirmed — the route is deny-by-default exactly like `/api/feed` (401→403→role-scoped read→neutral 404; a **Draft is blocked for both roles**, a **Client can't reach another engagement's** PDF via RLS + the explicit `engagementId` match + `getClientInvoice`'s draft-exclusion); money is integer-minor-unit via `formatMoney`/`computeLineTotal` (no float, the PDF mirrors the screen); AR-12/AR-14 (react-pdf server-side, the IO boundary is a Route Handler), the `pdf_blob_url` reuse (no migration), the `@vercel/blob` `put` + `/api/feed` patterns, and the a11y floor are all honored.

**Findings (2 actioned + 1 hardening; the rest accepted):**

1. **[High — FIXED] `put()` to a deterministic path without `allowOverwrite` → unrecoverable 503.** The path is `tenants/{tenantId}/invoices/invoice-{number}-{id}.pdf` (no random suffix), and `@vercel/blob` defaults `allowOverwrite` to false → "blob already exists" throws on a **concurrent first-download** (the loser 503s) AND, worse, if a `put` ever succeeds but `setInvoicePdfUrl` doesn't persist, **every** later download re-`put`s the same path → a **permanent 503 the lazy cache can't self-heal** (both Blind + Edge flagged this, High). **Fix:** `allowOverwrite: true` — idempotent regeneration is exactly the generate-once intent. (Diverged from the branding-Blob sibling, which uses a timestamped path; the PDF cache key is the DB column, so the deterministic path is correct *with* overwrite.)
2. **[Med — FIXED] A broken/slow Tenant logo Blob → 503 or a hang.** react-pdf's `<Image src>` fetches the logo server-side with **no timeout**; a deleted logo (CDN error bytes) makes its decoder throw → the WHOLE PDF 503s (not a graceful fallback), and a slow host hangs the function to its wall-clock limit. **Fix:** pre-fetch the logo myself in the storage layer with `AbortSignal.timeout(5s)` → an inline data-URL (react-pdf then does NO network I/O), and on ANY failure pass `logoUrl: null` → the tenant-name **text fallback**. A flaky logo now degrades gracefully instead of breaking the download.
3. **[Med — HARDENED] The 307 redirect carried no `Cache-Control`.** The `/api/feed` template sets `private, no-store`; the redirect didn't. **Fix:** return `private, no-store` on the 307 so no intermediary caches the per-invoice redirect. (The public-but-unguessable Blob url / bearer-URL posture itself is the documented v1 decision — the Tenant-logo precedent; the full private-blob/proxy upgrade is noted future hardening.)
4. **[Low/Med — accepted] A stale stored `pdf_blob_url` → a 307 to a deleted blob (Edge #4).** No code path deletes an invoice PDF in v1, so `pdf_blob_url` is always valid once set — not reachable today. Noted for a future blob-lifecycle/regenerate feature.
5. **[Low — accepted] `String(item.quantity)` vs the HTML doc's `{item.quantity}` (Edge #6); the unconditional portal Download link (Auditor F1).** Both benign — `String()` and React's coercion agree for finite decimals, and `getClientInvoice` already 404s drafts so the portal only ever reaches Sent/Paid (the route 404s a draft regardless). No change.

**Acceptance Auditor verdict:** PASS, no High/Med violations — all 3 ACs + every non-negotiable (NFR-2 repo isolation, AR-12/AR-14, integer-minor-unit money via `formatMoney`, the `InvoiceDocument` mirror not duplicated, `pdf_blob_url` reuse / no migration, a11y, scope discipline — no new table/Inngest/email/payments) confirmed satisfied.

## Change Log

| Date       | Version | Description                                                                                                                                                                              | Author |
| ---------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 2026-06-10 | 0.1     | Story drafted (context-engineered): server-side branded PDF via `@react-pdf/renderer` mirroring `InvoiceDocument` → Vercel Blob (lazy generate-once-and-cache into the reserved `pdf_blob_url`) → an authz'd download Route Handler (role-scoped, draft-404) → a Download link on the in-portal + Cockpit views. No migration, no Inngest. | Scrum  |
| 2026-06-10 | 1.0     | Implemented: `InvoicePdfDocument`/`renderInvoicePdf` (react-pdf, mirrors `InvoiceDocument`, standard PDF fonts, `formatMoney`) + lazy Blob cache (`ensureInvoicePdfDownloadUrl` + `setInvoicePdfUrl`) + the authz'd `/api/invoices/[id]/pdf` handler (role-scoped, draft-404, 307-redirect) + the shared Download link. 416 tests (+13); typecheck/lint/build green (route registered). No migration/Inngest. | Dev    |
| 2026-06-10 | 1.1     | Adversarial review (3 layers) — ✅ Approve. Fixes: (High) `allowOverwrite:true` on the Blob put (was an unrecoverable 503 on a concurrent/orphaned regenerate); (Med) pre-fetch the logo with a 5s timeout → data-URL, graceful text fallback (react-pdf's `<Image>` had no timeout → hang/503 on a broken logo); (hardening) `Cache-Control: private, no-store` on the redirect. 418 tests. | Review |
