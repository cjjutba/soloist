import type { ReactNode } from "react";

// Client Portal surface shell (Tenant-branded). The per-Tenant `--tenant-accent`
// is applied here once Branding exists (Story 1.6); for now it's the neutral default.
export default function PortalLayout({ children }: { children: ReactNode }) {
  return <div data-surface="portal">{children}</div>;
}
