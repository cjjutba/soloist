import { serve } from "inngest/next";
import { inngest } from "@/server/inngest/client";
import { processGithubEvent } from "@/server/inngest/functions/process-github-event";
import { reconcileRepos } from "@/server/inngest/functions/reconcile-repos";

// The registered functions run `withTenant` → the Neon/Drizzle pool (Node-only). Pin the runtime.
export const runtime = "nodejs";

// Inngest's function endpoint. Inngest (cloud in prod, the dev server locally) invokes the
// registered functions here: the real-time webhook handler (3.1) + the ~10-min reconciliation
// cron (3.3). Inert until INNGEST_* is configured.
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [processGithubEvent, reconcileRepos],
});
