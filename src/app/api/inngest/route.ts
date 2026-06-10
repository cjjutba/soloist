import { serve } from "inngest/next";
import { inngest } from "@/server/inngest/client";
import { invoiceSent } from "@/server/inngest/functions/invoice-sent";
import { processGithubEvent } from "@/server/inngest/functions/process-github-event";
import { reconcileRepos } from "@/server/inngest/functions/reconcile-repos";
import { shipPublished } from "@/server/inngest/functions/ship-published";

// The registered functions run `withTenant` → the Neon/Drizzle pool (Node-only). Pin the runtime.
export const runtime = "nodejs";

// Inngest's function endpoint. Inngest (cloud in prod, the dev server locally) invokes the
// registered functions here: the real-time webhook handler (3.1), the ~10-min reconciliation
// cron (3.3), the publish → notify+email fan-out (3.6), and the invoice-sent fan-out (5.2). Inert
// until INNGEST_* is configured.
// NOTE: adding a function requires a prod re-sync (`PUT /api/inngest`) to register it.
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [processGithubEvent, reconcileRepos, shipPublished, invoiceSent],
});
