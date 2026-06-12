import { ChatThread } from "@/components/chat/chat-thread";
import { requireOnboardedClient } from "@/server/auth/session";
import { loadClientChatPayload } from "@/server/chat/chat.read";
import { getTenant } from "@/server/db/repositories/tenants.repository";

// The client side of the engagement chat (realtime slice 3). Gated by `requireOnboardedClient`
// (like the other shell pages); nests under the (shell) RealtimeProvider so the thread is live.
// The "other party" is the freelancer's brand (the Tenant name) — the portal never exposes the
// freelancer's personal identity.
export default async function PortalMessagesPage() {
  const session = await requireOnboardedClient();
  const tenant = await getTenant(session);
  const otherLabel = tenant?.name?.trim() || "your team";
  const initialData = await loadClientChatPayload(session, session.engagementId);

  return (
    <ChatThread
      engagementId={session.engagementId}
      role="client"
      selfUserId={session.userId}
      otherLabel={otherLabel}
      initialData={initialData}
    />
  );
}
