/**
 * The fixed Ship Update status vocabulary (FR-10) — the SINGLE source of truth shared by the
 * Cockpit curation queue (Story 3.5), the Client feed (3.7), and branded emails (3.6). The DB
 * stores the bare key (`shipped|in_progress|next`); the emoji/label/colors live only here.
 * Colors are the DESIGN tokens (all AA on their surface): ✅ #15803D/#ECFDF3, 🚧 #92400E/#FEF6E7,
 * 📦 #475569/#F1F5F9. Pure data (no JSX) so it's node-unit-testable and server-importable.
 */
export const SHIP_STATUS = {
  shipped: {
    label: "Shipped",
    emoji: "✅",
    classes: "bg-[#ECFDF3] text-[#15803D]", // app (Tailwind, JIT needs literals)
    bg: "#ECFDF3", // email (inline styles can't use Tailwind classes)
    fg: "#15803D",
  },
  in_progress: {
    label: "In Progress",
    emoji: "🚧",
    classes: "bg-[#FEF6E7] text-[#92400E]",
    bg: "#FEF6E7",
    fg: "#92400E",
  },
  next: {
    label: "Next",
    emoji: "📦",
    classes: "bg-[#F1F5F9] text-[#475569]",
    bg: "#F1F5F9",
    fg: "#475569",
  },
} as const;

export type ShipStatus = keyof typeof SHIP_STATUS;

/** The cycle order for the `1/2/3` shortcuts and the segmented toggle. */
export const SHIP_STATUS_KEYS = ["shipped", "in_progress", "next"] as const;

/** Coerce a free-text DB value to a known status — `Object.hasOwn` (not `in`) so a value like
 * "constructor"/"toString" can't match an inherited prototype key (mirrors `StatusBadge`). */
export function toShipStatus(status: string): ShipStatus {
  return Object.hasOwn(SHIP_STATUS, status) ? (status as ShipStatus) : "in_progress";
}
