# Real-time foundation (Ably) + Slice 1: instant feed & notifications

**Date:** 2026-06-12 · **Status:** approved (brainstorm) → implementing

## Goal

Make the client portal's Ship Feed and notification bell update **the moment** the freelancer
publishes — replacing the 20s polling — via a provider-neutral managed realtime layer (**Ably**),
without weakening the multi-tenant RLS model. Built as a reusable foundation that presence,
live invoice/status, and chat (future slices) layer onto.

## Core principle — "signal, not data"

Realtime events carry **lightweight signals, never payload data.** The server publishes a tiny
event (e.g. `ship.published`) to a channel; the client receives it and **invalidates its existing
TanStack query**, which refetches through the **existing RLS-protected API** (`/api/feed/[id]`,
`/api/notifications`). Consequences:
- **No sensitive data on the wire** — the event says "something changed"; data still flows through
  authed, RLS-scoped endpoints. The security model is untouched.
- **Enhancement over polling, never a hard dependency** — a slow fallback poll (60s) remains; if
  Ably is unreachable the app still works, just less instantly. Low blast radius.

## Channels & authorization (the security crux)

- **Channels:** `engagement:{engagementId}` (feed/status/presence/chat) and `user:{userId}` (the
  notification bell).
- **Token endpoint** `POST /api/realtime/token`: `getAppSession()` → mints an **Ably capability
  token scoped to exactly the channels the caller may access**. Client → their one engagement +
  their user channel (`subscribe`, `presence`); freelancer → each owned engagement + their user
  channel. Deny-by-default (401 unauth / 503 if unconfigured). Clients are **subscribe-only**;
  the server publishes with the secret ROOT key (never exposed). `clientId = userId`.
- The capability builder is a **pure function** (`buildCapability`) — the wire-access authz core,
  unit-tested for no cross-tenant/engagement access. Same authorization shape as RLS, applied to
  the wire.

## Components

- `src/server/realtime/channels.ts` — pure channel-name + `buildCapability` helpers. **Tested.**
- `src/server/realtime/ably.ts` — server `Ably.Rest` client from `ABLY_API_KEY` (null if unset).
- `src/server/realtime/publish.ts` — `publishToEngagement` / `publishToUser`, **best-effort**
  (try/catch + log, never break the calling action — mirrors `emitPublished`).
- `src/app/api/realtime/token/route.ts` — the authed token endpoint (`runtime=nodejs`).
- `src/server/db/repositories/engagements.repository.ts` — add `listEngagementIds(ctx)` (RLS-scoped)
  for the freelancer token capability.
- Client: `src/app/.../realtime-provider.tsx` (Ably Realtime client via `authUrl`) + a
  `useRealtimeInvalidate(channel, event→queryKey)` hook.

## Data flow (Slice 1)

Freelancer publishes → existing `ship/update.published` Inngest fan-out → (existing) notification
rows **+ (new)** `publishToEngagement(id,"ship.published")` + `publishToUser(client,"notification")`
→ client browser (subscribed via token) receives → invalidates `['feed', id]` / `['notifications']`
→ refetch RLS-protected APIs → UI updates ~instantly. Same for `invoice.sent`. Poll drops to a 60s
fallback.

## Wiring (Slice 1 = client portal)

- **Publish (server):** `handleShipPublished` + `handleInvoiceSent` (Inngest fan-outs) call the
  publish helpers after creating notifications. Best-effort.
- **Subscribe (client portal only this slice):** the portal Ship Feed (`ship-feed.tsx`) +
  notification bell/center subscribe and invalidate; `refetchInterval` 20s → 60s fallback.
- The freelancer-side cockpit live updates are a **follow-on** (the token endpoint already supports
  the freelancer role).

## Degradation & errors

- Ably down / token fetch fails → client silently falls back to the 60s poll.
- Publish failures are best-effort (logged, never break publishing).
- `ABLY_API_KEY` optional in `env.ts` — unset → publish no-ops, token route 503s, client polls.

## Testing

- `channels.ts` `buildCapability` — unit (client can't access another engagement/user; freelancer
  scoping). The security-critical part.
- Token route — authz (401 unauth, 503 unconfigured, correct capability per role), mocking Ably +
  session, mirroring `/api/feed` tests.
- Publish helpers — best-effort (failure doesn't throw), Ably mocked.
- Inngest fan-out — asserts it also publishes the realtime signal (mock publish).

## Scope

**This spec = foundation + Slice 1 (client portal instant feed + notifications).** Follow-on specs:
presence / "seen" receipts, live invoice/status sync, live chat — all reuse this foundation.
Env: `ABLY_API_KEY` (server-only). Dep: `ably`.
