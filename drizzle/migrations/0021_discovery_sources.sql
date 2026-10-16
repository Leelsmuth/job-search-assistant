-- More discovery sources, per-source switches, and cross-source dedupe keys.
-- Apply this in the Supabase SQL editor before merge. Do not run it from CI.
-- The app selects enabled_discovery_sources, jobs.dedupe_key, and
-- jobs.canonical_apply_url, so discovery and job import fail until this is applied.
--
-- New enum values are not used in this file. PostgreSQL 15 allows ADD VALUE in a
-- transaction when the new value is not referenced later in the same transaction.
--
-- search_preferences and jobs stay per user. The anon key cannot read them.
-- Authenticated queries still have to pass RLS: (select auth.uid()) = user_id.

ALTER TYPE job_source_provider ADD VALUE IF NOT EXISTS 'smartrecruiters';
ALTER TYPE job_source_provider ADD VALUE IF NOT EXISTS 'workable';
ALTER TYPE job_source_provider ADD VALUE IF NOT EXISTS 'recruitee';
ALTER TYPE job_source_provider ADD VALUE IF NOT EXISTS 'bamboohr';
ALTER TYPE job_source_provider ADD VALUE IF NOT EXISTS 'teamtailor';
ALTER TYPE job_source_provider ADD VALUE IF NOT EXISTS 'personio';
ALTER TYPE job_source_provider ADD VALUE IF NOT EXISTS 'rippling';
ALTER TYPE job_source_provider ADD VALUE IF NOT EXISTS 'jobbank';
ALTER TYPE job_source_provider ADD VALUE IF NOT EXISTS 'remotive';
ALTER TYPE job_source_provider ADD VALUE IF NOT EXISTS 'weworkremotely';
ALTER TYPE job_source_provider ADD VALUE IF NOT EXISTS 'himalayas';
ALTER TYPE job_source_provider ADD VALUE IF NOT EXISTS 'remoteok';
ALTER TYPE job_source_provider ADD VALUE IF NOT EXISTS 'adzuna';

ALTER TABLE search_preferences
  ADD COLUMN IF NOT EXISTS enabled_discovery_sources jsonb NOT NULL DEFAULT '{
    "greenhouse": true,
    "lever": true,
    "ashby": true,
    "workday": true,
    "smartrecruiters": true,
    "workable": true,
    "recruitee": true,
    "bamboohr": true,
    "teamtailor": true,
    "personio": true,
    "rippling": true,
    "jobbank": true,
    "remotive": true,
    "weworkremotely": true,
    "himalayas": true,
    "remoteok": true,
    "adzuna": false
  }'::jsonb;

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS dedupe_key text;

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS canonical_apply_url text;

CREATE INDEX IF NOT EXISTS idx_jobs_user_dedupe_key
  ON jobs (user_id, dedupe_key);

CREATE INDEX IF NOT EXISTS idx_jobs_user_canonical_apply_url
  ON jobs (user_id, canonical_apply_url);

ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_preferences ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE jobs FROM anon;
REVOKE ALL ON TABLE search_preferences FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE jobs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE search_preferences TO authenticated;

DROP POLICY IF EXISTS "Users own their jobs" ON jobs;
CREATE POLICY "Users own their jobs"
  ON jobs
  FOR ALL
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users own their search preferences" ON search_preferences;
CREATE POLICY "Users own their search preferences"
  ON search_preferences
  FOR ALL
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);
