-- Saved board poll stats
ALTER TABLE saved_boards ADD COLUMN IF NOT EXISTS last_poll_new_jobs integer DEFAULT 0;
ALTER TABLE saved_boards ADD COLUMN IF NOT EXISTS last_poll_skipped integer DEFAULT 0;
ALTER TABLE saved_boards ADD COLUMN IF NOT EXISTS last_poll_filtered integer DEFAULT 0;

-- Track which board discovered each job
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS discovered_board_url text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS description_hash text;

CREATE INDEX IF NOT EXISTS idx_jobs_user_discovered_board
  ON jobs(user_id, discovered_board_url)
  WHERE discovered_board_url IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_jobs_user_status
  ON jobs(user_id, status);

-- DB-backed company registry (V2.1)
CREATE TABLE IF NOT EXISTS company_job_sources (
  id text PRIMARY KEY,
  company_name text NOT NULL,
  company_slug text NOT NULL,
  ats_provider text NOT NULL,
  board_slug text NOT NULL,
  board_url text NOT NULL,
  headquarters_country text,
  industries jsonb DEFAULT '[]'::jsonb NOT NULL,
  enabled boolean DEFAULT true NOT NULL,
  verification_status text DEFAULT 'verification_failed' NOT NULL,
  verified_at timestamptz,
  last_job_count integer,
  observed_signals jsonb,
  discovery_source text,
  last_synced_at timestamptz,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_company_job_sources_verified
  ON company_job_sources(verification_status, enabled);
