import { Card } from "@/components/ui/card";

/** Calm "arriving later" placeholder for the detail-shell tabs whose behavior lands in
 * Epics 3/2.3/5 (Story 2.2 ships the shell, not the contents). */
export function TabPlaceholder({ title, body }: { title: string; body: string }) {
  return (
    <Card className="flex flex-col items-center gap-2 p-12 text-center">
      <p className="font-medium">{title}</p>
      <p className="max-w-md text-sm text-muted-foreground">{body}</p>
    </Card>
  );
}
