import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Neutral, Soloist-branded status chips for the Cockpit — deliberately NOT the
// per-Tenant accent (the Cockpit is the founder's surface, never client-branded).
const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
  {
    variants: {
      variant: {
        active: "border-transparent bg-foreground/10 text-foreground",
        paused: "border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-400",
        completed: "border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
        archived: "border-border bg-transparent text-muted-foreground",
      },
    },
    defaultVariants: { variant: "active" },
  },
);

export type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

export function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

/** Single source of truth for status display labels (reused by the edit form's select). */
export const STATUS_LABELS: Record<BadgeVariant, string> = {
  active: "Active",
  paused: "Paused",
  completed: "Completed",
  archived: "Archived",
};

/** Map an Engagement.status string → a labelled status badge (falls back to Active).
 * `Object.hasOwn` (not `in`) so a free-text status like "constructor"/"toString" can't
 * match an inherited prototype key and produce an invalid variant. */
export function StatusBadge({ status }: { status: string }) {
  const variant: BadgeVariant = Object.hasOwn(STATUS_LABELS, status)
    ? (status as BadgeVariant)
    : "active";
  return <Badge variant={variant}>{STATUS_LABELS[variant]}</Badge>;
}

/** The "N updates need curation" signal on a Cockpit Engagement row (Story 2.2).
 * **Absent at zero** (never "0" — DESIGN.md L179). Always **Soloist Iris** (`#5b5bd6`,
 * a brand constant), NEVER the per-Tenant `--tenant-accent` — the Cockpit wears Soloist's
 * own chrome. The count renders in `font-mono` (the "Numeric" rule). */
export function CandidateBadge({ count }: { count: number }) {
  if (!(count > 0)) return null; // absent at zero — and fail-closed on NaN/negative
  return (
    <span
      className="inline-flex items-center rounded-full bg-[#5b5bd6] px-2 py-0.5 font-mono text-xs font-medium text-white"
      aria-label={`${count} ${count === 1 ? "update needs" : "updates need"} curation`}
    >
      {count}
    </span>
  );
}
