import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/server/auth";

// Better Auth needs the Node runtime (crypto + the pg/Drizzle pool) — make it
// explicit so a future global/Edge default can't silently break every auth route.
export const runtime = "nodejs";

export const { GET, POST } = toNextJsHandler(auth);
