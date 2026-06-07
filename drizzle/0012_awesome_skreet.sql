CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"engagement_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"ship_update_id" uuid,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_ship_update_id_ship_updates_id_fk" FOREIGN KEY ("ship_update_id") REFERENCES "public"."ship_updates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_ship_dedup" ON "notifications" USING btree ("user_id","ship_update_id") WHERE ship_update_id IS NOT NULL;--> statement-breakpoint
CREATE POLICY "notification_scope" ON "notifications" AS PERMISSIVE FOR ALL TO public USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid AND (nullif(current_setting('app.engagement_id', true), '')::uuid IS NULL OR engagement_id = nullif(current_setting('app.engagement_id', true), '')::uuid)) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid AND (nullif(current_setting('app.engagement_id', true), '')::uuid IS NULL OR engagement_id = nullif(current_setting('app.engagement_id', true), '')::uuid));--> statement-breakpoint
-- drizzle-kit does not emit FORCE; appended manually so the table owner (neondb_owner) is also
-- subject to the policy — RLS is the security boundary, not advisory (NFR-2).
ALTER TABLE "notifications" FORCE ROW LEVEL SECURITY;