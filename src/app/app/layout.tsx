import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppBar } from "@/components/cockpit/app-bar";
import { AppSidebar } from "@/components/cockpit/app-sidebar";
import { buildCockpitChrome } from "@/server/cockpit/chrome";
import { getCockpitDashboard } from "@/server/cockpit/data";
import { requireFreelancer } from "@/server/auth/session";
import { getTenant } from "@/server/db/repositories/tenants.repository";

// Cockpit surface (Soloist-branded), served at /app/*. The role guard runs here on every server
// render of this subtree: unauthenticated → /login, non-freelancer → redirect/not-found. The
// freelancer's Tenant is resolved from the session (never the host/URL). This layout also renders
// the persistent enterprise shell: a grouped collapsible sidebar + a consistent app bar. Chrome
// data (sidebar count, ⌘K palette, activity bell) comes from one request-cached dashboard read.
export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await requireFreelancer();
  const [tenant, dashboard, cookieStore] = await Promise.all([
    getTenant(session),
    getCockpitDashboard(session),
    cookies(),
  ]);
  if (!tenant) notFound(); // session.tenantId is a ghost (deleted Tenant) → deny, don't degrade

  const chrome = buildCockpitChrome(dashboard);
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";

  return (
    <div data-surface="cockpit" className="text-foreground">
      <SidebarProvider defaultOpen={defaultOpen}>
        <AppSidebar engagementsCount={chrome.engagementsActiveCount} />
        <SidebarInset>
          <AppBar
            user={{ name: session.name, email: session.email }}
            engagements={chrome.engagements}
            attention={chrome.attention}
          />
          <div className="flex flex-1 flex-col bg-background">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}
