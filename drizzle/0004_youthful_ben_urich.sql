CREATE TABLE "engagements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"client_display_name" text NOT NULL,
	"name" text NOT NULL,
	"scope" text,
	"status" text DEFAULT 'active' NOT NULL,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "engagements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "engagements" ADD CONSTRAINT "engagements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "engagement_scope" ON "engagements" AS PERMISSIVE FOR ALL TO public USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid AND (nullif(current_setting('app.engagement_id', true), '')::uuid IS NULL OR id = nullif(current_setting('app.engagement_id', true), '')::uuid)) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid AND (nullif(current_setting('app.engagement_id', true), '')::uuid IS NULL OR id = nullif(current_setting('app.engagement_id', true), '')::uuid));
--> statement-breakpoint
-- drizzle-kit does not emit FORCE; required so the table OWNER (neondb_owner, BYPASSRLS) is also subject to RLS (NFR-2).
ALTER TABLE "engagements" FORCE ROW LEVEL SECURITY;
