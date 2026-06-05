import type { ReactNode } from "react";

// Cockpit surface (Soloist-branded), served at /app/*. The freelancer's Tenant
// is resolved from the authenticated session (Story 1.3/1.4); surface chrome
// (sidebar, nav) lands in later Epic-1/2 stories. Walking-skeleton wrapper.
export default function AppLayout({ children }: { children: ReactNode }) {
  return <div data-surface="cockpit">{children}</div>;
}
