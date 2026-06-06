"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** The Onboarding welcome `<h1>`, focused on mount (EXPERIENCE a11y floor: Onboarding sets
 * initial focus to its heading). A client effect is required — React's `autoFocus` only
 * fires for form controls, not a heading, and SSR `autofocus` is inconsistent. */
export function WelcomeHeading({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <h1 ref={ref} tabIndex={-1} className="font-display text-4xl outline-none">
      {children}
    </h1>
  );
}
