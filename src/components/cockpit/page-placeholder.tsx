import type { LucideIcon } from "lucide-react";

export function PagePlaceholder({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-24 text-center">
      <span className="flex size-12 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground">
        <Icon className="size-6" />
      </span>
      <h1 className="text-xl font-semibold text-foreground">{title}</h1>
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      <span className="mt-1 rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
        Coming soon
      </span>
    </main>
  );
}
