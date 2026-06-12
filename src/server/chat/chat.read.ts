import type { ChatMessage, ChatPayload, ChatRole } from "@/components/chat/chat";
import type { TenantContext } from "@/server/db/context";
import {
  clientChatUnread,
  freelancerChatUnread,
  getClientLastRead,
  getFreelancerLastRead,
  listMessages,
  type Message,
} from "@/server/db/repositories/messages.repository";

/**
 * Shared chat-payload loaders (realtime slice 3) — the SINGLE source of the `{ messages, unreadCount,
 * otherLastReadAt }` shape, used by BOTH the `GET /api/chat/[engagementId]` poll AND the RSC pages'
 * `initialData`, so the seed and the refetch can never drift. Dates are emitted as ISO strings to
 * match `Response.json` (the page passes them straight into the client thread).
 */

const toWire = (messages: Message[]): ChatMessage[] =>
  messages.map((m) => ({
    id: m.id,
    senderRole: m.senderRole as ChatRole,
    senderUserId: m.senderUserId,
    body: m.body,
    createdAt: m.createdAt.toISOString(),
  }));

/** The client's view: inbound = freelancer messages; the other party's cursor = the freelancer's. */
export async function loadClientChatPayload(ctx: TenantContext, engagementId: string): Promise<ChatPayload> {
  const [messages, unreadCount, otherLastReadAt] = await Promise.all([
    listMessages(ctx, engagementId),
    clientChatUnread(ctx),
    getFreelancerLastRead(ctx, engagementId),
  ]);
  return { messages: toWire(messages), unreadCount, otherLastReadAt: otherLastReadAt?.toISOString() ?? null };
}

/** The freelancer's view: inbound = client messages; the other party's cursor = the client's. */
export async function loadFreelancerChatPayload(ctx: TenantContext, engagementId: string): Promise<ChatPayload> {
  const [messages, unreadCount, otherLastReadAt] = await Promise.all([
    listMessages(ctx, engagementId),
    freelancerChatUnread(ctx, engagementId),
    getClientLastRead(ctx, engagementId),
  ]);
  return { messages: toWire(messages), unreadCount, otherLastReadAt: otherLastReadAt?.toISOString() ?? null };
}
