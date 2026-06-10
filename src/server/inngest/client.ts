import { Inngest } from "inngest";

/** The Inngest event bus (Story 3.1 — the GitHub Ship Feed pipeline). Uses INNGEST_EVENT_KEY
 * in production (Inngest cloud); locally the Inngest dev server needs no keys. Event names
 * follow `domain/thing.verb` (architecture). */
export const inngest = new Inngest({ id: "soloist" });

/** The payload for `github/event.received` — minimal: a correlation id (the GitHub delivery
 * id) + the event type + the raw payload the function re-normalizes. */
export type GithubEventReceived = {
  ghDeliveryId: string;
  eventType: string;
  payload: unknown;
};

/** The payload for `ship/update.published` (Story 3.6) — minimal ids; the fan-out re-reads the
 * notification + email data (same pattern as `github/event.received`). */
export type ShipPublished = {
  shipUpdateId: string;
  engagementId: string;
  tenantId: string;
};

/** The payload for `invoice.sent` (Story 5.2) — minimal ids; the fan-out re-reads the invoice +
 * email data fresh (never trusts event-carried content), same pattern as `ship/update.published`. */
export type InvoiceSent = {
  invoiceId: string;
  engagementId: string;
  tenantId: string;
};
