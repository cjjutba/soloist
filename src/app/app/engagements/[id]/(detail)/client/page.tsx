import { requireFreelancer } from "@/server/auth/session";
import { getInvitationByEngagement } from "@/server/db/repositories/invitations.repository";
import { formatRelativeTime } from "@/lib/relative-time";
import { ClientInvite, type InviteView } from "./client-invite";

// Infer the row type from the repository (the page can't import the raw schema).
type InvitationRow = Awaited<ReturnType<typeof getInvitationByEngagement>>;

// Derive the view state (module scope so the impure `Date.now()` stays out of the component
// body — React Compiler purity). The server is authoritative; the client stays presentational.
function deriveInviteView(inv: InvitationRow): InviteView {
  if (!inv) return { kind: "none" };
  if (inv.acceptedAt) return { kind: "accepted", email: inv.email };
  if (inv.expiresAt.getTime() <= Date.now()) return { kind: "expired", email: inv.email };
  return { kind: "pending", email: inv.email, sentRelative: formatRelativeTime(inv.createdAt) };
}

// The Client tab (Story 2.3): invite a client to this Engagement + see/resend the invite.
// The (detail) layout already guarded the engagement; we only need ctx + its invitation.
export default async function ClientTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireFreelancer();
  const inv = await getInvitationByEngagement(ctx, id);
  return <ClientInvite engagementId={id} view={deriveInviteView(inv)} />;
}
