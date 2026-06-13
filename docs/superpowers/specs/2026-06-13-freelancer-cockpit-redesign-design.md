# Freelancer Cockpit Redesign — Design Spec

- **Date:** 2026-06-13
- **Status:** Approved (brainstorm complete) — ready for implementation plan
- **Surface:** Freelancer cockpit only (`/app/*`). The client portal (`/portal/*`), auth, and email surfaces are **out of scope** and must not change.

## 1. Context & Problem

The Soloist freelancer cockpit (`/app`) currently ships a minimal shell: a single top header (wordmark + Settings link + Logout) and one page that lists engagements. There is no persistent navigation, no global Overview, and no enterprise-grade information architecture. Everything substantive (Ship Feed, Repos, Client, Documents/Invoices, Messages) is engagement-scoped under `/app/engagements/[id]/…`; settings (Account, Branding, GitHub) is global.

We are elevating the cockpit to an enterprise-grade dashboard: a grouped, collapsible sidebar, a consistent app bar (breadcrumbs, command search, notifications, help, profile), and a rich, fully real Overview — while leaving the existing, live, production features working underneath the new shell.

This redesign is **structural and presentational**. It adds read-only aggregate queries but **no schema changes and no migrations**, and it does not alter the portal/auth/email surfaces.

## 2. Goals

- A persistent, collapsible, **grouped** sidebar with all 12 freelancer destinations.
- A consistent **app bar**: breadcrumbs, `⌘K` command search, live notifications, help, profile dropdown.
- A **fully real** Overview page that mirrors the reference mockup's structure using Soloist-native data — no fabricated numbers.
- A cockpit look that reads premium / clean / professional / modern / enterprise / production-ready.
- Polished placeholder pages for the 8 not-yet-built destinations so the nav feels intentional, not broken.
- Zero regression to existing working features (Engagements, Settings, Branding, engagement detail, realtime).

## 3. Non-Goals (this pass)

- Building out the 8 placeholder features (Clients list, global Messages inbox, Timeline, Tasks, Deliverables, Approvals, Files, global Invoices rollup).
- Dark mode (explicitly out of v1 scope per `globals.css`).
- Any change to the client portal, auth, or email surfaces.
- Any database schema change or migration.

## 4. Resolved Decisions

| # | Decision | Choice |
|---|----------|--------|
| D1 | Brand direction | **Cool / enterprise** look (not the warm portal palette), scoped to the cockpit surface only. |
| D2 | Cockpit accent | **Iris `#5b5bd6`** (existing brand indigo) on cool-gray/slate neutrals — cool read, slight brand continuity. |
| D3 | Sidebar grouping | **Workspace** (Overview, Engagements, Clients, Messages) · **Delivery** (Timeline, Tasks, Deliverables, Approvals) · **Documents** (Files, Invoices) · pinned footer (Brand, Settings). |
| D4 | Build scope | Shell + Overview fully real. **Wire** Engagements / Brand / Settings to existing features. **8 placeholders** for the rest. No regressions. |
| D5 | Overview data fidelity | **Real data + honest states.** Replace unbacked mockup widgets with real Soloist metrics or clean empty states. No fake numbers. |
| D6 | Component strategy | Use the official **shadcn `sidebar` block + primitives** (new-york style), not a hand-rolled nav. |

## 5. Architecture

### 5.1 Cockpit theme (scoped)

Add a cockpit-scoped token override in `src/app/globals.css` under the existing `[data-surface="cockpit"]` root attribute (already present on the app layout). This re-maps the cool palette **only inside the cockpit**, leaving the global warm tokens (used by portal/auth/email) untouched.

- Canvas `--background`: cool-gray (e.g. `#f8fafc`); cards `--card`: `#ffffff`.
- Text `--foreground`: slate ink (e.g. `#0f172a`); `--muted-foreground`: slate (e.g. `#64748b`).
- Borders/inputs `--border`/`--input`: cool slate (e.g. `#e2e8f0`).
- Accent + primary + ring: **Iris `#5b5bd6`**; accent surface `#eef2ff`-equivalent.
- Status vocabulary tokens (shipped/progress/next) unchanged.
- Type: all-sans (Geist) in the cockpit — no Fraunces display headings here. Headings use sans semibold.

Exact hex values are finalized during implementation against the shadcn neutral base; the table above is the target.

### 5.2 App shell

Rewrite `src/app/app/layout.tsx`:

