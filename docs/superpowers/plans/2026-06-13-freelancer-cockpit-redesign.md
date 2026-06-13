# Freelancer Cockpit Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the minimal `/app` cockpit shell with an enterprise-grade dashboard — a grouped, collapsible sidebar + a consistent app bar (breadcrumbs, ⌘K search, activity bell, help, profile) + a fully real Overview — wiring existing features and adding polished placeholders for the rest, with no schema changes.

**Architecture:** A scoped cool/Iris theme on `[data-surface="cockpit"]`; the official shadcn `sidebar` block + primitives compose the shell in `src/app/app/layout.tsx`; pure helpers + read-only RLS-scoped aggregate queries feed a server-rendered Overview. Existing engagement-detail, settings, and branding features keep working underneath the new shell.

**Tech Stack:** Next.js 16 (App Router, RSC), React 19, Tailwind v4, shadcn/ui (new-york), Drizzle + Postgres RLS, lucide-react, Vitest + PGlite.

**Spec:** `docs/superpowers/specs/2026-06-13-freelancer-cockpit-redesign-design.md`

**Conventions:**
- Every commit message ends with the trailer (per CLAUDE.md):
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- Run from repo root. Dev server: `npm run dev` (port 3002). Verify gates: `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`.
- Money is integer minor units; never float. Reuse `formatMoney` from `@/server/doc-engine/money`.
- If a lucide icon name doesn't resolve in this version, swap for the nearest available — icons are not load-bearing.

---

## Phase A — Foundation

### Task 1: Install shadcn UI primitives

**Files:**
- Create (via CLI): `src/components/ui/{sidebar,breadcrumb,dropdown-menu,avatar,command,dialog,tooltip,separator,sheet,skeleton,table,scroll-area}.tsx`
- Create (via CLI): `src/hooks/use-mobile.ts` (sidebar dependency)

- [ ] **Step 1: Add the components**

Run:
```bash
npx shadcn@latest add sidebar breadcrumb dropdown-menu avatar command dialog tooltip separator sheet skeleton table scroll-area --yes
```
This installs the components into `src/components/ui/` and adds npm deps (`cmdk`, `@radix-ui/*`). `sidebar` also appends `--sidebar*` CSS variables to `src/app/globals.css` and adds `src/hooks/use-mobile.ts`.

- [ ] **Step 2: Verify the install**

Run:
```bash
ls src/components/ui/sidebar.tsx src/components/ui/command.tsx src/components/ui/breadcrumb.tsx src/components/ui/dropdown-menu.tsx src/components/ui/avatar.tsx src/components/ui/table.tsx && npm run typecheck
```
Expected: all files listed; typecheck passes (the new files are unused so far).

- [ ] **Step 3: Patch `CommandDialog` to forward `className`** (so the portaled palette can carry the cockpit theme)

Open `src/components/ui/command.tsx`. Find the `CommandDialog` function. Ensure it accepts and forwards `className` to its `DialogContent`. If the generated signature is `function CommandDialog({ title, description, children, ...props })`, change it so `className` is destructured and applied:

```tsx
function CommandDialog({
  title = "Command Palette",
  description = "Search for a command to run...",
  children,
  className,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof Dialog> & {
  title?: string;
  description?: string;
  className?: string;
  showCloseButton?: boolean;
}) {
  return (
    <Dialog {...props}>
      <DialogHeader className="sr-only">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <DialogContent
        className={cn("overflow-hidden p-0", className)}
        showCloseButton={showCloseButton}
      >
        <Command className="[&_[cmdk-group-heading]]:text-muted-foreground ...">
          {children}
        </Command>
      </DialogContent>
    </Dialog>
  );
}
```
(Keep whatever inner `Command` className the generator produced — only the `DialogContent className={cn("overflow-hidden p-0", className)}` change is required.)

- [ ] **Step 4: Commit**

```bash
git add src/components/ui src/hooks package.json package-lock.json src/app/globals.css components.json
git commit -m "chore: add shadcn primitives for the cockpit shell (sidebar, command, breadcrumb, etc.)"
```

---

### Task 2: Cockpit cool/Iris theme tokens

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Define the scoped cool palette + sidebar tokens**

In `src/app/globals.css`, after the existing `body { … }` rule (near the end, before or after the reduced-motion block), append a new block. This scopes the cool palette to the cockpit surface AND a `.cockpit-surface` class (used on portaled menus/dialogs so they match):

```css
/*
 * Cockpit surface theme (freelancer /app/*). A cool, enterprise palette layered over the warm
 * global tokens — scoped so the client portal, auth, and marketing surfaces stay warm/branded.
 * The `.cockpit-surface` twin lets Radix-portaled content (command palette, dropdown menus),
 * which renders outside the [data-surface] subtree, carry the same tokens. Accent = Soloist Iris.
 */
[data-surface="cockpit"],
.cockpit-surface {
  --background: #f8fafc;
  --foreground: #0f172a;
  --card: #ffffff;
  --card-foreground: #0f172a;
  --popover: #ffffff;
  --popover-foreground: #0f172a;
  --muted: #f1f5f9;
  --muted-foreground: #64748b;
  --border: #e2e8f0;
  --input: #e2e8f0;
  --primary: #5b5bd6; /* Soloist Iris */
  --primary-foreground: #ffffff;
  --secondary: #f1f5f9;
  --secondary-foreground: #0f172a;
  --accent: #eef2ff; /* indigo tint — menu/hover surface */
  --accent-foreground: #4338ca;
  --ring: #5b5bd6;

  /* shadcn sidebar tokens (the sidebar only ever renders in the cockpit) */
  --sidebar: #ffffff;
  --sidebar-foreground: #334155;
  --sidebar-primary: #5b5bd6;
  --sidebar-primary-foreground: #ffffff;
  --sidebar-accent: #eef2ff;
  --sidebar-accent-foreground: #4338ca;
  --sidebar-border: #e2e8f0;
  --sidebar-ring: #5b5bd6;
}
```

- [ ] **Step 2: Ensure the `@theme inline` block maps the sidebar color tokens**

Confirm `src/app/globals.css` has these inside `@theme inline { … }` (the `shadcn add sidebar` step usually adds them; if missing, add them):

