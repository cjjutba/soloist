"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/** An `<h1>` focused on each route (EXPERIENCE a11y floor: move focus to the new view's
 * heading on every portal surface). A client effect is required — React's `autoFocus` only
 * fires for form controls. Depends on `pathname` so it ALSO re-fires on client-side
 * navigations where a persistent layout (e.g. the portal shell) reuses this node instead of
 * remounting it. */
export function FocusHeading({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLHeadingElement>(null);
  const pathname = usePathname();
  useEffect(() => {
    ref.current?.focus();
  }, [pathname]);
  return (
    <h1 ref={ref} tabIndex={-1} className={cn("outline-none", className)}>
      {children}
    </h1>
  );
}
