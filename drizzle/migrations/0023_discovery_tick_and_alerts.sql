-- Frequent discovery, posting age, and instant alerts.
-- APPLY THIS IN THE SUPABASE SQL EDITOR BEFORE MERGE.
-- Do not run it from CI. The app selects posted_at, job_alerts, and the tick lock.
--
-- One-time setup (values stay out of git):
-- 1. Vercel project env: set CRON_SECRET (openssl rand -base64 32) for Production.
--    The daily Vercel crons stay as a fallback (08:00 UTC discover, 12:00 UTC digest).
-- 2. Supabase Dashboard → Project Settings → Vault, or the SQL editor:
--      select vault.create_secret(
--        'https://<your-app>.vercel.app/api/discovery/tick',
--        'discovery_tick_url',
--        'Absolute URL of the discovery tick route'
--      );
--      select vault.create_secret(
--        '<same value as Vercel CRON_SECRET>',
--        'discovery_tick_secret',
--        'Bearer token for /api/discovery/tick'
--      );
--    The schedule below reads those names from vault.decrypted_secrets.
-- 3. Enable pg_cron and pg_net if CREATE EXTENSION below is not permitted
--    (Database → Extensions). Vault is already available on Supabase.
--
-- job_alerts and profile_rescore_queue are per user. The anon key cannot read
-- them. Authenticated queries still have to pass RLS: (select auth.uid()) = user_id.
-- discovery_tick_lock has no user_id. The tick route writes it on the owner
-- connection. API roles are denied (same pattern as curated_board_poll_state).

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS posted_at timestamp;

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS posted_at_source text;

ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_posted_at_source_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_posted_at_source_check CHECK (
  posted_at_source IS NULL OR posted_at_source IN ('provider', 'first_seen')
);

CREATE INDEX IF NOT EXISTS idx_jobs_user_posted_at
  ON jobs (user_id, posted_at DESC);

ALTER TABLE search_preferences
  ADD COLUMN IF NOT EXISTS instant_alerts_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE search_preferences
  ADD COLUMN IF NOT EXISTS instant_alert_daily_cap integer NOT NULL DEFAULT 10;

ALTER TABLE search_preferences
  ADD COLUMN IF NOT EXISTS hide_jobs_older_than_days integer;

ALTER TABLE search_preferences
  ADD COLUMN IF NOT EXISTS alert_quiet_start_minute integer NOT NULL DEFAULT 1320;

ALTER TABLE search_preferences
  ADD COLUMN IF NOT EXISTS alert_quiet_end_minute integer NOT NULL DEFAULT 420;

ALTER TABLE search_preferences DROP CONSTRAINT IF EXISTS search_preferences_instant_alert_cap_check;
ALTER TABLE search_preferences ADD CONSTRAINT search_preferences_instant_alert_cap_check CHECK (
  instant_alert_daily_cap >= 0 AND instant_alert_daily_cap <= 100
);

ALTER TABLE search_preferences DROP CONSTRAINT IF EXISTS search_preferences_hide_older_check;
ALTER TABLE search_preferences ADD CONSTRAINT search_preferences_hide_older_check CHECK (
  hide_jobs_older_than_days IS NULL
  OR (hide_jobs_older_than_days >= 1 AND hide_jobs_older_than_days <= 365)
);

ALTER TABLE search_preferences DROP CONSTRAINT IF EXISTS search_preferences_quiet_start_check;
ALTER TABLE search_preferences ADD CONSTRAINT search_preferences_quiet_start_check CHECK (
  alert_quiet_start_minute >= 0 AND alert_quiet_start_minute < 1440
);

ALTER TABLE search_preferences DROP CONSTRAINT IF EXISTS search_preferences_quiet_end_check;
ALTER TABLE search_preferences ADD CONSTRAINT search_preferences_quiet_end_check CHECK (
  alert_quiet_end_minute >= 0 AND alert_quiet_end_minute < 1440
);

ALTER TABLE saved_boards
  ADD COLUMN IF NOT EXISTS http_etag text,
  ADD COLUMN IF NOT EXISTS http_last_modified text,
  ADD COLUMN IF NOT EXISTS last_seen_cursor text;

ALTER TABLE curated_board_poll_state
  ADD COLUMN IF NOT EXISTS http_etag text,
  ADD COLUMN IF NOT EXISTS http_last_modified text,
  ADD COLUMN IF NOT EXISTS last_seen_cursor text,
  ADD COLUMN IF NOT EXISTS last_new_jobs integer;

-- Backfill provider timestamps from stored payloads when the shape is known.
-- Workday relative text ("Posted 2 Days Ago") is not reconstructed here; those
-- rows keep date_posted when the app already parsed it, otherwise first seen.
CREATE OR REPLACE FUNCTION pg_temp.try_timestamptz(value text)
RETURNS timestamp
LANGUAGE plpgsql
AS $$
BEGIN
  IF value IS NULL OR btrim(value) = '' THEN
    RETURN NULL;
  END IF;
  RETURN value::timestamp;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

UPDATE jobs AS j
SET
  posted_at = parsed.posted_at,
  posted_at_source = 'provider'
