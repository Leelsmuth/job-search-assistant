-- Unified job-fit score, eligibility gates, and digest/feed thresholds.
-- Apply in the Supabase SQL editor BEFORE merging the app that selects these columns.
-- Do not run this against production from CI.
--
-- jobs and search_preferences stay per user. New columns inherit the owner policies
-- restated below (same shape as 0010): anon has no access, authenticated rows match
-- (select auth.uid()) = user_id.
--
-- After this migration, run Rescore all (Settings) or `pnpm rescore:jobs <user-id>`.
-- Scoring and skill cleanup run in the app, not in SQL. The statements below only
-- sync target titles and minimum salary so profile and search preferences agree.

ALTER TABLE search_preferences
  ADD COLUMN IF NOT EXISTS min_fit_to_show integer NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS digest_min_fit integer NOT NULL DEFAULT 55;

ALTER TABLE search_preferences DROP CONSTRAINT IF EXISTS search_preferences_min_fit_check;
ALTER TABLE search_preferences ADD CONSTRAINT search_preferences_min_fit_check CHECK (
  min_fit_to_show >= 0 AND min_fit_to_show <= 100
);

ALTER TABLE search_preferences DROP CONSTRAINT IF EXISTS search_preferences_digest_min_fit_check;
ALTER TABLE search_preferences ADD CONSTRAINT search_preferences_digest_min_fit_check CHECK (
  digest_min_fit >= 0 AND digest_min_fit <= 100
);

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS fit_score real;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS fit_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS fit_eligible boolean NOT NULL DEFAULT true;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS fit_ineligible_reason text;

ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_fit_score_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_fit_score_check CHECK (
  fit_score IS NULL OR (fit_score >= 0 AND fit_score <= 100)
);

CREATE INDEX IF NOT EXISTS idx_jobs_user_fit
  ON jobs (user_id, fit_eligible, fit_score);

-- Fill a missing settings salary from the candidate profile (profile has 140k, settings was empty).
UPDATE search_preferences AS prefs
SET minimum_salary_cad = profile.minimum_salary,
    updated_at = now()
FROM candidate_profiles AS profile
WHERE profile.user_id = prefs.user_id
  AND prefs.minimum_salary_cad IS NULL
  AND profile.minimum_salary IS NOT NULL;

-- Fill an empty profile salary from settings.
UPDATE candidate_profiles AS profile
SET minimum_salary = prefs.minimum_salary_cad,
    updated_at = now()
FROM search_preferences AS prefs
WHERE prefs.user_id = profile.user_id
  AND profile.minimum_salary IS NULL
  AND prefs.minimum_salary_cad IS NOT NULL;

-- Fill empty profile titles from settings (settings has the seven target titles).
UPDATE candidate_profiles AS profile
SET target_titles = prefs.target_titles,
    updated_at = now()
FROM search_preferences AS prefs
WHERE prefs.user_id = profile.user_id
  AND jsonb_typeof(prefs.target_titles) = 'array'
  AND jsonb_array_length(prefs.target_titles) > 0
  AND (
    profile.target_titles IS NULL
    OR jsonb_typeof(profile.target_titles) <> 'array'
    OR jsonb_array_length(profile.target_titles) = 0
  );

-- Fill empty settings titles from the profile.
UPDATE search_preferences AS prefs
SET target_titles = profile.target_titles,
    updated_at = now()
FROM candidate_profiles AS profile
WHERE profile.user_id = prefs.user_id
  AND jsonb_typeof(profile.target_titles) = 'array'
  AND jsonb_array_length(profile.target_titles) > 0
  AND (
    prefs.target_titles IS NULL
    OR jsonb_typeof(prefs.target_titles) <> 'array'
    OR jsonb_array_length(prefs.target_titles) = 0
  );

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
