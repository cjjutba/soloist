import { Webhooks } from "@octokit/webhooks";
import * as Sentry from "@sentry/nextjs";
import { env } from "@/env";
import { deleteDelivery, recordDelivery } from "@/server/db/repositories/webhook-event.repository";
import { inngest } from "@/server/inngest/client";

// HMAC verify (node:crypto) + the Neon/Drizzle pool (recordDelivery) are Node-only. Pin the
// runtime so a future global/Edge default can't silently break the receiver (matches auth route).
export const runtime = "nodejs";

/**
 * GitHub webhook receiver (Story 3.1). Verifies the `X-Hub-Signature-256` HMAC (NFR-3 / AR-8),
 * dedupes on `gh_delivery_id`, enqueues an Inngest event, and returns 202 FAST — no heavy work
 * in the request (the `process-github-event` function does the mapping/candidate creation).
 * Fails CLOSED: no webhook secret → 503; bad/missing signature → 401 (no record, no enqueue).
 */
export async function POST(req: Request): Promise<Response> {
  const secret = env.GITHUB_APP_WEBHOOK_SECRET;
  if (!secret) {
    // No secret → we cannot verify authenticity → reject (fail closed). Inert until configured.
    return new Response("Webhook not configured", { status: 503 });
  }

  const signature = req.headers.get("x-hub-signature-256");
  const eventType = req.headers.get("x-github-event");
  const ghDeliveryId = req.headers.get("x-github-delivery");
  if (!signature || !eventType || !ghDeliveryId) {
    return new Response("Missing GitHub headers", { status: 400 });
  }

  // The RAW body is required for HMAC — verify BEFORE parsing.
  const rawBody = await req.text();
  let valid = false;
  try {
    valid = await new Webhooks({ secret }).verify(rawBody, signature);
  } catch {
    valid = false;
  }
  if (!valid) {
    return new Response("Invalid signature", { status: 401 });
  }

  // Parse the (now-authentic) body BEFORE touching the ledger — a body we can't parse won't
  // become parseable on retry, so reject 4xx without recording a delivery (GitHub won't retry).
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("Malformed JSON body", { status: 400 });
  }

  try {
    // Idempotency ledger: a duplicate delivery is acknowledged but NOT re-enqueued.
    const isNew = await recordDelivery({ ghDeliveryId, eventType });
    if (!isNew) {
      return new Response("Duplicate delivery (already handled)", { status: 202 });
    }
    try {
      await inngest.send({ name: "github/event.received", data: { ghDeliveryId, eventType, payload } });
    } catch (sendErr) {
      // Enqueue failed AFTER the ledger row was written. Roll it back so GitHub's redelivery
      // re-enqueues instead of being permanently dropped as a "duplicate".
      await deleteDelivery(ghDeliveryId);
      throw sendErr;
    }
    return new Response("Accepted", { status: 202 });
  } catch (err) {
    // Unexpected → surface to Sentry (architecture: unexpected errors are alerted), don't leak.
    console.error("[webhooks/github] enqueue failed:", err);
    Sentry.captureException(err);
    return new Response("Internal error", { status: 500 });
  }
}
