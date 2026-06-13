import Link from "next/link";
import { Card } from "@/components/ui/card";
import { formatRelativeTime } from "@/lib/relative-time";

export type RecentUpdate = {
  id: string;
  title: string;
  statusTag: string;
  publishedAt: Date | null;
  engagementId: string;
  engagementName: string;
};

export function RecentUpdates({ updates }: { updates: RecentUpdate[] }) {
  return (
    <Card className="flex flex-col gap-3 p-5">
      <h2 className="text-sm font-semibold text-foreground">Recent updates sent</h2>
      {updates.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing published yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {updates.map((u) => (
            <li key={u.id}>
              <Link href={`/app/engagements/${u.engagementId}`} className="flex flex-col gap-0.5">
                <span className="truncate text-sm font-medium text-foreground">{u.title}</span>
                <span className="text-xs text-muted-foreground">
                  {u.engagementName}
                  {u.publishedAt ? ` · ${formatRelativeTime(u.publishedAt)}` : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
