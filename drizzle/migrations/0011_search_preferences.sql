-- Search preferences, location eligibility, and deterministic frontend-fit snapshots.
-- Apply in the Supabase SQL editor. Do not run this against production from CI.
--
-- search_preferences is per user. The anon key cannot read it. Authenticated
-- queries still have to pass RLS: (select auth.uid()) = user_id.

CREATE TABLE IF NOT EXISTS search_preferences (
  user_id uuid PRIMARY KEY,
  target_titles jsonb NOT NULL DEFAULT '["Frontend Engineer","UI Engineer","React Developer","TypeScript Developer","Full-Stack Engineer","Design Engineer","Web Platform Engineer"]'::jsonb,
  preferred_seniority text NOT NULL DEFAULT 'senior',
  minimum_salary_cad integer,
  include_hybrid_gta boolean NOT NULL DEFAULT true,
  include_onsite_gta boolean NOT NULL DEFAULT true,
  show_remote_other boolean NOT NULL DEFAULT false,
  show_out_of_area boolean NOT NULL DEFAULT false,
  discover_curated_boards boolean NOT NULL DEFAULT false,
  gta_cities jsonb NOT NULL DEFAULT '["Toronto","Mississauga","Brampton","Markham","Vaughan","Richmond Hill","Oakville","Burlington","Pickering","Ajax","Whitby","Oshawa","Milton","North York","Scarborough","Etobicoke","East York","Greater Toronto Area","Greater Toronto","GTA"]'::jsonb,
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT search_preferences_seniority_check CHECK (
    preferred_seniority IN ('intern', 'junior', 'mid', 'senior', 'staff')
  ),
  CONSTRAINT search_preferences_salary_check CHECK (
    minimum_salary_cad IS NULL OR (minimum_salary_cad >= 0 AND minimum_salary_cad <= 2000000)
  )
);

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

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS location_eligibility text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS location_flags jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS frontend_fit_score real;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS frontend_fit_reasons jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_location_eligibility_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_location_eligibility_check CHECK (
  location_eligibility IS NULL OR location_eligibility IN (
    'remote_canada',
    'remote_other',
    'hybrid_gta',
    'onsite_gta',
    'out_of_area'
  )
);

CREATE INDEX IF NOT EXISTS idx_jobs_user_location_eligibility
  ON jobs (user_id, location_eligibility);
