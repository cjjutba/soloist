import type { ReactNode } from "react";
import { requireClient } from "@/server/auth/session";

// Client Portal surface shell (Tenant-branded). The role guard runs here: a non-client
// session (e.g. a Freelancer) → not-found; unauthenticated → /login. SCAFFOLD — real
// Client/Engagement resolution + the per-Tenant `--tenant-accent` land in Epic 2 / 1.6.
export default async function PortalLayout({ children }: { children: ReactNode }) {
  await requireClient();
  return <div data-surface="portal">{children}</div>;
}
