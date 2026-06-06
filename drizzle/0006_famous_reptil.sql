CREATE TABLE "client_access" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"engagement_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'client' NOT NULL,
	"invited_at" timestamp with time zone,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_access_engagement_id_unique" UNIQUE("engagement_id"),
	CONSTRAINT "client_access_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "client_access" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "client_access" ADD CONSTRAINT "client_access_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_access" ADD CONSTRAINT "client_access_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_access" ADD CONSTRAINT "client_access_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "client_access_scope" ON "client_access" AS PERMISSIVE FOR ALL TO public USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid AND (nullif(current_setting('app.engagement_id', true), '')::uuid IS NULL OR engagement_id = nullif(current_setting('app.engagement_id', true), '')::uuid)) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid AND (nullif(current_setting('app.engagement_id', true), '')::uuid IS NULL OR engagement_id = nullif(current_setting('app.engagement_id', true), '')::uuid));
--> statement-breakpoint
-- drizzle-kit does not emit FORCE; required so the table OWNER (neondb_owner, BYPASSRLS) is also subject to RLS (NFR-2).
ALTER TABLE "client_access" FORCE ROW LEVEL SECURITY;