- Keep `await requireFreelancer()` as the first statement (role guard unchanged).
- Read the sidebar collapse state from its cookie (SSR) and pass to `SidebarProvider` so the server render matches the persisted state (no flash).
- Compose: `SidebarProvider` → `AppSidebar` (left) + `SidebarInset` containing a sticky `AppBar` header and a scrollable `<main>` for `{children}`.
- Wraps **all** `/app/*` routes, including engagement detail. The engagement detail's existing `(detail)` sub-layout (header + tabs) is preserved and simply renders inside the new shell's content region.

### 5.3 Providers

- shadcn `SidebarProvider` mounts in the cockpit layout (cookie-persisted open/collapsed; `⌘B` toggle is built in).
- Reuse the existing global `providers.tsx` (TanStack Query, Sonner) — unchanged.
- The app bar's notification bell reuses the existing realtime hook (`useRealtimeRefresh` / `useRealtimeInvalidate`) to refresh the unread state live. The cockpit-level realtime subscription scope is finalized in the plan; it must not duplicate or break the engagement-detail realtime provider.

### 5.4 shadcn components to install

`sidebar`, `breadcrumb`, `dropdown-menu`, `avatar`, `command`, `dialog`, `tooltip`, `separator`, `sheet`, `skeleton`, `table`, `scroll-area`. (`button`, `card`, `badge`, `input` already present.) Installed via the shadcn CLI into `src/components/ui/`.

### 5.5 New component files (indicative)

- `src/components/cockpit/app-sidebar.tsx` — grouped nav, counts, active state, footer.
- `src/components/cockpit/app-bar.tsx` — header bar assembling the pieces below.
- `src/components/cockpit/breadcrumbs.tsx` — route → crumb mapping.
- `src/components/cockpit/command-menu.tsx` — `⌘K` palette (nav + engagements).
- `src/components/cockpit/notifications-menu.tsx` — bell + dropdown, wired to `/api/notifications`.
- `src/components/cockpit/help-menu.tsx` — help dropdown.
- `src/components/cockpit/profile-menu.tsx` — avatar dropdown (reuses logout).
- `src/components/cockpit/nav-config.ts` — single source of truth for nav groups, labels, icons, hrefs, and which counts each item shows.
- `src/components/cockpit/page-placeholder.tsx` — shared "coming soon" empty-state.
- `src/components/cockpit/overview/*` — Overview widgets (KPI cards, momentum chart, engagements table, activity, attention, outstanding invoices).
- `src/components/cockpit/momentum-chart.tsx` — lean hand-rolled SVG area chart (no new chart dependency).

`nav-config.ts` is the shared contract consumed by the sidebar, breadcrumbs, and command menu, so the three stay in sync.

## 6. Sidebar Specification

- **Groups & order** per D3. Group titles are uppercase section labels; in the collapsed rail they become dividers and labels appear on hover (tooltip).
- **Collapse/expand:** shadcn `icon` collapsible mode + `⌘B`; state persisted via cookie; a visible collapse control at the bottom.
- **Active state:** `usePathname()`; a child route highlights its parent nav item (e.g. `/app/engagements/[id]` highlights Engagements).
- **Live counts (real, honest):** a count badge appears **only on nav items that lead to a real, working destination** — this pass, that is **Engagements** (active count). Placeholder destinations (Messages, Approvals, Tasks, etc.) get **no count badge**, because a live number on a "coming soon" page reads as broken. The real attention signals (unread messages, curation backlog, outstanding invoices) surface instead on the Overview's KPI cards and "Needs your attention" panel, where they are actionable. When a placeholder feature later becomes real, its nav count turns on. The Engagements count comes from the cockpit-summary query (§9), passed to the sidebar from the layout.
- **Footer (pinned):** Brand → `/app/settings/branding`; Settings → `/app/settings`.
- **Mobile:** shadcn auto-switches the sidebar to a Sheet drawer.

## 7. App Bar Specification

- **Breadcrumbs:** built from `usePathname()` against the `nav-config` label map. Known segments map to labels (Overview, Engagements, Settings → Account/Branding/GitHub, etc.). Dynamic segments (engagement `[id]`) resolve to a readable crumb; the engagement detail may supply its name via a lightweight context/slot, otherwise a generic "Engagement" label is shown. No extra blocking fetch is introduced for crumbs.
- **`⌘K` command search:** shadcn `command` inside a `dialog`. Lists: (1) all nav destinations, (2) the freelancer's engagements (fetched client-side, RLS-scoped) for fuzzy jump. Selecting navigates. Opens via `⌘K`/`Ctrl+K` and via the header search affordance.
- **Notifications:** bell with an unread indicator, wired to the real `/api/notifications`; dropdown lists recent items with a "View all" affordance; refreshed live via the existing realtime hook.
- **Help:** dropdown with keyboard-shortcuts and docs/support links (links may be lightweight placeholders).
- **Profile:** avatar dropdown — name/email, Account, Brand, Settings, and Logout (reusing existing `LogoutButton` behavior).

