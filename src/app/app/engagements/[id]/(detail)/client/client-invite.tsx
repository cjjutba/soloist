"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { resendInviteAction, sendInviteAction } from "@/server/invitations/invitations.actions";

export type InviteView =
  | { kind: "none" }
  | { kind: "pending"; email: string; sentRelative: string }
  | { kind: "expired"; email: string }
  | { kind: "accepted"; email: string };

/** Cockpit Client tab invite control (Story 2.3) — composes shadcn Input + Button + a state
 * Badge. The server derives `view`; this component is presentational + calls the actions. */
export function ClientInvite({ engagementId, view }: { engagementId: string; view: InviteView }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSend() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await sendInviteAction(engagementId, email);
      if (res.ok) {
        toast.success("Invite sent.");
        router.refresh();
      } else {
        setError(res.error);
      }
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function onResend() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await resendInviteAction(engagementId);
      if (res.ok) {
        toast.success("Invite resent.");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="w-full max-w-xl">
      <CardHeader>
        <CardTitle>Client access</CardTitle>
        <CardDescription>Invite your client by email to their branded portal.</CardDescription>
      </CardHeader>
      <CardContent>
        {view.kind === "none" ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void onSend();
            }}
            className="flex flex-col gap-3"
            noValidate
          >
            <Field label="Client email" htmlFor="invite-email" error={error ?? undefined}>
              <Input
                id="invite-email"
                type="email"
                autoComplete="off"
                placeholder="client@company.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (error) setError(null); // clear the stale error as they correct it
                }}
                aria-invalid={!!error}
              />
            </Field>
            <Button type="submit" disabled={busy} className="self-start">
              {busy ? "Sending…" : "Send invite"}
            </Button>
          </form>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{view.email}</span>
              {view.kind === "pending" ? <Badge variant="paused">Pending</Badge> : null}
              {view.kind === "expired" ? <Badge variant="archived">Expired</Badge> : null}
              {view.kind === "accepted" ? <Badge variant="completed">Accepted</Badge> : null}
            </div>
            {view.kind === "pending" ? (
              <p className="text-sm text-muted-foreground">
                Invited {view.sentRelative}. Awaiting acceptance.
              </p>
            ) : null}
            {view.kind === "expired" ? (
              <p className="text-sm text-muted-foreground">
                This invite has expired. Resend to send a fresh link.
              </p>
            ) : null}
            {view.kind === "accepted" ? (
              <p className="text-sm text-muted-foreground">
                Your client has access to this engagement.
              </p>
            ) : null}
            {view.kind !== "accepted" ? (
              <Button variant="outline" onClick={onResend} disabled={busy} className="self-start">
                {busy ? "Resending…" : "Resend invite"}
              </Button>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
