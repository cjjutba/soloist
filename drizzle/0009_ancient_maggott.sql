CREATE TABLE "repo_connections" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"engagement_id" uuid NOT NULL,
	"gh_installation_id" text NOT NULL,
	"gh_repo_id" text NOT NULL,
	"repo_full_name" text NOT NULL,
	"status" text DEFAULT 'connected' NOT NULL,
	"last_pull_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "repo_connections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "repo_connections" ADD CONSTRAINT "repo_connections_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repo_connections" ADD CONSTRAINT "repo_connections_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "repo_connections_active_repo" ON "repo_connections" USING btree ("repo_full_name") WHERE status <> 'disconnected';--> statement-breakpoint
CREATE POLICY "repo_connection_scope" ON "repo_connections" AS PERMISSIVE FOR ALL TO public USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid AND (nullif(current_setting('app.engagement_id', true), '')::uuid IS NULL OR engagement_id = nullif(current_setting('app.engagement_id', true), '')::uuid)) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid AND (nullif(current_setting('app.engagement_id', true), '')::uuid IS NULL OR engagement_id = nullif(current_setting('app.engagement_id', true), '')::uuid));
--> statement-breakpoint
-- drizzle-kit does not emit FORCE; required so the table OWNER (neondb_owner, BYPASSRLS) is also subject to RLS (NFR-2).
ALTER TABLE "repo_connections" FORCE ROW LEVEL SECURITY;
