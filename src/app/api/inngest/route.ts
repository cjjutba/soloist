import { serve } from "inngest/next";
import { inngest } from "@/server/inngest/client";
import { processGithubEvent } from "@/server/inngest/functions/process-github-event";

// The registered functions run `withTenant` → the Neon/Drizzle pool (Node-only). Pin the runtime.
export const runtime = "nodejs";

// Inngest's function endpoint (Story 3.1). Inngest (cloud in prod, the dev server locally)
// invokes the registered functions here. Inert until INNGEST_* is configured.
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [processGithubEvent],
});
