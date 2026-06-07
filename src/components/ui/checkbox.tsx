import * as React from "react";
import { cn } from "@/lib/utils";

/** Minimal styled checkbox (Story 3.5 bulk-select) — a native `<input type="checkbox">`, not a
 * Radix dependency. `accent-foreground` tints the check to Soloist Ink; the focus ring matches
 * the other form primitives. Always give it an `aria-label` (the rows have no visible label). */
export const Checkbox = React.forwardRef<
  HTMLInputElement,
  Omit<React.ComponentProps<"input">, "type">
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    type="checkbox"
    className={cn(
      "size-4 cursor-pointer rounded-[var(--radius-sm)] border border-input accent-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
Checkbox.displayName = "Checkbox";
