-- NFR-2 fix: the connection role (Neon's neondb_owner) has BYPASSRLS, so RLS is
-- inert when queries run as it — even with FORCE. The app instead runs every scoped
-- query as this dedicated NON-bypass role via `SET LOCAL ROLE soloist_app`
-- (see src/server/db/scope.ts), so RLS actually applies. Migrations keep using the
-- owner. Idempotent so it replays on a fresh DB and inside the PGlite tests.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'soloist_app') THEN
    CREATE ROLE soloist_app NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END $$;--> statement-breakpoint
-- The connecting role must be a member of soloist_app to SET ROLE to it.
GRANT soloist_app TO CURRENT_USER;--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO soloist_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO soloist_app;--> statement-breakpoint
-- Future tenant-scoped tables (created by the owner in later migrations) auto-grant to soloist_app.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO soloist_app;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO soloist_app;