```css
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);
```
Also ensure a `:root` default exists for each `--sidebar*` (any value — it's overridden in the cockpit block above; a sensible default is the same cool values). If `shadcn add` already added `:root` `--sidebar*` entries, leave them.

- [ ] **Step 3: Verify build picks up the tokens**

Run:
```bash
npm run build
```
Expected: build succeeds (CSS compiles; no missing-token errors).

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(cockpit): scoped cool/Iris theme tokens for the /app surface"
```

---

## Phase B — Pure logic + data layer (TDD)

### Task 3: Navigation config + active-state + breadcrumb logic

**Files:**
- Create: `src/components/cockpit/nav-config.ts`
- Test: `src/components/cockpit/__tests__/nav-config.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/components/cockpit/__tests__/nav-config.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { activeHref, crumbsForPath, NAV_GROUPS, FOOTER_ITEMS } from "../nav-config";

describe("nav-config structure", () => {
  it("has the 12 destinations in 3 groups + 2 footer items", () => {
    const items = NAV_GROUPS.flatMap((g) => g.items);
    expect(NAV_GROUPS.map((g) => g.title)).toEqual(["Workspace", "Delivery", "Documents"]);
    expect(items).toHaveLength(10);
    expect(FOOTER_ITEMS).toHaveLength(2);
    expect([...items, ...FOOTER_ITEMS].map((i) => i.href)).toEqual([
      "/app", "/app/engagements", "/app/clients", "/app/messages",
      "/app/timeline", "/app/tasks", "/app/deliverables", "/app/approvals",
      "/app/files", "/app/invoices",
      "/app/settings/branding", "/app/settings",
    ]);
  });
});

describe("activeHref — longest-prefix match", () => {
  it("matches Overview only on the exact /app path", () => {
    expect(activeHref("/app")).toBe("/app");
    expect(activeHref("/app/engagements")).toBe("/app/engagements");
  });
  it("matches Engagements for any engagement child route", () => {
    expect(activeHref("/app/engagements/abc-123")).toBe("/app/engagements");
    expect(activeHref("/app/engagements/abc-123/documents")).toBe("/app/engagements");
  });
  it("disambiguates Brand vs Settings by longest prefix", () => {
    expect(activeHref("/app/settings/branding")).toBe("/app/settings/branding");
    expect(activeHref("/app/settings/account")).toBe("/app/settings");
    expect(activeHref("/app/settings")).toBe("/app/settings");
  });
  it("returns null for an unknown path", () => {
    expect(activeHref("/portal")).toBeNull();
  });
});

describe("crumbsForPath", () => {
  it("returns Overview for /app", () => {
    expect(crumbsForPath("/app")).toEqual([{ label: "Overview" }]);
  });
  it("builds linked crumbs with the last as the page", () => {
    expect(crumbsForPath("/app/settings/account")).toEqual([
      { label: "Settings", href: "/app/settings" },
      { label: "Account" },
    ]);
  });
  it("labels a uuid engagement segment as Engagement", () => {
    expect(crumbsForPath("/app/engagements/0190a1b2-c3d4-7000-8000-000000000000")).toEqual([
      { label: "Engagements", href: "/app/engagements" },
      { label: "Engagement" },
    ]);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/components/cockpit/__tests__/nav-config.test.ts`
Expected: FAIL — cannot find module `../nav-config`.

- [ ] **Step 3: Implement `nav-config.ts`**

Create `src/components/cockpit/nav-config.ts`:

```ts
import {
  Activity,
  BadgeCheck,
  Briefcase,
  Files,
  LayoutDashboard,
  ListChecks,
  MessageSquare,
  Package,
  Palette,
  Receipt,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";
import { isUuid } from "@/lib/uuid";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Match key for active-state when the destination has child routes (defaults to `href`). */
  matchPrefix?: string;
};
export type NavGroup = { title: string; items: NavItem[] };

export const NAV_GROUPS: NavGroup[] = [
  {
    title: "Workspace",
    items: [
      { label: "Overview", href: "/app", icon: LayoutDashboard },
      { label: "Engagements", href: "/app/engagements", icon: Briefcase, matchPrefix: "/app/engagements" },
      { label: "Clients", href: "/app/clients", icon: Users },
      { label: "Messages", href: "/app/messages", icon: MessageSquare },
    ],
  },
  {
    title: "Delivery",
    items: [
      { label: "Timeline", href: "/app/timeline", icon: Activity },
      { label: "Tasks", href: "/app/tasks", icon: ListChecks },
      { label: "Deliverables", href: "/app/deliverables", icon: Package },
      { label: "Approvals", href: "/app/approvals", icon: BadgeCheck },
    ],
  },
  {
    title: "Documents",
    items: [
      { label: "Files", href: "/app/files", icon: Files },
      { label: "Invoices", href: "/app/invoices", icon: Receipt },
    ],
  },
];

export const FOOTER_ITEMS: NavItem[] = [
  { label: "Brand", href: "/app/settings/branding", icon: Palette },
  { label: "Settings", href: "/app/settings", icon: Settings, matchPrefix: "/app/settings" },
];

const ALL_ITEMS: NavItem[] = [...NAV_GROUPS.flatMap((g) => g.items), ...FOOTER_ITEMS];

/** The href of the nav item whose match-key is the longest prefix of `pathname`.
 * Overview ("/app") matches ONLY the exact path; every other item also matches its child
 * routes ("/key/..."). Longest key wins → Brand beats Settings on "/app/settings/branding". */
export function activeHref(pathname: string): string | null {
  let best: { href: string; len: number } | null = null;
  for (const item of ALL_ITEMS) {
    const key = item.matchPrefix ?? item.href;
    const matches = pathname === key || (key !== "/app" && pathname.startsWith(key + "/"));
    if (matches && (best === null || key.length > best.len)) best = { href: item.href, len: key.length };
  }
  return best?.href ?? null;
}

const SEGMENT_LABELS: Record<string, string> = {
  engagements: "Engagements",
  clients: "Clients",
  messages: "Messages",
  timeline: "Timeline",
  tasks: "Tasks",
  deliverables: "Deliverables",
  approvals: "Approvals",
  files: "Files",
  invoices: "Invoices",
  settings: "Settings",
  account: "Account",
  branding: "Brand",
  github: "GitHub",
  setup: "Setup",
  new: "New",
  edit: "Edit",
  repos: "Repos",
  client: "Client",
  documents: "Documents",
};

/** Breadcrumb trail for the path under /app. The last crumb is the current page (no href). */
export function crumbsForPath(pathname: string): { label: string; href?: string }[] {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== "app") return [];
  const rest = parts.slice(1);
  if (rest.length === 0) return [{ label: "Overview" }];
  const crumbs: { label: string; href?: string }[] = [];
  let acc = "/app";
  rest.forEach((seg, i) => {
    acc += "/" + seg;
    const label = SEGMENT_LABELS[seg] ?? (isUuid(seg) ? "Engagement" : seg);
    crumbs.push(i === rest.length - 1 ? { label } : { label, href: acc });
  });
  return crumbs;
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npx vitest run src/components/cockpit/__tests__/nav-config.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/components/cockpit/nav-config.ts src/components/cockpit/__tests__/nav-config.test.ts
git commit -m "feat(cockpit): nav config with longest-prefix active-state + breadcrumb trail"
```

---

### Task 4: Cockpit pure helpers (summary, chrome, dates)

**Files:**
- Create: `src/server/cockpit/overview-summary.ts`
- Create: `src/server/cockpit/chrome.ts`
- Create: `src/server/cockpit/dates.ts`
- Test: `src/server/cockpit/__tests__/overview-summary.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/server/cockpit/__tests__/overview-summary.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { bucketByWeek, pickDominantCurrency, summarizeDashboard } from "../overview-summary";
import { buildCockpitChrome } from "../chrome";
import { startOfMonthUTC, weeksAgoUTC } from "../dates";
import type { DashboardEngagement } from "@/server/db/repositories/engagements.repository";

const eng = (over: Partial<DashboardEngagement>): DashboardEngagement =>
  ({
    id: "e", tenantId: "t", clientDisplayName: "C", name: "N", scope: null, status: "active",
    lastActivityAt: new Date("2026-06-01T00:00:00Z"), freelancerChatLastReadAt: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    candidateCount: 0, lastSeenAt: null, chatUnreadCount: 0, ...over,
  }) as DashboardEngagement;

describe("summarizeDashboard", () => {
  it("counts engagements and sums candidate + unread totals", () => {
    const rows = [
      eng({ id: "a", candidateCount: 3, chatUnreadCount: 2 }),
      eng({ id: "b", candidateCount: 1, chatUnreadCount: 0 }),
    ];
    expect(summarizeDashboard(rows)).toEqual({ activeEngagements: 2, awaitingCuration: 4, unreadMessages: 2 });
  });
  it("is all-zero for an empty workspace", () => {
    expect(summarizeDashboard([])).toEqual({ activeEngagements: 0, awaitingCuration: 0, unreadMessages: 0 });
  });
});

describe("buildCockpitChrome", () => {
  it("projects engagements, active count, and only attention-needing rows", () => {
    const rows = [
      eng({ id: "a", name: "Alpha", candidateCount: 2, chatUnreadCount: 0 }),
      eng({ id: "b", name: "Beta", candidateCount: 0, chatUnreadCount: 0 }),
      eng({ id: "c", name: "Gamma", candidateCount: 0, chatUnreadCount: 3 }),
    ];
    const chrome = buildCockpitChrome(rows);
    expect(chrome.engagementsActiveCount).toBe(3);
    expect(chrome.engagements).toEqual([
      { id: "a", name: "Alpha" }, { id: "b", name: "Beta" }, { id: "c", name: "Gamma" },
    ]);
    expect(chrome.attention.map((a) => a.id)).toEqual(["a", "c"]); // Beta excluded
  });
});

describe("bucketByWeek", () => {
  const now = new Date("2026-06-13T12:00:00Z"); // a Saturday
  it("produces N consecutive week buckets ending with the current week", () => {
    const buckets = bucketByWeek([], 6, now);
    expect(buckets).toHaveLength(6);
    expect(buckets[5].weekStart).toBe("2026-06-08"); // Monday of the week containing 2026-06-13
    expect(buckets.every((b) => b.count === 0)).toBe(true);
  });
  it("counts dates into their Monday-started week, ignoring out-of-window dates", () => {
    const buckets = bucketByWeek(
      [new Date("2026-06-13T00:00:00Z"), new Date("2026-06-09T00:00:00Z"), new Date("2026-01-01T00:00:00Z")],
      6, now,
    );
    expect(buckets[5].count).toBe(2); // both June 9 + June 13 fall in week starting June 8
    expect(buckets.reduce((n, b) => n + b.count, 0)).toBe(2); // Jan 1 is out of the 6-week window
  });
});

describe("pickDominantCurrency", () => {
  it("returns the largest bucket, or null when empty", () => {
    expect(pickDominantCurrency([])).toBeNull();
    expect(pickDominantCurrency([{ currency: "PHP", minor: 100 }, { currency: "USD", minor: 900 }]))
      .toEqual({ currency: "USD", minor: 900 });
  });
});

describe("date helpers", () => {
  it("startOfMonthUTC returns the 1st at UTC midnight", () => {
    expect(startOfMonthUTC(new Date("2026-06-13T12:00:00Z")).toISOString()).toBe("2026-06-01T00:00:00.000Z");
  });
  it("weeksAgoUTC subtracts whole weeks", () => {
    expect(weeksAgoUTC(new Date("2026-06-13T00:00:00Z"), 6).toISOString()).toBe("2026-05-02T00:00:00.000Z");
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/server/cockpit/__tests__/overview-summary.test.ts`
Expected: FAIL — cannot find modules `../overview-summary`, `../chrome`, `../dates`.

- [ ] **Step 3: Implement `overview-summary.ts`**

Create `src/server/cockpit/overview-summary.ts`:

```ts
import type { DashboardEngagement } from "@/server/db/repositories/engagements.repository";

export type OverviewKpis = { activeEngagements: number; awaitingCuration: number; unreadMessages: number };

export function summarizeDashboard(rows: DashboardEngagement[]): OverviewKpis {
  return {
    activeEngagements: rows.length,
    awaitingCuration: rows.reduce((n, e) => n + e.candidateCount, 0),
    unreadMessages: rows.reduce((n, e) => n + e.chatUnreadCount, 0),
  };
}

export type WeekBucket = { weekStart: string; count: number };

function startOfWeekUTC(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const mondayIndex = (x.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  x.setUTCDate(x.getUTCDate() - mondayIndex);
  return x;
}

/** `weeks` consecutive Monday-started week buckets ending with the week containing `now`,
 * each counting the `dates` that fall inside it. Dates outside the window are ignored. */
export function bucketByWeek(dates: Date[], weeks: number, now: Date): WeekBucket[] {
  const MS_WEEK = 7 * 24 * 60 * 60 * 1000;
  const currentWeekStart = startOfWeekUTC(now);
  const buckets: WeekBucket[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const ws = new Date(currentWeekStart.getTime() - i * MS_WEEK);
    buckets.push({ weekStart: ws.toISOString().slice(0, 10), count: 0 });
  }
  const index = new Map(buckets.map((b, i) => [b.weekStart, i]));
  for (const d of dates) {
    const key = startOfWeekUTC(d).toISOString().slice(0, 10);
    const i = index.get(key);
    if (i !== undefined) buckets[i].count++;
  }
  return buckets;
}

export type CurrencyTotal = { currency: string; minor: number };

/** The currency bucket with the largest total (the KPI headline), or null if there are none. */
export function pickDominantCurrency(totals: CurrencyTotal[]): CurrencyTotal | null {
  if (totals.length === 0) return null;
  return [...totals].sort((a, b) => b.minor - a.minor)[0];
}
```

- [ ] **Step 4: Implement `chrome.ts`**

Create `src/server/cockpit/chrome.ts`:

```ts
import type { DashboardEngagement } from "@/server/db/repositories/engagements.repository";

export type AttentionItem = { id: string; name: string; candidateCount: number; unreadCount: number };
export type CockpitChrome = {
  engagements: { id: string; name: string }[];
  engagementsActiveCount: number;
  attention: AttentionItem[];
};

/** Derive everything the persistent chrome needs (sidebar count, ⌘K palette list, activity bell)
 * from the one dashboard read — no extra queries. */
export function buildCockpitChrome(dashboard: DashboardEngagement[]): CockpitChrome {
  return {
    engagements: dashboard.map((e) => ({ id: e.id, name: e.name })),
    engagementsActiveCount: dashboard.length,
    attention: dashboard
      .filter((e) => e.candidateCount > 0 || e.chatUnreadCount > 0)
      .map((e) => ({ id: e.id, name: e.name, candidateCount: e.candidateCount, unreadCount: e.chatUnreadCount })),
  };
}
```

- [ ] **Step 5: Implement `dates.ts`**

Create `src/server/cockpit/dates.ts`:

```ts
/** First day of `now`'s month at UTC midnight (the paid-this-month floor). */
export function startOfMonthUTC(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** `now` minus `weeks` whole weeks (the momentum-chart window floor). */
export function weeksAgoUTC(now: Date, weeks: number): Date {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() - weeks * 7);
  return d;
}
```

- [ ] **Step 6: Run the test to confirm it passes**

Run: `npx vitest run src/server/cockpit/__tests__/overview-summary.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/server/cockpit/overview-summary.ts src/server/cockpit/chrome.ts src/server/cockpit/dates.ts src/server/cockpit/__tests__/overview-summary.test.ts
git commit -m "feat(cockpit): pure overview summary/chrome/date helpers (+ tests)"
```

---

### Task 5: Cockpit aggregate queries (read-only, RLS-scoped)

**Files:**
- Create: `src/server/db/repositories/cockpit.repository.ts`
- Test: `src/server/db/__tests__/cockpit.repository.test.ts`

- [ ] **Step 1: Write the failing test** (PGlite harness — mirrors `invoices.repository.test.ts`)

Create `src/server/db/__tests__/cockpit.repository.test.ts`:

```ts
import { readdirSync, readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "../schema";
import { user } from "../schema";
import type { TenantContext } from "../context";

const h = vi.hoisted(() => ({ db: undefined as ReturnType<typeof drizzle> | undefined }));
vi.mock("../index", () => ({
  get db() {
    return h.db;
  },
}));

import {
  invoiceMoneyStats,
  listOutstandingInvoices,
  listRecentPublishedUpdates,
  publishedUpdateDates,
} from "../repositories/cockpit.repository";
import { createEngagement } from "../repositories/engagements.repository";
import { createInvoice, markInvoicePaid, markInvoiceSent } from "../repositories/invoices.repository";
import { createCandidate, publishShipUpdate } from "../repositories/ship-update.repository";
import { provisionTenant } from "../repositories/tenants.repository";

let TENANT_A = "";
let TENANT_B = "";
let ENG_A = "";
let ENG_B = "";
const ctxA = (): TenantContext => ({ tenantId: TENANT_A, userId: "owner_a", role: "freelancer" });
const ctxB = (): TenantContext => ({ tenantId: TENANT_B, userId: "owner_b", role: "freelancer" });
const line = (description: string, quantity: number, unitAmount: number) => ({ description, quantity, unitAmount });

beforeAll(async () => {
  const client = new PGlite();
  for (const file of readdirSync("drizzle").filter((f) => f.endsWith(".sql")).sort()) {
    for (const stmt of readFileSync(`drizzle/${file}`, "utf8").split("--> statement-breakpoint")) {
      const s = stmt.trim();
      if (s) await client.exec(s);
    }
  }
  h.db = drizzle(client, { schema });
  await h.db.insert(user).values([
    { id: "owner_a", name: "Owner A", email: "a@example.com" },
    { id: "owner_b", name: "Owner B", email: "b@example.com" },
  ]);
  TENANT_A = (await provisionTenant({ ownerUserId: "owner_a", slug: "alpha", name: "Alpha" })).id;
  TENANT_B = (await provisionTenant({ ownerUserId: "owner_b", slug: "beta", name: "Beta" })).id;
  ENG_A = (await createEngagement(ctxA(), { name: "Proj A", clientDisplayName: "Acme" })).id;
  ENG_B = (await createEngagement(ctxB(), { name: "Proj B", clientDisplayName: "Initech" })).id;

  // Tenant A: one paid (5000) + one sent/outstanding (3000), both PHP, issued now (this month).
  const paid = await createInvoice(ctxA(), { engagementId: ENG_A, lineItems: [line("Design", 1, 5000)], currency: "PHP" });
  await markInvoiceSent(ctxA(), paid.id);
  await markInvoicePaid(ctxA(), paid.id);
  const sent = await createInvoice(ctxA(), { engagementId: ENG_A, lineItems: [line("Build", 1, 3000)], currency: "PHP" });
  await markInvoiceSent(ctxA(), sent.id);

  // Tenant B: one paid (9999) — must NOT leak into Tenant A's stats (RLS).
  const bPaid = await createInvoice(ctxB(), { engagementId: ENG_B, lineItems: [line("X", 1, 9999)], currency: "PHP" });
  await markInvoiceSent(ctxB(), bPaid.id);
  await markInvoicePaid(ctxB(), bPaid.id);

  // Tenant A: one published ship update + one candidate (the candidate must be excluded).
  const cand = await createCandidate(ctxA(), { engagementId: ENG_A, statusTag: "shipped", title: "Shipped login", source: "manual" });
  await publishShipUpdate(ctxA(), cand!.id);
  await createCandidate(ctxA(), { engagementId: ENG_A, statusTag: "in_progress", title: "WIP dashboard", source: "manual" });
});

const MONTH_START = new Date(Date.UTC(2000, 0, 1)); // far past → "this month" includes the freshly-issued rows

describe("invoiceMoneyStats", () => {
  it("sums paid (since monthStart) + outstanding by currency, RLS-scoped to the tenant", async () => {
    const stats = await invoiceMoneyStats(ctxA(), MONTH_START);
    expect(stats.paidThisMonth).toEqual([{ currency: "PHP", minor: 5000 }]); // not 5000+9999 (B excluded)
    expect(stats.outstanding).toEqual([{ currency: "PHP", minor: 3000 }]);
  });
  it("is empty for a tenant with no invoices in range", async () => {
    const empty = await invoiceMoneyStats(ctxB(), new Date(Date.UTC(3000, 0, 1)));
    expect(empty.paidThisMonth).toEqual([]);
  });
});

describe("listOutstandingInvoices", () => {
  it("returns only sent (unpaid) invoices with engagement context", async () => {
    const rows = await listOutstandingInvoices(ctxA());
    expect(rows).toHaveLength(1);
    expect(rows[0].amountTotal).toBe(3000);
    expect(rows[0].engagementName).toBe("Proj A");
  });
});

describe("listRecentPublishedUpdates", () => {
  it("returns only published updates (candidates excluded), newest first, with engagement name", async () => {
    const rows = await listRecentPublishedUpdates(ctxA());
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("Shipped login");
    expect(rows[0].engagementName).toBe("Proj A");
  });
});

describe("publishedUpdateDates", () => {
  it("returns the published-at timestamps in the window (non-null)", async () => {
    const dates = await publishedUpdateDates(ctxA(), MONTH_START);
    expect(dates).toHaveLength(1);
    expect(dates[0]).toBeInstanceOf(Date);
  });
});
```

NOTE: this mirrors the `invoices.repository.test.ts` harness exactly — `vi` is in the first vitest import (the `vi.hoisted` mock of `../index` needs it), migrations are replayed from `drizzle/*.sql` in `beforeAll`, and tenants/engagements are seeded via the real repos so RLS is exercised end-to-end.

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/server/db/__tests__/cockpit.repository.test.ts`
Expected: FAIL — cannot find module `../repositories/cockpit.repository`.

- [ ] **Step 3: Implement `cockpit.repository.ts`**

Create `src/server/db/repositories/cockpit.repository.ts`:

```ts
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { withTenant, type TenantContext } from "../context";
import { engagements, invoices, shipUpdates } from "../schema";

/** Sum invoice amounts (integer minor units) grouped by currency, for one status, optionally
 * floored at `since` (by issue date). RLS scopes to the caller's tenant. */
async function invoiceTotalsByCurrency(ctx: TenantContext, status: "paid" | "sent", since?: Date) {
  return withTenant(ctx, (tx) =>
    tx
      .select({
        currency: invoices.currency,
        minor: sql<number>`coalesce(sum(${invoices.amountTotal}), 0)::int`,
      })
      .from(invoices)
      .where(
        since ? and(eq(invoices.status, status), gte(invoices.issuedAt, since)) : eq(invoices.status, status),
      )
      .groupBy(invoices.currency),
  );
}

/** Paid-this-month (by ISSUE date — there is no paid-at timestamp) + outstanding (sent, unpaid),
 * each grouped by currency. `monthStart` is passed in for deterministic, testable behavior. */
export async function invoiceMoneyStats(ctx: TenantContext, monthStart: Date) {
  const [paidThisMonth, outstanding] = await Promise.all([
    invoiceTotalsByCurrency(ctx, "paid", monthStart),
    invoiceTotalsByCurrency(ctx, "sent"),
  ]);
  return { paidThisMonth, outstanding };
}

/** Sent-but-unpaid invoices across the tenant's engagements, newest issue first (the Overview's
 * "Outstanding invoices" panel). Each row carries its own currency — never summed across currencies. */
export async function listOutstandingInvoices(ctx: TenantContext, limit = 5) {
  return withTenant(ctx, (tx) =>
    tx
      .select({
        id: invoices.id,
        number: invoices.number,
        amountTotal: invoices.amountTotal,
        currency: invoices.currency,
        issuedAt: invoices.issuedAt,
        dueAt: invoices.dueAt,
        engagementId: invoices.engagementId,
        engagementName: engagements.name,
        clientDisplayName: engagements.clientDisplayName,
      })
      .from(invoices)
      .innerJoin(engagements, eq(engagements.id, invoices.engagementId))
      .where(eq(invoices.status, "sent"))
      .orderBy(desc(invoices.issuedAt))
      .limit(limit),
  );
}

/** Recently PUBLISHED ship updates across the tenant's engagements — client projection only
 * (never raw_meta). Newest first. Powers the "Recent updates sent" panel. */
export async function listRecentPublishedUpdates(ctx: TenantContext, limit = 6) {
  return withTenant(ctx, (tx) =>
    tx
      .select({
        id: shipUpdates.id,
        title: shipUpdates.title,
        statusTag: shipUpdates.statusTag,
        publishedAt: shipUpdates.publishedAt,
        engagementId: shipUpdates.engagementId,
        engagementName: engagements.name,
      })
      .from(shipUpdates)
      .innerJoin(engagements, eq(engagements.id, shipUpdates.engagementId))
      .where(eq(shipUpdates.state, "published"))
      .orderBy(desc(shipUpdates.publishedAt))
      .limit(limit),
  );
}

/** Published-at timestamps within the window (>= `since`) for the momentum-chart bucketing.
 * Returns non-null Dates only. */
export async function publishedUpdateDates(ctx: TenantContext, since: Date): Promise<Date[]> {
  const rows = await withTenant(ctx, (tx) =>
    tx
      .select({ publishedAt: shipUpdates.publishedAt })
      .from(shipUpdates)
      .where(and(eq(shipUpdates.state, "published"), gte(shipUpdates.publishedAt, since))),
  );
  return rows.map((r) => r.publishedAt).filter((d): d is Date => d != null);
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npx vitest run src/server/db/__tests__/cockpit.repository.test.ts`
Expected: PASS (cross-tenant rows excluded by RLS; candidates excluded; outstanding = sent only).

- [ ] **Step 5: Lint + commit**

```bash
npm run lint
git add src/server/db/repositories/cockpit.repository.ts src/server/db/__tests__/cockpit.repository.test.ts
git commit -m "feat(cockpit): read-only RLS-scoped overview aggregates (invoice stats, recent updates)"
```

---

## Phase C — App shell

### Task 6: Request-cached dashboard reader

**Files:**
- Create: `src/server/cockpit/data.ts`

- [ ] **Step 1: Implement the cached reader**

The layout AND the Overview page both need the dashboard. Wrap it in React `cache()` so it runs once per request (both call it with the same `session` reference — `getAppSession` is already `cache()`-wrapped, so `requireFreelancer()` returns a stable object).

Create `src/server/cockpit/data.ts`:

```ts
import { cache } from "react";
import type { FreelancerSession } from "@/server/auth/session";
import { listDashboard, type DashboardEngagement } from "@/server/db/repositories/engagements.repository";

/** The cockpit dashboard read, request-memoized so the layout (chrome) and the Overview page
 * share a single set of queries within one render. */
export const getCockpitDashboard = cache(
  (session: FreelancerSession): Promise<DashboardEngagement[]> => listDashboard(session),
);
```

- [ ] **Step 2: Verify**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/server/cockpit/data.ts
git commit -m "feat(cockpit): request-cached dashboard reader shared by layout + overview"
```

---

### Task 7: AppSidebar component

**Files:**
- Create: `src/components/cockpit/app-sidebar.tsx`

- [ ] **Step 1: Implement the sidebar**

Create `src/components/cockpit/app-sidebar.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { activeHref, FOOTER_ITEMS, NAV_GROUPS } from "./nav-config";

export function AppSidebar({ engagementsCount }: { engagementsCount: number }) {
  const active = activeHref(usePathname());

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Link href="/app" className="flex items-center gap-2 px-1.5 py-1.5">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
            S
          </span>
          <span className="text-base font-semibold tracking-tight group-data-[collapsible=icon]:hidden">
            Soloist
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        {NAV_GROUPS.map((group) => (
          <SidebarGroup key={group.title}>
            <SidebarGroupLabel>{group.title}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={active === item.href} tooltip={item.label}>
                      <Link href={item.href}>
                        <item.icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                    {item.href === "/app/engagements" && engagementsCount > 0 ? (
                      <SidebarMenuBadge>{engagementsCount}</SidebarMenuBadge>
                    ) : null}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          {FOOTER_ITEMS.map((item) => (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton asChild isActive={active === item.href} tooltip={item.label}>
                <Link href={item.href}>
                  <item.icon />
                  <span>{item.label}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
```

NOTE: every imported name above (`SidebarMenuBadge`, `SidebarMenuButton`, `SidebarMenuItem`, `SidebarRail`, etc.) is a standard shadcn sidebar export. If typecheck reports a missing export, open the generated `src/components/ui/sidebar.tsx` and confirm the exact export name (versions are stable, but grep to be safe).

- [ ] **Step 2: Verify**

Run: `npm run typecheck`
Expected: PASS once the import block is corrected (no usage yet outside this file — that's fine).

- [ ] **Step 3: Commit**

```bash
git add src/components/cockpit/app-sidebar.tsx
git commit -m "feat(cockpit): grouped collapsible AppSidebar"
```

---

### Task 8: Breadcrumbs component

**Files:**
- Create: `src/components/cockpit/breadcrumbs.tsx`

- [ ] **Step 1: Implement**

Create `src/components/cockpit/breadcrumbs.tsx`:

```tsx
"use client";

import { Fragment } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { crumbsForPath } from "./nav-config";

export function Breadcrumbs() {
  const crumbs = crumbsForPath(usePathname());
  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem className="hidden sm:block">
          <BreadcrumbLink asChild>
            <Link href="/app">Soloist</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        {crumbs.map((c, i) => (
          <Fragment key={`${c.label}-${i}`}>
            <BreadcrumbSeparator className="hidden sm:block" />
            <BreadcrumbItem>
              {c.href ? (
                <BreadcrumbLink asChild>
                  <Link href={c.href}>{c.label}</Link>
                </BreadcrumbLink>
              ) : (
                <BreadcrumbPage>{c.label}</BreadcrumbPage>
              )}
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/cockpit/breadcrumbs.tsx
git commit -m "feat(cockpit): route-driven breadcrumbs"
```

---

### Task 9: Command menu (⌘K)

**Files:**
- Create: `src/components/cockpit/command-menu.tsx`

- [ ] **Step 1: Implement**

Create `src/components/cockpit/command-menu.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { FOOTER_ITEMS, NAV_GROUPS } from "./nav-config";

const ALL_NAV = [...NAV_GROUPS.flatMap((g) => g.items), ...FOOTER_ITEMS];

export function CommandMenu({ engagements }: { engagements: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-2 text-muted-foreground"
        aria-label="Search"
      >
        <Search className="size-4" />
        <span className="hidden lg:inline">Search…</span>
        <kbd className="hidden rounded border border-border bg-muted px-1.5 font-mono text-[10px] lg:inline">
          ⌘K
        </kbd>
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen} className="cockpit-surface">
        <CommandInput placeholder="Search engagements and pages…" />
        <CommandList>
          <CommandEmpty>No results.</CommandEmpty>
          <CommandGroup heading="Navigation">
            {ALL_NAV.map((item) => (
              <CommandItem key={item.href} value={item.label} onSelect={() => go(item.href)}>
                <item.icon className="size-4" />
                {item.label}
              </CommandItem>
            ))}
          </CommandGroup>
          {engagements.length > 0 ? (
            <CommandGroup heading="Engagements">
              {engagements.map((e) => (
                <CommandItem
                  key={e.id}
                  value={`engagement ${e.name}`}
                  onSelect={() => go(`/app/engagements/${e.id}`)}
                >
                  {e.name}
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
        </CommandList>
      </CommandDialog>
    </>
  );
}
```
(The `className="cockpit-surface"` is what the Task 1 Step 3 patch carries through to the portaled dialog, keeping the palette on the cool theme.)

- [ ] **Step 2: Verify + commit**

```bash
npm run typecheck
git add src/components/cockpit/command-menu.tsx
git commit -m "feat(cockpit): ⌘K command palette (nav + engagement jump)"
```

---

### Task 10: Profile menu

**Files:**
- Create: `src/components/cockpit/profile-menu.tsx`

- [ ] **Step 1: Implement**

Create `src/components/cockpit/profile-menu.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, Palette, Settings, User } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut } from "@/server/auth/client";

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((p) => p[0]!).join("");
  return (letters || "S").toUpperCase();
}

export function ProfileMenu({ user }: { user: { name: string; email: string } }) {
  const router = useRouter();

  async function onLogout() {
    const { error } = await signOut();
    if (error) {
      toast.error("Couldn't sign out. Please try again.");
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2 px-1.5" aria-label="Account menu">
          <Avatar className="size-7">
            <AvatarFallback className="bg-primary text-xs text-primary-foreground">
              {initialsOf(user.name)}
            </AvatarFallback>
          </Avatar>
          <span className="hidden text-sm font-medium md:inline">{user.name}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="cockpit-surface w-56">
        <DropdownMenuLabel className="flex flex-col">
          <span>{user.name}</span>
          <span className="text-xs font-normal text-muted-foreground">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/app/settings/account">
            <User className="size-4" />
            Account
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/app/settings/branding">
            <Palette className="size-4" />
            Brand
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/app/settings">
            <Settings className="size-4" />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            void onLogout();
          }}
        >
          <LogOut className="size-4" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```
(`signOut` import path matches the existing `src/app/app/logout-button.tsx`.)

- [ ] **Step 2: Verify + commit**

```bash
npm run typecheck
git add src/components/cockpit/profile-menu.tsx
git commit -m "feat(cockpit): profile dropdown (account/brand/settings/logout)"
```

---

### Task 11: Help menu

**Files:**
- Create: `src/components/cockpit/help-menu.tsx`

- [ ] **Step 1: Implement**

Create `src/components/cockpit/help-menu.tsx`:

```tsx
"use client";

import { BookOpen, HelpCircle, Keyboard, LifeBuoy } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function HelpMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-9" aria-label="Help">
          <HelpCircle className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="cockpit-surface w-56">
        <DropdownMenuLabel>Help &amp; resources</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a href="https://github.com/cjjutba/soloist" target="_blank" rel="noreferrer">
            <BookOpen className="size-4" />
            Documentation
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem disabled>
          <Keyboard className="size-4" />
          Keyboard shortcuts
          <span className="ml-auto font-mono text-xs text-muted-foreground">⌘K</span>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href="mailto:support@soloist.app">
            <LifeBuoy className="size-4" />
            Contact support
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 2: Verify + commit**

```bash
npm run typecheck
git add src/components/cockpit/help-menu.tsx
git commit -m "feat(cockpit): help menu"
```

---

### Task 12: Activity bell

**Files:**
- Create: `src/components/cockpit/activity-menu.tsx`

- [ ] **Step 1: Implement** (freelancer-derived attention feed — NOT the client-only `/api/notifications`)

Create `src/components/cockpit/activity-menu.tsx`:

```tsx
"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type AttentionItem = { id: string; name: string; candidateCount: number; unreadCount: number };

function summaryFor(a: AttentionItem): string {
  const bits: string[] = [];
  if (a.candidateCount > 0) bits.push(`${a.candidateCount} to curate`);
  if (a.unreadCount > 0) bits.push(`${a.unreadCount} unread`);
  return bits.join(" · ");
}

export function ActivityMenu({ attention }: { attention: AttentionItem[] }) {
  const total = attention.reduce((n, a) => n + a.candidateCount + a.unreadCount, 0);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative size-9" aria-label="Activity">
          <Bell className="size-4" />
          {total > 0 ? (
            <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-primary" aria-hidden />
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="cockpit-surface w-80">
        <DropdownMenuLabel>Needs your attention</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {attention.length === 0 ? (
          <div className="px-2 py-6 text-center text-sm text-muted-foreground">You&apos;re all caught up.</div>
        ) : (
          attention.map((a) => (
            <DropdownMenuItem key={a.id} asChild>
              <Link href={`/app/engagements/${a.id}`} className="flex flex-col items-start gap-0.5">
                <span className="font-medium">{a.name}</span>
                <span className="text-xs text-muted-foreground">{summaryFor(a)}</span>
              </Link>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/app">View overview</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 2: Verify + commit**

```bash
npm run typecheck
git add src/components/cockpit/activity-menu.tsx
git commit -m "feat(cockpit): activity bell (freelancer attention feed)"
```

---

### Task 13: AppBar (composes the bar)

**Files:**
- Create: `src/components/cockpit/app-bar.tsx`

- [ ] **Step 1: Implement**

Create `src/components/cockpit/app-bar.tsx`:

```tsx
"use client";

import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ActivityMenu, type AttentionItem } from "./activity-menu";
import { Breadcrumbs } from "./breadcrumbs";
import { CommandMenu } from "./command-menu";
import { HelpMenu } from "./help-menu";
import { ProfileMenu } from "./profile-menu";

export type AppBarProps = {
  user: { name: string; email: string };
  engagements: { id: string; name: string }[];
  attention: AttentionItem[];
};

export function AppBar({ user, engagements, attention }: AppBarProps) {
  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-1 h-5" />
      <Breadcrumbs />
      <div className="ml-auto flex items-center gap-1">
        <CommandMenu engagements={engagements} />
        <ActivityMenu attention={attention} />
        <HelpMenu />
        <ProfileMenu user={user} />
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Verify + commit**

```bash
npm run typecheck
git add src/components/cockpit/app-bar.tsx
git commit -m "feat(cockpit): app bar (trigger + breadcrumbs + search + activity + help + profile)"
```

---

### Task 14: Rewrite the cockpit layout (shell goes live)

**Files:**
- Modify: `src/app/app/layout.tsx`
- Delete (optional): `src/app/app/logout-button.tsx` is now unused — leave it; removal is separate cleanup.

After this task the shell renders on every `/app/*` route. `/app/page.tsx` still shows the OLD engagements list (rewritten in Task 16) — that's a fine intermediate state; it simply renders inside the new shell.

- [ ] **Step 1: Replace `src/app/app/layout.tsx` entirely**

```tsx
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppBar } from "@/components/cockpit/app-bar";
import { AppSidebar } from "@/components/cockpit/app-sidebar";
import { buildCockpitChrome } from "@/server/cockpit/chrome";
import { getCockpitDashboard } from "@/server/cockpit/data";
import { requireFreelancer } from "@/server/auth/session";
import { getTenant } from "@/server/db/repositories/tenants.repository";

// Cockpit surface (Soloist-branded), served at /app/*. The role guard runs here on every server
// render of this subtree: unauthenticated → /login, non-freelancer → redirect/not-found. The
// freelancer's Tenant is resolved from the session (never the host/URL). This layout also renders
// the persistent enterprise shell: a grouped collapsible sidebar + a consistent app bar. Chrome
// data (sidebar count, ⌘K palette, activity bell) comes from one request-cached dashboard read.
export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await requireFreelancer();
  const [tenant, dashboard, cookieStore] = await Promise.all([
    getTenant(session),
    getCockpitDashboard(session),
    cookies(),
  ]);
  if (!tenant) notFound(); // session.tenantId is a ghost (deleted Tenant) → deny, don't degrade

  const chrome = buildCockpitChrome(dashboard);
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";

  return (
    <div data-surface="cockpit" className="text-foreground">
      <SidebarProvider defaultOpen={defaultOpen}>
        <AppSidebar engagementsCount={chrome.engagementsActiveCount} />
        <SidebarInset>
          <AppBar
            user={{ name: session.name, email: session.email }}
            engagements={chrome.engagements}
            attention={chrome.attention}
          />
          <div className="flex flex-1 flex-col bg-background">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}
```

- [ ] **Step 2: Verify build + manual check**

Run: `npm run typecheck && npm run build`
Expected: PASS.

Then run `npm run dev` and open `http://localhost:3002/app` (log in as a freelancer if needed). Confirm:
- The sidebar renders with the 3 groups + Brand/Settings footer; the Engagements item shows a count badge if you have active engagements.
- Collapse/expand works via the trigger and `⌘B`; the collapsed rail shows icons + tooltips; the state persists across reloads (cookie).
- The app bar shows breadcrumbs (`Soloist / Overview`), the ⌘K search button (opens the palette; `⌘K` toggles it; selecting an engagement navigates), the bell, help, and profile (logout works).
- The cool theme (slate canvas, Iris accent) applies to the cockpit and to the opened palette/menus.

- [ ] **Step 3: Commit**

```bash
git add src/app/app/layout.tsx
git commit -m "feat(cockpit): enterprise shell layout (sidebar + app bar) wraps /app"
```

---

## Phase D — Overview

### Task 15: Overview widget components

**Files:**
- Create: `src/components/cockpit/overview/kpi-cards.tsx`
- Create: `src/components/cockpit/overview/momentum-chart.tsx`
- Create: `src/components/cockpit/overview/engagements-table.tsx`
- Create: `src/components/cockpit/overview/recent-updates.tsx`
- Create: `src/components/cockpit/overview/attention-card.tsx`
- Create: `src/components/cockpit/overview/outstanding-invoices.tsx`

All are server components (no `"use client"`). They render real data passed from the page (Task 16). No unit tests (presentational); verified by typecheck + the manual walk in Task 16.

- [ ] **Step 1: `kpi-cards.tsx`**

```tsx
import { Briefcase, ClipboardCheck, MessageSquare, Wallet, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { pickDominantCurrency, type CurrencyTotal } from "@/server/cockpit/overview-summary";
import { formatMoney } from "@/server/doc-engine/money";

function Kpi({ icon: Icon, label, value, hint }: { icon: LucideIcon; label: string; value: string; hint?: string }) {
  return (
    <Card className="flex flex-col gap-3 p-5">
      <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-primary">
        <Icon className="size-4" />
      </span>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-mono text-2xl font-semibold tracking-tight text-foreground">{value}</p>
        {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
      </div>
    </Card>
  );
}

export function KpiCards({
  activeEngagements,
  awaitingCuration,
  unreadMessages,
  paidThisMonth,
}: {
  activeEngagements: number;
  awaitingCuration: number;
  unreadMessages: number;
  paidThisMonth: CurrencyTotal[];
}) {
  const paid = pickDominantCurrency(paidThisMonth);
  const paidValue = paid ? formatMoney(paid.minor, paid.currency) : "—";
  const otherCount = paidThisMonth.length - 1;
  const paidHint =
    otherCount > 0 ? `+ ${otherCount} other ${otherCount === 1 ? "currency" : "currencies"}` : "by issue date";

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Kpi icon={Briefcase} label="Active engagements" value={String(activeEngagements)} />
      <Kpi
        icon={ClipboardCheck}
        label="Awaiting curation"
        value={String(awaitingCuration)}
        hint={awaitingCuration > 0 ? "candidates to review" : "all caught up"}
      />
      <Kpi icon={MessageSquare} label="Unread messages" value={String(unreadMessages)} />
      <Kpi icon={Wallet} label="Paid this month" value={paidValue} hint={paidHint} />
    </div>
  );
}
```

- [ ] **Step 2: `momentum-chart.tsx`** (hand-rolled SVG area — no chart dependency)

```tsx
import { Card } from "@/components/ui/card";
import type { WeekBucket } from "@/server/cockpit/overview-summary";

export function MomentumChart({ buckets }: { buckets: WeekBucket[] }) {
  const total = buckets.reduce((n, b) => n + b.count, 0);
  const max = Math.max(1, ...buckets.map((b) => b.count));
  const W = 560;
  const H = 140;
  const P = 8;
  const innerW = W - P * 2;
  const innerH = H - P * 2;
  const stepX = buckets.length > 1 ? innerW / (buckets.length - 1) : 0;
  const xy = (b: WeekBucket, i: number): readonly [number, number] => [
    P + i * stepX,
    P + innerH - (b.count / max) * innerH,
  ];
  const line = buckets
    .map((b, i) => {
      const [x, y] = xy(b, i);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const lastX = (P + (buckets.length - 1) * stepX).toFixed(1);
  const area = `${line} L${lastX},${(H - P).toFixed(1)} L${P.toFixed(1)},${(H - P).toFixed(1)} Z`;

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Delivery momentum</h2>
          <p className="text-xs text-muted-foreground">Ship updates published · last {buckets.length} weeks</p>
        </div>
        <span className="font-mono text-2xl font-semibold text-foreground">{total}</span>
      </div>
      {total === 0 ? (
        <div className="flex h-[140px] items-center justify-center rounded-lg border border-dashed border-border px-4 text-center text-sm text-muted-foreground">
          No updates published yet — your momentum chart fills in as you ship.
        </div>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`${total} ship updates over ${buckets.length} weeks`}>
          <defs>
            <linearGradient id="momentum-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.18" />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill="url(#momentum-fill)" />
          <path d={line} fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      )}
    </Card>
  );
}
```

- [ ] **Step 3: `engagements-table.tsx`**

```tsx
import Link from "next/link";
import { CandidateBadge, StatusBadge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatRelativeTime } from "@/lib/relative-time";
import type { DashboardEngagement } from "@/server/db/repositories/engagements.repository";

export function EngagementsTable({ rows }: { rows: DashboardEngagement[] }) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-center justify-between px-5 py-4">
        <h2 className="text-sm font-semibold text-foreground">Active engagements</h2>
        <Link href="/app/engagements" className="text-xs font-medium text-primary hover:underline">
          View all
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 pb-8 pt-2 text-center text-sm text-muted-foreground">No active engagements yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Engagement</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">To curate</TableHead>
              <TableHead className="text-right">Unread</TableHead>
              <TableHead className="text-right">Last activity</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((e) => (
              <TableRow key={e.id}>
                <TableCell>
                  <Link href={`/app/engagements/${e.id}`} className="flex flex-col">
                    <span className="font-medium text-foreground">{e.name}</span>
                    <span className="text-xs text-muted-foreground">{e.clientDisplayName}</span>
                  </Link>
                </TableCell>
                <TableCell>
                  <StatusBadge status={e.status} />
                </TableCell>
                <TableCell className="text-right">
                  <CandidateBadge count={e.candidateCount} />
                </TableCell>
                <TableCell className="text-right font-mono text-sm text-foreground">
                  {e.chatUnreadCount > 0 ? e.chatUnreadCount : "—"}
                </TableCell>
                <TableCell className="text-right font-mono text-xs text-muted-foreground">
                  {formatRelativeTime(e.lastActivityAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}
```

- [ ] **Step 4: `recent-updates.tsx`**

```tsx
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { formatRelativeTime } from "@/lib/relative-time";

export type RecentUpdate = {
  id: string;
  title: string;
  statusTag: string;
  publishedAt: Date | null;
  engagementId: string;
  engagementName: string;
};

export function RecentUpdates({ updates }: { updates: RecentUpdate[] }) {
  return (
    <Card className="flex flex-col gap-3 p-5">
      <h2 className="text-sm font-semibold text-foreground">Recent updates sent</h2>
      {updates.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing published yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {updates.map((u) => (
            <li key={u.id}>
              <Link href={`/app/engagements/${u.engagementId}`} className="flex flex-col gap-0.5">
                <span className="truncate text-sm font-medium text-foreground">{u.title}</span>
                <span className="text-xs text-muted-foreground">
                  {u.engagementName}
                  {u.publishedAt ? ` · ${formatRelativeTime(u.publishedAt)}` : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
```

- [ ] **Step 5: `attention-card.tsx`**

```tsx
import Link from "next/link";
import { ClipboardCheck, MessageSquare, Wallet, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";

export function AttentionCard({
  awaitingCuration,
  unreadMessages,
  outstandingCount,
}: {
  awaitingCuration: number;
  unreadMessages: number;
  outstandingCount: number;
}) {
  const items: { icon: LucideIcon; n: number; label: string; href: string }[] = [
    { icon: ClipboardCheck, n: awaitingCuration, label: awaitingCuration === 1 ? "update to curate" : "updates to curate", href: "/app/engagements" },
    { icon: MessageSquare, n: unreadMessages, label: unreadMessages === 1 ? "unread message" : "unread messages", href: "/app/engagements" },
    { icon: Wallet, n: outstandingCount, label: outstandingCount === 1 ? "invoice outstanding" : "invoices outstanding", href: "/app/engagements" },
  ];
  const active = items.filter((i) => i.n > 0);

  return (
    <Card className="flex flex-col gap-3 p-5">
      <h2 className="text-sm font-semibold text-foreground">Needs your attention</h2>
      {active.length === 0 ? (
        <p className="text-sm text-muted-foreground">You&apos;re all caught up. 🎉</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {active.map((i, idx) => (
            <li key={idx}>
              <Link href={i.href} className="flex items-center gap-3 text-sm text-foreground">
                <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-primary">
                  <i.icon className="size-4" />
                </span>
                <span>
                  <span className="font-mono font-semibold">{i.n}</span> {i.label}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
```

- [ ] **Step 6: `outstanding-invoices.tsx`**

```tsx
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { formatMoney } from "@/server/doc-engine/money";

export type OutstandingRow = {
  id: string;
  number: number;
  amountTotal: number;
  currency: string;
  engagementId: string;
  engagementName: string;
};

export function OutstandingInvoices({ rows }: { rows: OutstandingRow[] }) {
  return (
    <Card className="flex flex-col gap-3 p-5">
      <h2 className="text-sm font-semibold text-foreground">Outstanding invoices</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No sent invoices awaiting payment.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3">
              <Link
                href={`/app/engagements/${r.engagementId}/documents/${r.id}`}
                className="flex min-w-0 flex-col"
              >
                <span className="truncate text-sm font-medium text-foreground">
                  #{r.number} · {r.engagementName}
                </span>
              </Link>
              <span className="shrink-0 font-mono text-sm text-foreground">
                {formatMoney(r.amountTotal, r.currency)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
```

- [ ] **Step 7: Verify + commit**

```bash
npm run typecheck
git add src/components/cockpit/overview
git commit -m "feat(cockpit): overview widget components (kpis, momentum, table, rail panels)"
```

---

### Task 16: Overview page (`/app`)

**Files:**
- Modify (full rewrite): `src/app/app/page.tsx`

- [ ] **Step 1: Replace `src/app/app/page.tsx` entirely**

```tsx
import { notFound } from "next/navigation";
import { AttentionCard } from "@/components/cockpit/overview/attention-card";
import { EngagementsTable } from "@/components/cockpit/overview/engagements-table";
import { KpiCards } from "@/components/cockpit/overview/kpi-cards";
import { MomentumChart } from "@/components/cockpit/overview/momentum-chart";
import { OutstandingInvoices } from "@/components/cockpit/overview/outstanding-invoices";
import { RecentUpdates } from "@/components/cockpit/overview/recent-updates";
import { requireFreelancer } from "@/server/auth/session";
import { getCockpitDashboard } from "@/server/cockpit/data";
import { startOfMonthUTC, weeksAgoUTC } from "@/server/cockpit/dates";
import { bucketByWeek, summarizeDashboard } from "@/server/cockpit/overview-summary";
import {
  invoiceMoneyStats,
  listOutstandingInvoices,
  listRecentPublishedUpdates,
  publishedUpdateDates,
} from "@/server/db/repositories/cockpit.repository";

const CHART_WEEKS = 6;

export default async function OverviewPage() {
  // Self-guard (positional-guard convention). The Tenant ghost-check lives in the layout.
  const session = await requireFreelancer();
  const now = new Date();
  const monthStart = startOfMonthUTC(now);
  const chartSince = weeksAgoUTC(now, CHART_WEEKS);

  const [dashboard, money, outstanding, recent, pubDates] = await Promise.all([
    getCockpitDashboard(session), // request-cached → shared with the layout's chrome read
    invoiceMoneyStats(session, monthStart),
    listOutstandingInvoices(session),
    listRecentPublishedUpdates(session),
    publishedUpdateDates(session, chartSince),
  ]);
  if (!session.tenantId) notFound(); // defensive; requireFreelancer already guarantees it

  const kpis = summarizeDashboard(dashboard);
  const buckets = bucketByWeek(pubDates, CHART_WEEKS, now);

  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Overview</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your workspace health, delivery momentum, and what needs attention.
        </p>
      </header>

      <KpiCards
        activeEngagements={kpis.activeEngagements}
        awaitingCuration={kpis.awaitingCuration}
        unreadMessages={kpis.unreadMessages}
        paidThisMonth={money.paidThisMonth}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <MomentumChart buckets={buckets} />
          <EngagementsTable rows={dashboard} />
        </div>
        <div className="flex flex-col gap-6">
          <AttentionCard
            awaitingCuration={kpis.awaitingCuration}
            unreadMessages={kpis.unreadMessages}
            outstandingCount={outstanding.length}
          />
          <OutstandingInvoices rows={outstanding} />
          <RecentUpdates updates={recent} />
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Verify build + manual check**

Run: `npm run typecheck && npm run build`
Expected: PASS.

`npm run dev` → `http://localhost:3002/app`. Confirm the Overview renders: 4 KPI cards (real numbers), the momentum chart (or its empty state), the active-engagements table (rows link to detail), and the right rail (attention / outstanding / recent updates). All numbers should match your real data — no placeholders.

- [ ] **Step 3: Commit**

```bash
git add src/app/app/page.tsx
git commit -m "feat(cockpit): real Overview dashboard (KPIs, momentum, engagements, attention)"
```

---

## Phase E — Routes

### Task 17: Engagements list page + detail back-links

**Files:**
- Create: `src/app/app/engagements/page.tsx`
- Modify: `src/app/app/engagements/[id]/(detail)/layout.tsx` (back-link + archive redirect now point to `/app/engagements`)

The old `/app` engagements list moves here (the Engagements nav destination). Reuses the existing `ArchiveButton` (sibling file) and the same dashboard read.

- [ ] **Step 1: Create `src/app/app/engagements/page.tsx`**

```tsx
import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CandidateBadge, StatusBadge } from "@/components/ui/badge";
import { formatRelativeTime } from "@/lib/relative-time";
import { requireFreelancer } from "@/server/auth/session";
import { getCockpitDashboard } from "@/server/cockpit/data";
import { ArchiveButton } from "./archive-button";

export default async function EngagementsPage() {
  const session = await requireFreelancer();
  const engagements = await getCockpitDashboard(session);

  return (
    <main className="flex w-full flex-1 flex-col gap-6 p-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Engagements</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Each engagement is one client&apos;s branded workspace.
          </p>
        </div>
        <Link href="/app/engagements/new" className={buttonVariants()}>
          New engagement
        </Link>
      </header>

      {engagements.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-12 text-center">
          <p className="text-muted-foreground">No engagements yet — create your first.</p>
          <Link href="/app/engagements/new" className={buttonVariants({ variant: "outline" })}>
            New engagement
          </Link>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {engagements.map((e) => (
            <li key={e.id}>
              <Card className="flex items-center justify-between gap-4 p-4">
                <Link
                  href={`/app/engagements/${e.id}`}
                  className="flex min-w-0 flex-1 flex-col gap-1 rounded-[var(--radius-md)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="flex items-center gap-2">
                    <span className="truncate font-medium text-foreground">{e.name}</span>
                    <StatusBadge status={e.status} />
                    <CandidateBadge count={e.candidateCount} />
                    {e.chatUnreadCount > 0 ? (
                      <span
                        className="inline-flex items-center gap-1 rounded-full bg-primary px-1.5 font-mono text-[10px] font-medium leading-4 text-primary-foreground"
                        aria-label={`${e.chatUnreadCount} unread message${e.chatUnreadCount === 1 ? "" : "s"}`}
                      >
                        <MessageCircle className="size-2.5" aria-hidden />
                        {e.chatUnreadCount > 99 ? "99+" : e.chatUnreadCount}
                      </span>
                    ) : null}
                  </span>
                  <span className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="truncate">{e.clientDisplayName}</span>
                    <span aria-hidden>·</span>
                    <time
                      dateTime={e.lastActivityAt.toISOString()}
                      title={e.lastActivityAt.toISOString()}
                      className="shrink-0 font-mono text-xs"
                    >
                      {formatRelativeTime(e.lastActivityAt)}
                    </time>
                  </span>
                  {e.lastSeenAt ? (
                    <span className="text-xs text-emerald-700">
                      Client viewed {formatRelativeTime(e.lastSeenAt)}
                    </span>
                  ) : null}
                </Link>
                <div className="flex shrink-0 items-center gap-2">
                  <Link
                    href={`/app/engagements/${e.id}/edit`}
                    className={buttonVariants({ variant: "ghost", size: "sm" })}
                  >
                    Edit
                  </Link>
                  <ArchiveButton id={e.id} name={e.name} />
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Repoint the detail back-link + archive redirect**

In `src/app/app/engagements/[id]/(detail)/layout.tsx`:
- Change the back-link `href="/app"` → `href="/app/engagements"` (the `← Engagements` Link).
- Change `<ArchiveButton id={engagement.id} name={engagement.name} redirectTo="/app" />` → `redirectTo="/app/engagements"`.

```tsx
          <Link
            href="/app/engagements"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            ← Engagements
          </Link>
```
```tsx
              {engagement.status !== "archived" ? (
                <ArchiveButton id={engagement.id} name={engagement.name} redirectTo="/app/engagements" />
              ) : null}
```

- [ ] **Step 3: Verify + manual check**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

`npm run dev` → click **Engagements** in the sidebar → `/app/engagements` shows the list; open one → detail renders inside the shell; the `← Engagements` link returns to the list; archiving redirects to the list.

- [ ] **Step 4: Commit**

```bash
git add src/app/app/engagements/page.tsx "src/app/app/engagements/[id]/(detail)/layout.tsx"
git commit -m "feat(cockpit): Engagements list route; repoint detail back-links"
```

---

### Task 18: Placeholder component + 8 stub routes

**Files:**
- Create: `src/components/cockpit/page-placeholder.tsx`
- Create: `src/app/app/clients/page.tsx`
- Create: `src/app/app/messages/page.tsx`
- Create: `src/app/app/timeline/page.tsx`
- Create: `src/app/app/tasks/page.tsx`
- Create: `src/app/app/deliverables/page.tsx`
- Create: `src/app/app/approvals/page.tsx`
- Create: `src/app/app/files/page.tsx`
- Create: `src/app/app/invoices/page.tsx`

- [ ] **Step 1: `page-placeholder.tsx`**

```tsx
import type { LucideIcon } from "lucide-react";

export function PagePlaceholder({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-24 text-center">
      <span className="flex size-12 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground">
        <Icon className="size-6" />
      </span>
      <h1 className="text-xl font-semibold text-foreground">{title}</h1>
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      <span className="mt-1 rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
        Coming soon
      </span>
    </main>
  );
}
```

- [ ] **Step 2: Create the 8 stub pages**

Each self-guards with `requireFreelancer()` (cached; cheap) and renders the placeholder. Use these exact contents:

`src/app/app/clients/page.tsx`:
```tsx
import { Users } from "lucide-react";
import { PagePlaceholder } from "@/components/cockpit/page-placeholder";
import { requireFreelancer } from "@/server/auth/session";

export default async function ClientsPage() {
  await requireFreelancer();
  return (
    <PagePlaceholder
      icon={Users}
      title="Clients"
      description="A unified directory of everyone you work with across engagements, with contact history and access."
    />
  );
}
```

`src/app/app/messages/page.tsx`:
```tsx
import { MessageSquare } from "lucide-react";
import { PagePlaceholder } from "@/components/cockpit/page-placeholder";
import { requireFreelancer } from "@/server/auth/session";

export default async function MessagesPage() {
  await requireFreelancer();
  return (
    <PagePlaceholder
      icon={MessageSquare}
      title="Messages"
      description="One inbox for every client conversation. For now, open an engagement to chat with that client."
    />
  );
}
```

`src/app/app/timeline/page.tsx`:
```tsx
import { Activity } from "lucide-react";
import { PagePlaceholder } from "@/components/cockpit/page-placeholder";
import { requireFreelancer } from "@/server/auth/session";

export default async function TimelinePage() {
  await requireFreelancer();
  return (
    <PagePlaceholder
      icon={Activity}
      title="Timeline"
      description="A chronological feed of everything that's happened across your workspace — ships, messages, and invoices."
    />
  );
}
```

`src/app/app/tasks/page.tsx`:
```tsx
import { ListChecks } from "lucide-react";
import { PagePlaceholder } from "@/components/cockpit/page-placeholder";
import { requireFreelancer } from "@/server/auth/session";

export default async function TasksPage() {
  await requireFreelancer();
  return (
    <PagePlaceholder
      icon={ListChecks}
      title="Tasks"
      description="Track the work in flight per engagement, with due dates and status. Coming soon."
    />
  );
}
```

`src/app/app/deliverables/page.tsx`:
```tsx
import { Package } from "lucide-react";
import { PagePlaceholder } from "@/components/cockpit/page-placeholder";
import { requireFreelancer } from "@/server/auth/session";

export default async function DeliverablesPage() {
  await requireFreelancer();
  return (
    <PagePlaceholder
      icon={Package}
      title="Deliverables"
      description="The tangible outputs you hand off to clients, versioned and linked to their engagement."
    />
  );
}
```

`src/app/app/approvals/page.tsx`:
```tsx
import { BadgeCheck } from "lucide-react";
import { PagePlaceholder } from "@/components/cockpit/page-placeholder";
import { requireFreelancer } from "@/server/auth/session";

export default async function ApprovalsPage() {
  await requireFreelancer();
  return (
    <PagePlaceholder
      icon={BadgeCheck}
      title="Approvals"
      description="Everything waiting on a client sign-off, in one queue. Coming soon."
    />
  );
}
```

`src/app/app/files/page.tsx`:
```tsx
import { Files } from "lucide-react";
import { PagePlaceholder } from "@/components/cockpit/page-placeholder";
import { requireFreelancer } from "@/server/auth/session";

export default async function FilesPage() {
  await requireFreelancer();
  return (
    <PagePlaceholder
      icon={Files}
      title="Files"
      description="Shared documents and assets across your engagements, with previews and access control."
    />
  );
}
```

`src/app/app/invoices/page.tsx`:
```tsx
import { Receipt } from "lucide-react";
import { PagePlaceholder } from "@/components/cockpit/page-placeholder";
import { requireFreelancer } from "@/server/auth/session";

export default async function InvoicesPage() {
  await requireFreelancer();
  return (
    <PagePlaceholder
      icon={Receipt}
      title="Invoices"
      description="A roll-up of every invoice across engagements. For now, manage invoices inside each engagement's Documents tab."
    />
  );
}
```

- [ ] **Step 3: Verify + manual check**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

`npm run dev` → click each Delivery/Documents/Clients/Messages nav item → a clean "Coming soon" page renders inside the shell; the active nav item highlights; breadcrumbs read correctly (e.g. `Soloist / Tasks`).

- [ ] **Step 4: Commit**

```bash
git add src/components/cockpit/page-placeholder.tsx src/app/app/clients src/app/app/messages src/app/app/timeline src/app/app/tasks src/app/app/deliverables src/app/app/approvals src/app/app/files src/app/app/invoices
git commit -m "feat(cockpit): polished placeholder pages for the 8 not-yet-built destinations"
```

---

## Phase F — Verification

### Task 19: Full verification + spec coverage check

**Files:** none (verification only).

- [ ] **Step 1: Run the full gate**

Run:
```bash
npm run typecheck && npm run lint && npm run test && npm run build
```
Expected: typecheck clean; lint clean; **all tests pass** (the prior 509 + the new nav-config, overview-summary, and cockpit.repository suites); build succeeds.

If the PGlite suites time out on a loaded machine, re-run serially: `npx vitest run --no-file-parallelism`.

- [ ] **Step 2: Manual end-to-end walk** (`npm run dev`, `http://localhost:3002`)

Confirm each, as a logged-in freelancer:
1. **Shell** renders on `/app` and every child route; the cool/Iris theme applies (incl. opened palette + menus).
2. **Sidebar:** 3 groups + footer; Engagements count badge; active highlighting follows the route; collapse/expand via trigger + `⌘B`; collapsed rail shows icon tooltips; state persists across reload.
3. **App bar:** breadcrumbs match the route; `⌘K` opens the palette and navigates (nav + engagement jump); bell shows attention items (or "all caught up"); help menu opens; profile menu → Account/Brand/Settings links work; **Log out** works.
4. **Overview:** real KPIs, momentum chart (or empty state), engagements table (rows link to detail), attention/outstanding/recent panels — no fabricated numbers.
5. **Existing features intact:** `/app/engagements` list; engagement detail with its tabs (Ship Feed, Repos, Client, Documents, Messages); `/app/settings/{account,branding}` — all still work, now inside the shell.
6. **Placeholders:** the 8 stub routes render the "Coming soon" page.
7. **No regressions on other surfaces:** spot-check `/login` and (if you have a client login) `/portal` — they remain the warm brand, unchanged.

- [ ] **Step 3: Spec coverage self-check**

Confirm against `docs/superpowers/specs/2026-06-13-freelancer-cockpit-redesign-design.md`: D1–D6 honored; §6 sidebar (counts only on Engagements); §7 app bar (bell is freelancer-derived, not `/api/notifications`); §8 every Overview widget real or honest-empty; §9 routes wired vs placeholders; §5.1 theme scoped (portal/auth unchanged); §10 tests added + suite green; §5.3 no second realtime provider mounted.

- [ ] **Step 4: Final integration commit (if anything was tidied during the walk)**

```bash
git add -A
git commit -m "chore(cockpit): final verification pass for the freelancer shell redesign"
```

---

## Done

The cockpit now has a grouped collapsible sidebar, a consistent app bar, and a fully real Overview, with the existing features wired in and polished placeholders for the rest — no schema changes, all surfaces but `/app` untouched. Deferred (per spec §12): the 8 placeholder features, dark mode, a single hoisted cockpit-level realtime provider for cross-engagement push-live updates, and a first-class freelancer notifications model.
