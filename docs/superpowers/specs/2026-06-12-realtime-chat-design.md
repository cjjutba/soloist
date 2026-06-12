# Real-time Chat (Slice 3) — design

**Date:** 2026-06-12
**Status:** approved (CJ)
**Builds on:** the Ably realtime foundation (Slice 1) + presence/seen (Slice 2). Same **"signal, not data"** rule — message text never rides the Ably wire; a bare `message` signal triggers a refetch through an RLS-protected read.

## Goal
A per-engagement, two-way message thread between the freelancer and the client, in the freelancer's brand, with instant delivery, unread badges, online/typing presence, and read receipts — reusing the existing channel, presence capability, and seen plumbing.

## Data model (migration 0018)
- **`messages`** table — `id`, `tenant_id`, `engagement_id`, `sender_role` (`freelancer`|`client`), `sender_user_id`, `body` (text), `created_at`. **Dual-scope RLS + FORCE**, identical shape to `ship_updates`/`invoices` (freelancer scoped by `tenant_id`; client additionally by `engagement_id`; both read the same thread). Index `(engagement_id, created_at)`.
- **Two nullable read cursors** (no new table): `client_access.chat_last_read_at` + `engagements.freelancer_chat_last_read_at`. These drive unread counts **and** read receipts.

## Real-time (no channel/capability change)
- New **`message`** event on the existing `engagement:{id}` channel — both roles already hold `["subscribe","presence"]` there, so the token/capability map is untouched. Send → publish `message` → both sides' threads + unread badges refetch via the RLS API.
- **Read receipts** reuse the existing **`seen`** signal: opening the thread stamps the caller's read cursor and publishes `seen` → the other side refetches and shows "Read".
- **Online + typing** via presence: each party `presence.enter`s while on its chat surface (the client's entry is owned shell-wide by `PortalRealtime`; the freelancer enters on the Messages tab) and `presence.update({typing})` while composing. Presence `clientId === userId` (set on the token), so "the other party" = any member whose `clientId !== selfUserId`.

## Layers
- **Repo** `messages.repository.ts`: `createMessage`, `listMessages` (chronological, RLS + explicit `engagement_id` filter), `markChatReadAsClient`, `markChatReadAsFreelancer`, `clientChatUnread`, `freelancerChatUnread`, `freelancerChatUnreadByEngagement` (dashboard).
- **Actions** `chat/chat.actions.ts`: `sendMessageAsClientAction(body)` (engagement from session), `sendMessageAsFreelancerAction(engagementId, body)` (load-bearing `getEngagement` guard, mirroring `manual-update`), `markChatReadAs{Client,Freelancer}Action`. Zod-validated (`chat.schema.ts`): trimmed, 1–4000 chars. Each publishes the `message`/`seen` signal best-effort.
- **API** `GET /api/chat/[engagementId]` — `getAppSession` → 401/403; client requires `engagementId === session.engagementId`; freelancer scoped by RLS. Returns `{ messages, unreadCount, otherLastReadAt }`, `private, no-store`.
- **Realtime hooks** (shared provider): add `usePresenceMembers` (clientId + data) and `usePresenceTyping` (best-effort `presence.update`).
- **Shared UI** `components/chat/`: `chat.ts` (pure: types, `groupByDay`, `dayLabel`, `lastOwnMessageId`), `chat-thread.tsx` (query + realtime + presence + read + auto-scroll + receipts), `chat-composer.tsx` (Enter-to-send, typing).
- **Surfaces:** freelancer **Messages tab** (engagement detail) with an RSC unread badge (the layout refreshes via `CockpitRealtime` on `message`/`seen`); client **Messages** nav item with a polled unread badge (shares the `["chat", id]` query); a dashboard per-engagement chat-unread badge.

## v1 scope
Plain text only (rendered escaped); no edit/delete/attachments/reactions; no email-per-message (presence shows who's online — email-on-missed-message is a follow-on). Chat unread is its own badge, **not** folded into the ship/invoice notification center.

## Security
Same model as every other table: dual-scope RLS + FORCE, `withTenant`, the load-bearing `getEngagement` guard on the freelancer write (the WITH CHECK only gates `tenant_id`). No message body on the Ably wire. Capability map unchanged.
