CREATE TABLE "branding" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"logo_blob_url" text,
	"accent_hex" text,
	"accent_text_hex" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "branding" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "tenants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "branding" ADD CONSTRAINT "branding_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "branding_tenant" ON "branding" AS PERMISSIVE FOR ALL TO public USING (tenant_id = current_setting('app.tenant_id', true)::uuid) WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "tenant_self" ON "tenants" AS PERMISSIVE FOR ALL TO public USING (id = current_setting('app.tenant_id', true)::uuid) WITH CHECK (id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
-- FORCE so RLS applies even to the table OWNER (the app's DB role). drizzle-kit does not emit this;
-- without it, neondb_owner would BYPASS RLS and the backstop would be inert. (Story 1.2, NFR-2.)
ALTER TABLE "tenants" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "branding" FORCE ROW LEVEL SECURITY;