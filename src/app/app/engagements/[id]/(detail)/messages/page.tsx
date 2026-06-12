import { notFound } from "next/navigation";
import { ChatThread } from "@/components/chat/chat-thread";
import { requireFreelancer } from "@/server/auth/session";
import { loadFreelancerChatPayload } from "@/server/chat/chat.read";
import { getEngagement } from "@/server/db/repositories/engagements.repository";
import { isUuid } from "@/lib/uuid";

// The freelancer side of the engagement chat (realtime slice 3). Nests under the guarded
// `(detail)` layout (which provides the RealtimeProvider + role guard); self-guards too, per the
// positional-guard rule — a malformed/foreign id → 404.
export default async function EngagementMessagesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const ctx = await requireFreelancer();
  const engagement = await getEngagement(ctx, id);
  if (!engagement) notFound();

  const initialData = await loadFreelancerChatPayload(ctx, id);

  return (
    <ChatThread
      engagementId={id}
      role="freelancer"
      selfUserId={ctx.userId}
      otherLabel={engagement.clientDisplayName}
      initialData={initialData}
    />
  );
}
