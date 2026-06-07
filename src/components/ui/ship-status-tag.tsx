import { cn } from "@/lib/utils";
import { SHIP_STATUS, toShipStatus } from "./ship-status";

/** Read-only status pill (emoji + label) — used in the feed and as the curation row's current
 * state. The vocabulary lives in `./ship-status`; the editable segmented toggle (Story 3.5) is a
 * separate control. */
export function ShipStatusTag({ status, className }: { status: string; className?: string }) {
  const s = SHIP_STATUS[toShipStatus(status)];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        s.classes,
        className,
      )}
    >
      <span aria-hidden="true">{s.emoji}</span>
      {s.label}
    </span>
  );
}
