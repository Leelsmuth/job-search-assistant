-- Curated discovery defaults on, with per-user exclusions, plus a shared poll cursor.
-- Apply in the Supabase SQL editor. Do not run this against production from CI.
--
-- search_preferences stays per user. The anon key cannot read it. Authenticated
-- queries still have to pass RLS: (select auth.uid()) = user_id.
--
-- Existing rows were created while discover_curated_boards defaulted to false,
-- which is why the daily cron never polled the curated catalog. This turns the
-- setting on. Opt out afterward from Discovery or Settings.
--
-- curated_board_poll_state has no user_id. The discovery cron reads and writes it
-- on the database owner connection, which bypasses RLS. API roles are denied
-- (same pattern as company_job_sources in 0010).

ALTER TABLE search_preferences
  ADD COLUMN IF NOT EXISTS excluded_curated_board_urls jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE search_preferences
  ALTER COLUMN discover_curated_boards SET DEFAULT true;

UPDATE search_preferences
SET discover_curated_boards = true
WHERE discover_curated_boards = false;

ALTER TABLE search_preferences ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE search_preferences FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE search_preferences TO authenticated;

DROP POLICY IF EXISTS "Users own their search preferences" ON search_preferences;
CREATE POLICY "Users own their search preferences"
  ON search_preferences
  FOR ALL
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE TABLE IF NOT EXISTS curated_board_poll_state (
  board_url text PRIMARY KEY,
  provider text NOT NULL,
  company_name text NOT NULL,
  last_polled_at timestamp,
  last_status text,
  last_run_id text,
  updated_at timestamp NOT NULL DEFAULT now()
);

ALTER TABLE curated_board_poll_state ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE curated_board_poll_state FROM anon, authenticated;

DROP POLICY IF EXISTS "No API access to curated board poll state" ON curated_board_poll_state;
CREATE POLICY "No API access to curated board poll state"
  ON curated_board_poll_state
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);
