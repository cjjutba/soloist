import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import { env } from "@/env";
import * as schema from "./schema";

// WebSocket transport so the Pool supports the multi-statement transactions that
// `withTenant` needs (SET LOCAL / set_config). The neon-HTTP driver canNOT do
// interactive transactions — using it would make the RLS GUC a silent no-op.
neonConfig.webSocketConstructor = ws;

const pool = new Pool({ connectionString: env.DATABASE_URL });

/** The ONLY Drizzle client construction site. Feature code must go through repositories. */
export const db = drizzle(pool, { schema });

export type Db = typeof db;
