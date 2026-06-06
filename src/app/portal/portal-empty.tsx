import { FocusHeading } from "@/components/ui/focus-heading";

/** A calm, DESIGNED empty state for a Client Portal surface (Story 2.6). Serif title +
 * one reassuring line, centered — never a blank or "no data." Shared by the empty Ship
 * Feed, Documents, and Notifications so the premium empty-state is one component. */
export function PortalEmpty({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-3 text-center">
      <FocusHeading className="font-display text-3xl">{title}</FocusHeading>
      <p className="max-w-sm text-balance text-muted-foreground">{body}</p>
    </div>
  );
}
