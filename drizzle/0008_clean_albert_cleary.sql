CREATE TABLE "ship_updates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"engagement_id" uuid NOT NULL,
	"status_tag" text NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"state" text DEFAULT 'candidate' NOT NULL,
	"source" text NOT NULL,
	"source_event_key" text,
	"published_at" timestamp with time zone,
	"raw_meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ship_updates_engagement_source_event_key" UNIQUE("engagement_id","source_event_key")
);
--> statement-breakpoint
ALTER TABLE "ship_updates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"gh_delivery_id" text NOT NULL,
	"event_type" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	CONSTRAINT "webhook_events_gh_delivery_id_unique" UNIQUE("gh_delivery_id")
);
--> statement-breakpoint
ALTER TABLE "ship_updates" ADD CONSTRAINT "ship_updates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ship_updates" ADD CONSTRAINT "ship_updates_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "ship_update_scope" ON "ship_updates" AS PERMISSIVE FOR ALL TO public USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid AND (nullif(current_setting('app.engagement_id', true), '')::uuid IS NULL OR engagement_id = nullif(current_setting('app.engagement_id', true), '')::uuid)) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid AND (nullif(current_setting('app.engagement_id', true), '')::uuid IS NULL OR engagement_id = nullif(current_setting('app.engagement_id', true), '')::uuid));
--> statement-breakpoint
-- drizzle-kit does not emit FORCE; required so the table OWNER (neondb_owner, BYPASSRLS) is also subject to RLS (NFR-2).
-- webhook_events is intentionally RLS-free (pre-tenant system ledger) — no FORCE there.
ALTER TABLE "ship_updates" FORCE ROW LEVEL SECURITY;
