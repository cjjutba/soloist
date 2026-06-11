ALTER TABLE "client_access" ADD COLUMN "last_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "client_viewed_at" timestamp with time zone;