FROM (
  SELECT
    job.id,
    CASE source.provider
      WHEN 'greenhouse' THEN COALESCE(
        pg_temp.try_timestamptz(source.raw_payload #>> '{job,first_published}'),
        pg_temp.try_timestamptz(source.raw_payload ->> 'first_published'),
        pg_temp.try_timestamptz(source.raw_payload #>> '{job,updated_at}'),
        pg_temp.try_timestamptz(source.raw_payload ->> 'updated_at')
      )
      WHEN 'lever' THEN CASE
        WHEN (source.raw_payload ->> 'createdAt') ~ '^[0-9]+(\.[0-9]+)?$'
          AND (source.raw_payload ->> 'createdAt')::double precision >= 1000000000
        THEN to_timestamp((source.raw_payload ->> 'createdAt')::double precision / 1000.0)
        ELSE NULL
      END
      WHEN 'ashby' THEN pg_temp.try_timestamptz(source.raw_payload ->> 'publishedAt')
      WHEN 'smartrecruiters' THEN pg_temp.try_timestamptz(source.raw_payload ->> 'releasedDate')
      WHEN 'workable' THEN pg_temp.try_timestamptz(source.raw_payload ->> 'published_on')
      WHEN 'recruitee' THEN pg_temp.try_timestamptz(source.raw_payload ->> 'published_at')
      WHEN 'bamboohr' THEN pg_temp.try_timestamptz(source.raw_payload ->> 'datePosted')
      WHEN 'teamtailor' THEN pg_temp.try_timestamptz(source.raw_payload ->> 'pubDate')
      WHEN 'personio' THEN COALESCE(
        pg_temp.try_timestamptz(source.raw_payload ->> 'createdAt'),
        pg_temp.try_timestamptz(source.raw_payload ->> 'created_at')
      )
      WHEN 'rippling' THEN COALESCE(
        pg_temp.try_timestamptz(source.raw_payload ->> 'createdAt'),
        pg_temp.try_timestamptz(source.raw_payload ->> 'postedDate')
      )
      WHEN 'remotive' THEN pg_temp.try_timestamptz(source.raw_payload ->> 'publication_date')
      WHEN 'weworkremotely' THEN pg_temp.try_timestamptz(source.raw_payload ->> 'pubDate')
      WHEN 'himalayas' THEN pg_temp.try_timestamptz(source.raw_payload ->> 'pubDate')
      WHEN 'remoteok' THEN COALESCE(
        pg_temp.try_timestamptz(source.raw_payload ->> 'date'),
        pg_temp.try_timestamptz(source.raw_payload ->> 'created')
      )
      WHEN 'adzuna' THEN pg_temp.try_timestamptz(source.raw_payload ->> 'created')
      WHEN 'jobbank' THEN COALESCE(
        pg_temp.try_timestamptz(source.raw_payload ->> 'datePosted'),
        pg_temp.try_timestamptz(source.raw_payload ->> 'postingDate')
      )
      ELSE NULL
    END AS posted_at
  FROM jobs AS job
  JOIN job_sources AS source ON source.id = job.source_id
) AS parsed
WHERE j.id = parsed.id
  AND parsed.posted_at IS NOT NULL
  AND (j.posted_at IS NULL OR j.posted_at_source IS DISTINCT FROM 'provider');

UPDATE jobs
SET
  posted_at = date_posted,
  posted_at_source = 'provider'
WHERE posted_at IS NULL
  AND date_posted IS NOT NULL;

UPDATE jobs
SET
  posted_at = date_discovered,
  posted_at_source = 'first_seen'
WHERE posted_at IS NULL;

CREATE TABLE IF NOT EXISTS job_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  status text NOT NULL,
  fit_score real,
  posted_at timestamp,
  queued_until timestamp,
  sent_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT job_alerts_status_check CHECK (status IN ('queued', 'sent')),
  CONSTRAINT job_alerts_user_job_unique UNIQUE (user_id, job_id)
);

CREATE INDEX IF NOT EXISTS idx_job_alerts_user_created
  ON job_alerts (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS profile_rescore_queue (
  user_id uuid NOT NULL,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  queued_at timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, job_id)
);

CREATE TABLE IF NOT EXISTS discovery_tick_lock (
  id text PRIMARY KEY,
  owner text,
  leased_until timestamp,
  cursor integer NOT NULL DEFAULT 0,
  updated_at timestamp NOT NULL DEFAULT now()
);

INSERT INTO discovery_tick_lock (id)
VALUES ('discovery')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE job_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile_rescore_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE discovery_tick_lock ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_preferences ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE job_alerts FROM anon;
REVOKE ALL ON TABLE profile_rescore_queue FROM anon;
REVOKE ALL ON TABLE discovery_tick_lock FROM anon, authenticated;
REVOKE ALL ON TABLE jobs FROM anon;
REVOKE ALL ON TABLE search_preferences FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE job_alerts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE profile_rescore_queue TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE jobs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE search_preferences TO authenticated;

DROP POLICY IF EXISTS "Users own their job alerts" ON job_alerts;
CREATE POLICY "Users own their job alerts"
  ON job_alerts
  FOR ALL
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users own their rescore queue" ON profile_rescore_queue;
CREATE POLICY "Users own their rescore queue"
  ON profile_rescore_queue
  FOR ALL
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "No API access to discovery tick lock" ON discovery_tick_lock;
CREATE POLICY "No API access to discovery tick lock"
  ON discovery_tick_lock
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

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

-- pg_cron calls the tick every 30 minutes. The URL and bearer token are read
-- from Vault at run time, so this file does not contain a secret.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'discovery-tick-30m') THEN
    PERFORM cron.unschedule('discovery-tick-30m');
  END IF;
END $$;

SELECT cron.schedule(
  'discovery-tick-30m',
  '*/30 * * * *',
  $cron$
  SELECT net.http_post(
    url := (
      SELECT decrypted_secret
      FROM vault.decrypted_secrets
      WHERE name = 'discovery_tick_url'
      LIMIT 1
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization',
      'Bearer ' || COALESCE((
        SELECT decrypted_secret
        FROM vault.decrypted_secrets
        WHERE name = 'discovery_tick_secret'
        LIMIT 1
      ), '')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 110000
  );
  $cron$
);
