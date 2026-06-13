import Link from "next/link";
import { CandidateBadge, StatusBadge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatRelativeTime } from "@/lib/relative-time";
import type { DashboardEngagement } from "@/server/db/repositories/engagements.repository";

export function EngagementsTable({ rows }: { rows: DashboardEngagement[] }) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-center justify-between px-5 py-4">
        <h2 className="text-sm font-semibold text-foreground">Active engagements</h2>
        <Link href="/app/engagements" className="text-xs font-medium text-primary hover:underline">
          View all
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 pb-8 pt-2 text-center text-sm text-muted-foreground">No active engagements yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Engagement</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">To curate</TableHead>
              <TableHead className="text-right">Unread</TableHead>
              <TableHead className="text-right">Last activity</TableHead>
              <TableHead className="text-right">Client viewed</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((e) => (
              <TableRow key={e.id}>
                <TableCell>
                  <Link href={`/app/engagements/${e.id}`} className="flex flex-col">
                    <span className="font-medium text-foreground">{e.name}</span>
                    <span className="text-xs text-muted-foreground">{e.clientDisplayName}</span>
                  </Link>
                </TableCell>
                <TableCell>
                  <StatusBadge status={e.status} />
                </TableCell>
                <TableCell className="text-right">
                  <CandidateBadge count={e.candidateCount} />
                </TableCell>
                <TableCell className="text-right font-mono text-sm text-foreground">
                  {e.chatUnreadCount > 0 ? e.chatUnreadCount : "—"}
                </TableCell>
                <TableCell className="text-right font-mono text-xs text-muted-foreground">
                  {formatRelativeTime(e.lastActivityAt)}
                </TableCell>
                <TableCell className="text-right font-mono text-xs text-muted-foreground">
                  {e.lastSeenAt ? formatRelativeTime(e.lastSeenAt) : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}
