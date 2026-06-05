import type { ReactNode } from "react";

// Cockpit surface shell (Soloist-branded). Surface chrome (sidebar, nav) lands
// in later Epic-1/2 stories; this is the walking-skeleton wrapper.
export default function CockpitLayout({ children }: { children: ReactNode }) {
  return <div data-surface="cockpit">{children}</div>;
}