## 8. Overview Page Specification (`/app`)

`/app/page.tsx` becomes the Overview dashboard. The current engagement-list logic moves to the new `/app/engagements` index (§9). Layout mirrors the reference mockup; every value is real and Soloist-native.

| Widget | Source | Notes |
|--------|--------|-------|
| KPI: Active engagements | count of non-archived engagements (from summary query) | real |
| KPI: Awaiting curation | sum of candidate ship-updates across engagements | replaces mockup "Tasks due" |
| KPI: Unread messages | sum of inbound unread chat | real |
| KPI: Invoices paid (MTD) | sum of `paid` invoices in current month | new aggregate |
| Delivery momentum | ship-updates published per week (~last 6 weeks) | hand-rolled SVG area chart; clean empty state if thin |
| Active engagements table | per-engagement: status, candidates, unread, last activity, "client viewed"; row links to detail | real; replaces mockup progress/due columns with real columns |
| Recent activity | real notifications | reuses notifications repo |
| Needs your attention | derived: curation backlog, unread, outstanding invoices | real, derived |
| Outstanding invoices | `sent`-but-unpaid invoices (amount, client) | replaces mockup "milestones" with a real money panel |

Empty states: when a real metric is genuinely empty (e.g. no published updates yet), render a clean, intentional empty state rather than a zero-noise widget or fabricated data.

## 9. Routes & Data Layer

### 9.1 Routes

- **Overview** — `/app/page.tsx` (rebuilt as dashboard).
- **Engagements** — new `/app/engagements/page.tsx` index (enhanced version of today's list) → existing `/app/engagements/[id]` detail (unchanged internally).
- **Brand** — links to existing `/app/settings/branding`.
- **Settings** — links to existing `/app/settings`.
- **Placeholders (8):** `/app/clients`, `/app/messages`, `/app/timeline`, `/app/tasks`, `/app/deliverables`, `/app/approvals`, `/app/files`, `/app/invoices` — each renders the shared `PagePlaceholder` (icon, title, one-line description, subtle scaffolding).

### 9.2 Data layer additions (read-only, RLS-scoped, no migrations)

New repository read functions, all routed through the existing `withTenant` → RLS path:

- **Cockpit summary** — active engagement count, total candidates, total unread (drives KPIs + sidebar counts; may extend/aggregate `listDashboard`).
- **Invoices paid MTD** + **outstanding (sent, unpaid)** — aggregate across the freelancer's engagements (invoices repo is per-engagement today).
- **Recent published ship-updates** (global, across engagements) and **published-per-week series** for the momentum chart.
- **Recent notifications** — reuse existing notifications repo if a suitable read exists; otherwise a thin read.

These are additive; no existing query changes behavior.

## 10. Testing

- **Vitest unit tests** for every new aggregate read function (paid-MTD, outstanding, per-week series, summary) and for the breadcrumb/label + nav-config logic.
- Keep the full suite green (currently 509 tests). New tests follow the existing PGlite repository-test patterns.
- **Manual browser walk:** shell renders; sidebar collapse/expand + `⌘B` + cookie persistence; mobile drawer; `⌘K` palette navigates; notifications dropdown shows real items; Overview renders real numbers; placeholder pages render; existing engagement detail + settings still work under the new shell.

## 11. Risks & Mitigations

- **Regression risk to live features.** Mitigation: wire (don't replace) Engagements/Settings/Brand; preserve the engagement-detail sub-layout; guard stays put; full suite must stay green.
- **Realtime double-mounting.** The cockpit notification refresh must coexist with the engagement-detail realtime provider without duplicate subscriptions — finalized in the plan.
- **Theme bleed.** Cockpit tokens are scoped under `[data-surface="cockpit"]`; verify the portal/auth/email surfaces are visually unchanged.
- **Chart dependency creep.** Use a hand-rolled SVG chart; do not add a charting library for a single widget.

## 12. Future (explicitly deferred)

Flesh out the 8 placeholder features; dark mode; richer breadcrumb data; command-palette actions beyond navigation.
