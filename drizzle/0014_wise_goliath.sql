CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"engagement_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"line_items" jsonb NOT NULL,
	"amount_total" integer NOT NULL,
	"currency" text NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"due_at" timestamp with time zone,
	"notes" text,
	"pdf_blob_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_tenant_number" UNIQUE("tenant_id","number")
);
--> statement-breakpoint
ALTER TABLE "invoices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invoices" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "invoice_seq" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "invoice_scope" ON "invoices" AS PERMISSIVE FOR ALL TO public USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid AND (nullif(current_setting('app.engagement_id', true), '')::uuid IS NULL OR engagement_id = nullif(current_setting('app.engagement_id', true), '')::uuid)) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid AND (nullif(current_setting('app.engagement_id', true), '')::uuid IS NULL OR engagement_id = nullif(current_setting('app.engagement_id', true), '')::uuid));