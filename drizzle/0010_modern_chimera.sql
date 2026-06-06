CREATE TABLE "github_installations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"gh_installation_id" text NOT NULL,
	"account_login" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "github_installations_gh_installation_id_unique" UNIQUE("gh_installation_id")
);
--> statement-breakpoint
ALTER TABLE "github_installations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "github_installations" ADD CONSTRAINT "github_installations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "github_installation_scope" ON "github_installations" AS PERMISSIVE FOR ALL TO public USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint
-- drizzle-kit does not emit FORCE; required so the owner (BYPASSRLS) is also subject to RLS (NFR-2).
ALTER TABLE "github_installations" FORCE ROW LEVEL SECURITY;
