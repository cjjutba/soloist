import { notFound } from "next/navigation";
import { AttentionCard } from "@/components/cockpit/overview/attention-card";
import { EngagementsTable } from "@/components/cockpit/overview/engagements-table";
import { KpiCards } from "@/components/cockpit/overview/kpi-cards";
import { MomentumChart } from "@/components/cockpit/overview/momentum-chart";
import { OutstandingInvoices } from "@/components/cockpit/overview/outstanding-invoices";
import { RecentUpdates } from "@/components/cockpit/overview/recent-updates";
import { requireFreelancer } from "@/server/auth/session";
import { getCockpitDashboard } from "@/server/cockpit/data";
import { startOfMonthUTC, weeksAgoUTC } from "@/server/cockpit/dates";
import { bucketByWeek, summarizeDashboard } from "@/server/cockpit/overview-summary";
import {
  invoiceMoneyStats,
  listOutstandingInvoices,
  listRecentPublishedUpdates,
  publishedUpdateDates,
} from "@/server/db/repositories/cockpit.repository";

const CHART_WEEKS = 6;

export default async function OverviewPage() {
  // Self-guard (positional-guard convention). The Tenant ghost-check lives in the layout.
  const session = await requireFreelancer();
  const now = new Date();
  const monthStart = startOfMonthUTC(now);
  const chartSince = weeksAgoUTC(now, CHART_WEEKS);

  const [dashboard, money, outstanding, recent, pubDates] = await Promise.all([
    getCockpitDashboard(session), // request-cached → shared with the layout's chrome read
    invoiceMoneyStats(session, monthStart),
    listOutstandingInvoices(session),
    listRecentPublishedUpdates(session),
    publishedUpdateDates(session, chartSince),
  ]);
  if (!session.tenantId) notFound(); // defensive; requireFreelancer already guarantees it

  const kpis = summarizeDashboard(dashboard);
  const buckets = bucketByWeek(pubDates, CHART_WEEKS, now);

  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Overview</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your workspace health, delivery momentum, and what needs attention.
        </p>
      </header>

      <KpiCards
        activeEngagements={kpis.activeEngagements}
        awaitingCuration={kpis.awaitingCuration}
        unreadMessages={kpis.unreadMessages}
        paidThisMonth={money.paidThisMonth}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <MomentumChart buckets={buckets} />
          <EngagementsTable rows={dashboard} />
        </div>
        <div className="flex flex-col gap-6">
          <AttentionCard
            awaitingCuration={kpis.awaitingCuration}
            unreadMessages={kpis.unreadMessages}
            outstandingCount={money.outstanding.reduce((n, b) => n + b.count, 0)}
          />
          <OutstandingInvoices rows={outstanding} />
          <RecentUpdates updates={recent} />
        </div>
      </div>
    </main>
  );
}
