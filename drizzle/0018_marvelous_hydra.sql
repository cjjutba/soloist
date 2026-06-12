CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"engagement_id" uuid NOT NULL,
	"sender_role" text NOT NULL,
	"sender_user_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "client_access" ADD COLUMN "chat_last_read_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "engagements" ADD COLUMN "freelancer_chat_last_read_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_user_id_user_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "messages_engagement_created" ON "messages" USING btree ("engagement_id","created_at");--> statement-breakpoint
CREATE POLICY "message_scope" ON "messages" AS PERMISSIVE FOR ALL TO public USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid AND (nullif(current_setting('app.engagement_id', true), '')::uuid IS NULL OR engagement_id = nullif(current_setting('app.engagement_id', true), '')::uuid)) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid AND (nullif(current_setting('app.engagement_id', true), '')::uuid IS NULL OR engagement_id = nullif(current_setting('app.engagement_id', true), '')::uuid));--> statement-breakpoint
-- drizzle-kit does not emit FORCE; required so the table OWNER (neondb_owner, BYPASSRLS) is also subject to RLS (NFR-2).
ALTER TABLE "messages" FORCE ROW LEVEL SECURITY;