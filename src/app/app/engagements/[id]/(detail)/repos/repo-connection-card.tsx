import { Card } from "@/components/ui/card";
import { formatRelativeTime } from "@/lib/relative-time";
import { DisconnectButton } from "./disconnect-button";
import { RetryButton } from "./retry-button";

/** Structural shape (avoids importing the schema type, which the data-access ESLint guard
 * blocks for UI files). A `RepoConnection` row is assignable to this. */
type ConnRow = {
  id: string;
  repoFullName: string;
  status: string;
  lastPullAt: Date | null;
  lastError: string | null;
};

// All FOUR states render (AC-1). 3.2 reaches connected/disconnected; pulling/error land in 3.3.
const STATUS: Record<string, { label: string; dot: string; text: string }> = {
  connected: { label: "Connected", dot: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-400" },
  pulling: { label: "Pulling…", dot: "bg-amber-500", text: "text-amber-700 dark:text-amber-400" },
  error: { label: "Error", dot: "bg-destructive", text: "text-destructive" },
  disconnected: { label: "Disconnected", dot: "bg-muted-foreground/50", text: "text-muted-foreground" },
};

export function RepoConnectionCard({
  connection,
  engagementId,
}: {
  connection: ConnRow;
  engagementId: string;
}) {
  const s = STATUS[connection.status] ?? STATUS.connected;
  const isActive = connection.status !== "disconnected";

  return (
    <Card className="flex items-center justify-between gap-4 p-4">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="truncate font-mono text-sm">{connection.repoFullName}</span>
        <span className={`inline-flex items-center gap-1.5 text-xs ${s.text}`}>
          <span className={`size-1.5 rounded-full ${s.dot}`} aria-hidden />
          {s.label}
          {isActive && connection.lastPullAt ? (
            <span className="text-muted-foreground">· last pull {formatRelativeTime(connection.lastPullAt)}</span>
          ) : null}
        </span>
        {connection.status === "error" && connection.lastError ? (
          <span className="text-xs text-destructive">{connection.lastError}</span>
        ) : null}
      </div>
      {isActive ? (
        <div className="flex shrink-0 items-center gap-2">
          {connection.status === "error" ? (
            <RetryButton engagementId={engagementId} connectionId={connection.id} />
          ) : null}
          <DisconnectButton
            engagementId={engagementId}
            connectionId={connection.id}
            repoFullName={connection.repoFullName}
          />
        </div>
      ) : null}
    </Card>
  );
}
