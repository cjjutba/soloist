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
