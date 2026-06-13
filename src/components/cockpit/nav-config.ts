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
    // A uuid segment is labelled by its parent: an invoice id (under /documents) reads
    // "Invoice", otherwise an engagement id reads "Engagement".
    const prev = rest[i - 1];
    const label =
      SEGMENT_LABELS[seg] ??
      (isUuid(seg) ? (prev === "documents" ? "Invoice" : "Engagement") : seg);
    crumbs.push(i === rest.length - 1 ? { label } : { label, href: acc });
  });
  return crumbs;
}
